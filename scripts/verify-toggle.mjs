/**
 * 「逻辑解题」单按钮总开关验证：
 * 1) 空闲点击 → 从当前状态推理并开始回放，其余按钮被屏蔽，按钮变"停止回放"
 * 2) 回放中点击 → 立即停止并恢复其余按钮
 * 3) P 键仍可暂停/继续
 */
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'
import fs from 'node:fs'

const URL = 'http://127.0.0.1:5177/'
const PROFILE = profileDir(process.env.PROFILE_NAME || 'default')
fs.rmSync(PROFILE, { recursive: true, force: true })

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  executablePath: edgePath(),
  viewport: { width: 1440, height: 960 },
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')

await page.locator('.puzzle-item', { hasText: '经典 · 5×5 A' }).first().click()
await page.waitForTimeout(200)

const done = () =>
  page.evaluate(
    () =>
      document.querySelectorAll('.edge-on').length +
      document.querySelectorAll('.edge-off-mark').length,
  )
const btn = () =>
  page.evaluate(() => {
    const b = document.getElementById('btn-logic')
    return { text: b.textContent, disabled: b.disabled, cls: b.className }
  })
const others = () =>
  page.evaluate(() =>
    ['btn-check', 'btn-undo', 'btn-redo', 'btn-hint', 'btn-solve', 'btn-clear'].map(
      (id) => `${id}:${document.getElementById(id).disabled ? 'off' : 'on'}`,
    ).join(' '),
  )
const status = () => page.locator('#status').innerText()

// —— 1) 空闲态 ——
console.log('1 空闲:', JSON.stringify(await btn()), '|', await others())

// 先手动落一条边，验证"从当前状态"开始
const vb = await page.evaluate(() => {
  const s = document.querySelector('svg.board-svg')
  const box = s.getBoundingClientRect()
  return { x: box.x, y: box.y, w: s.viewBox.baseVal.width, h: s.viewBox.baseVal.height, bw: box.width, bh: box.height }
})
const sx = vb.bw / vb.w
const sy = vb.bh / vb.h
const cell = 64
const pad = cell * 0.35
await page.mouse.click(vb.x + (pad + cell / 2) * sx, vb.y + pad * sy)
await page.waitForTimeout(120)
const manual = await done()
console.log('   手动落边后已确定边数:', manual)

// 第一次点击：开始
await page.click('#btn-logic')
await page.waitForTimeout(900)
console.log('2 回放中:', JSON.stringify(await btn()), '|', await others())
console.log('   状态:', (await status()).slice(0, 50))

// —— 3) 第二次点击：停止 ——
const beforeStop = await done()
await page.click('#btn-logic')
await page.waitForTimeout(400)
const afterStop = await done()
console.log('3 停止后:', JSON.stringify(await btn()), '|', await others())
console.log('   已确定边数:', beforeStop, '->', afterStop, afterStop === beforeStop ? '（已停住）' : '（仍在动？）')
await page.waitForTimeout(1200)
const later = await done()
console.log('   再等 1.2s:', later, later === afterStop ? 'OK 真的停了' : 'FAIL 还在播放')

// 停止后可以正常再用其他按钮
await page.click('#btn-check')
await page.waitForTimeout(120)
console.log('4 停止后检查按钮可用:', (await status()).slice(0, 40))

// —— 5) 再次点击可以重新开始（清空后从空盘推）——
await page.click('#btn-clear')
await page.waitForTimeout(150)
await page.click('#btn-logic')
await page.waitForTimeout(900)
console.log('5 再次开始:', JSON.stringify(await btn()), '|', await others())

// —— 6) P 暂停/继续 ——
await page.keyboard.press('p')
await page.waitForTimeout(150)
const p1 = await done()
await page.waitForTimeout(1000)
const p2 = await done()
console.log('6 P 暂停:', p2 === p1 ? 'OK' : 'FAIL', '|', (await status()).slice(0, 40))
await page.keyboard.press('p')
await page.waitForTimeout(1000)
console.log('   P 继续:', (await done()) > p2 ? 'OK' : 'FAIL')

// 跑到自然结束
await page.waitForFunction(
  () => document.getElementById('btn-logic').textContent === '逻辑解题',
  { timeout: 180000 },
)
console.log('7 自然结束:', JSON.stringify(await btn()), '|', await others())
console.log('   最终状态:', (await status()).slice(0, 50))
console.log('错误:', errs.join(' ;; ') || '无')

await ctx.close()
fs.rmSync(PROFILE, { recursive: true, force: true })
