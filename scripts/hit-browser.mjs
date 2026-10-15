import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Users\\MerchRev\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })

// 用页面内的 getScreenCTM 映射：点击 viewBox 边中点，再读会话里哪条边变了
const result = await page.evaluate(() => {
  const svg = document.querySelector('svg.board-svg')
  const ctm = svg.getScreenCTM()
  const inv = ctm.inverse()
  const toClient = (vx, vy) => {
    const pt = svg.createSVGPoint()
    pt.x = vx
    pt.y = vy
    const p = pt.matrixTransform(ctm)
    return { x: p.x, y: p.y }
  }
  // metrics 5x5: cell=64 pad=22.4
  const pad = 22.4
  const cell = 64
  // 第一条横边中点 (pad+32, pad)
  return toClient(pad + 32, pad)
})

await page.mouse.click(result.x, result.y)
await page.waitForTimeout(100)

const changed = await page.evaluate(() => {
  const s = window.__shuhui.getSession()
  const on = []
  s.state.h.forEach((v, i) => {
    if (v === 1) on.push(['h', i])
  })
  s.state.v.forEach((v, i) => {
    if (v === 1) on.push(['v', i])
  })
  return on
})

console.log('clicked client', result)
console.log('on edges after mid-H0 click', changed)
// 期望唯一 ON 为 h index 1
const ok = changed.length === 1 && changed[0][0] === 'h' && changed[0][1] === 1
console.log(ok ? 'OK midpoint hits H0' : 'FAIL expected only h[1]')
if (!ok) process.exitCode = 1

// 再点第一条竖边中点
const result2 = await page.evaluate(() => {
  const svg = document.querySelector('svg.board-svg')
  const ctm = svg.getScreenCTM()
  const pad = 22.4
  const cell = 64
  const pt = svg.createSVGPoint()
  pt.x = pad
  pt.y = pad + 32
  const p = pt.matrixTransform(ctm)
  return { x: p.x, y: p.y }
})
// 先清空
await page.click('#btn-clear')
await page.waitForTimeout(50)
await page.mouse.click(result2.x, result2.y)
await page.waitForTimeout(100)
const changed2 = await page.evaluate(() => {
  const s = window.__shuhui.getSession()
  const on = []
  s.state.h.forEach((v, i) => {
    if (v === 1) on.push(['h', i])
  })
  s.state.v.forEach((v, i) => {
    if (v === 1) on.push(['v', i])
  })
  return on
})
console.log('on edges after mid-V0 click', changed2)
const ok2 = changed2.length === 1 && changed2[0][0] === 'v' && changed2[0][1] === 6
console.log(ok2 ? 'OK midpoint hits V0' : 'FAIL expected only v[6]')
if (!ok2) process.exitCode = 1

await browser.close()
