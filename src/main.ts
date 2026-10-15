import './styles.css'
import type { CellNumber, GameState, Move, Puzzle } from './types'
import { EdgeState as ES } from './types'
import {
  applyMove,
  createEmptyState,
  cycleEdge,
  deserializeState,
  edgeValue,
  invertMove,
  isPadEdge,
  lockPads,
  serializeState,
  setEdge,
} from './state'
import { puzzles as builtinPuzzles, getPuzzle, getReferenceSolution } from './puzzles'
import { loadSavedPuzzles, savePuzzleToLibrary } from './library'
import { clientToViewBox, hitTest, metricsFor, renderBoard, validateNow } from './render'
import { validate } from './validate'
import { planLogicSolve, type PlaybackFrame } from './logic'
import { displayMarks, type DisplayMark } from './coloring'
import { isMuted, playForEdge, resumeAudio, setMuted } from './audio'
import { solvePuzzle } from './solver'

const SAVE_PREFIX = 'shuhui-save:'
const LAST_PUZZLE_KEY = 'shuhui-last-puzzle'

interface Session {
  puzzle: Puzzle
  state: GameState
  undo: Move[]
  redo: Move[]
}

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel)
  if (!el) throw new Error(`missing ${sel}`)
  return el
}

function loadSave(puzzleId: string): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + puzzleId)
    if (!raw) return null
    const data = JSON.parse(raw) as {
      version: number
      puzzleId: string
      width: number
      height: number
      h: number[]
      v: number[]
    }
    if (data.version !== 1) return null
    return deserializeState(data)
  } catch {
    return null
  }
}

function saveState(session: Session): void {
  localStorage.setItem(
    SAVE_PREFIX + session.puzzle.id,
    JSON.stringify(serializeState(session.state)),
  )
}

function difficultyLabel(d: Puzzle['difficulty']): string {
  return d === 'easy' ? '入门' : d === 'medium' ? '进阶' : d === 'custom' ? '自定义' : '挑战'
}

const app = document.querySelector('#app')
if (!app) throw new Error('no #app')

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <h1>数回</h1>
      <p>沿格线画一条闭合环 · 每个数字等于周围环边数</p>
    </div>
    <div class="brand">
      <p style="margin:0">逻辑层为每个顶点保留四条边（含不可见 padding）</p>
    </div>
  </header>

  <div class="layout">
    <aside class="panel">
      <h2>题面</h2>
      <div class="toolbar" style="margin-top:0">
        <button class="btn" id="btn-random" type="button">随机抽题</button>
        <button class="btn" id="btn-custom" type="button">自定义</button>
        <button class="btn" id="btn-mute" type="button">音效：开</button>
      </div>
      <div class="puzzle-list" id="puzzle-list"></div>

      <div class="custom-editor" id="custom-editor" hidden>
        <h2>自定义题板</h2>
        <div class="custom-row">
          <label>宽 <input id="custom-w" type="number" min="2" max="40" value="5" /></label>
          <label>高 <input id="custom-h" type="number" min="2" max="60" value="5" /></label>
          <button class="btn" id="custom-regen" type="button">生成网格</button>
        </div>
        <div class="custom-hint">点击循环：空 → 0 → 1 → 2 → 3 → 空 ｜ 键盘：方向键移动，0–3 填数，. / 退格清空，Enter / Tab 下一格</div>
        <div class="custom-grid" id="custom-grid"></div>
        <div class="toolbar" style="margin-top:10px">
          <button class="btn primary" id="custom-apply" type="button">载入题板</button>
          <button class="btn" id="custom-save" type="button">保存到题库</button>
          <button class="btn" id="custom-solve" type="button">求解</button>
          <button class="btn" id="custom-logic" type="button">逻辑解题</button>
          <button class="btn danger" id="custom-close" type="button">关闭</button>
        </div>
        <div class="custom-msg" id="custom-msg"></div>
      </div>

      <div class="toolbar">
        <button class="btn primary" id="btn-check" type="button">检查</button>
        <button class="btn" id="btn-undo" type="button">撤销</button>
        <button class="btn" id="btn-redo" type="button">重做</button>
        <button class="btn" id="btn-hint" type="button">提示一格</button>
        <button class="btn" id="btn-logic" type="button">逻辑解题</button>
        <button class="btn" id="btn-solve" type="button">显示解</button>
        <button class="btn danger" id="btn-clear" type="button">清空</button>
      </div>

      <div class="status" id="status">选择左侧题目开始。点击格线：空 → 环 → × → 空。</div>

      <div class="legend">
        <div><kbd>点击</kbd> 切换边状态</div>
        <div><kbd>右键</kbd> 直接标 × · <kbd>拖拽</kbd> 平移画布</div>
        <div><kbd>滚轮</kbd> 缩放 · <kbd>+</kbd>/<kbd>−</kbd>/<kbd>0</kbd> 放大/缩小/复位</div>
        <div><kbd>Z</kbd> / <kbd>Shift+Z</kbd> 撤销 / 重做</div>
        <div><kbd>C</kbd> 检查 · <kbd>Esc</kbd> 清空 · <kbd>L</kbd> 逻辑解题</div>
        <div><kbd>R</kbd> 随机 · <kbd>M</kbd> 音效开关</div>
      </div>
    </aside>

    <main class="panel board-wrap" id="board-wrap">
      <div class="zoom-bar">
        <button class="btn" id="zoom-out" type="button" title="缩小">−</button>
        <span class="zoom-label" id="zoom-label">100%</span>
        <button class="btn" id="zoom-in" type="button" title="放大">+</button>
        <button class="btn" id="zoom-reset" type="button">复位</button>
      </div>
      <div id="board"></div>
    </main>
  </div>

  <p class="footer-note">循环必须唯一闭合 · 分叉与开口会在顶点上标红</p>
