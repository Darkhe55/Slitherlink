import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Users\\MerchRev\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.click('#btn-custom')
await page.waitForTimeout(80)

await page.fill('#custom-w', '3')
await page.fill('#custom-h', '3')
await page.click('#custom-regen')
await page.waitForTimeout(50)

await page.keyboard.press('2')
await page.keyboard.press('2')
await page.keyboard.press('2')
const row0 = await page.evaluate(() =>
  [...document.querySelectorAll('.custom-cell')].slice(0, 3).map((b) => b.textContent),
)
console.log('after 222 row0', row0)

await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('1')
const cell6 = await page.evaluate(() => document.querySelector('.custom-cell[data-i="6"]').textContent)
console.log('cell6', cell6)

// After typing 1 at i=6, cursor moves to 7. Backspace clears 7.
await page.keyboard.press('Backspace')
const cell7 = await page.evaluate(() => document.querySelector('.custom-cell[data-i="7"]').textContent)
console.log('cell7 after backspace', JSON.stringify(cell7))

const selected = await page.evaluate(() => document.querySelector('.custom-cell.selected')?.dataset.i)
console.log('cursor', selected)

// Enter moves right
await page.keyboard.press('Enter')
const selected2 = await page.evaluate(() => document.querySelector('.custom-cell.selected')?.dataset.i)
console.log('cursor after Enter', selected2)

await page.screenshot({ path: 'output/playwright/17-kbd-custom.png', fullPage: true })
await browser.close()
console.log('OK')
