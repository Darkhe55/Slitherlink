/**
 * 一次性生成静态题库 → src/puzzles-data.ts
 * 运行时只读数据，不再在 import 时跑生成/求解。
 *
 * 用法：npx esbuild scripts/gen-puzzles.mts --bundle --format=esm --platform=node --outfile=scripts/gen-puzzles.mjs && node scripts/gen-puzzles.mjs
 */
import {
  countSolutions,
  loopFromPolyomino,
  numbersFromLoop,
  randomHoleFreePolyomino,
  stateFromLoop,
} from '../src/solver.ts'
import type { CellNumber, GameState, Puzzle } from '../src/types.ts'
import { writeFileSync } from 'node:fs'

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

type Spec = {
  id: string
  name: string
  width: number
  height: number
  difficulty: Puzzle['difficulty']
  seed: number
  fillRatio: number
  blankRatio: number
  series: string
}

function hideBlanks(
  full: CellNumber[],
  blankRatio: number,
  puzzle: Omit<Puzzle, 'cells'>,
  rng: () => number,
): CellNumber[] {
  if (blankRatio <= 0) return full.slice()
  const w = puzzle.width
  const h = puzzle.height
  const targetBlanks = Math.max(1, Math.floor(w * h * blankRatio))

  const order = full.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = order[i]!
    order[i] = order[j]!
    order[j] = t
  }

  const cells = full.slice()
  const hidden: number[] = []
  for (const idx of order) {
    if (hidden.length >= targetBlanks) break
    if (cells[idx] === null) continue
    cells[idx] = null
    hidden.push(idx)
  }

  const test: Puzzle = { ...puzzle, cells }
  let c = countSolutions(test, 2, 200_000)
  while (c.timedOut === false && c.count > 1 && hidden.length) {
    const idx = hidden.pop()!
    cells[idx] = full[idx]
    c = countSolutions({ ...puzzle, cells }, 2, 200_000)
  }
  if (c.timedOut && hidden.length > 1) {
    while (hidden.length > 1) {
      const idx = hidden.pop()!
      cells[idx] = full[idx]
    }
  }
  return cells
}

function buildOne(spec: Spec) {
  const { width: w, height: h, seed, fillRatio, blankRatio } = spec
  for (let attempt = 0; attempt < 12; attempt++) {
    const rng = mulberry32(seed + attempt * 9973)
    const target = Math.max(3, Math.floor(w * h * fillRatio))
    const inSet = randomHoleFreePolyomino(w, h, target, rng)
    const { h: hOn, v: vOn } = loopFromPolyomino(w, h, inSet)
    const raw = numbersFromLoop(w, h, hOn, vOn)
    if (raw.some((n) => n > 3)) continue

    const full = raw.map((n) => n as CellNumber)
    const base: Omit<Puzzle, 'cells'> = {
      id: spec.id,
      name: spec.name,
      width: w,
      height: h,
      difficulty: spec.difficulty,
    }
    const cells = blankRatio > 0 ? hideBlanks(full, blankRatio, base, rng) : full
    const puzzle: Puzzle = { ...base, cells }
    const sol = stateFromLoop(puzzle, hOn, vOn)
    return { puzzle, sol, series: spec.series }
  }
  throw new Error('build failed ' + spec.id)
}

function batch(
  prefix: string,
  label: string,
  series: string,
  width: number,
  height: number,
  difficulty: Puzzle['difficulty'],
  fillRatio: number,
  count: number,
  seedBase: number,
  blankRatio = 0,
): Spec[] {
  const out: Spec[] = []
  for (let i = 0; i < count; i++) {
    const n = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '')
    out.push({
      id: `${prefix}-${n}`,
      name: `${label} ${n}`,
      width,
      height,
      difficulty,
      seed: seedBase + i * 131,
      fillRatio,
      blankRatio,
      series,
    })
  }
  return out
}

