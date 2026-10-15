import { hitTest, metricsFor } from '../src/render.ts'
import type { Puzzle } from '../src/types.ts'

const puzzle: Puzzle = {
  id: 't',
  name: 't',
  width: 5,
  height: 5,
  cells: Array(25).fill(0),
  difficulty: 'easy',
}
const m = metricsFor(puzzle)

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL', msg)
    process.exitCode = 1
  } else {
    console.log('OK', msg)
  }
}

// 第一条横边中点
const midX = m.pad + 0.5 * m.cell
const midY = m.pad
const hit = hitTest(m, puzzle, midX, midY)
assert(!!hit && hit.axis === 'h', `mid first H edge axis=h (got ${hit?.axis})`)
assert(!!hit && hit.index === 1, `mid first H edge index=1 (got ${hit?.index})`)

// 边右端内侧一点（仍属第 0 条横边）
const hitR = hitTest(m, puzzle, m.pad + m.cell - 0.5, m.pad)
assert(!!hitR && hitR.index === 1, `near right of H0 index=1 (got ${hitR?.index})`)

// 第二条横边中点
const hit2 = hitTest(m, puzzle, m.pad + 1.5 * m.cell, m.pad)
assert(!!hit2 && hit2.axis === 'h' && hit2.index === 2, `mid H1 index=2 (got ${hit2?.index})`)

// 第一条竖边中点
const hitV = hitTest(m, puzzle, m.pad, m.pad + 0.5 * m.cell)
assert(!!hitV && hitV.axis === 'v', `mid first V edge axis=v (got ${hitV?.axis})`)
assert(!!hitV && hitV.index === 6, `mid first V edge index=6 (got ${hitV?.index})`)

console.log('metrics', m)
