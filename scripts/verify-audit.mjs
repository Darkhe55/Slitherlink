/** 自测 /__audit：项目内 profile，模拟已保存的 30x30 自定义题板 */
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'
import fs from 'node:fs'

const URL = 'http://127.0.0.1:5177/'
const PROFILE = profileDir('audit')

const W = 30
const H = 30

// 与 app 保存格式一致的自定义题库 + 当前存档
const seed = () => {
  const W = 30
  const H = 30
  let s = 5150
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const cells = new Array(W * H)
    .fill(null)
    .map(() => {
      const r = rnd()
      return r < 0.12 ? null : r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3
    })
  const id = 'custom-30x30-selftest'
  const hLen = (H + 1) * (W + 2)
  const vLen = (H + 2) * (W + 1)
  const h = new Array(hLen).fill(2)
  const v = new Array(vLen).fill(2)
  // 揭示 40% 的边（随机 On/Off）
  for (let i = 0; i < hLen; i++) if (rnd() < 0.4) h[i] = rnd() < 0.5 ? 1 : 2
  for (let i = 0; i < vLen; i++) if (rnd() < 0.4) v[i] = rnd() < 0.5 ? 1 : 2
  localStorage.setItem(
    'shuhui-saved-puzzles',
    JSON.stringify([
      { id, name: '自定义 · 30×30', width: W, height: H, difficulty: 'custom', cells: cells.map((c) => (c === null ? '.' : String(c))).join(''), savedAt: 1 },
    ]),
  )
  localStorage.setItem('shuhui-last-puzzle', id)
  localStorage.setItem(
    'shuhui-save:' + id,
    JSON.stringify({ version: 1, puzzleId: id, width: W, height: H, h, v, updatedAt: 1 }),
  )
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  executablePath: edgePath(),
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.addInitScript(seed)
await page.goto(URL + '__audit', { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.getElementById('out').textContent.includes('结果已发送'), {
  timeout: 180000,
})
console.log(await page.locator('#out').innerText())
await ctx.close()
