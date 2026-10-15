import { collectLogicSteps } from '../src/logic.ts'
import { createEmptyState, setEdge, hIndex, vIndex, edgeValue } from '../src/state.ts'
import type { Puzzle } from '../src/types.ts'
import { EdgeState as ES } from '../src/types.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL', msg)
    process.exitCode = 1
  } else {
    console.log('OK', msg)
  }
}

// 1x1 棋盘，数字 0 → 规则1 应立刻把 4 边全部排除
{
  const puzzle: Puzzle = {
    id: 'n0',
    name: 'n0',
    width: 1,
    height: 1,
    cells: [0],
    difficulty: 'easy',
  }
  const st = createEmptyState(puzzle)
  const { steps, finalState } = collectLogicSteps(puzzle, st)
  assert(steps.length > 0, `number0 produces steps (${steps.length})`)
  const allOff =
    finalState.h.every((v) => v === ES.Forbidden) &&
    finalState.v.every((v) => v === ES.Forbidden)
  assert(allOff, 'number0 fills all edges Forbidden')
}

// 1x1 数字 4 不在经典盘里；用 2×1 验证规则1情形B：一格3边排除 → 1边在环上
{
  const puzzle: Puzzle = {
    id: 'r1b',
    name: 'r1b',
    width: 2,
    height: 1,
    cells: [1, 1],
    difficulty: 'easy',
  }
  const st = createEmptyState(puzzle)
  // 手工把 (0,0) 的上、下、左 排除 → 规则1 应把右边设为 On
  const w = 2
  // cell(0,0) top=h(1,0), bottom=h(1,1), left=v(0,1), right=v(1,1)
  setEdge(st, 'h', hIndex(w, 1, 0), ES.Forbidden)
  setEdge(st, 'h', hIndex(w, 1, 1), ES.Forbidden)
  setEdge(st, 'v', vIndex(w, 0, 1), ES.Forbidden)
  const { steps } = collectLogicSteps(puzzle, st)
  const turnOn = steps.some((s) =>
    s.changes.some(
      (c) =>
        c.to === ES.On &&
        c.axis === 'v' &&
        c.index === vIndex(w, 1, 1),
    ),
  )
  assert(turnOn, 'rule1 case B turns remaining edge On')
}

// 规则4：两环边 → 余边排除
{
  const puzzle: Puzzle = {
    id: 'r4',
    name: 'r4',
    width: 2,
    height: 2,
    cells: [null, null, null, null],
    difficulty: 'easy',
  }
  const st = createEmptyState(puzzle)
  const w = 2
  // 顶点 (1,1) 的 west=h(1,1), east=h(2,1), north=v(1,1), south=v(1,2)
  setEdge(st, 'h', hIndex(w, 1, 1), ES.On)
  setEdge(st, 'v', vIndex(w, 1, 1), ES.On)
  const { steps } = collectLogicSteps(puzzle, st)
  const excluded = steps.some((s) =>
    s.changes.some(
      (c) =>
        c.to === ES.Forbidden &&
        ((c.axis === 'h' && c.index === hIndex(w, 2, 1)) ||
          (c.axis === 'v' && c.index === vIndex(w, 1, 2))),
    ),
  )
  assert(excluded, 'rule4 case A excludes remaining edges at vertex')
}

console.log('done')
