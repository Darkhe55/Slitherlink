/**
 * 最终验证（端口 5177，干净 origin）：
 * 反复普通打开/刷新都必须进入游玩界面，而且要快。
 */
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'
import fs from 'node:fs'

const URL = 'http://127.0.0.1:5177/'
const ROOT = profileDir('final')
fs.rmSync(ROOT, { recursive: true, force: true })
fs.mkdirSync(ROOT, { recursive: true })

const ctx = await chromium.launchPersistentContext(ROOT, {
  headless: false,
  executablePath: edgePath(),
  viewport: { width: 1440, height: 960 },
})

async function open(tag) {
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()))
  page.on('requestfailed', (r) => errs.push('REQFAILED ' + r.url()))
  const t0 = Date.now()
  await page.goto(URL, { waitUntil: 'networkidle' })
  const ms = Date.now() - t0
  const ok = await page
    .waitForFunction(
      () => document.querySelector('#app')?.getAttribute('data-booted') === '1',
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false)
  const info = await page.evaluate(() => ({
    items: document.querySelectorAll('.puzzle-item').length,
    svg: document.querySelectorAll('svg.board-svg').length,
    url: location.pathname + location.search,
  }))
  console.log(
    `${tag}: ${ok ? 'OK' : 'FAIL'} ${ms}ms`,
    JSON.stringify(info),
    errs.join(' ;; ') || '无错误',
  )
  await page.close()
  return ok
}

let allOk = true
allOk = (await open('冷启动(新标签页)')) && allOk

// 连续 5 次普通刷新
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')
for (let i = 1; i <= 5; i++) {
  const t0 = Date.now()
  await page.reload({ waitUntil: 'networkidle' })
  const ms = Date.now() - t0
  const ok = await page
    .waitForSelector('svg.board-svg', { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  const info = await page.evaluate(() => ({
    items: document.querySelectorAll('.puzzle-item').length,
    svg: document.querySelectorAll('svg.board-svg').length,
    url: location.pathname + location.search,
  }))
  console.log(`普通刷新 #${i}: ${ok ? 'OK' : 'FAIL'} ${ms}ms`, JSON.stringify(info))
  allOk = ok && allOk
}
await page.close()

// 再开两个新标签页（模拟"重新打开网页"）
allOk = (await open('重新打开(标签页2)')) && allOk
allOk = (await open('重新打开(标签页3)')) && allOk

// 交互冒烟
const p = await ctx.newPage()
await p.goto(URL, { waitUntil: 'networkidle' })
await p.waitForSelector('svg.board-svg')
const box = await p.locator('svg.board-svg').boundingBox()
await p.mouse.click(box.x + 40, box.y + 25)
await p.waitForTimeout(150)
const on = await p.locator('.edge-on').count()
await p.screenshot({ path: 'output/final-board.png', fullPage: true })
console.log('交互冒烟: 点击落边 =', on, on === 1 ? 'OK' : 'FAIL')
await p.close()

await ctx.close()
fs.rmSync(ROOT, { recursive: true, force: true })
console.log(allOk ? '\n全部通过：每次打开/普通刷新都进入游玩界面' : '\n存在失败项')
