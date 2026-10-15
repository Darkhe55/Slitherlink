import { planLogicSolve } from '../src/logic.ts'
import { createEmptyState, edgeValue, hIndex, vIndex } from '../src/state.ts'
import type { CellNumber, Puzzle } from '../src/types.ts'
import { EdgeState as ES } from '../src/types.ts'
import { validate } from '../src/validate.ts'
import { solvePuzzle, countSolutions } from '../src/solver.ts'

const raw = `
. 2 3 . . 2 2 . . . . . . . .
. 2 2 2 1 . 3 . . . . . 2 . 3
2 . . . . 3 . . 3 1 . 3 . . .
. 2 1 . 1 . 2 . . . . . . 2 1
3 . . . . 3 . . 2 3 . 3 . 3 .
1 2 2 . . 3 0 3 . 2 1 . . 1 2
2 . 1 . . . . . . 2 2 2 . 2 .
3 2 2 . . . 1 2 . . . . . . 1
. . 2 . 1 . . . 3 2 . 3 2 2 .
. . . . 3 . . 2 . . 3 1 2 . 3
2 . 3 . . 3 . . . . . 1 . . .
2 2 2 . . . . 2 . 3 2 . . . .
3 . . . 1 3 3 . . . 1 . . 1 3
3 . 3 . 2 1 . 3 . . 2 3 . . .
. . 2 . . 2 . . 1 . 2 . . . 3
`.trim().split('\n').map((r) => r.trim().split(/\s+/))

const cells: CellNumber[] = []
for (const row of raw) {
  for (const ch of row) {
    cells.push(ch === '.' ? null : (Number(ch) as 0 | 1 | 2 | 3))
  }
}
console.log('cells', cells.length, 'filled', cells.filter((c) => c !== null).length)

const puzzle: Puzzle = {
  id: 'user-15x15',
  name: '用户 15×15',
  width: 15,
  height: 15,
  cells,
  difficulty: 'hard',
}

const state = createEmptyState(puzzle)
const t0 = Date.now()
const plan = planLogicSolve(puzzle, state)
const t1 = Date.now()

let on = 0
let off = 0
let unk = 0
for (let hy = 0; hy <= 15; hy++) {
  for (let hx = 1; hx <= 15; hx++) {
    const v = edgeValue(plan.finalState, 'h', hIndex(15, hx, hy))
    if (v === ES.On) on++
    else if (v === ES.Forbidden) off++
    else unk++
  }
}
for (let vy = 1; vy <= 15; vy++) {
  for (let vx = 0; vx <= 15; vx++) {
    const v = edgeValue(plan.finalState, 'v', vIndex(15, vx, vy))
    if (v === ES.On) on++
    else if (v === ES.Forbidden) off++
    else unk++
  }
}

console.log('plan frames', plan.frames.length, 'ruleSteps', plan.ruleSteps, 'ms', t1 - t0)
console.log('after rules: on', on, 'off', off, 'unknown', unk)
console.log('saturated', plan.saturated)

const result = validate(plan.finalState, puzzle)
console.log('validate solved', result.solved, 'loop', result.loop.kind, 'badCells', result.badCells.length, 'badPoints', result.badPoints.length)

// 规则分布
const byRule: Record<number, number> = {}
for (const f of plan.frames) {
  byRule[f.rule] = (byRule[f.rule] ?? 0) + 1
}
console.log('frames by rule', byRule)

// 回溯求解验证唯一性（可能慢）
console.log('backtracking countSolutions…')
const t2 = Date.now()
const c = countSolutions(puzzle, 2, 3_000_000)
console.log('solutions', c.count, 'capped', c.capped, 'timeout', c.timedOut, 'nodes', c.nodes, 'ms', Date.now() - t2)

// 若有解，对比逻辑结果与真解差多少
if (c.first) {
  let agree = 0
  let logicUnknownButSolved = 0
  let conflict = 0
  for (let hy = 0; hy <= 15; hy++) {
    for (let hx = 1; hx <= 15; hx++) {
      const i = hIndex(15, hx, hy)
      const a = plan.finalState.h[i]!
      const b = c.first.h[i]!
      if (a === ES.Unknown) {
        if (b !== ES.Unknown) logicUnknownButSolved++
      } else if (a === b) agree++
      else conflict++
    }
  }
  for (let vy = 1; vy <= 15; vy++) {
    for (let vx = 0; vx <= 15; vx++) {
      const i = vIndex(15, vx, vy)
      const a = plan.finalState.v[i]!
      const b = c.first.v[i]!
      if (a === ES.Unknown) {
        if (b !== ES.Unknown) logicUnknownButSolved++
      } else if (a === b) agree++
      else conflict++
    }
  }
  console.log('vs first solution: agree', agree, 'logic-still-unknown', logicUnknownButSolved, 'CONFLICT', conflict)
}
