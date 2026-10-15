import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Users\\MerchRev\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })

// 仪表化 Web Audio：统计 oscillator / 噪声
await page.evaluate(() => {
  const w = window
  w.__audioStats = { osc: 0, buffer: 0, resume: 0 }
  const OrigAC = window.AudioContext
  class Wrapped extends OrigAC {
    createOscillator() {
      w.__audioStats.osc++
      return super.createOscillator()
    }
    createBuffer(...args) {
      w.__audioStats.buffer++
      return super.createBuffer(...args)
    }
    resume() {
      w.__audioStats.resume++
      return super.resume()
    }
  }
  window.AudioContext = Wrapped
})

// 触发一次用户手势（解锁音频）
await page.click('#btn-check')
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
// 只看前几秒的音效触发
await page.waitForTimeout(2500)
const mid = await page.evaluate(() => ({
  ...window.__audioStats,
  string: document.querySelectorAll('.fx-string').length,
  ripple: document.querySelectorAll('.fx-ripple').length,
}))
console.log('audio mid', mid)

await page.waitForTimeout(4000)
const end = await page.evaluate(() => window.__audioStats)
console.log('audio end', end)

// 静音切换
await page.click('#btn-mute')
const muteLabel = await page.locator('#btn-mute').innerText()
console.log('mute label', muteLabel)
const before = await page.evaluate(() => window.__audioStats.osc)
await page.evaluate(() => {
  // 直接触发内部音效应被静音挡掉（gain=0 但 oscillator 仍会创建）
  window.__shuhui
})
// 再跑几步看是否 resume
await page.click('#btn-mute')
await page.waitForTimeout(50)

if (end.osc < 4) {
  console.log('FAIL expected oscillators for drop/pluck')
  process.exitCode = 1
}
if (end.buffer < 1) {
  console.log('FAIL expected noise buffer for water splash')
  process.exitCode = 1
}
if (!muteLabel.includes('关') && !muteLabel.includes('开')) {
  console.log('FAIL mute label')
  process.exitCode = 1
}

console.log('OK')
await browser.close()
