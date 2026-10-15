import type { Axis, EdgeState, GameState, Move, Puzzle, VertexEdges } from './types'
import { EdgeState as ES } from './types'

export function hWidth(w: number): number {
  return w + 2
}

export function hLength(w: number, h: number): number {
  return (h + 1) * hWidth(w)
}

export function vHeight(h: number): number {
  return h + 2
}

export function vLength(w: number, h: number): number {
  return vHeight(h) * (w + 1)
}

/** 逻辑横边索引：hx ∈ [0, W+1], hy ∈ [0, H] */
export function hIndex(w: number, hx: number, hy: number): number {
  return hy * hWidth(w) + hx
}

/** 逻辑竖边索引：vx ∈ [0, W], vy ∈ [0, H+1] */
export function vIndex(w: number, vx: number, vy: number): number {
  return vy * (w + 1) + vx
}

export function isHPad(w: number, hx: number): boolean {
  return hx === 0 || hx === w + 1
}

export function isVPad(h: number, vy: number): boolean {
  return vy === 0 || vy === h + 1
}

export function isPadEdge(
  w: number,
  h: number,
  axis: Axis,
  index: number,
): boolean {
  if (axis === 'h') {
    const hx = index % hWidth(w)
    return isHPad(w, hx)
  }
  const stride = w + 1
  const vy = Math.floor(index / stride)
  return isVPad(h, vy)
}

/** 格子四条边在 h/v 扁平数组中的索引 */
export function cellEdges(w: number, cx: number, cy: number) {
  return {
    top: hIndex(w, cx + 1, cy),
    bottom: hIndex(w, cx + 1, cy + 1),
    left: vIndex(w, cx, cy + 1),
    right: vIndex(w, cx + 1, cy + 1),
  }
}

/** 顶点四条边（含 pad），解题器统一入口 */
export function vertexEdges(w: number, px: number, py: number): VertexEdges {
  return {
    west: hIndex(w, px, py),
    east: hIndex(w, px + 1, py),
    north: vIndex(w, px, py),
    south: vIndex(w, px, py + 1),
  }
}

export function allVertexPositions(w: number, h: number) {
  const pts: Array<{ px: number; py: number }> = []
  for (let py = 0; py <= h; py++) {
    for (let px = 0; px <= w; px++) {
      pts.push({ px, py })
    }
  }
  return pts
}

export function edgeValue(state: GameState, axis: Axis, index: number): EdgeState {
  return axis === 'h' ? state.h[index]! : state.v[index]!
}

export function setEdge(state: GameState, axis: Axis, index: number, value: EdgeState): void {
  if (axis === 'h') state.h[index] = value
  else state.v[index] = value
}

export function cycleEdge(current: EdgeState): EdgeState {
  if (current === ES.Unknown) return ES.On
  if (current === ES.On) return ES.Forbidden
  return ES.Unknown
}

export function createEmptyState(puzzle: Puzzle): GameState {
  const { width: w, height: h } = puzzle
  const hArr = new Array<EdgeState>(hLength(w, h)).fill(ES.Forbidden)
  const vArr = new Array<EdgeState>(vLength(w, h)).fill(ES.Forbidden)

  // 真实横边置 Unknown
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      hArr[hIndex(w, hx, hy)] = ES.Unknown
    }
  }
  // 真实竖边置 Unknown
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      vArr[vIndex(w, vx, vy)] = ES.Unknown
    }
  }

  return {
    puzzleId: puzzle.id,
    width: w,
    height: h,
    h: hArr,
    v: vArr,
  }
}

/** 强制锁定所有 pad 为 Forbidden */
export function lockPads(state: GameState): void {
  const { width: w, height: h } = state
  for (let hy = 0; hy <= h; hy++) {
    state.h[hIndex(w, 0, hy)] = ES.Forbidden
    state.h[hIndex(w, w + 1, hy)] = ES.Forbidden
  }
  for (let vx = 0; vx <= w; vx++) {
    state.v[vIndex(w, vx, 0)] = ES.Forbidden
    state.v[vIndex(w, vx, h + 1)] = ES.Forbidden
  }
}

export function applyMove(state: GameState, move: Move): void {
  lockPads(state)
  setEdge(state, move.axis, move.index, move.to)
}

export function invertMove(move: Move): Move {
  return { ...move, from: move.to, to: move.from }
}

/** 序列化进度（仅真实边；pad 可重建） */
export function serializeState(state: GameState) {
  return {
    version: 1 as const,
    puzzleId: state.puzzleId,
    width: state.width,
    height: state.height,
    h: state.h.map((s) => s as number),
    v: state.v.map((s) => s as number),
    updatedAt: Date.now(),
  }
}

export function deserializeState(data: {
  version: number
  puzzleId: string
  width: number
  height: number
  h: number[]
  v: number[]
}): GameState {
  const state: GameState = {
    puzzleId: data.puzzleId,
    width: data.width,
    height: data.height,
    h: data.h.map((n) => n as EdgeState),
    v: data.v.map((n) => n as EdgeState),
  }
  lockPads(state)
  return state
}
