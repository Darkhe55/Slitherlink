/** 格子数字：0–3 或 null（无约束） */
export type CellNumber = 0 | 1 | 2 | 3 | null

export const enum EdgeState {
  Unknown = 0,
  On = 1,
  Forbidden = 2,
}

export type Axis = 'h' | 'v'

export interface Puzzle {
  id: string
  name: string
  width: number
  height: number
  /** row-major, length = width * height */
  cells: CellNumber[]
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
}

export interface GameState {
  puzzleId: string
  width: number
  height: number
  /** 横边（含左右 pad），length = (H+1)*(W+2) */
  h: EdgeState[]
  /** 竖边（含上下 pad），length = (H+2)*(W+1) */
  v: EdgeState[]
}

export interface Move {
  axis: Axis
  index: number
  from: EdgeState
  to: EdgeState
}

export interface PointDegree {
  px: number
  py: number
  degree: number
}

export interface CellCount {
  cx: number
  cy: number
  expected: number
  actual: number
}

export type LoopStatus =
  | { kind: 'empty' }
  | { kind: 'open' }
  | { kind: 'branch' }
  | { kind: 'multiple' }
  | { kind: 'single' }

export interface ValidationResult {
  /** 点度数非法 */
  badPoints: PointDegree[]
  /** 格数字不匹配 */
  badCells: CellCount[]
  loop: LoopStatus
  /** 全部正确且成单环 */
  solved: boolean
}

/** 解题器视角：任意顶点四条边（含 pad） */
export interface VertexEdges {
  west: number
  east: number
  north: number
  south: number
}
