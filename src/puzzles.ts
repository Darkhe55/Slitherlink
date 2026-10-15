import type { CellNumber, EdgeState, GameState, Puzzle } from './types'
import { EdgeState as ES } from './types'
import { lockPads } from './state'
import { RAW_PUZZLES, type RawPuzzle } from './puzzles-data'

function parseCells(s: string): CellNumber[] {
  return [...s].map((ch) => (ch === '.' ? null : (Number(ch) as 0 | 1 | 2 | 3)))
}

function parseEdges(s: string): EdgeState[] {
  return [...s].map((ch) => Number(ch) as EdgeState)
}

function toPuzzle(r: RawPuzzle): Puzzle {
  return {
    id: r.id,
    name: r.name,
    width: r.width,
    height: r.height,
    difficulty: r.difficulty,
    cells: parseCells(r.cells),
  }
}

function toSolution(r: RawPuzzle): GameState | null {
  if (!r.solH || !r.solV) return null
  const st: GameState = {
    puzzleId: r.id,
    width: r.width,
    height: r.height,
    h: parseEdges(r.solH),
    v: parseEdges(r.solV),
  }
  lockPads(st)
  return st
}

/** 静态题库（import 即用，无运行时生成） */
export const puzzles: Puzzle[] = RAW_PUZZLES.map(toPuzzle)

const solutions = new Map<string, GameState>()
for (const r of RAW_PUZZLES) {
  const sol = toSolution(r)
  if (sol) solutions.set(r.id, sol)
}

export function getPuzzle(id: string): Puzzle | undefined {
  return puzzles.find((p) => p.id === id)
}

export function getReferenceSolution(id: string): GameState | null {
  return solutions.get(id) ?? null
}

export function randomPuzzle(avoidId?: string): Puzzle {
  const pool = avoidId ? puzzles.filter((p) => p.id !== avoidId) : puzzles
  const list = pool.length ? pool : puzzles
  return list[Math.floor(Math.random() * list.length)]!
}

export function blankCount(p: Puzzle): number {
  return p.cells.filter((c) => c === null).length
}

/** 系列筛选（经典/入门/…） */
export function listSeries(): string[] {
  return [...new Set(RAW_PUZZLES.map((r) => r.series))]
}

export function bySeries(series: string): Puzzle[] {
  return RAW_PUZZLES.filter((r) => r.series === series).map(toPuzzle)
}

// 便于审计脚本
export { ES }
