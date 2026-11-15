/** 端到端验证：无解题板立刻报错不回放；合法题板照常完整回放 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { edgePath, profileDir } from './_browser.mjs'

const EXE = edgePath()
const URL = 'http://127.0.0.1:5177/'
const PROFILE = profileDir('e2e-gate')

// 造一个"保存到题库"的 30x30 随机题板（不可满足），写入项目内存储
// 备份项目内存储，测试结束后原样恢复（绝不能覆盖用户真实题库）
const DATA_DIR = 'data'
const BACKUP = 'output/.store-backup'
if (fs.existsSync(DATA_DIR)) {
  fs.cpSync(DATA_DIR, BACKUP, { recursive: true })
} else {
  fs.mkdirSync(BACKUP, { recursive: true })
}
const restoreStore = () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
  if (fs.readdirSync(BACKUP).length) fs.cpSync(BACKUP, DATA_DIR, { recursive: true })
  else fs.rmSync(BACKUP, { recursive: true, force: true })
}

const W = 30, H = 30
let sd = 4242
const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff }
const cells = new Array(W * H).fill(null).map(() => {
  const v = rnd()
  return v < 0.12 ? null : v < 0.4 ? 0 : v < 0.7 ? 1 : v < 0.9 ? 2 : 3
})
const id = 'custom-30x30-e2e'
const storeBody = {
  library: [
    { id, name: '自定义 · 30×30', width: W, height: H, difficulty: 'custom', cells: cells.map((c) => (c === null ? '.' : String(c))).join(''), savedAt: 1 },
  ],
  progress: {},
  lastPuzzle: id,
}
const post = await fetch(URL + '__store', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(storeBody),
})
console.log('写入项目内存储:', post.status)

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  executablePath: EXE,
  viewport: { width: 1440, height: 960 },
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')

// 载入这道自定义题
await page.locator('.puzzle-item', { hasText: '自定义 · 30×30' }).first().click()
await page.waitForTimeout(300)
const before = await page.locator('.edge-on').count()
console.log('载入后已落边:', before)

// 点逻辑解题：应回放到"还能解的最后一步"就停下，然后说明原因
await page.click('#btn-logic')
await page.waitForFunction(
  () => document.getElementById('btn-logic').textContent === '逻辑解题',
  { timeout: 120000 },
)
const status = await page.locator('#status').innerText()
const on = await page.locator('.edge-on').count()
const off = await page.locator('.edge-off-mark').count()
const others = await page.evaluate(() =>
  ['btn-check', 'btn-undo', 'btn-solve', 'btn-clear'].map((id) => id + ':' + (document.getElementById(id).disabled ? 'off' : 'on')).join(' '),
)
console.log('状态栏:', status)
console.log('按钮:', await page.evaluate(() => document.getElementById('btn-logic').textContent), '|', others)
console.log('回放落地:', on, '环 +', off, '叉 =', on + off, on + off < 200 ? '=> 已截断，没有打叉洪水 OK' : '=> 仍在洪水 FAIL')

// 合法题板（内置 5x5）照常完整回放
await page.locator('.puzzle-item', { hasText: '经典 · 5×5 A' }).first().click()
await page.waitForTimeout(200)
await page.click('#btn-logic')
await page.waitForFunction(
  () => document.getElementById('btn-logic').textContent === '逻辑解题',
  { timeout: 120000 },
)
const status2 = await page.locator('#status').innerText()
const on2 = await page.locator('.edge-on').count()
console.log('合法题板回放结束:', status2, '| 环边', on2)
console.log('错误:', errs.join(' ;; ') || '无')

await ctx.close()

// 清掉测试写进项目内存储的数据，恢复测试前的原样
restoreStore()
console.log('已恢复项目内存储（测试前的原样）')
