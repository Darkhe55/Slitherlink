/** 自定义题板：载入即入库 + 刷新后仍在列表 + 进度能接上 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { edgePath, profileDir } from './_browser.mjs'

const EXE = edgePath()
const URL = 'http://127.0.0.1:5177/'
const PROFILE = profileDir('customkeep')

// 备份/恢复项目内存储
const BACKUP = 'output/.store-backup'
if (fs.existsSync('data')) fs.cpSync('data', BACKUP, { recursive: true })
else fs.mkdirSync(BACKUP, { recursive: true })
const restore = () => {
  fs.rmSync('data', { recursive: true, force: true })
  if (fs.readdirSync(BACKUP).length) fs.cpSync(BACKUP, 'data', { recursive: true })
  else fs.rmSync(BACKUP, { recursive: true, force: true })
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  executablePath: EXE,
  viewport: { width: 1440, height: 960 },
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')

// 打开自定义编辑器，生成 30x30，填几个数字，载入题板
await page.click('#btn-custom')
await page.waitForTimeout(150)
await page.fill('#custom-w', '30')
await page.fill('#custom-h', '30')
await page.click('#custom-regen')
await page.waitForTimeout(300)
// 点几个格子填数（每次点击 空→0→1→2→3→空）
for (let i = 0; i < 6; i++) {
  await page.locator('.custom-cell').nth(i * 37).click()
}
await page.waitForTimeout(150)
await page.click('#custom-apply')
await page.waitForTimeout(400)

const inList = await page.evaluate(() =>
  [...document.querySelectorAll('.puzzle-item .title')].map((t) => t.textContent),
)
console.log('载入后列表含自定义 30×30:', inList.includes('自定义 · 30×30'), '| 列表前3:', inList.slice(0, 3).join(' / '))
console.log('状态栏:', (await page.locator('#status').innerText()).slice(0, 60))

// 画一条边，然后刷新
const box = await page.locator('svg.board-svg').boundingBox()
await page.mouse.click(box.x + 40, box.y + 30)
await page.waitForTimeout(200)
const drawn = await page.locator('.edge-on').count()
console.log('手画一条边后 环边数:', drawn)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')
await page.waitForTimeout(600)
const after = await page.evaluate(() => ({
  list: [...document.querySelectorAll('.puzzle-item .title')].map((t) => t.textContent),
  status: document.querySelector('#status').textContent,
  on: document.querySelectorAll('.edge-on').length,
  items: document.querySelectorAll('.puzzle-item').length,
}))
console.log('刷新后列表仍含自定义 30×30:', after.list.includes('自定义 · 30×30'))
console.log('刷新后状态栏:', after.status.slice(0, 60))
console.log('刷新后 环边数:', after.on, after.on === drawn ? '=> 进度接上了 OK' : '=> 进度丢失 FAIL')

// 项目内文件确认
const lib = JSON.parse(fs.readFileSync('data/library.json', 'utf8'))
console.log('data/library.json:', lib.map((p) => `${p.name}(${p.width}x${p.height})`).join(', '))

await ctx.close()
restore()
console.log('已恢复项目内存储')
