/**
 * 色块染色 — 约束染色 + 坍缩搜索 + 空腔规则
 *
 * 外扩一圈空白格；外圈 = 色 1。
 * On 边 ⇒ 相邻异色；Off 边 ⇒ 相邻同化（合并为一类）。
 *
 * 坍缩：
 *   初始每格一个「细化色号」(≥10)，仅作类标识。
 *   Off 边 union 同化；On 边在类之间加异色约束。
 *   类一旦确定为 色1/色2，细化色号被覆盖；不得反向覆盖。
 *
 * 空腔（解完时不变量）：
 *   色2 应单连通（内部不得有洞）⇒ 色2 空腔必须填满色2。
 *   色1 双连通（外侧带恰好一个洞=内部）⇒
 *     若色1 出现 ≥2 个空腔：至少一个填成色1；
 *     若某空腔内含异色(色2)格，则其余空腔必须填满色1。
 */

import { edgeValue, hIndex, vIndex } from './state'
import type { EdgeState, GameState, Puzzle } from './types'
import { EdgeState as ES } from './types'
import { validate } from './validate'

export const COLOR_UNK = 0
export const COLOR_OUT = 1
export const COLOR_IN = 2
export type Color = 0 | 1 | 2
export type CellMark = number // 0/1/2 或细化色号 ≥10

export function padIndex(w: number, pcx: number, pcy: number): number {
  return pcy * (w + 2) + pcx
}

export function gameToPad(cx: number, cy: number): { pcx: number; pcy: number } {
  return { pcx: cx + 1, pcy: cy + 1 }
}

export function sharedEdgeBetween(
  w: number,
  h: number,
  pcx1: number,
  pcy1: number,
  pcx2: number,
  pcy2: number,
): { axis: 'h' | 'v'; index: number } | null {
  const dx = pcx2 - pcx1
  const dy = pcy2 - pcy1
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null

  if (dx === 1) {
    const segY = pcy1 - 1
    const vx = pcx1
    if (segY < 0 || segY > h - 1) return null
    if (vx < 0 || vx > w) return null
    return { axis: 'v', index: vIndex(w, vx, segY + 1) }
  }
  if (dx === -1) return sharedEdgeBetween(w, h, pcx2, pcy2, pcx1, pcy1)
  if (dy === 1) {
    const hy = pcy1
    const segX = pcx1 - 1
    if (hy < 0 || hy > h) return null
    if (segX < 0 || segX > w - 1) return null
    return { axis: 'h', index: hIndex(w, segX + 1, hy) }
  }
  if (dy === -1) return sharedEdgeBetween(w, h, pcx2, pcy2, pcx1, pcy1)
  return null
}

/** 并查集：Off 边同化 */
class DSU {
  parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    let r = x
    while (this.parent[r] !== r) r = this.parent[r]!
    while (this.parent[x] !== r) {
      const nx = this.parent[x]!
      this.parent[x] = r
      x = nx
    }
    return r
  }
  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[rb] = ra
  }
}

export interface CollapseResult {
  /** 每格最终标记（细化色号或 0/1/2） */
  mark: CellMark[]
  /** 每格是否已定为色1/色2 */
  fixed: boolean[]
  conflict: boolean
  /** 由空腔规则强制改写的格 */
  forced: Array<{ i: number; to: Color }>
}

function neighborPairs(w: number, h: number) {
  const nCols = w + 2
  const nRows = h + 2
  const pairs: Array<{ a: number; b: number; e: { axis: 'h' | 'v'; index: number } | null }> = []
  for (let pcy = 0; pcy < nRows; pcy++) {
    for (let pcx = 0; pcx < nCols; pcx++) {
      if (pcx + 1 < nCols) {
        const e = sharedEdgeBetween(w, h, pcx, pcy, pcx + 1, pcy)
        pairs.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx + 1, pcy), e })
      }
      if (pcy + 1 < nRows) {
        const e = sharedEdgeBetween(w, h, pcx, pcy, pcx, pcy + 1)
        pairs.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx, pcy + 1), e })
      }
    }
  }
  return pairs
}