`

let session: Session | null = null

/** 内置 + 本地保存的自定义题库 */
let library: Puzzle[] = [...builtinPuzzles]

function refreshLibrary() {
  const saved = loadSavedPuzzles()
  const human = builtinPuzzles.filter(
    (p) => p.id.startsWith('human-') || p.name.includes('名题'),
  )
  const humanIds = new Set(human.map((p) => p.id))
  const rest = builtinPuzzles.filter((p) => !humanIds.has(p.id))
  library = [...saved, ...human, ...rest]
}

function findPuzzle(id: string): Puzzle | undefined {
  return library.find((p) => p.id === id) || getPuzzle(id)
}

/** 稳定排序：自定义已存 → 人拟名题 → 其它内置（保持原顺序） */
function sortedLibrary(): Puzzle[] {
  const rank = (p: Puzzle) => {
    if (p.difficulty === 'custom') return 0
    if (p.id.startsWith('human-') || p.name.includes('名题')) return 1
    return 2
  }
  return [...library].sort((a, b) => rank(a) - rank(b))
}

function currentResult() {
  if (!session) return null
  return validate(session.state, session.puzzle)
}

function setStatus(text: string, tone: 'ok' | 'bad' | 'solving' | '' = '') {
  const el = $('#status')
  el.textContent = text
  el.className = 'status' + (tone ? ` ${tone}` : '')
}

function renderPuzzleList() {
  refreshLibrary()
  const list = $('#puzzle-list')
  list.innerHTML = sortedLibrary()
    .map((p) => {
      const active = session?.puzzle.id === p.id ? ' active' : ''
      return `
        <button class="puzzle-item${active}" data-id="${p.id}" type="button">
          <span class="title">${p.name}</span>
          <span class="meta">${p.width}×${p.height} · ${difficultyLabel(p.difficulty)}</span>
        </button>
      `
    })
    .join('')

  list.querySelectorAll<HTMLButtonElement>('.puzzle-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const p = id ? findPuzzle(id) : undefined
      if (p) selectPuzzle(p)
    })
  })
}

function renderBoardOnly(colorGrid?: DisplayMark[] | null) {
  if (!session) return
  const result = validateNow(session.puzzle, session.state)
  const svg = renderBoard(session.puzzle, session.state, result, colorGrid)
  const board = $('#board')
  board.innerHTML = svg
  bindBoardEvents()
  applyViewBox()
}

/** 回放染色层：主色 1/2 + 细化类号 */
function currentColorGrid(): DisplayMark[] | null {
  if (!session) return null
  return displayMarks(session.puzzle, session.state)
}

function refresh() {
  renderPuzzleList()
  renderBoardOnly()
  if (!session) return
  const result = currentResult()
  if (!result) return
  if (result.solved) {
    setStatus('完成！环唯一闭合，数字全部吻合。', 'ok')
    return
  }
  const bits: string[] = []
  bits.push(`环边 ${countOn()} 条`)
  if (result.loop.kind === 'empty') bits.push('尚未落环')
  if (result.loop.kind === 'open') bits.push('存在开口（度数为 1 的点）')
  if (result.loop.kind === 'branch') bits.push('存在分叉')
  if (result.loop.kind === 'multiple') bits.push('多于一条环')
  if (result.loop.kind === 'single') bits.push('已是单环，继续对齐数字')
  if (result.badCells.length) bits.push(`${result.badCells.length} 格数字不符`)
  if (result.badPoints.length) bits.push(`${result.badPoints.length} 点度数异常`)
  setStatus(bits.join(' · '))
}

function countOn(): number {
  if (!session) return 0
  let n = 0
  for (const s of session.state.h) if (s === ES.On) n++
  for (const s of session.state.v) if (s === ES.On) n++
  return n
}

function selectPuzzle(puzzle: Puzzle) {
  stopLogic()
  const saved = loadSave(puzzle.id)
  session = {
    puzzle,
    state: saved ?? createEmptyState(puzzle),
    undo: [],
    redo: [],
  }
  lockPads(session.state)
  try {
    localStorage.setItem(LAST_PUZZLE_KEY, puzzle.id)
  } catch {
    /* localStorage 不可用时静默 */
  }
  refresh()
  setStatus(`已载入「${puzzle.name}」。点击格线画环。`)
}

function pushMove(move: Move) {
  if (!session) return
  applyMove(session.state, move)
  session.undo.push(move)
  session.redo.length = 0
  saveState(session)
}

function toggleEdge(axis: 'h' | 'v', index: number, force?: ES) {
  if (!session) return
  const { width: w, height: h } = session.puzzle
  if (isPadEdge(w, h, axis, index)) return
  const from = edgeValue(session.state, axis, index)
  const to = force !== undefined ? force : cycleEdge(from)
  if (from === to) return
  pushMove({ axis, index, from, to })
  refresh()
}

function bindBoardEvents() {
  const board = $('#board')
  const svg = board.querySelector('svg.board-svg') as SVGSVGElement | null
  if (!svg) return

  applyViewBox()

  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault()
  })

  let dragging = false
  let dragMoved = false
  let lastClient = { x: 0, y: 0 }
  let pendingToggle: { axis: 'h' | 'v'; index: number; force?: ES } | null = null

  const hitAt = (e: PointerEvent) => {
    if (!session) return null
    const vb = clientToViewBox(svg, e.clientX, e.clientY)
    if (!vb) return null
    const m = metricsFor(session.puzzle)
    return hitTest(m, session.puzzle, vb.x, vb.y)
  }

  svg.addEventListener('wheel', (e) => {
    e.preventDefault()
    const vb = clientToViewBox(svg, e.clientX, e.clientY)
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    setZoom(zoom * factor, vb ?? undefined)
  }, { passive: false })

  svg.addEventListener('pointerdown', (e) => {
    resumeAudio()
    if (e.button === 2) {
      const hit = hitAt(e)
      if (hit) toggleEdge(hit.axis, hit.index, ES.Forbidden)
      return
    }
    if (e.button !== 0) return

    lastClient = { x: e.clientX, y: e.clientY }
    dragging = true
    dragMoved = false
    const hit = hitAt(e)
    pendingToggle = hit ? { axis: hit.axis, index: hit.index } : null
    svg.setPointerCapture(e.pointerId)
  })

  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const dx = e.clientX - lastClient.x
    const dy = e.clientY - lastClient.y
    if (!dragMoved && Math.hypot(dx, dy) < 6) return
    dragMoved = true
    pendingToggle = null // 移动超过阈值 → 不算点击
    // 屏幕位移 → viewBox 位移
    const rect = svg.getBoundingClientRect()
    const { w, h } = baseVB()
    const scaleX = w / zoom / rect.width
    const scaleY = h / zoom / rect.height
    panX -= dx * scaleX
    panY -= dy * scaleY
    lastClient = { x: e.clientX, y: e.clientY }
    applyViewBox()
  })

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    try {
      svg.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (!dragMoved && pendingToggle) {
      toggleEdge(pendingToggle.axis, pendingToggle.index)
    }
    pendingToggle = null
  }
  svg.addEventListener('pointerup', endDrag)
  svg.addEventListener('pointercancel', endDrag)
}

function undo() {
  if (!session || !session.undo.length) return
  const move = session.undo.pop()!
  const inv = invertMove(move)
  setEdge(session.state, inv.axis, inv.index, inv.to)
  lockPads(session.state)
  session.redo.push(move)
  saveState(session)
  refresh()
}

function redo() {
  if (!session || !session.redo.length) return
  const move = session.redo.pop()!
  applyMove(session.state, move)
  session.undo.push(move)
  saveState(session)
  refresh()
}

function clearBoard() {
  if (!session) return
  stopLogic()
  session.state = createEmptyState(session.puzzle)
  session.undo = []
  session.redo = []
  saveState(session)
  refresh()
  setStatus('已清空当前盘面。')
}

function check() {
  const result = currentResult()
  if (!session || !result) return
  if (result.solved) {
    setStatus('正确！这就是数回的答案。', 'ok')
  } else if (result.badCells.length === 0 && result.loop.kind === 'single') {
    setStatus('环已闭合，但还有数字未对齐。', 'bad')
  } else {
    const parts: string[] = []
    if (result.badPoints.length) parts.push(`${result.badPoints.length} 个顶点度数异常`)
    if (result.badCells.length) parts.push(`${result.badCells.length} 格数字不符`)
    if (result.loop.kind === 'open') parts.push('环未闭合')
    if (result.loop.kind === 'branch') parts.push('出现分叉')
    if (result.loop.kind === 'multiple') parts.push('不是单环')
    if (result.loop.kind === 'empty') parts.push('尚未绘制')
    setStatus(parts.join(' · ') || '还差一点', 'bad')
  }
  refresh()
}

function showSolution() {
  if (!session) return
  const sol = getReferenceSolution(session.puzzle.id)
  if (sol) {
    session.state = {
      ...sol,
      h: sol.h.slice(),
      v: sol.v.slice(),
    }
    session.undo = []
    session.redo = []
    saveState(session)
    refresh()
    setStatus('已填入一组可行解。', 'ok')
    return
  }
  // 自定义盘：回溯求解
  const r = solvePuzzle(session.puzzle, 1_500_000)
  if (!r.solved || !r.solution) {
    setStatus(r.timedOut ? '求解超时。' : '无解或数字矛盾。', 'bad')
    return
  }
  session.state = r.solution
  session.undo = []
  session.redo = []
  saveState(session)
  refresh()
  setStatus('已填入一组可行解。', 'ok')
}

function hint() {
  if (!session) return
  let sol = getReferenceSolution(session.puzzle.id)
  if (!sol) {
    const r = solvePuzzle(session.puzzle, 1_500_000)
    if (!r.solved || !r.solution) {
      setStatus('暂时给不出提示。', 'bad')
      return
    }
    sol = r.solution
  }
  const { width: w, height: h } = session.puzzle
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      const idx = hy * (w + 2) + hx
      const cur = edgeValue(session.state, 'h', idx)
      const target = edgeValue(sol, 'h', idx)
      if (cur === ES.Unknown && target !== ES.Unknown) {
        pushMove({ axis: 'h', index: idx, from: cur, to: target })
        refresh()
        setStatus('已揭示一条边。', 'ok')
        return
      }
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const idx = vy * (w + 1) + vx
      const cur = edgeValue(session.state, 'v', idx)
      const target = edgeValue(sol, 'v', idx)
      if (cur === ES.Unknown && target !== ES.Unknown) {
        pushMove({ axis: 'v', index: idx, from: cur, to: target })
        refresh()
        setStatus('已揭示一条边。', 'ok')
        return
      }
    }
  }
  setStatus('当前已与可行解一致，或无未知边可提示。', 'ok')
}

// —— 画布缩放 / 平移 ——
let zoom = 1
let panX = 0
let panY = 0

function baseVB() {
  if (!session) return { w: 400, h: 400 }
  const m = metricsFor(session.puzzle)
  return { w: m.svgWidth, h: m.svgHeight }
}

function applyViewBox() {
  const svg = document.querySelector('svg.board-svg')
  if (!svg) return
  const { w, h } = baseVB()
  const vw = w / zoom
  const vh = h / zoom
  panX = Math.max(0, Math.min(panX, w - vw))
  panY = Math.max(0, Math.min(panY, h - vh))
  svg.setAttribute('viewBox', `${panX} ${panY} ${vw} ${vh}`)
  const label = document.getElementById('zoom-label')
  if (label) label.textContent = `${Math.round(zoom * 100)}%`
}

function setZoom(next: number, anchor?: { x: number; y: number }) {
  const { w, h } = baseVB()
  const oldZoom = zoom
  const z = Math.max(1, Math.min(5, next))
  if (anchor) {
    // 锚点（viewBox 坐标）在缩放后保持不动
    const u = (anchor.x - panX) / (w / oldZoom)
    const v = (anchor.y - panY) / (h / oldZoom)
    zoom = z
    panX = anchor.x - u * (w / zoom)
    panY = anchor.y - v * (h / zoom)
  } else {
    zoom = z
    // 以视口中心为锚
    const cx = panX + w / oldZoom / 2
    const cy = panY + h / oldZoom / 2
    panX = cx - w / zoom / 2
    panY = cy - h / zoom / 2
  }
  applyViewBox()
}

// —— 逻辑解题动画 ——
/** 一次完整弦振/涟漪的名义时长 */
const LOGIC_ANIM_MS = 720
let logicPlaying = false
let logicToken = 0

function sleep(ms: number, token: number): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(token === logicToken), ms)
  })
}

function edgeMidVB(axis: 'h' | 'v', index: number) {
  if (!session) return { x: 0, y: 0 }
  const m = metricsFor(session.puzzle)
  const w = session.puzzle.width
  if (axis === 'h') {
    const stride = w + 2
    const hy = Math.floor(index / stride)
    const hx = index % stride
    const seg = hx - 1
    return {
      x: m.pad + (seg + 0.5) * m.cell,
      y: m.pad + hy * m.cell,
    }
  }
  const stride = w + 1
  const vy = Math.floor(index / stride)
  const vx = index % stride
  const seg = vy - 1
  return {
    x: m.pad + vx * m.cell,
    y: m.pad + (seg + 0.5) * m.cell,
  }
}

function flashEdge(axis: 'h' | 'v', index: number, to: ES, streak = 1) {
  const board = $('#board')
  const svg = board.querySelector('svg.board-svg')
  if (!svg) return

  const sel = `[data-axis="${axis}"][data-index="${index}"]`
  const mid = edgeMidVB(axis, index)
  const ns = 'http://www.w3.org/2000/svg'

  // 音效：落环=弦振拨弦，排除=水滴；音高随连拍 n 抬升
  playForEdge(to === ES.On, streak, session!.puzzle.width >= 10 ? 1.15 : 1)

  if (to === ES.On) {
    const visual = svg.querySelector(`.edge-on${sel}`) as SVGLineElement | null
    if (!visual) return
    const x1 = Number(visual.getAttribute('x1'))
    const y1 = Number(visual.getAttribute('y1'))
    const x2 = Number(visual.getAttribute('x2'))
    const y2 = Number(visual.getAttribute('y2'))

    const path = document.createElementNS(ns, 'path')
    path.setAttribute('class', 'edge-on fx-string')
    path.setAttribute('data-axis', axis)
    path.setAttribute('data-index', String(index))
    path.setAttribute('fill', 'none')
    visual.replaceWith(path)

    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    // 连拍越多振幅略收，避免叠得太乱
    const amp0 = Math.min(len * 0.22, 14) / Math.sqrt(streak)
    const duration = LOGIC_ANIM_MS
    const t0 = performance.now()

    const frame = (now: number) => {
      const elapsed = now - t0
      const u = elapsed / duration
      if (u >= 1) {
        path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`)
        path.classList.remove('fx-string')
        return
      }
      const damp = Math.exp(-4.2 * u)
      const amp = amp0 * damp
      const phase = u * 7.5 * Math.PI * 2
      const N = 14
      let d = `M ${x1} ${y1}`
      for (let i = 1; i < N; i++) {
        const t = i / N
        const envelope = Math.sin(Math.PI * t)
        const off = amp * envelope * Math.sin(phase - t * 2.2 * Math.PI)
        d += ` L ${x1 + dx * t + nx * off} ${y1 + dy * t + ny * off}`
      }
      d += ` L ${x2} ${y2}`
      path.setAttribute('d', d)
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  } else {
    const group = svg.querySelector(`.edge-off-group${sel}`) as SVGGElement | null
    if (group) {
      group.classList.add('fx-pop')
      setTimeout(() => group.classList.remove('fx-pop'), 650)
    }

    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        const ring = document.createElementNS(ns, 'circle')
        ring.setAttribute('class', 'fx-ripple')
        ring.setAttribute('cx', String(mid.x))
        ring.setAttribute('cy', String(mid.y))
        ring.setAttribute('r', '6')
        svg.appendChild(ring)
        const anim = ring.animate(
          [
            { r: 4, opacity: 0.95, strokeWidth: 5 },
            { r: 28, opacity: 0.35, strokeWidth: 2 },
            { r: 48, opacity: 0, strokeWidth: 1 },
          ],
          {
            duration: 560 / Math.sqrt(streak),
            easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
            fill: 'forwards',
          },
        )
        anim.onfinish = () => ring.remove()
      }, k * (120 / streak))
    }
  }
}

