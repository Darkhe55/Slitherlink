import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Users\\MerchRev\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE', msg.text())
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.screenshot({ path: 'output/playwright/01-initial.png', fullPage: true })

const puzzleCount = await page.locator('.puzzle-item').count()
const svgCount = await page.locator('svg.board-svg').count()
const hitEdges = await page.locator('.edge-hit').count()
const nums = await page.locator('.num').count()
console.log({ puzzleCount, svgCount, hitEdges, nums })

// 通过坐标点击第一条横边中点
const box = await page.locator('svg.board-svg').boundingBox()
const scale = await page.evaluate(() => {
  const svg = document.querySelector('svg.board-svg')
  return {
    vbW: svg.viewBox.baseVal.width,
    vbH: svg.viewBox.baseVal.height,
  }
})
const sx = box.width / scale.vbW
const sy = box.height / scale.vbH
// metrics: cell=64, pad=22.4 for 5x5
const cell = 64
const pad = 64 * 0.35
const clickVB = async (vx, vy, opts = {}) => {
  await page.mouse.click(box.x + vx * sx, box.y + vy * sy, opts)
}

// 第一条横边中点 (pad+32, pad)
await clickVB(pad + 32, pad)
await page.waitForTimeout(80)
let onCount1 = await page.locator('.edge-on').count()
console.log('after click edge-on', onCount1)
await page.screenshot({ path: 'output/playwright/02-after-click.png', fullPage: true })

// 再点 → ×
await clickVB(pad + 32, pad)
await page.waitForTimeout(80)
const xMarks = await page.locator('.edge-off-mark').count()
console.log('after 2nd click x-marks', xMarks)

// 第三次 → 清空
await clickVB(pad + 32, pad)
await page.waitForTimeout(80)
const onAfterCycle = await page.locator('.edge-on').count()
const xAfterCycle = await page.locator('.edge-off-mark').count()
console.log('after 3rd click on/x', onAfterCycle, xAfterCycle)

// 落一条边再撤销
await clickVB(pad + 32, pad)
await page.waitForTimeout(50)
await page.click('#btn-undo')
await page.waitForTimeout(50)
const onAfterUndo = await page.locator('.edge-on').count()
console.log('after undo edge-on', onAfterUndo)
await page.click('#btn-redo')
await page.waitForTimeout(50)
const onAfterRedo = await page.locator('.edge-on').count()
console.log('after redo edge-on', onAfterRedo)

await page.click('#btn-check')
await page.waitForTimeout(50)
console.log('status after check:', await page.locator('#status').innerText())

await page.click('#btn-solve')
await page.waitForTimeout(100)
const status2 = await page.locator('#status').innerText()
const onCount2 = await page.locator('.edge-on').count()
console.log('status after solve:', status2, 'edge-on', onCount2)
await page.screenshot({ path: 'output/playwright/03-solved.png', fullPage: true })

// 切换 10×10
await page.locator('.puzzle-item').nth(2).click()
await page.waitForTimeout(100)
const hit10 = await page.locator('.edge-hit').count()
const nums10 = await page.locator('.num').count()
console.log('10x10 hits', hit10, 'nums', nums10)
await page.screenshot({ path: 'output/playwright/04-10x10.png', fullPage: true })

await page.click('#btn-clear')
await page.waitForTimeout(50)
console.log('after clear edge-on', await page.locator('.edge-on').count())

// 右键标 ×
const box10 = await page.locator('svg.board-svg').boundingBox()
const scale10 = await page.evaluate(() => {
  const svg = document.querySelector('svg.board-svg')
  return { vbW: svg.viewBox.baseVal.width, vbH: svg.viewBox.baseVal.height }
})
const sx10 = box10.width / scale10.vbW
const sy10 = box10.height / scale10.vbH
const cell10 = 48
const pad10 = 48 * 0.35
await page.mouse.click(box10.x + (pad10 + 24) * sx10, box10.y + pad10 * sy10, {
  button: 'right',
})
await page.waitForTimeout(80)
const xRight = await page.locator('.edge-off-mark').count()
console.log('right-click x-marks', xRight)
await page.screenshot({ path: 'output/playwright/05-rightclick.png', fullPage: true })

// 校验 padding 不渲染
const padLines = await page.evaluate(() => {
  const idxs = [...document.querySelectorAll('.edge-hit')].map((el) =>
    Number(el.getAttribute('data-index')),
  )
  return { min: Math.min(...idxs), max: Math.max(...idxs), n: idxs.length }
})
console.log('hit edge index range', padLines)

await browser.close()
console.log('OK')
