import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Users\\MerchRev\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })

const puzzleCount = await page.locator('.puzzle-item').count()
console.log('puzzle count', puzzleCount)
if (puzzleCount < 20) {
  console.log('FAIL expected larger library')
  process.exitCode = 1
}

// 随机抽题
const beforeId = await page.evaluate(() => window.__shuhui.getSession().puzzle.id)
await page.click('#btn-random')
await page.waitForTimeout(150)
const afterId = await page.evaluate(() => window.__shuhui.getSession().puzzle.id)
console.log('random', beforeId, '->', afterId)
if (beforeId === afterId && puzzleCount > 1) {
  // 极小概率抽到同题，再试一次
  await page.click('#btn-random')
  await page.waitForTimeout(100)
}
const status = await page.locator('#status').innerText()
console.log('random status', status)
if (!status.includes('随机')) {
  console.log('FAIL random status')
  process.exitCode = 1
}

// 回到第一题跑逻辑解题，抓特效类
await page.locator('.puzzle-item').first().click()
await page.waitForTimeout(80)

const stepCount = await page.evaluate(() => {
  const s = window.__shuhui.getSession()
  const { steps } = window.__shuhui.collectLogicSteps(s.puzzle, s.state)
  let n = 0
  for (const st of steps) n += st.changes.length
  return n
})
console.log('logic changes', stepCount)

await page.click('#btn-logic')
// 轮询直到看到弦振或播完
let fxMid = { string: 0, ripple: 0, pop: 0, on: 0, off: 0 }
let sawString = false
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(400)
  fxMid = await page.evaluate(() => ({
    string: document.querySelectorAll('.fx-string').length,
    ripple: document.querySelectorAll('.fx-ripple').length,
    pop: document.querySelectorAll('.fx-pop').length,
    on: document.querySelectorAll('.edge-on').length,
    off: document.querySelectorAll('.edge-off-group').length,
  }))
  if (fxMid.string > 0) {
    sawString = true
    const sample = await page.evaluate(() => {
      const p = document.querySelector('path.fx-string')
      return p ? p.getAttribute('d')?.slice(0, 100) : null
    })
    console.log('string path sample', sample)
    await page.screenshot({ path: 'output/playwright/08-fx-mid.png', fullPage: true })
    break
  }
}
console.log('fx mid', fxMid, 'sawString', sawString)

const waitMs = Math.max(4000, stepCount * 450)
await page.waitForTimeout(Math.min(waitMs, 35000))
const disabledEnd = await page.locator('#btn-logic').isDisabled()
console.log('after play disabled?', disabledEnd)
await page.screenshot({ path: 'output/playwright/09-fx-end.png', fullPage: true })

if (!sawString) {
  console.log('FAIL never saw fx-string on On edge')
  process.exitCode = 1
}
if (fxMid.ripple === 0 && fxMid.pop === 0 && !sawString) {
  console.log('FAIL no fx classes observed')
  process.exitCode = 1
}

console.log('OK')
await browser.close()
