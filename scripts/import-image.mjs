/**
 * 数回题板图片导入（自动字形识别版）
 *
 * 用法：
 *   node scripts/import-image.mjs <图片路径> [--name 名称] [--series human]
 *                                   [--append] [--verify] [--map 0=3,1=2,...]
 *
 * 流程：
 *   1. 连通域定圆点阵 → 每格中心裁切 → 字形聚类；
 *   2. 根据字形结构自动把簇映射到 0/1/2/3（--map 可人工覆盖）；
 *   3. 预览数字网格；
 *   4. --append 写入 src/puzzles-data.ts；
 *   5. --verify 额外启动 Vite 调 solver 检查是否唯一解（默认跳过）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'

const args = process.argv.slice(2)
const imageArg = args.find((a) => !a.startsWith('--'))
if (!imageArg) {
  console.error(
    '用法：node scripts/import-image.mjs <图片路径> [--name 名称] [--series human] [--append] [--verify] [--map 0=3,1=2,...]',
  )
  process.exit(1)
}
const has = (flag) => args.includes(flag)
const arg = (flag, fallback = '') => {
  const i = args.indexOf(flag)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
const IMAGE = path.resolve(imageArg)
if (!fs.existsSync(IMAGE)) {
  console.error('找不到图片:', IMAGE)
  process.exit(1)
}
const append = has('--append')
const verify = has('--verify')
const nameOpt = arg('--name')
const series = arg('--series', 'human')

const mapArg = (() => {
  const i = args.findIndex((a) => a === '--map' || a.startsWith('--map='))
  if (i < 0) return null
  return args[i].startsWith('--map=') ? args[i].slice(6) : (args[i + 1] ?? '')
})()
const manualMap = {}
if (mapArg) {
  for (const pair of mapArg.split(',')) {
    const [k, v] = pair.split('=')
    if (k !== undefined && v !== undefined) manualMap[Number(k)] = Number(v)
  }
}

// ───────────────────────── OCR ─────────────────────────
const ctx = await chromium.launchPersistentContext(profileDir('import'), {
  headless: true,
  executablePath: edgePath(),
  viewport: { width: 1600, height: 1800 },
})
const page = await ctx.newPage()
await page.goto('about:blank')
const url = 'data:image/png;base64,' + fs.readFileSync(IMAGE).toString('base64')

const r = await page.evaluate(async (u) => {
  const img = new Image()
  img.src = u
  await img.decode()
  const W = img.naturalWidth
  const H = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, W, H).data
  const dark = (x, y) => {
    const i = (y * W + x) * 4
    return d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 110
  }
  const lum = (x, y) => {
    const i = (y * W + x) * 4
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  }

  // 1) 连通域找圆点质心 → 点阵
  const seen = new Uint8Array(W * H)
  const dots = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x
      if (seen[k] || !dark(x, y)) continue
      let n = 0,
        sx = 0,
        sy = 0,
        minX = x,
        maxX = x,
        minY = y,
        maxY = y
      const stack = [[x, y]]
      seen[k] = 1
      while (stack.length) {
        const [cx, cy] = stack.pop()
        n++
        sx += cx
        sy += cy
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const nk = ny * W + nx
          if (seen[nk] || !dark(nx, ny)) continue
          seen[nk] = 1
          stack.push([nx, ny])
        }
      }
      const bw = maxX - minX + 1
      const bh = maxY - minY + 1
      if (n >= 55 && n <= 200 && Math.abs(bw - bh) <= 4 && bw >= 7 && bw <= 15) {
        dots.push({ x: sx / n, y: sy / n })
      }
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
  const T = 210,
    G = 24,
    N = 16
  const cellRaw = (cx, cy) => {
    const x0 = colX[cx],
      x1 = colX[cx + 1],
      y0 = rowY[cy],
      y1 = rowY[cy + 1]
    const mx = x0 + (x1 - x0) * 0.225,
      my = y0 + (y1 - y0) * 0.225
    const mw = (x1 - x0) * 0.55,
      mh = (y1 - y0) * 0.55
    const m = new Array(G * G).fill(0)
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        m[j * G + i] =
          lum(Math.round(mx + (mw * i) / (G - 1)), Math.round(my + (mh * j) / (G - 1))) < T
            ? 1
            : 0
      }
    return m
  }
  const norm = (m) => {
    let x0 = G,
      y0 = G,
      x1 = -1,
      y1 = -1,
      ink = 0
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++)
        if (m[j * G + i]) {
          ink++
          if (i < x0) x0 = i
          if (i > x1) x1 = i
          if (j < y0) y0 = j
          if (j > y1) y1 = j
        }
    if (!ink || x1 < x0) return null
    const bw = x1 - x0 + 1,
      bh = y1 - y0 + 1
    const out = new Array(N * N).fill(0)
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        out[j * N + i] =
          m[(y0 + Math.floor((bh * j) / N)) * G + (x0 + Math.floor((bw * i) / N))] ? 1 : 0
      }
    return { m: out, ink }
  }
  const sim = (a, b) => {
    let i2 = 0,
      u = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] && b[i]) i2++
      if (a[i] || b[i]) u++
    }
    return u ? i2 / u : 0
  }

  // 3) 聚类
  const protos = []
  const assign = []
  for (let cy = 0; cy < nRows; cy++) {
    const row = []
    for (let cx = 0; cx < nCols; cx++) {
      const n = norm(cellRaw(cx, cy))
      if (!n || n.ink < 8) {
        row.push(-1)
        continue
      }
      let best = -1,
        bs = 0
      for (let k = 0; k < protos.length; k++) {
        const s = sim(n.m, protos[k].m)
        if (s > bs) {
          bs = s
          best = k
        }
      }
      if (best >= 0 && bs >= 0.8) {
        protos[best].count++
        row.push(best)
      } else {
        protos.push({ m: n.m, count: 1 })
        row.push(protos.length - 1)
      }
    }
    assign.push(row)
  }
  return { nCols, nRows, assign, protos: protos.map((p) => ({ m: p.m, count: p.count })) }
}, url)

// 用系统无衬线字体生成 0–3 的参考字形（16×16 二值），用于和图上字形做 IoU 匹配
const templates = await page.evaluate(() => {
  const N = 16
  const normRaw = (m) => {
    let x0 = 24,
      y0 = 24,
      x1 = -1,
      y1 = -1
    for (let j = 0; j < 24; j++)
      for (let i = 0; i < 24; i++)
        if (m[j * 24 + i]) {
          if (i < x0) x0 = i
          if (i > x1) x1 = i
          if (j < y0) y0 = j
          if (j > y1) y1 = j
        }
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    const out = new Array(N * N).fill(0)
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        out[j * N + i] =
          m[(y0 + Math.floor((bh * j) / N)) * 24 + (x0 + Math.floor((bw * i) / N))] ? 1 : 0
      }
    return out
  }
  const c = document.createElement('canvas')
  c.width = 80
  c.height = 80
  const g = c.getContext('2d', { willReadFrequently: true })
  const res = {}
  for (const ch of ['0', '1', '2', '3']) {
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 80, 80)
    g.fillStyle = '#000'
    g.font = '700 60px Arial'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(ch, 40, 40)
    const d = g.getImageData(0, 0, 80, 80).data
    const raw = new Array(24 * 24).fill(0)
    for (let j = 0; j < 24; j++)
      for (let i = 0; i < 24; i++) {
        const x = Math.floor((i * 80) / 24)
        const y = Math.floor((j * 80) / 24)
        raw[j * 24 + i] = d[(y * 80 + x) * 4] < 128 ? 1 : 0
      }
    res[ch] = normRaw(raw)
  }
  return res
})
await ctx.close()

// ─────────────────── 自动字形分类 ───────────────────
const N = 16
function features(m) {
  let ink = 0,
    x0 = N,
    x1 = -1,
    y0 = N,
    y1 = -1
  const rowCount = new Array(N).fill(0)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++)
      if (m[j * N + i]) {
        ink++
        rowCount[j]++
        if (i < x0) x0 = i
        if (i > x1) x1 = i
        if (j < y0) y0 = j
        if (j > y1) y1 = j
      }
  const spanOfRow = (j) => {
    let a = N
    let b = -1
    for (let i = 0; i < N; i++)
      if (m[j * N + i]) {
        if (i < a) a = i
        if (i > b) b = i
      }
    return b >= 0 ? b - a + 1 : 0
  }
  const topSpan = spanOfRow(y0)
  const bottomSpan = spanOfRow(y1)
  let middleMax = 0
  for (let j = y0 + 1; j < y1; j++) middleMax = Math.max(middleMax, spanOfRow(j))
  // 包围盒内部背景连通块（洞）数量；数字 0 一般有 1 个洞
  const seen = new Uint8Array(N * N)
  let holes = 0
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (m[j * N + i] || seen[j * N + i]) continue
      if (i < x0 || i > x1 || j < y0 || j > y1) {
        seen[j * N + i] = 1
        continue
      }
      let touches = false
      const stack = [[i, j]]
      seen[j * N + i] = 1
      while (stack.length) {
        const [x, y] = stack.pop()
        if (x <= x0 || x >= x1 || y <= y0 || y >= y1) touches = true
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx,
            ny = y + dy
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue
          if (seen[ny * N + nx] || m[ny * N + nx]) continue
          seen[ny * N + nx] = 1
          stack.push([nx, ny])
        }
      }
      if (!touches) holes++
    }
  const longRows = rowCount.filter((v) => v >= 9).length
  return { ink, holes, longRows, topSpan, bottomSpan, middleMax }
}

const sim = (a, b) => {
  let i2 = 0
  let u = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) i2++
    if (a[i] || b[i]) u++
  }
  return u ? i2 / u : 0
}

function classify(proto) {
  const f = features(proto.m)
  const scores = [0, 1, 2, 3]
    .map((digit) => [digit, sim(proto.m, templates[String(digit)])])
    .sort((a, b) => b[1] - a[1])
  const [best, bestScore] = scores[0]
  const [, secondScore] = scores[1]
  if (f.holes > 0) return { digit: 0, f, method: '结构' }
  // 字体接近内置无衬线模板时优先模板匹配
  if (bestScore - secondScore >= 0.14) {
    return { digit: best, f, method: '模板' }
  }
  // 粗体/低分辨率字体：1 的长横线很少，2 底横通常顶满，3 底横略短
  if (f.longRows <= 6) return { digit: 1, f, method: '结构' }
  if (f.bottomSpan >= 16) return { digit: 2, f, method: '结构' }
  return { digit: 3, f, method: '结构' }
}

const mapping = []
for (let k = 0; k < r.protos.length; k++) {
  const auto = classify(r.protos[k])
  const digit = manualMap[k] ?? auto.digit
  mapping[k] = digit
  const tag = manualMap[k] !== undefined ? '人工' : auto.method
  console.log(
    `簇${k}: ${digit}（${tag}，n=${r.protos[k].count}，墨迹 ${auto.f.ink}，长行 ${auto.f.longRows}，洞 ${auto.f.holes}）`,
  )
}

const rows = r.assign.map((row) =>
  row.map((c) => (c < 0 ? '.' : String(mapping[c] ?? 0))).join(''),
)
const cells = rows.join('')
const width = r.nCols
const height = r.nRows
console.log(`\n识别网格：${width}×${height}，共 ${width * height} 格`)
rows.forEach((row, i) => console.log(String(i).padStart(2) + ' ' + row))

if (!append) {
  console.log('\n预览模式（未写入）。加 --append 写入题库。')
  process.exit(0)
}

// ─────────────────── 可选唯一解校验 ───────────────────
let solH = ''
let solV = ''
if (verify) {
  const PORT = 5177
  const server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', windowsHide: true },
  )
  process.on('exit', () => server.kill())
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  let ready = false
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`)
      if (res.ok) {
        ready = true
        break
      }
    } catch {
      /* wait */
    }
    await sleep(250)
  }
  if (!ready) {
    server.kill()
    throw new Error('Vite 启动超时，无法执行 --verify')
  }
  const vctx = await chromium.launchPersistentContext(profileDir('import-verify'), {
    headless: true,
    executablePath: edgePath(),
  })
  const vpage = await vctx.newPage()
  await vpage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
  const parsed = [...cells].map((ch) => (ch === '.' ? null : Number(ch)))
  const result = await vpage.evaluate(
    async ({ puzzle }) => {
      const mod = await import('/src/solver.ts')
      const counted = mod.countSolutions(puzzle, 2, 2_000_000)
      return {
        count: counted.count,
        capped: counted.capped,
        timedOut: counted.timedOut,
        h: counted.first ? counted.first.h.join('') : '',
        v: counted.first ? counted.first.v.join('') : '',
      }
    },
    { puzzle: { id: 'import-temp', name: 'import-temp', width, height, cells: parsed } },
  )
  await vctx.close()
  server.kill()
  console.log(`唯一解校验：count=${result.count} capped=${result.capped} timedOut=${result.timedOut}`)
  if (result.count === 1 && !result.capped && !result.timedOut) {
    solH = result.h
    solV = result.v
  } else {
    console.warn('未确认唯一解，条目不写入参考解。')
  }
}

const id = `img-${width}x${height}-${Date.now().toString(36)}`
const name = nameOpt || `识图 · ${width}×${height}`
const entry = `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, width: ${width}, height: ${height}, difficulty: "hard", series: ${JSON.stringify(series)}, cells: ${JSON.stringify(cells)}, solH: ${JSON.stringify(solH)}, solV: ${JSON.stringify(solV)} },\n`
const dataFile = path.resolve('src/puzzles-data.ts')
const text = fs.readFileSync(dataFile, 'utf8').replace(/\r\n/g, '\n')
const marker = text.lastIndexOf('\n]')
if (marker < 0) throw new Error('puzzles-data.ts 格式异常：找不到结尾 ]')
fs.writeFileSync(dataFile, text.slice(0, marker + 1) + '\n' + entry + text.slice(marker + 1))
console.log(`已写入 src/puzzles-data.ts：${id} ${name}`)