function setButtonsDisabled(disabled: boolean) {
  for (const id of ['btn-check', 'btn-undo', 'btn-redo', 'btn-hint', 'btn-logic', 'btn-solve', 'btn-clear'] as const) {
    const el = document.getElementById(id) as HTMLButtonElement | null
    if (el) el.disabled = disabled
  }
  const board = document.getElementById('board')
  if (board) board.style.pointerEvents = disabled ? 'none' : ''
}

/**
 * 相位 2：只回放已算好的计划，不做任何推理。
 */
async function playLogicPlan(
  plan: { puzzleId: string; frames: PlaybackFrame[] },
  puzzleId: string,
  token: number,
) {
  const frames = plan.frames
  if (!frames.length) return

  for (let i = 0; i < frames.length; i++) {
    if (token !== logicToken) return
    if (!session || session.puzzle.id !== puzzleId) return

    const frame = frames[i]!
    const { change } = frame
    pushMove({ axis: change.axis, index: change.index, from: change.from, to: change.to })
    // 同步刷新染色层（半透明，不遮数字）
    renderBoardOnly(currentColorGrid())
    flashEdge(change.axis, change.index, change.to, frame.streak)

    const tone = change.to === ES.On ? '落环' : '排除'
    setStatus(
      `回放 [${i + 1}/${frames.length}] 规则${frame.rule} ${tone}×${frame.streak} · ${frame.label}`,
      'solving',
    )

    if (i < frames.length - 1) {
      const gap = Math.max(50, Math.round(LOGIC_ANIM_MS / frame.streak))
      const more = await sleep(gap, token)
      if (!more) return
    }
  }
  await sleep(LOGIC_ANIM_MS, token)
}

