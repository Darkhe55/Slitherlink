/** 验证新入库的题板：列表出现、能载入、无参考解、逻辑推理行为 */
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'

const EXE = edgePath()
const URL = 'http://127.0.0.1:5177/'

const ctx = await chromium.launchPersistentContext(profileDir('verify-img'), {
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
await page.waitForTimeout(500)

// 1) 列表
const list = await page.evaluate(() =>
  [...document.querySelectorAll('.puzzle-item')].map((b) => ({
    name: b.querySelector('.title').textContent,
    meta: b.querySelector('.meta').textContent,
  })),
)
const mine = list.filter((p) => p.name.includes('识图'))
console.log('题库总数:', list.length)
console.log('新题板:', JSON.stringify(mine))

// 2) 载入
await page.locator('.puzzle-item', { hasText: '识图' }).first().click()
await page.waitForTimeout(400)
const info = await page.evaluate(() => {
  const s = window.__shuhui.getSession()
  return {
    id: s.puzzle.id,
    name: s.puzzle.name,
    size: s.puzzle.width + 'x' + s.puzzle.height,
    clues: s.puzzle.cells.filter((c) => c !== null && c !== undefined).length,
    refSol: window.__shuhui.getReferenceSolution(s.puzzle.id),
    svg: document.querySelectorAll('svg.board-svg').length,
    nums: document.querySelectorAll('.num').length,
    status: document.querySelector('#status').textContent,
  }
})
console.log('载入后:', JSON.stringify({ ...info, refSol: info.refSol === null ? 'null（无参考解，符合预期）' : '有解？！' }))

// 3) 逻辑推理（预期：推出大量步骤后进入打叉洪水/矛盾）
await page.click('#btn-logic')
await page.waitForTimeout(4000)
const mid = await page.evaluate(() => ({
  status: document.querySelector('#status').textContent.slice(0, 80),
  on: document.querySelectorAll('.edge-on').count || document.querySelectorAll('.edge-on').length,
  off: document.querySelectorAll('.edge-off-mark').length,
  btn: document.getElementById('btn-logic').textContent,
}))
console.log('推理 4s 后:', JSON.stringify(mid))

// 4) 停掉，确认按钮恢复
await page.click('#btn-logic')
await page.waitForTimeout(300)
console.log('停止后按钮:', await page.evaluate(() => document.getElementById('btn-logic').textContent))
console.log('错误:', errs.join(' ;; ') || '无')

await ctx.close()