const specs: Spec[] = [
  // —— 经典风格（模拟 Nikoli 常见盘）——
  ...batch('classic-5x5', '经典 · 5×5', 'classic', 5, 5, 'easy', 0.42, 6, 100001, 0),
  ...batch('classic-10x10', '经典 · 10×10', 'classic', 10, 10, 'medium', 0.38, 8, 100101, 0),
  ...batch('classic-15x15', '经典 · 15×15', 'classic', 15, 15, 'hard', 0.32, 4, 100201, 0),
  ...batch('classic-20x20', '经典 · 20×20', 'classic', 20, 20, 'hard', 0.28, 3, 100301, 0),
  // —— 入门 / 进阶 ——
  ...batch('easy-5x5', '入门 · 5×5', 'easy', 5, 5, 'easy', 0.38, 6, 20240501, 0),
  ...batch('medium-10x10', '进阶 · 10×10', 'medium', 10, 10, 'medium', 0.36, 5, 20240701, 0),
  ...batch('hard-10x10', '挑战 · 10×10', 'hard', 10, 10, 'hard', 0.28, 3, 20240901, 0),
  ...batch('easy-7x7', '休闲 · 7×7', 'easy', 7, 7, 'easy', 0.36, 4, 20241101, 0),
  ...batch('hard-8x8', '硬核 · 8×8', 'hard', 8, 8, 'hard', 0.26, 2, 20241201, 0),
  ...batch('expert-25x25', '专家 · 25×25', 'expert', 25, 25, 'hard', 0.22, 3, 20250601, 0),
  ...batch('blank-5x5', '空白 · 5×5', 'blank', 5, 5, 'easy', 0.42, 3, 20250101, 0.16),
  ...batch('blank-7x7', '空白 · 7×7', 'blank', 7, 7, 'medium', 0.38, 2, 20250201, 0.18),
  ...batch('blank-10x10', '空白 · 10×10', 'blank', 10, 10, 'hard', 0.34, 2, 20250401, 0.12),
]

console.log('generating', specs.length, 'puzzles…')
const t0 = Date.now()
const items = specs.map((s, i) => {
  const r = buildOne(s)
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${specs.length}`)
  return r
})
console.log('built in', Date.now() - t0, 'ms')

// 序列化（cells/h/v 压成紧凑字符串：数字 0-3，空 .；边 0-2）
const lines: string[] = []
lines.push('/* 自动生成，勿手改。scripts/gen-puzzles.mts */')
lines.push(`export type RawPuzzle = {`)
lines.push(`  id: string`)
lines.push(`  name: string`)
lines.push(`  width: number`)
lines.push(`  height: number`)
lines.push(`  difficulty: 'easy'|'medium'|'hard'|'custom'`)
lines.push(`  series: string`)
lines.push(`  /** 数字串：0-3 或 . */`)
lines.push(`  cells: string`)
lines.push(`  /** 解：横边(含pad)+竖边(含pad)，0-2 */`)
lines.push(`  solH: string`)
lines.push(`  solV: string`)
lines.push(`}`)
lines.push(``)
lines.push(`export const RAW_PUZZLES: RawPuzzle[] = [`)

for (const { puzzle: p, sol, series } of items) {
  const cells = p.cells.map((c) => (c === null ? '.' : String(c))).join('')
  const solH = sol.h.map((v) => String(v)).join('')
  const solV = sol.v.map((v) => String(v)).join('')
  lines.push(
    `  { id: ${JSON.stringify(p.id)}, name: ${JSON.stringify(p.name)}, width: ${p.width}, height: ${p.height}, difficulty: ${JSON.stringify(p.difficulty)}, series: ${JSON.stringify(series)}, cells: ${JSON.stringify(cells)}, solH: ${JSON.stringify(solH)}, solV: ${JSON.stringify(solV)} },`,
  )
}

// —— 人工维护的名题/自定义追加项（不参与自动生成，重新生成题库时保留）——
// 这些题没有自动解（solH/solV 留空），运行时走回溯求解。
const MANUAL_PUZZLES: Array<{
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  cells: string
}> = [
  {
    id: 'human-15x15-a',
    name: '名题 · 15×15 A',
    width: 15,
    height: 15,
    difficulty: 'hard',
    series: 'human',
    cells: '.23..22.........2221.3.....2.32....3..31.3....21.1.2......213....3..23.3.3.122..303.21..122.1......222.2.322...12......1..2.1...32.322.....3..2..312.32.3..3.....1...222....2.32....3...133...1..133.3.21.3..23.....2..2..1.2...3',
  },
]

for (const m of MANUAL_PUZZLES) {
  lines.push(
    `  { id: ${JSON.stringify(m.id)}, name: ${JSON.stringify(m.name)}, width: ${m.width}, height: ${m.height}, difficulty: ${JSON.stringify(m.difficulty)}, series: ${JSON.stringify(m.series)}, cells: ${JSON.stringify(m.cells)}, solH: "", solV: "" },`,
  )
}

lines.push(`]`)
lines.push(``)

writeFileSync('src/puzzles-data.ts', lines.join('\n'))
console.log('wrote src/puzzles-data.ts', items.length, 'puzzles')