/**
 * 相位 1：完整推理出计划；相位 2：纯回放。
 * 动画不会与推理交错，也不会在播放中再跑规则。
 */
async function runLogicSolver() {
  if (!session || logicPlaying) return
  const puzzle = session.puzzle
  const snapshot = {
    h: session.state.h.slice(),
    v: session.state.v.slice(),
    puzzleId: session.state.puzzleId,
    width: session.state.width,
    height: session.state.height,
  }

  logicPlaying = true
  logicToken++
  const token = logicToken
  setButtonsDisabled(true)
  setStatus('逻辑解题：推理中…', 'solving')
  // 让“推理中”先上屏
  await sleep(16, token)
  if (token !== logicToken) return

  // —— 相位 1：一次性推完，写入计划 ——
  const plan = planLogicSolve(puzzle, snapshot)
  if (token !== logicToken) return

  if (!plan.frames.length) {
    logicPlaying = false
    setButtonsDisabled(false)
    setStatus('逻辑规则暂无新推演（可能已卡关或已全部确定）。')
    return
  }

  setStatus(
    `推理完成：${plan.frames.length} 帧 / ${plan.ruleSteps} 条规则步，开始回放…`,
    'solving',
  )
  // 回放一开始就上染色层，而不是等到最后
  renderBoardOnly(currentColorGrid())
  await sleep(280, token)
  if (token !== logicToken) return

  // —— 相位 2：只读计划回放（含染色动画）——
  try {
    await playLogicPlan(plan, puzzle.id, token)
  } catch {
    /* ignore */
  }

  if (token === logicToken) {
    logicPlaying = false
    setButtonsDisabled(false)
    if (session && session.puzzle.id === puzzle.id) {
      // 收尾仍显示染色
      renderBoardOnly(currentColorGrid())
      const result = currentResult()
      if (result?.solved) setStatus('逻辑解题完成，盘面已解出。', 'ok')
      else setStatus(`回放完毕（${plan.frames.length} 帧，染色已叠加）。`, 'ok')
    }
  }
}

