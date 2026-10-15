import {
  allVertexPositions,
  cellEdges,
  edgeValue,
  vertexEdges,
} from './state'
import type {
  CellCount,
  CellNumber,
  GameState,
  LoopStatus,
  PointDegree,
  Puzzle,
  ValidationResult,
} from './types'
import { EdgeState as ES } from './types'

function countOnAroundCell(state: GameState, w: number, cx: number, cy: number): number {
  const e = cellEdges(w, cx, cy)
  let n = 0
  if (edgeValue(state, 'h', e.top) === ES.On) n++
  if (edgeValue(state, 'h', e.bottom) === ES.On) n++
  if (edgeValue(state, 'v', e.left) === ES.On) n++
  if (edgeValue(state, 'v', e.right) === ES.On) n++
  return n
}

function degreeAt(state: GameState, w: number, px: number, py: number): number {
  const e = vertexEdges(w, px, py)
  let d = 0
  if (edgeValue(state, 'h', e.west) === ES.On) d++
  if (edgeValue(state, 'h', e.east) === ES.On) d++
  if (edgeValue(state, 'v', e.north) === ES.On) d++
  if (edgeValue(state, 'v', e.south) === ES.On) d++
  return d
}

function analyzeLoop(state: GameState, w: number, h: number): LoopStatus {
  const pts = allVertexPositions(w, h)
  let onEdgeCount = 0
  for (const s of state.h) if (s === ES.On) onEdgeCount++
  for (const s of state.v) if (s === ES.On) onEdgeCount++

  if (onEdgeCount === 0) return { kind: 'empty' }

  // 邻接：从每个 ON 端点走向下一顶点
  const key = (px: number, py: number) => py * (w + 1) + px
  const adj = new Map<number, number[]>()
  for (const { px, py } of pts) {
    const e = vertexEdges(w, px, py)
    const nbrs: number[] = []
    if (edgeValue(state, 'h', e.west) === ES.On && px > 0) nbrs.push(key(px - 1, py))
    if (edgeValue(state, 'h', e.east) === ES.On && px < w) nbrs.push(key(px + 1, py))
    if (edgeValue(state, 'v', e.north) === ES.On && py > 0) nbrs.push(key(px, py - 1))
    if (edgeValue(state, 'v', e.south) === ES.On && py < h) nbrs.push(key(px, py + 1))
    if (nbrs.length) adj.set(key(px, py), nbrs)
  }

  // 度数异常
  for (const { px, py } of pts) {
    const d = degreeAt(state, w, px, py)
    if (d === 1) return { kind: 'open' }
    if (d >= 3) return { kind: 'branch' }
  }

  // 连通分量数（只遍历 ON 相关顶点）
  const visited = new Set<number>()
  let components = 0
  for (const start of adj.keys()) {
    if (visited.has(start)) continue
    components++
    const stack = [start]
    visited.add(start)
    while (stack.length) {
      const cur = stack.pop()!
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          stack.push(nb)
        }
      }
    }
  }

  if (components > 1) return { kind: 'multiple' }
  return { kind: 'single' }
}

export function validate(state: GameState, puzzle: Puzzle): ValidationResult {
  const w = puzzle.width
  const h = puzzle.height
  const badPoints: PointDegree[] = []
  const badCells: CellCount[] = []

  for (const { px, py } of allVertexPositions(w, h)) {
    const d = degreeAt(state, w, px, py)
    if (d === 1 || d >= 3) {
      badPoints.push({ px, py, degree: d })
    }
  }

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const expected = puzzle.cells[cy * w + cx] as CellNumber
      if (expected === null) continue
      const actual = countOnAroundCell(state, w, cx, cy)
      if (actual !== expected) {
        badCells.push({ cx, cy, expected, actual })
      }
    }
  }

  const loop = analyzeLoop(state, w, h)
  const solved =
    badPoints.length === 0 &&
    badCells.length === 0 &&
    loop.kind === 'single'

  return { badPoints, badCells, loop, solved }
}

export function countOnEdges(state: GameState): number {
  let n = 0
  for (const s of state.h) if (s === ES.On) n++
  for (const s of state.v) if (s === ES.On) n++
  return n
}
