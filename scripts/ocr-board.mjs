/**
 * 题板图片识别（单文件版）
 *   node scripts/ocr-board.mjs [图片路径] [--map 0=3,1=2,2=1,...]
 * 流程：连通域定真实点阵 → 每格中心裁切 → 墨迹包围盒归一化 → 字形聚类
 *   - 不带 --map：打印每个簇的 ASCII 原型 + 用簇号表示的网格（供人眼识别后填映射）
 *   - 带 --map：直接输出数字网格（. 表示空格），并写入 output/cells/grid.txt
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { edgePath, profileDir } from './_browser.mjs'

const args = process.argv.slice(2)
const imgArg = args.find((a) => !a.startsWith('--'))
const jsonArg = args.includes('--json')
const mapIdx = args.findIndex((a) => a === '--map' || a.startsWith('--map='))
const mapArg = mapIdx >= 0 ? (args[mapIdx].startsWith('--map=') ? args[mapIdx] : `--map=${args[mapIdx + 1] || ''}`) : null
const SRC = path.resolve(imgArg || 'output/board-src.png')
if (!fs.existsSync(SRC)) {
  console.error('找不到图片:', SRC)
  process.exit(1)
}

const ctx = await chromium.launchPersistentContext(profileDir('ocr'), {
  headless: true,
  executablePath: edgePath(),
  viewport: { width: 1600, height: 1800 },
})
const page = await ctx.newPage()
const url = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64')
await page.goto('about:blank')

const r = await page.evaluate(async (u) => {
  const img = new Image()
  img.src = u
  await img.decode()
  const W = img.naturalWidth, H = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, W, H).data
  const dark = (x, y) => { const i = (y * W + x) * 4; return d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 110 }
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] }

  // 1) 连通域找圆点质心 → 点阵
  const seen = new Uint8Array(W * H)
  const dots = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x
    if (seen[k] || !dark(x, y)) continue
    let n = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y
    const stack = [[x, y]]
    seen[k] = 1
    while (stack.length) {
      const [cx, cy] = stack.pop()
      n++; sx += cx; sy += cy
      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const nk = ny * W + nx
        if (seen[nk] || !dark(nx, ny)) continue
        seen[nk] = 1
        stack.push([nx, ny])
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1
    if (n >= 55 && n <= 200 && Math.abs(bw - bh) <= 4 && bw >= 7 && bw <= 15) dots.push({ x: sx / n, y: sy / n })
  }
  dots.sort((a, b) => a.y - b.y)
  const rowsC = []
  for (const dt of dots) {
    const last = rowsC[rowsC.length - 1]
    if (last && Math.abs(dt.y - last.avg) < 8) {
      last.members.push(dt)
      last.avg = last.members.reduce((s, m) => s + m.y, 0) / last.members.length
    } else rowsC.push({ avg: dt.y, members: [dt] })
  }
  rowsC.sort((a, b) => a.avg - b.avg)
  for (const rc of rowsC) rc.members.sort((a, b) => a.x - b.x)
  const colX = rowsC[0].members.map((m) => m.x)
  const rowY = rowsC.map((rc) => rc.avg)
  const nCols = colX.length - 1
  const nRows = rowY.length - 1

  // 2) 每格中心 55% 二值化 → 包围盒归一化 16x16
  const T = 210, G = 24, N = 16
  const cellRaw = (cx, cy) => {
    const x0 = colX[cx], x1 = colX[cx + 1], y0 = rowY[cy], y1 = rowY[cy + 1]
    const mx = x0 + (x1 - x0) * 0.225, my = y0 + (y1 - y0) * 0.225
    const mw = (x1 - x0) * 0.55, mh = (y1 - y0) * 0.55
    const m = new Array(G * G).fill(0)
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      m[j * G + i] = lum(Math.round(mx + (mw * i) / (G - 1)), Math.round(my + (mh * j) / (G - 1))) < T ? 1 : 0
    }
    return m
  }
  const norm = (m) => {
    let x0 = G, y0 = G, x1 = -1, y1 = -1, ink = 0
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (m[j * G + i]) {
      ink++; if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j
    }
    if (!ink || x1 < x0) return null
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    const out = new Array(N * N).fill(0)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      out[j * N + i] = m[(y0 + Math.floor((bh * j) / N)) * G + (x0 + Math.floor((bw * i) / N))] ? 1 : 0
    }
    return { m: out, ink }
  }
  const sim = (a, b) => { let i2 = 0, u = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) i2++; if (a[i] || b[i]) u++ } return u ? i2 / u : 0 }

  // 3) 聚类
  const protos = []
  const assign = []
  for (let cy = 0; cy < nRows; cy++) {
    const row = []
    for (let cx = 0; cx < nCols; cx++) {
      const n = norm(cellRaw(cx, cy))
      if (!n || n.ink < 8) { row.push(-1); continue }
      let best = -1, bs = 0
      for (let k = 0; k < protos.length; k++) { const s = sim(n.m, protos[k].m); if (s > bs) { bs = s; best = k } }
      if (best >= 0 && bs >= 0.8) { protos[best].count++; row.push(best) }
      else { protos.push({ m: n.m, count: 1 }); row.push(protos.length - 1) }
    }
    assign.push(row)
  }
  return { nCols, nRows, assign, protos: protos.map((p) => ({ m: p.m, count: p.count })) }
}, url)

await ctx.close()

const outDir = path.resolve('output/cells')
fs.mkdirSync(outDir, { recursive: true })
if (jsonArg) {
  fs.writeFileSync(path.join(outDir, 'ocr.json'), JSON.stringify(r))
  console.log('已写入 output/cells/ocr.json')
}

console.log(`图片 ${path.basename(SRC)} → 网格 ${r.nCols} 列 x ${r.nRows} 行 = ${r.nCols * r.nRows} 格`)
console.log(`字形簇 ${r.protos.length} 个（数量 ${r.protos.map((p) => p.count).join(',')}）`)
r.protos.forEach((p, i) => {
  console.log(`--- 簇${i} (n=${p.count}) ---`)
  for (let j = 0; j < 16; j++) {
    let line = ''
    for (let k = 0; k < 16; k++) line += p.m[j * 16 + k] ? '#' : '.'
    console.log('   ' + line)
  }
})

const map = {}
if (mapArg) {
  for (const pair of mapArg.replace('--map', '').trim().split(',')) {
    const [k, v] = pair.split('=')
    if (k !== undefined && v !== undefined) map[Number(k)] = v
  }
}
const rows = r.assign.map((row) =>
  row.map((c) => (c < 0 ? '.' : (map[c] ?? `[${c}]`))).join(''),
)
console.log('\n网格（' + (mapArg ? '数字' : '簇号，[] 内为簇索引') + '）：')
rows.forEach((row, i) => console.log(String(i).padStart(2) + ' ' + row))
if (mapArg) {
  const dir = path.resolve('output/cells')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'grid.txt'), `${r.nCols} ${r.nRows}\n${rows.join('\n')}\n`)
  console.log(`\n已写入 output/cells/grid.txt（${r.nCols}x${r.nRows}）`)
}
