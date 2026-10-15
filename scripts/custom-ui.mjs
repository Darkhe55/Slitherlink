import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })

await page.click('#btn-custom')
await page.waitForTimeout(80)
const visible = await page.locator('#custom-editor').isVisible()
console.log('editor visible', visible)

// 5x5 默认，点几个格子
const cells = page.locator('.custom-cell')
const n0 = await cells.count()
console.log('cells', n0)

// 点第 0 格三次 → 显示 2
const c0 = cells.nth(0)
await c0.click(); await c0.click(); await c0.click()
const label = await c0.innerText()
console.log('cell0 after 3 clicks', label)

// 全 2 的 2x2
await page.fill('#custom-w', '2')
await page.fill('#custom-h', '2')
await page.click('#custom-regen')
await page.waitForTimeout(50)
const cells2 = page.locator('.custom-cell')
console.log('cells after regen', await cells2.count())
for (let i = 0; i < 4; i++) {
  const c = cells2.nth(i)
  await c.click(); await c.click() // null→0→1  ; need 2 more for 2
  await c.click() // 2
}
await page.click('#custom-apply')
await page.waitForTimeout(100)

const status = await page.locator('#status').innerText()
console.log('status', status)

await page.click('#custom-solve')
await page.waitForTimeout(300)
const msg = await page.locator('#custom-msg').innerText()
const onCount = await page.locator('.edge-on').count()
console.log('solve msg', msg, 'on edges', onCount)
await page.screenshot({ path: 'output/playwright/12-custom.png', fullPage: true })

if (!msg.includes('成功') && !msg.includes('解')) {
  console.log('FAIL solve message')
  process.exitCode = 1
}
if (onCount < 4) {
  console.log('FAIL expected loop edges after solve')
  process.exitCode = 1
}

console.log('OK')
await browser.close()
