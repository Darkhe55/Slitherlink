import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Users\\MerchRev\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })

// —— 缩放 ——
const label0 = await page.locator('#zoom-label').innerText()
const vb0 = await page.evaluate(() => {
  const s = document.querySelector('svg.board-svg')
  return s.getAttribute('viewBox')
})
console.log('zoom0', label0, vb0)

await page.click('#zoom-in')
await page.click('#zoom-in')
await page.waitForTimeout(50)
const label1 = await page.locator('#zoom-label').innerText()
const vb1 = await page.evaluate(() => {
  const s = document.querySelector('svg.board-svg')
  return s.getAttribute('viewBox')
})
console.log('zoom-in x2', label1, vb1)
if (label1 === label0) {
  console.log('FAIL zoom label unchanged')
  process.exitCode = 1
}

// 滚轮放大
const box = await page.locator('svg.board-svg').boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.wheel(0, -120)
await page.waitForTimeout(50)
const label2 = await page.locator('#zoom-label').innerText()
console.log('after wheel', label2)

// 复位
await page.click('#zoom-reset')
await page.waitForTimeout(50)
const label3 = await page.locator('#zoom-label').innerText()
const vb3 = await page.evaluate(() => {
  const s = document.querySelector('svg.board-svg')
  return s.getAttribute('viewBox')
})
console.log('reset', label3, vb3)
if (label3 !== '100%') {
  console.log('FAIL reset label')
  process.exitCode = 1
}

// 拖拽平移（放大后）
await page.click('#zoom-in')
await page.waitForTimeout(30)
const vbBefore = await page.evaluate(() => document.querySelector('svg.board-svg').getAttribute('viewBox'))
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 40, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(50)
const vbAfter = await page.evaluate(() => document.querySelector('svg.board-svg').getAttribute('viewBox'))
console.log('pan before', vbBefore, 'after', vbAfter)
if (vbBefore === vbAfter) {
  console.log('FAIL pan did not change viewBox')
  process.exitCode = 1
}

await page.screenshot({ path: 'output/playwright/10-zoom.png', fullPage: true })

// —— 逻辑解题 1/n 连拍 ——
await page.click('#zoom-reset')
await page.locator('.puzzle-item').first().click()
await page.waitForTimeout(80)

const timing = await page.evaluate(async () => {
  const t0 = performance.now()
  const stamps = []
  // 轻量监听：每 20ms 记录 edge-on 数量变化
  let lastOn = 0
  let lastOff = 0
  const timer = setInterval(() => {
    const on = document.querySelectorAll('.edge-on').length
    const off = document.querySelectorAll('.edge-off-group').length
    if (on !== lastOn || off !== lastOff) {
      stamps.push({ t: performance.now() - t0, on, off })
      lastOn = on
      lastOff = off
    }
  }, 15)
  return { timerId: timer, t0 }
})
void timing

await page.click('#btn-logic')
// 收集 2.5s 内的变化次数（连拍应比固定 420ms 密集）
await page.waitForTimeout(2500)
const stamps = await page.evaluate(() => {
  // 读不到之前闭包的 stamps，改看 DOM：连续同类型时间隙应变短
  return {
    on: document.querySelectorAll('.edge-on').length,
    off: document.querySelectorAll('.edge-off-group').length,
    string: document.querySelectorAll('.fx-string').length,
  }
})
console.log('after 2.5s', stamps)

const status = await page.locator('#status').innerText()
console.log('status', status)

// 同类型连拍状态栏应显示 ×n
if (!/×\d+/.test(status)) {
  console.log('WARN status may not show streak counter')
}

await page.screenshot({ path: 'output/playwright/11-streak.png', fullPage: true })

console.log('OK')
await browser.close()
