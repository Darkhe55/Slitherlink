import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

/** 题库与进度存放在项目内，与浏览器配置目录无关 */
const DATA_DIR = path.resolve(__dirname, 'data')
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json')
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json')

function readJson(file: string, fallback: unknown): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function readStoreFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  return {
    version: 1,
    library: readJson(LIBRARY_FILE, []),
    progress: readJson(PROGRESS_FILE, {}),
    lastPuzzle: (readJson(path.join(DATA_DIR, 'last-puzzle.json'), null) as string | null) ?? null,
  }
}

function writeStoreFiles(data: {
  library?: unknown
  progress?: unknown
  lastPuzzle?: string | null
}) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const write = (file: string, value: unknown) => {
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, file)
  }
  if (data.library !== undefined) write(LIBRARY_FILE, data.library)
  if (data.progress !== undefined) write(PROGRESS_FILE, data.progress)
  write(path.join(DATA_DIR, 'last-puzzle.json'), data.lastPuzzle ?? null)
}

/**
 * 为什么必须自己占一个端口：
 * 浏览器 HTTP 缓存按 origin(host:port)+path 存储。5173 是 Vite 的默认端口，
 * 机器上任何其它 Vite 工具（以及本项目以前的旧版本）都会往这个 origin 里写
 * /src/main.ts 之类的缓存条目；普通刷新会直接复用这些条目 → 模块图是旧的 →
 * 页面卡在加载。只有 Ctrl+Shift+R 绕过缓存才好。兄弟项目正是各占一个端口
 * （划斜线 5174 / 帐篷 5175 / 黑白 5176）所以从来不受影响。
 */
const PORT = 5177

/** 开发/预览都不允许浏览器缓存任何响应，避免产生新的陈旧条目 */
const noCacheHeaders = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

/**
 * 题板审计页（dev-only）：在用户浏览器里跑，读 localStorage 里的题库，
 * 逐帧检查规则推导是否破坏硬约束，结果 post 回 /__audit-result 打到终端。
 */
function auditPageHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>题板审计</title>
<style>
body{font:13px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;background:#f6f2ea;color:#1c1b18;margin:0;padding:24px}
pre{white-space:pre-wrap;word-break:break-all;background:#fffdf8;border:1px solid #d9d2c3;border-radius:12px;padding:16px}
h1{font-size:16px;margin:0 0 12px}
</style>
</head>
<body>
<h1>题板审计（开发期工具，不影响游戏）</h1>
<pre id="out">running…</pre>
<script type="module">
const UNK=0, ON=1, OFF=2
const out=document.getElementById('out')
const say=(s)=>{ out.textContent += (out.textContent==='running…'?'':'\\n') + s }
const logic = await import('/src/logic.ts')
const puz = await import('/src/puzzles.ts')

const saved = JSON.parse(localStorage.getItem('shuhui-saved-puzzles') || '[]')
const lastId = localStorage.getItem('shuhui-last-puzzle')
const saveRaw = lastId ? localStorage.getItem('shuhui-save:' + lastId) : null
say('本地题库: ' + saved.length + ' 题；上次题目: ' + lastId + '；有存档: ' + !!saveRaw)

const inSaved = saved.some((p) => p.id === lastId)
let puzzle = inSaved ? saved.find((p) => p.id === lastId) : null
if (!puzzle) {
  const builtin = puz.puzzles.find((p) => p.id === lastId)
  if (builtin) puzzle = builtin
  else if (saved.length) {
    // 上次玩的题不在已保存题库里（只「载入题板」没「保存到题库」）→ 用保存列表里最大的自定义题
    puzzle = saved.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0]
    say('注意：上次题目 ' + lastId + ' 不在已保存题库中，改审计 ' + puzzle.name)
  } else puzzle = puz.puzzles[0]
}
// localStorage 里自定义题库的 cells 是字符串，统一成数组
if (typeof puzzle.cells === 'string') {
  puzzle.cells = [...puzzle.cells].map((ch) => (ch === '.' ? null : Number(ch)))
}
const w = puzzle.width, h = puzzle.height
say('审计对象: ' + puzzle.name + ' ' + w + 'x' + h + ' id=' + puzzle.id)
const hIdx=(hx,hy)=>hy*(w+2)+hx
const vIdx=(vx,vy)=>vy*(w+1)+vx
const ce=(cx,cy)=>({top:hIdx(cx+1,cy),bottom:hIdx(cx+1,cy+1),left:vIdx(cx,cy+1),right:vIdx(cx+1,cy+1)})
const ve=(px,py)=>({west:hIdx(px,py),east:hIdx(px+1,py),north:vIdx(px,py),south:vIdx(px,py+1)})

let hArr=new Array((h+1)*(w+2)).fill(OFF), vArr=new Array((h+2)*(w+1)).fill(OFF)
for (let hy=0;hy<=h;hy++) for (let hx=1;hx<=w;hx++) hArr[hIdx(hx,hy)]=UNK
for (let vy=1;vy<=h;vy++) for (let vx=0;vx<=w;vx++) vArr[vIdx(vx,vy)]=UNK
if (saveRaw) {
  try {
    const s = JSON.parse(saveRaw)
    if (s.width === w && s.height === h && Array.isArray(s.h) && Array.isArray(s.v)) {
      hArr = s.h.slice(); vArr = s.v.slice()
      say('已用当前存档作为起点（' + s.h.filter((x)=>x!==UNK).length + ' 横边 / ' + s.v.filter((x)=>x!==UNK).length + ' 竖边已定）')
    } else { say('存档尺寸不匹配，改用空盘') }
  } catch (e) { say('存档解析失败，改用空盘') }
}
const st = { puzzleId: puzzle.id, width: w, height: h, h: hArr, v: vArr }

const violations = (s) => {
  const bad = []
  for (let cy=0;cy<h;cy++) for (let cx=0;cx<w;cx++) {
    const n = puzzle.cells[cy*w+cx]
    if (n===null||n===undefined) continue
    const e=ce(cx,cy); let on=0, unk=0
    for (const k of ['top','bottom']) { const v=s.h[e[k]]; if (v===ON) on++; else if (v===UNK) unk++ }
    for (const k of ['left','right']) { const v=s.v[e[k]]; if (v===ON) on++; else if (v===UNK) unk++ }
    // 已无解：环边超过数字，或剩余未知边补不上缺口
    if (on > n || on + unk < n) bad.push({kind:'cell',at:'('+cx+','+cy+')',num:n,on,unk})
  }
  for (let py=0;py<=h;py++) for (let px=0;px<=w;px++) {
    const t=ve(px,py); let on=0, unk=0
    for (const [ax,i] of [['h',t.west],['h',t.east],['v',t.north],['v',t.south]]) {
      const v = ax==='h' ? s.h[i] : s.v[i]
      if (v===ON) on++; else if (v===UNK) unk++
    }
    // 顶点度数只能是 0 或 2
    if (on > 2) bad.push({kind:'vertex',at:'('+px+','+py+')',on,unk})
    else if (on === 1 && unk === 0) bad.push({kind:'vertex',at:'('+px+','+py+')',on,unk,note:'度数1且无未知'})
    else if (on === 0 && unk === 1) bad.push({kind:'vertex',at:'('+px+','+py+')',on,unk,note:'将成度数1'})
  }
  return bad
}

const t0 = performance.now()
const plan = logic.planLogicSolve(puzzle, st)
const ms = Math.round(performance.now() - t0)
say('推理完成: ' + plan.frames.length + ' 帧 / ' + plan.ruleSteps + ' 规则步 / saturated=' + plan.saturated + ' / ' + ms + 'ms')

const work = { h: hArr.slice(), v: vArr.slice() }
const inputBad = violations(work)
say('输入状态硬约束违反: ' + inputBad.length + (inputBad.length ? ' => ' + JSON.stringify(inputBad.slice(0,4)) : ''))

let first = null
let violFrames = 0
for (let i=0;i<plan.frames.length;i++) {
  const f = plan.frames[i]
  if (f.change.axis==='h') work.h[f.change.index]=f.change.to
  else work.v[f.change.index]=f.change.to
  const bad = violations(work)
  if (bad.length) {
    violFrames++
    if (!first) first = { step: i, rule: f.rule, label: f.label, change: f.change, violations: bad.slice(0,5) }
  }
}
say('制造硬约束违反的帧数: ' + violFrames)
say('第一条制造违反的帧: ' + JSON.stringify(first))
say('终态硬约束违反总数: ' + violations(work).length)

// 每档步数的违反分布（用户报的是 1173 步附近）
const buckets = {}
{
  const work2 = { h: hArr.slice(), v: vArr.slice() }
  for (let i=0;i<plan.frames.length;i++) {
    const f = plan.frames[i]
    if (f.change.axis==='h') work2.h[f.change.index]=f.change.to
    else work2.v[f.change.index]=f.change.to
    if (violations(work2).length) {
      const b = Math.floor(i/200)*200
      buckets[b] = (buckets[b]||0)+1
    }
  }
}
say('每 200 步的违反帧数分布: ' + JSON.stringify(buckets))

// 规则命中统计
const ruleHits = {}
for (const f of plan.frames) ruleHits[f.rule] = (ruleHits[f.rule]||0)+1
say('规则命中: ' + JSON.stringify(ruleHits))

const report = {
  puzzle: { id: puzzle.id, name: puzzle.name, width: w, height: h, cells: puzzle.cells.map((c)=>c===null||c===undefined?'.':String(c)).join('') },
  fromSave: !!saveRaw,
  frames: plan.frames.length,
  ruleSteps: plan.ruleSteps,
  saturated: plan.saturated,
  ms,
  inputViolations: inputBad.length,
  violatingFrames: violFrames,
  first,
  finalViolations: violations(work).length,
  buckets,
  ruleHits,
}
say('REPORT_JSON=' + JSON.stringify(report))
try { await fetch('/__audit-result', { method: 'POST', body: JSON.stringify(report) }) } catch (e) {}
say('（结果已发送到开发服务器终端）')
</script>
</body>
</html>`
}

/**
 * 开发期守卫
 */
function devGuards(): Plugin {
  return {
    name: 'shuhui-dev-guards',
    configureServer(server) {
      // ① 文档导航时清掉该 origin 的 HTTP 缓存：
      //    no-store 只对"这次真的发了请求"的响应生效，对已经存在的陈旧条目无效，
      //    必须主动清理，才能保证每次打开/刷新都拉到新模块。
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path === '/' || path === '/index.html') {
          res.setHeader('Clear-Site-Data', '"cache"')
        }
        next()
      })

      // ② index.html 的兜底脚本把"页面为什么没起来"post 到这里，直接出现在终端
      server.middlewares.use('/__boot-failure', (req, res) => {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          server.config.logger.error(`[boot] 页面启动失败：${body || '(无详情)'}`)
          res.statusCode = 204
          res.end()
        })
      })

      // ③ 题板存储：题库/进度/上次题目读写到项目内 data/ 目录
      //    GET  → 返回 data/library.json + data/progress.json + data/last-puzzle.json
      //    POST → 原子写回这三个文件（先写 .tmp 再 rename）
      server.middlewares.use('/__store', (req, res, next) => {
        const p = (req.url || '').split('?')[0]
        if (p !== '/' && p !== '') return next()
        if (req.method === 'GET') {
          try {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(readStoreFiles()))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}')
              writeStoreFiles({
                library: Array.isArray(data.library) ? data.library : [],
                progress: data.progress && typeof data.progress === 'object' ? data.progress : {},
                lastPuzzle: typeof data.lastPuzzle === 'string' ? data.lastPuzzle : null,
              })
              res.statusCode = 204
            } catch (e) {
              res.statusCode = 400
              res.end(String(e))
              return
            }
            res.end()
          })
          return
        }
        next()
      })

      // ④ 题板审计：在用户自己的浏览器里跑（同 origin，能读到 localStorage 里的题库），
      //    结果 post 回来打到终端，避免再去读项目外的浏览器配置目录。
      server.middlewares.use('/__audit', (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path !== '/' && path !== '') return next()
        if (req.method !== 'GET') return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(auditPageHtml())
      })
      server.middlewares.use('/__audit-result', (req, res) => {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          server.config.logger.info(`[audit] ${body}`)
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [devGuards()],
  server: {
    host: '127.0.0.1',
    port: PORT,
    // 端口被占用时直接失败，而不是悄悄换端口：否则浏览器里已打开的标签页会连到旧服务
    strictPort: true,
    headers: noCacheHeaders,
    watch: {
      // 输出目录里常有被其它程序锁定的文件（截图、日志、浏览器 profile），
      // chokidar 监视到锁定文件会抛 EBUSY 并直接搞崩 dev server
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/output/**'],
    },
  },
  preview: {
    headers: noCacheHeaders,
    strictPort: true,
  },
})