/**
 * 坍缩：细化色号 + Off 同化 + On 异色 + 外圈播种，迭代到不动点。
 * 之后应用空腔规则。
 */
export function collapseColors(puzzle: Puzzle, state: GameState): CollapseResult {
  const w = puzzle.width
  const h = puzzle.height
  const nCols = w + 2
  const nRows = h + 2
  const N = nCols * nRows

  // 初始：外圈色1，内部细化色号
  const mark: CellMark[] = new Array(N)
  const fixed = new Array<boolean>(N).fill(false)
  for (let i = 0; i < N; i++) mark[i] = 10 + i

  for (let pcx = 0; pcx < nCols; pcx++) {
    for (const pcy of [0, nRows - 1]) {
      const i = padIndex(w, pcx, pcy)
      mark[i] = COLOR_OUT
      fixed[i] = true
    }
  }
  for (let pcy = 0; pcy < nRows; pcy++) {
    for (const pcx of [0, nCols - 1]) {
      const i = padIndex(w, pcx, pcy)
      mark[i] = COLOR_OUT
      fixed[i] = true
    }
  }

  let conflict = false
  const forced: Array<{ i: number; to: Color }> = []

  const flip = (c: number): number =>
    c === COLOR_OUT ? COLOR_IN : c === COLOR_IN ? COLOR_OUT : c

  for (let round = 0; round < N + 4; round++) {
    const dsu = new DSU(N)
    // Off 同化（含 pad 间隙：e=null 不合并；真实 Off 边合并）
    for (const { a, b, e } of neighborPairs(w, h)) {
      if (!e) continue
      const v = edgeValue(state, e.axis, e.index)
      if (v === ES.Forbidden) dsu.union(a, b)
    }

    // 类代表上的色
    const classMark = new Map<number, CellMark>()
    const classFixed = new Map<number, boolean>()
    for (let i = 0; i < N; i++) {
      const r = dsu.find(i)
      if (mark[i] === COLOR_OUT || mark[i] === COLOR_IN) {
        const prev = classMark.get(r)
        if (prev !== undefined && prev !== mark[i] && (prev === COLOR_OUT || prev === COLOR_IN)) {
          if (prev !== mark[i]) conflict = true
        }
        classMark.set(r, mark[i]!)
        classFixed.set(r, true)
      } else if (!classMark.has(r)) {
        classMark.set(r, mark[i]!)
        classFixed.set(r, false)
      }
    }

    // On 异色约束在类图上 BFS 染色
    type Edge = { a: number; b: number }
    const onClass: Edge[] = []
    for (const { a, b, e } of neighborPairs(w, h)) {
      if (!e) continue
      if (edgeValue(state, e.axis, e.index) !== ES.On) continue
      onClass.push({ a: dsu.find(a), b: dsu.find(b) })
    }

    // 从固定类向外翻色
    const adj = new Map<number, number[]>()
    for (const { a, b } of onClass) {
      if (a === b) {
        // 自环异色不可能
        conflict = true
        continue
      }
      const la = adj.get(a) ?? []
      la.push(b)
      adj.set(a, la)
      const lb = adj.get(b) ?? []
      lb.push(a)
      adj.set(b, lb)
    }

    const queue: number[] = []
    for (const r of classMark.keys()) {
      if (classFixed.get(r)) queue.push(r)
    }
    const seen = new Set<number>(queue)
    while (queue.length) {
      const r = queue.pop()!
      const c0 = classMark.get(r)!
      const nc = flip(c0)
      if (nc !== COLOR_OUT && nc !== COLOR_IN) continue
      for (const nb of adj.get(r) ?? []) {
        const prev = classMark.get(nb)
        if (prev === COLOR_OUT || prev === COLOR_IN) {
          if (prev !== nc) conflict = true
        } else {
          classMark.set(nb, nc)
          classFixed.set(nb, true)
          if (!seen.has(nb)) {
            seen.add(nb)
            queue.push(nb)
          }
        }
      }
    }

    // 写回
    let changed = false
    for (let i = 0; i < N; i++) {
      const r = dsu.find(i)
      const cm = classMark.get(r)!
      const was = mark[i]!
      const wasFixed = fixed[i]!
      // 细化色号可被 1/2 覆盖；1/2 不可被细化色号覆盖
      if (cm === COLOR_OUT || cm === COLOR_IN) {
        if (was !== cm) {
          if (wasFixed && was !== cm) conflict = true
          mark[i] = cm
          fixed[i] = true
          changed = true
        }
      }
    }

    // —— 空腔规则 ——
    const cav = applyCavities(w, h, mark, fixed, state)
    if (cav.conflict) conflict = true
    if (cav.forced.length) {
      changed = true
      for (const f of cav.forced) {
        forced.push(f)
        mark[f.i] = f.to
        fixed[f.i] = true
      }
    }

    // —— 窄桥规则：色2 多分支间的 1 格宽瓶颈 ——
    const bridge = applyNarrowBridge(w, h, mark, fixed, state)
    if (bridge.conflict) conflict = true
    if (bridge.forced.length) {
      changed = true
      for (const f of bridge.forced) {
        forced.push(f)
        mark[f.i] = f.to
        fixed[f.i] = true
      }
    }

    if (!changed || conflict) break
  }

  return { mark, fixed, conflict, forced }
}