function stopLogic() {
  logicToken++
  logicPlaying = false
  setButtonsDisabled(false)
}

function pickRandomPuzzle() {
  refreshLibrary()
  const cur = session?.puzzle.id
  const pool = cur ? library.filter((p) => p.id !== cur) : library
  const list = pool.length ? pool : library
  const p = list[Math.floor(Math.random() * list.length)]!
  selectPuzzle(p)
  setStatus(`随机抽到「${p.name}」。`)
}

function toggleMute() {
  const next = !isMuted()
  setMuted(next)
  const btn = document.getElementById('btn-mute')
  if (btn) btn.textContent = next ? '音效：关' : '音效：开'
  if (!next) resumeAudio()
}

// —— 自定义题板 ——
let customCells: CellNumber[] = []
let customW = 5
let customH = 5
/** 键盘光标所在格（0..W*H-1），-1 表示未选 */
let customCursor = 0

function customMsg(text: string, tone: 'ok' | 'bad' | '' = '') {
  const el = document.getElementById('custom-msg')
  if (!el) return
  el.textContent = text
  el.className = 'custom-msg' + (tone ? ` ${tone}` : '')
}

function customEditorOpen(): boolean {
  const panel = document.getElementById('custom-editor')
  return !!panel && !panel.hidden
}

