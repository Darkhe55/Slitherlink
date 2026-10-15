import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })

const names = await page.locator('.puzzle-item .title').allInnerTexts()
console.log('has human', names.some((n) => n.includes('名题')))
console.log('count', names.length)

await page.locator('.puzzle-item', { hasText: '名题 · 15×15' }).first().click()
await page.waitForTimeout(150)
const nums = await page.locator('.num').count()
console.log('nums on human puzzle', nums)

await page.click('#btn-logic')
// 等回放完
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(500)
  const dis = await page.locator('#btn-logic').isDisabled()
  const st = await page.locator('#status').innerText()
  if (!dis && st.includes('回放完毕')) break
  if (!dis && st.includes('解出')) break
}
const colors = await page.evaluate(() => ({
  out: document.querySelectorAll('.cell-tint-out').length,
  inn: document.querySelectorAll('.cell-tint-in').length,
  nums: document.querySelectorAll('.num').length,
}))
console.log('color layer after play', colors)
const status = await page.locator('#status').innerText()
console.log('status', status)

await page.screenshot({ path: 'output/playwright/18-color-fx.png', fullPage: true })

const order = await page.evaluate(() => {
  const svg = document.querySelector('svg.board-svg')
  return [...svg.children].slice(0, 4).map((c) => c.tagName + '.' + (c.getAttribute('class') || ''))
})
console.log('svg layers', order)

if (colors.nums < 90) {
  console.log('FAIL numbers hidden?')
  process.exitCode = 1
}
if (colors.out + colors.inn === 0) {
  console.log('WARN no colored cells after full playback (may be few determined regions)')
}
console.log('OK')
await browser.close()