/**
 * 空腔：
 * - 色2 空腔（被色2 围住的非色2 连通块）→ 填色2（单连通）
 * - 色1 的多个空腔：至少一个填色1；
 *   若某空腔含色2 格，则其余空腔必须填色1
 */
function applyCavities(
  w: number,
  h: number,
  mark: CellMark[],
  fixed: boolean[],
  state: GameState,
): { forced: Array<{ i: number; to: Color }>; conflict: boolean } {
  const nCols = w + 2
  const nRows = h + 2
  const N = nCols * nRows
  const forced: Array<{ i: number; to: Color }> = []
  let conflict = false

  const colorOf = (i: number): Color => {
    const m = mark[i]!
    return m === COLOR_OUT || m === COLOR_IN ? m : COLOR_UNK
  }

  // 邻接（On 不连通，因异色）
  const neigh = (i: number) => {
    const pcx = i % nCols
    const pcy = Math.floor(i / nCols)
    const out: number[] = []
    for (const [nx, ny] of [
      [pcx + 1, pcy],
      [pcx - 1, pcy],
      [pcx, pcy + 1],
      [pcx, pcy - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= nCols || ny >= nRows) continue
      const e = sharedEdgeBetween(w, h, pcx, pcy, nx, ny)
      if (e && edgeValue(state, e.axis, e.index) === ES.On) continue
      out.push(padIndex(w, nx, ny))
    }
    return out
  }

  // 找「被单一颜色包围」的连通块（空腔）
  // 块 = 极大连通，块内都不是目标色，且所有邻接外格都是目标色
  const visited = new Uint8Array(N)
  const cavities: Array<{ cells: number[]; surround: Color; hasIn: boolean; hasOut: boolean }> = []

  for (let s = 0; s < N; s++) {
    if (visited[s]) continue
    const sc = colorOf(s)
    if (sc === COLOR_OUT || sc === COLOR_IN) continue
    // 连通块
    const comp: number[] = []
    const stack = [s]
    visited[s] = 1
    while (stack.length) {
      const cur = stack.pop()!
      comp.push(cur)
      for (const nb of neigh(cur)) {
        if (visited[nb]) continue
        const nc = colorOf(nb)
        if (nc === COLOR_OUT || nc === COLOR_IN) continue
        visited[nb] = 1
        stack.push(nb)
      }
    }

    // 看包围色
    let surround: Color = COLOR_UNK
    let mixed = false
    let hasIn = false
    let hasOut = false
    for (const c of comp) {
      const m = mark[c]!
      if (m === COLOR_IN) hasIn = true
      if (m === COLOR_OUT) hasOut = true
      for (const nb of neigh(c)) {
        const nc = colorOf(nb)
        if (nc === COLOR_OUT || nc === COLOR_IN) {
          if (surround === COLOR_UNK) surround = nc
          else if (surround !== nc) mixed = true
        }
      }
    }

    // 只有「完全被一种颜色包围」才算空腔
    if (mixed || surround === COLOR_UNK) continue
    // 外圈相邻的开放区域不算空腔（会碰到 pad=OUT 以外的开口）
    // 检查是否与棋盘外拓扑开口：若邻接有 UNKNOWN 且不全被包围，跳过
    cavities.push({ cells: comp, surround, hasIn, hasOut })
  }

  // 色2 空腔 → 填色2
  for (const cav of cavities) {
    if (cav.surround === COLOR_IN) {
      for (const i of cav.cells) {
        if (colorOf(i) === COLOR_IN) continue
        if (fixed[i] && mark[i] !== COLOR_IN) {
          conflict = true
          continue
        }
        forced.push({ i, to: COLOR_IN })
      }
    }
  }

  // 色1 空腔集合
  const outCavs = cavities.filter((c) => c.surround === COLOR_OUT)
  if (outCavs.length >= 2) {
    // 含异色(色2)格的空腔已经「用掉」了那个洞 → 其余必须填色1
    const withIn = outCavs.filter((c) => c.hasIn || c.cells.some((i) => mark[i] === COLOR_IN))
    const rest = outCavs.filter((c) => !withIn.includes(c))

    if (withIn.length >= 1) {
      for (const cav of rest) {
        for (const i of cav.cells) {
          if (colorOf(i) === COLOR_OUT) continue
          if (fixed[i] && mark[i] !== COLOR_OUT) {
            conflict = true
            continue
          }
          forced.push({ i, to: COLOR_OUT })
        }
      }
    } else {
      // 没有含异色的空腔：至少一个填色1 —— 若只有一个可行动作则强制；否则挑不与已定色冲突的
      // 简化：若其余路径都不通，任选一个合法腔填色1；无法唯一时不强制
      // 这里采用：若存在恰好一个空腔可以填色1（其它填色1会冲突），则强制它
      const canFill: number[] = []
      for (let ci = 0; ci < outCavs.length; ci++) {
        const cav = outCavs[ci]!
        let ok = true
        for (const i of cav.cells) {
          if (fixed[i] && mark[i] !== COLOR_OUT) ok = false
        }
        if (ok) canFill.push(ci)
      }
      if (canFill.length === 1) {
        const cav = outCavs[canFill[0]!]!
        for (const i of cav.cells) {
          if (colorOf(i) === COLOR_OUT) continue
          forced.push({ i, to: COLOR_OUT })
        }
      }
    }
  }

  return { forced, conflict }
}

/**
 * 窄桥规则：
 *   色2 最终必须单连通。若当前有 ≥2 个色2 连通分支，
 *   在「非色1」格（色2 + 未染色）组成的图中，
 *   某个未染色格是连接不同色2 分支的割点（移除它就断开），
 *   则该格必须染成色2。
 */
function applyNarrowBridge(
  w: number,
  h: number,
  mark: CellMark[],
  fixed: boolean[],
  state: GameState,
): { forced: Array<{ i: number; to: Color }>; conflict: boolean } {
  const nCols = w + 2
  const nRows = h + 2
  const N = nCols * nRows
  const forced: Array<{ i: number; to: Color }> = []
  let conflict = false

  const colorOf = (i: number): Color => {
    const m = mark[i]!
    return m === COLOR_OUT || m === COLOR_IN ? m : COLOR_UNK
  }

  const neigh = (i: number): number[] => {
    const pcx = i % nCols
    const pcy = Math.floor(i / nCols)
    const out: number[] = []
    for (const [nx, ny] of [
      [pcx + 1, pcy],
      [pcx - 1, pcy],
      [pcx, pcy + 1],
      [pcx, pcy - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= nCols || ny >= nRows) continue
      const e = sharedEdgeBetween(w, h, pcx, pcy, nx, ny)
      if (e && edgeValue(state, e.axis, e.index) === ES.On) continue
      out.push(padIndex(w, nx, ny))
    }
    return out
  }

  // 色2 格列表
  const inCells: number[] = []
  for (let i = 0; i < N; i++) if (colorOf(i) === COLOR_IN) inCells.push(i)
  if (inCells.length < 2) return { forced, conflict }

  // 在完整图中，从第一个色2 格 BFS，看能否 reach 所有色2 格
  const passable = (i: number) => colorOf(i) !== COLOR_OUT
  const bfsReach = (blockV: number): number => {
    const seen = new Uint8Array(N)
    const stack = [inCells[0]!]
    seen[inCells[0]!] = 1
    let reached = 1
    while (stack.length) {
      const cur = stack.pop()!
      for (const nb of neigh(cur)) {
        if (!passable(nb)) continue
        if (nb === blockV) continue
        if (seen[nb]) continue
        seen[nb] = 1
        if (colorOf(nb) === COLOR_IN) reached++
        stack.push(nb)
      }
    }
    return reached
  }

  // 完整图里已经连通，不需要窄桥规则
  if (bfsReach(-1) === inCells.length) return { forced, conflict }

  // 对每个未染色格，测试它是不是割点
  for (let v = 0; v < N; v++) {
    if (colorOf(v) !== COLOR_UNK) continue
    if (bfsReach(v) < inCells.length) {
      // v 是连接色2 分支的必经之路 → 必须染成色2
      if (fixed[v] && mark[v] !== COLOR_IN) {
        conflict = true
        continue
      }
      forced.push({ i: v, to: COLOR_IN })
    }
  }

  return { forced, conflict }
}

/**
 * 动画显示：主色 1/2 + 细化色号（类），实时随局面变化。
 * 返回每格的展示标记：
 *   'out' | 'in' | `t${n}`（细化类，n≥0，同一 Off 同化类同色）
 */
export type DisplayMark = 'out' | 'in' | `t${number}`

export function displayMarks(puzzle: Puzzle, state: GameState): DisplayMark[] {
  const w = puzzle.width
  const h = puzzle.height
  const nCols = w + 2
  const nRows = h + 2
  const N = nCols * nRows

  const col = collapseColors(puzzle, state)

  // 未定类 → 稳定编号（按类代表最小索引排序，保证稳定）
  const classOf = new Map<number, number>()
  const dsu = new DSU(N)
  for (const { a, b, e } of neighborPairs(w, h)) {
    if (!e) continue
    if (edgeValue(state, e.axis, e.index) === ES.Forbidden) dsu.union(a, b)
  }

  const roots: number[] = []
  for (let i = 0; i < N; i++) {
    const r = dsu.find(i)
    if (!classOf.has(r)) {
      classOf.set(r, 0)
      roots.push(r)
    }
  }
  roots.sort((a, b) => a - b)
  roots.forEach((r, idx) => classOf.set(r, idx))

  const out: DisplayMark[] = []
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const { pcx, pcy } = gameToPad(cx, cy)
      const i = padIndex(w, pcx, pcy)
      const m = col.mark[i]!
      if (m === COLOR_OUT) {
        out.push('out')
      } else if (m === COLOR_IN) {
        out.push('in')
      } else {
        const r = dsu.find(i)
        out.push(`t${classOf.get(r)!}`)
      }
    }
  }
  return out
}

/** 兼容旧接口：仅 out/in/unk */
export function displayColors(puzzle: Puzzle, state: GameState): Array<'out' | 'in' | 'unk'> {
  return displayMarks(puzzle, state).map((m) =>
    m === 'out' ? 'out' : m === 'in' ? 'in' : 'unk',
  ) as Array<'out' | 'in' | 'unk'>
}

export function probeEdge(
  puzzle: Puzzle,
  state: GameState,
  axis: 'h' | 'v',
  index: number,
  to: EdgeState,
): { ok: boolean; reason?: string } {
  const old = edgeValue(state, axis, index)
  if (axis === 'h') state.h[index] = to
  else state.v[index] = to

  const a = collapseColors(puzzle, state)
  let completes = false
  if (!a.conflict) {
    // 成环才看是否完整解
    completes = validate(state, puzzle).solved
  }

  if (axis === 'h') state.h[index] = old
  else state.v[index] = old

  if (a.conflict) return { ok: false, reason: 'collapse-conflict' }
  if (a.forced.length === 0 && !completes) {
    // 无强制时允许
    return { ok: true }
  }
  return { ok: true }
}