function setCustomCell(i: number, value: CellNumber) {
  if (i < 0 || i >= customCells.length) return
  customCells[i] = value
  const btn = document.querySelector<HTMLButtonElement>(`.custom-cell[data-i="${i}"]`)
  if (btn) {
    btn.textContent = value === null ? '' : String(value)
    btn.classList.toggle('empty', value === null)
  }
}

function selectCustomCell(i: number) {
  const max = customW * customH
  if (max <= 0) return
  customCursor = Math.max(0, Math.min(max - 1, i))
  document.querySelectorAll('.custom-cell').forEach((el) => {
    el.classList.toggle('selected', Number((el as HTMLElement).dataset.i) === customCursor)
  })
  const btn = document.querySelector<HTMLButtonElement>(`.custom-cell[data-i="${customCursor}"]`)
  btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function renderCustomGrid() {
  const grid = document.getElementById('custom-grid')
  if (!grid) return
  const w = customW
  const h = customH
  if (customCells.length !== w * h) {
    customCells = new Array<CellNumber>(w * h).fill(null)
  }
  grid.style.gridTemplateColumns = `repeat(${w}, 36px)`
  grid.innerHTML = customCells
    .map((n, i) => {
      const label = n === null ? '' : String(n)
      const sel = i === customCursor ? ' selected' : ''
      return `<button type="button" class="custom-cell${n === null ? ' empty' : ''}${sel}" data-i="${i}">${label}</button>`
    })
    .join('')
  grid.querySelectorAll<HTMLButtonElement>('.custom-cell').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i)
      selectCustomCell(i)
      // 点击仍保留：空→0→1→2→3→空（也可用键盘直接填）
      const cur = customCells[i] ?? null
      const next: CellNumber =
        cur === null ? 0 : cur === 0 ? 1 : cur === 1 ? 2 : cur === 2 ? 3 : null
      setCustomCell(i, next)
    })
    btn.addEventListener('focus', () => {
      selectCustomCell(Number(btn.dataset.i))
    })
  })
  grid.tabIndex = 0
}

