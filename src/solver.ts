import {
  cellEdges,
  createEmptyState,
  edgeValue,
  hIndex,
  lockPads,
  setEdge,
  vIndex,
  vertexEdges,
} from './state'
import type { GameState, Puzzle } from './types'
import { EdgeState as ES } from './types'

export interface SolveResult {
  solved: boolean
  solution: GameState | null
  nodes: number
  timedOut: boolean
}

export interface CountResult {
  count: number
  /** 至少达到 limit */
  capped: boolean
  nodes: number
  timedOut: boolean
  first: GameState | null
  second: GameState | null
}

function cloneState(s: GameState): GameState {
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    h: s.h.slice(),
    v: s.v.slice(),
  }
}

/** 从多连块生成合法环 */
export function loopFromPolyomino(
  w: number,
  h: number,
  inSet: boolean[],
): { h: boolean[]; v: boolean[] } {
  const hOn = new Array<boolean>((h + 1) * w).fill(false)
  const vOn = new Array<boolean>(h * (w + 1)).fill(false)

  const cell = (cx: number, cy: number) =>
    cx < 0 || cy < 0 || cx >= w || cy >= h ? false : inSet[cy * w + cx]!

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const inside = cell(cx, cy)
      if (inside !== cell(cx, cy - 1)) hOn[cy * w + cx] = true
      if (inside !== cell(cx, cy + 1)) hOn[(cy + 1) * w + cx] = true
      if (inside !== cell(cx - 1, cy)) vOn[cy * (w + 1) + cx] = true
      if (inside !== cell(cx + 1, cy)) vOn[cy * (w + 1) + cx + 1] = true
    }
  }
  return { h: hOn, v: vOn }
}

/** 随机无捏合多连块 */
export function randomHoleFreePolyomino(
  w: number,
  h: number,
  targetSize: number,
  rng: () => number,
): boolean[] {
  const inSet = new Array<boolean>(w * h).fill(false)
  const cx0 = Math.floor(rng() * w)
  const cy0 = Math.floor(rng() * h)
  inSet[cy0 * w + cx0] = true
  let size = 1

  const has = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < w && cy < h && inSet[cy * w + cx]!

  const createsPinch = (cx: number, cy: number): boolean => {
    const has2 = (x: number, y: number) => (x === cx && y === cy) || has(x, y)
    for (const [ox, oy] of [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ] as const) {
      const x = cx + ox
      const y = cy + oy
      const a = has2(x, y)
      const b = has2(x + 1, y)
      const c = has2(x, y + 1)
      const d = has2(x + 1, y + 1)
      if (a && d && !b && !c) return true
      if (b && c && !a && !d) return true
    }
    return false
  }

  const neighborCount = (cx: number, cy: number) => {
    let n = 0
    if (has(cx + 1, cy)) n++
    if (has(cx - 1, cy)) n++
    if (has(cx, cy + 1)) n++
    if (has(cx, cy - 1)) n++
    return n
  }

  const max = Math.min(targetSize, w * h)
  while (size < max) {
    const candidates: Array<[number, number]> = []
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (inSet[cy * w + cx]) continue
        if (neighborCount(cx, cy) !== 1) continue
        if (createsPinch(cx, cy)) continue
        candidates.push([cx, cy])
      }
    }
    if (!candidates.length) break
    const pick = candidates[Math.floor(rng() * candidates.length)]!
    inSet[pick[1] * w + pick[0]] = true
    size++
  }
  return inSet
}

export function numbersFromLoop(
  w: number,
  h: number,
  hOn: boolean[],
  vOn: boolean[],
): Array<0 | 1 | 2 | 3> {
  const nums: Array<0 | 1 | 2 | 3> = new Array(w * h).fill(0)
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      let n = 0
      if (hOn[cy * w + cx]) n++
      if (hOn[(cy + 1) * w + cx]) n++
      if (vOn[cy * (w + 1) + cx]) n++
      if (vOn[cy * (w + 1) + cx + 1]) n++
      nums[cy * w + cx] = n as 0 | 1 | 2 | 3
    }
  }
  return nums
}

export function stateFromLoop(
  puzzle: Puzzle,
  hOn: boolean[],
  vOn: boolean[],
): GameState {
  const st = createEmptyState(puzzle)
  const w = puzzle.width
  const h = puzzle.height
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 0; hx < w; hx++) {
      setEdge(st, 'h', hIndex(w, hx + 1, hy), hOn[hy * w + hx] ? ES.On : ES.Forbidden)
    }
  }
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      setEdge(st, 'v', vIndex(w, vx, vy + 1), vOn[vy * (w + 1) + vx] ? ES.On : ES.Forbidden)
    }
  }
  lockPads(st)
  return st
}

