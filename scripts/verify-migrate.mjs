/** 迁移验证：localStorage 里已有的题库/进度，首次启动后必须进入项目内 data/ */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { edgePath, profileDir } from './_browser.mjs'

const EXE = edgePath()
const URL = 'http://127.0.0.1:5177/'
const PROFILE = profileDir('migrate')

// 先清空项目内存储，模拟"第一次迁移"
for (const f of ['data/library.json', 'data/progress.json', 'data/last-puzzle.json']) {
  if (fs.existsSync(f)) fs.rmSync(f)
}

const W = 12, H = 9
const seed = () => {
  const W = 12
  const H = 9
  const cells = new Array(W * H).fill(null).map((_, i) => (i % 5 === 0 ? '2' : i % 3 === 0 ? '1' : '.'))
  const id = 'custom-12x9-legacy'
  localStorage.setItem(
    'shuhui-saved-puzzles',
    JSON.stringify([
      { id, name: '自定义 · 12×9（旧数据）', width: W, height: H, difficulty: 'custom', cells: cells.join(''), savedAt: 1 },
    ]),
  )
  localStorage.setItem('shuhui-last-puzzle', id)
  const hLen = (H + 1) * (W + 2)
  const vLen = (H + 2) * (W + 1)
  const h = new Array(hLen).fill(2)
  const v = new Array(vLen).fill(2)
  for (let i = 0; i < hLen; i++) if (i % 7 === 0) h[i] = 1
  localStorage.setItem('shuhui-save:' + id, JSON.stringify({ version: 1, puzzleId: id, width: W, height: H, h, v, updatedAt: 1 }))
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  executablePath: EXE,
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.addInitScript(seed)
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')
await page.waitForTimeout(1200) // 等 initStore + 落盘

const state = await page.evaluate(() => ({
  items: [...document.querySelectorAll('.puzzle-item')].map((b) => b.querySelector('.title').textContent),
  status: document.querySelector('#status').textContent,
  location: window.__shuhui ? undefined : undefined,
}))
console.log('题面列表:', JSON.stringify(state.items.slice(0, 3)))
console.log('状态栏:', state.status)

// 项目内文件是否已生成
const lib = JSON.parse(fs.readFileSync('data/library.json', 'utf8'))
const last = JSON.parse(fs.readFileSync('data/last-puzzle.json', 'utf8'))
const prog = JSON.parse(fs.readFileSync('data/progress.json', 'utf8'))
console.log('data/library.json:', lib.length, '题 ->', lib.map((p) => p.name).join(', '))
console.log('data/last-puzzle.json:', last)
console.log('data/progress.json 条目:', Object.keys(prog).length, Object.keys(prog).join(','))

const ok =
  lib.length === 1 &&
  lib[0].id === 'custom-12x9-legacy' &&
  last === 'custom-12x9-legacy' &&
  Object.keys(prog).includes('custom-12x9-legacy') &&
  state.items.some((t) => t.includes('旧数据'))
console.log(ok ? '迁移 OK：题库/进度/上次题目都进了项目内 data/' : '迁移 FAIL')

await ctx.close()

// 清掉测试数据，等用户自己迁移
for (const f of ['data/library.json', 'data/progress.json', 'data/last-puzzle.json']) {
  if (fs.existsSync(f)) fs.rmSync(f)
}
console.log('已清理测试数据')