function customMoveCursor(dx: number, dy: number) {
  const w = customW
  const row = Math.floor(customCursor / w)
  const col = customCursor % w
  selectCustomCell((row + dy) * w + (col + dx))
}

function openCustomEditor() {
  const panel = document.getElementById('custom-editor')
  if (!panel) return
  panel.hidden = false
  const wEl = document.getElementById('custom-w') as HTMLInputElement | null
  const hEl = document.getElementById('custom-h') as HTMLInputElement | null
  if (wEl) wEl.value = String(customW)
  if (hEl) hEl.value = String(customH)
  if (customCursor >= customW * customH) customCursor = 0
  renderCustomGrid()
  customMsg('键盘：方向键移动 · 0–3 填数 · . / 退格清空 · Enter 下一格')
  // 焦点进网格，便于直接打字
  const grid = document.getElementById('custom-grid')
  grid?.focus()
}

function closeCustomEditor() {
  const panel = document.getElementById('custom-editor')
  if (panel) panel.hidden = true
}

function readCustomSize() {
  const wEl = document.getElementById('custom-w') as HTMLInputElement | null
  const hEl = document.getElementById('custom-h') as HTMLInputElement | null
  const w = Math.max(2, Math.min(40, Number(wEl?.value) || 5))
  const h = Math.max(2, Math.min(60, Number(hEl?.value) || 5))
  if (wEl) wEl.value = String(w)
  if (hEl) hEl.value = String(h)
  return { w, h }
}

function regenCustomGrid() {
  const { w, h } = readCustomSize()
  customW = w
  customH = h
  customCells = new Array<CellNumber>(w * h).fill(null)
  customCursor = 0
  renderCustomGrid()
  customMsg(`已生成 ${w}×${h} 网格。方向键移动，0–3 填数。`)
  document.getElementById('custom-grid')?.focus()
}

function makeCustomPuzzle(): Puzzle {
  return {
    id: `custom-${customW}x${customH}-${Date.now()}`,
    name: `自定义 · ${customW}×${customH}`,
    width: customW,
    height: customH,
    cells: customCells.slice(),
    difficulty: 'custom' as Puzzle['difficulty'],
  }
}

function loadCustomPuzzle() {
  const { w, h } = readCustomSize()
  customW = w
  customH = h
  if (customCells.length !== w * h) {
    customCells = new Array<CellNumber>(w * h).fill(null)
    renderCustomGrid()
    customMsg('网格已重置，请填数字。', 'bad')
    return
  }
  const puzzle = makeCustomPuzzle()
  stopLogic()
  session = {
    puzzle,
    state: createEmptyState(puzzle),
    undo: [],
    redo: [],
  }
  lockPads(session.state)
  zoom = 1
  panX = 0
  panY = 0
  refresh()
  setStatus(`已载入自定义 ${w}×${h}。`)
  customMsg('题板已载入，可点「求解」或「逻辑解题」。', 'ok')
}

function saveCustomToLibrary() {
  const { w, h } = readCustomSize()
  if (customCells.length !== w * h) {
    customMsg('请先生成网格并填好数字。', 'bad')
    return
  }
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `自定义 · ${w}×${h} · ${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${pad(stamp.getHours())}${pad(stamp.getMinutes())}`
  const puzzle: Puzzle = {
    id: `custom-${w}x${h}-${Date.now()}`,
    name,
    width: w,
    height: h,
    cells: customCells.slice(),
    difficulty: 'custom',
  }
  savePuzzleToLibrary(puzzle)
  refreshLibrary()
  renderPuzzleList()
  customMsg(`已保存到题库：「${name}」，下次启动仍可选用。`, 'ok')
  setStatus(`自定义盘已存入题库「${name}」。`)
}

function solveCustom() {
  if (!session || !session.puzzle.id.startsWith('custom-')) {
    customMsg('请先载入自定义题板。', 'bad')
    return
  }
  const puzzle = session.puzzle
  customMsg('求解中…')
  const area = puzzle.width * puzzle.height
  // 大盘给足节点；超大只做有限搜索并提示
  let budget = 1_500_000
  if (area > 400) budget = 4_000_000
  if (area > 1200) budget = 6_000_000
  const r = solvePuzzle(puzzle, budget)
  if (!r.solved || !r.solution) {
    customMsg(
      r.timedOut
        ? '求解超时：盘面过大或数字矛盾/无解，可先「逻辑解题」再求解。'
        : '无解或数字矛盾，无法完成闭合环。',
      'bad',
    )
    return
  }
  session.state = r.solution
  session.undo = []
  session.redo = []
  saveState(session)
  refresh()
  customMsg(`求解成功（搜索 ${r.nodes} 节点）。`, 'ok')
  setStatus('自定义盘已求解。', 'ok')
}