function cellSatisfied(
  state: GameState,
  w: number,
  cx: number,
  cy: number,
  target: number | null,
): boolean {
  if (target === null) return true
  const e = cellEdges(w, cx, cy)
  let on = 0
  let unknown = 0
  for (const [axis, index] of [
    ['h', e.top],
    ['h', e.bottom],
    ['v', e.left],
    ['v', e.right],
  ] as const) {
    const v = edgeValue(state, axis, index)
    if (v === ES.On) on++
    else if (v === ES.Unknown) unknown++
  }
  if (on > target) return false
  if (on + unknown < target) return false
  return true
}

function vertexOk(state: GameState, w: number, px: number, py: number): boolean {
  const e = vertexEdges(w, px, py)
  let on = 0
  let unknown = 0
  for (const [axis, index] of [
    ['h', e.west],
    ['h', e.east],
    ['v', e.north],
    ['v', e.south],
  ] as const) {
    const v = edgeValue(state, axis, index)
    if (v === ES.On) on++
    else if (v === ES.Unknown) unknown++
  }
  if (on > 2) return false
  if (unknown === 0 && on === 1) return false
  return true
}

function realEdges(w: number, h: number) {
  const edges: Array<{ axis: 'h' | 'v'; index: number }> = []
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) edges.push({ axis: 'h', index: hIndex(w, hx, hy) })
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) edges.push({ axis: 'v', index: vIndex(w, vx, vy) })
  }
  return edges
}

/** 找一个解 */
export function solvePuzzle(puzzle: Puzzle, maxNodes = 400_000): SolveResult {
  const w = puzzle.width
  const h = puzzle.height
  const state = createEmptyState(puzzle)
  const edges = realEdges(w, h)
  let nodes = 0
  let timedOut = false
  let found: GameState | null = null

  const cellsOk = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (!cellSatisfied(state, w, cx, cy, puzzle.cells[cy * w + cx] ?? null)) return false
      }
    }
    return true
  }
  const vertsOk = () => {
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        if (!vertexOk(state, w, px, py)) return false
      }
    }
    return true
  }

  const dfs = (i: number): boolean => {
    if (nodes++ > maxNodes) {
      timedOut = true
      return false
    }
    if (i === edges.length) {
      if (cellsOk() && vertsOk()) {
        found = cloneState(state)
        return true
      }
      return false
    }
    const { axis, index } = edges[i]!
    for (const val of [ES.On, ES.Forbidden] as const) {
      setEdge(state, axis, index, val)
      if (cellsOk() && vertsOk() && dfs(i + 1)) return true
    }
    setEdge(state, axis, index, ES.Unknown)
    return false
  }

  const ok = dfs(0)
  return { solved: ok, solution: found, nodes, timedOut }
}

/**
 * 统计解的个数（上限 limit）。
 * 用于空白格题：保证唯一解。
 */
export function countSolutions(
  puzzle: Puzzle,
  limit = 2,
  maxNodes = 800_000,
): CountResult {
  const w = puzzle.width
  const h = puzzle.height
  const state = createEmptyState(puzzle)
  const edges = realEdges(w, h)
  let nodes = 0
  let timedOut = false
  let count = 0
  let first: GameState | null = null
  let second: GameState | null = null

  const cellsOk = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (!cellSatisfied(state, w, cx, cy, puzzle.cells[cy * w + cx] ?? null)) return false
      }
    }
    return true
  }
  const vertsOk = () => {
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        if (!vertexOk(state, w, px, py)) return false
      }
    }
    return true
  }

  const dfs = (i: number): boolean => {
    // true = 已到 limit，剪枝
    if (nodes++ > maxNodes) {
      timedOut = true
      return true
    }
    if (count >= limit) return true
    if (i === edges.length) {
      if (cellsOk() && vertsOk()) {
        count++
        const snap = cloneState(state)
        if (!first) first = snap
        else if (!second) second = snap
      }
      return count >= limit
    }
    const { axis, index } = edges[i]!
    for (const val of [ES.On, ES.Forbidden] as const) {
      setEdge(state, axis, index, val)
      if (cellsOk() && vertsOk()) {
        if (dfs(i + 1)) {
          setEdge(state, axis, index, ES.Unknown)
          return true
        }
      }
    }
    setEdge(state, axis, index, ES.Unknown)
    return false
  }

  dfs(0)
  return {
    count,
    capped: count >= limit,
    nodes,
    timedOut,
    first,
    second,
  }
}
