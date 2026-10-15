import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })

// 预演：收集逻辑步骤数
const stepCount = await page.evaluate(() => {
  const s = window.__shuhui.getSession()
  const { steps } = window.__shuhui.collectLogicSteps(s.puzzle, s.state)
  let n = 0
  for (const st of steps) n += st.changes.length
  return n
})
console.log('logic atomic changes', stepCount)
if (stepCount < 1) {
  console.log('FAIL no logic changes to play')
  process.exitCode = 1
}

// 点击逻辑解题
await page.click('#btn-logic')
await page.waitForTimeout(300)

// 播放中按钮应禁用、盘面 pointer-events none
const disabledMid = await page.locator('#btn-logic').isDisabled()
const pe = await page.evaluate(() => {
  const board = document.getElementById('board')
  return board && board.style.pointerEvents
})
console.log('during play btn disabled?', disabledMid, 'pointerEvents', pe)

// 应出现至少一条已落边
const onDuring = await page.locator('.edge-on').count()
const offDuring = await page.locator('.edge-off-group').count()
const fx = await page.locator('.fx-pulse, .fx-ring').count()
console.log('during play on/off/fx', onDuring, offDuring, fx)
await page.screenshot({ path: 'output/playwright/06-logic-mid.png', fullPage: true })

// 等播放完（每步 420ms + 余量）
const waitMs = Math.max(3000, stepCount * 450 + 1500)
await page.waitForTimeout(waitMs)

const disabledEnd = await page.locator('#btn-logic').isDisabled()
const status = await page.locator('#status').innerText()
const onEnd = await page.locator('.edge-on').count()
console.log('after play disabled?', disabledEnd)
console.log('status', status)
console.log('on edges after play', onEnd)
await page.screenshot({ path: 'output/playwright/07-logic-end.png', fullPage: true })

if (disabledEnd) {
  console.log('FAIL buttons still disabled after play')
  process.exitCode = 1
}
if (!status.includes('逻辑')) {
  console.log('FAIL status should mention 逻辑')
  process.exitCode = 1
}

// 再点逻辑解题应还能跑（或提示无新推演）
await page.click('#btn-logic')
await page.waitForTimeout(500)
const status2 = await page.locator('#status').innerText()
console.log('second run status', status2)

console.log('OK')
await browser.close()