function logicCustom() {
  if (!session) return
  closeCustomEditor()
  void runLogicSolver()
}

$('#btn-check').addEventListener('click', check)
$('#btn-undo').addEventListener('click', undo)
$('#btn-redo').addEventListener('click', redo)
$('#btn-clear').addEventListener('click', clearBoard)
$('#btn-solve').addEventListener('click', showSolution)
$('#btn-hint').addEventListener('click', hint)
$('#btn-random').addEventListener('click', pickRandomPuzzle)
$('#btn-mute').addEventListener('click', toggleMute)
$('#btn-custom').addEventListener('click', openCustomEditor)
$('#custom-regen').addEventListener('click', regenCustomGrid)
$('#custom-apply').addEventListener('click', loadCustomPuzzle)
$('#custom-save').addEventListener('click', saveCustomToLibrary)
$('#custom-solve').addEventListener('click', solveCustom)
$('#custom-logic').addEventListener('click', logicCustom)
$('#custom-close').addEventListener('click', closeCustomEditor)
$('#btn-logic').addEventListener('click', () => {
  resumeAudio()
  void runLogicSolver()
})
$('#zoom-in').addEventListener('click', () => setZoom(zoom * 1.25))
$('#zoom-out').addEventListener('click', () => setZoom(zoom / 1.25))
$('#zoom-reset').addEventListener('click', () => {
  zoom = 1
  panX = 0
  panY = 0
  applyViewBox()
})

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return

  // —— 自定义题板键盘录入（编辑器打开时优先）——
  if (customEditorOpen()) {
    const k = e.key

    // 数字 / 清空，只要编辑器开着就生效（方便从网格直接打字）
    if (k >= '0' && k <= '3') {
      e.preventDefault()
      setCustomCell(customCursor, Number(k) as 0 | 1 | 2 | 3)
      customMoveCursor(1, 0)
      return
    }
    if (k === '.' || k === 'Backspace' || k === 'Delete' || k === ' ') {
      e.preventDefault()
      setCustomCell(customCursor, null)
      if (k === 'Backspace') customMoveCursor(-1, 0)
      else customMoveCursor(1, 0)
      return
    }

    if (k === 'ArrowLeft') {
      e.preventDefault()
      customMoveCursor(-1, 0)
      return
    }
    if (k === 'ArrowRight') {
      e.preventDefault()
      customMoveCursor(1, 0)
      return
    }
    if (k === 'ArrowUp') {
      e.preventDefault()
      customMoveCursor(0, -1)
      return
    }
    if (k === 'ArrowDown') {
      e.preventDefault()
      customMoveCursor(0, 1)
      return
    }
    if (k === 'Enter' || k === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) customMoveCursor(-1, 0)
      else customMoveCursor(1, 0)
      return
    }
    if (k === 'Home') {
      e.preventDefault()
      selectCustomCell(Math.floor(customCursor / customW) * customW)
      return
    }
    if (k === 'End') {
      e.preventDefault()
      selectCustomCell(Math.floor(customCursor / customW) * customW + customW - 1)
      return
    }

    if (k === 'Escape') {
      e.preventDefault()
      closeCustomEditor()
      return
    }
  }

  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  } else if ((k === 'z' && e.shiftKey) || k === 'y') {
    e.preventDefault()
    redo()
  } else if (k === 'c') {
    e.preventDefault()
    check()
  } else if (k === 'l') {
    e.preventDefault()
    void runLogicSolver()
  } else if (k === 'r') {
    e.preventDefault()
    pickRandomPuzzle()
  } else if (k === 'm') {
    e.preventDefault()
    toggleMute()
  } else if (k === '+' || k === '=') {
    e.preventDefault()
    setZoom(zoom * 1.25)
  } else if (k === '-' || k === '_') {
    e.preventDefault()
    setZoom(zoom / 1.25)
  } else if (k === '0') {
    if (customEditorOpen()) return // 上面已处理
    e.preventDefault()
    zoom = 1
    panX = 0
    panY = 0
    applyViewBox()
  } else if (k === 'escape') {
    clearBoard()
  }
})

// 默认载入：优先恢复上次玩的题；找不到再回退到排序第一题
refreshLibrary()
let boot: Puzzle | undefined
try {
  const lastId = localStorage.getItem(LAST_PUZZLE_KEY)
  if (lastId) boot = findPuzzle(lastId)
} catch {
  boot = undefined
}
if (!boot) boot = sortedLibrary()[0]
if (boot) selectPuzzle(boot)
else setStatus('没有可用题面。', 'bad')

// 便于调试
;(window as unknown as { __shuhui: unknown }).__shuhui = {
  validate,
  getReferenceSolution,
  getSession: () => session,
  puzzles: library,
  planLogicSolve,
  runLogicSolver,
  stopLogic,
  loadSavedPuzzles,
}
