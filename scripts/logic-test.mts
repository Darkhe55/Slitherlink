import { collectLogicSteps, planLogicSolve } from '../src/logic.ts'
import { createEmptyState, setEdge, hIndex, vIndex, cellEdges, edgeValue } from '../src/state.ts'
import { puzzles } from '../src/puzzles.ts'
import { validate } from '../src/validate.ts'
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

// 规则12：已确定的环边自身闭合成环 → 其余边全部排除
{
  const w = 3
  const h = 3
  const puzzle: Puzzle = {
    id: 'r12',
    name: 'r12',
    width: w,
    height: h,
    cells: [null, null, null, null, null, null, null, null, null],
    difficulty: 'custom',
  }
  const st = createEmptyState(puzzle)
  // 手工放一个 1 格小环：格 (0,0) 的四条边全部 On
  const e = cellEdges(w, 0, 0)
  setEdge(st, 'h', e.top, ES.On)
  setEdge(st, 'h', e.bottom, ES.On)
  setEdge(st, 'v', e.left, ES.On)
  setEdge(st, 'v', e.right, ES.On)
  const plan = planLogicSolve(puzzle, st)
  const v = validate(plan.finalState, puzzle)
  const loopEdges = new Set([
    `h:${e.top}`,
    `h:${e.bottom}`,
    `v:${e.left}`,
    `v:${e.right}`,
  ])
  let otherOn = 0
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      const idx = hIndex(w, hx, hy)
      if (!loopEdges.has(`h:${idx}`) && edgeValue(plan.finalState, 'h', idx) === ES.On) otherOn++
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const idx = vIndex(w, vx, vy)
      if (!loopEdges.has(`v:${idx}`) && edgeValue(plan.finalState, 'v', idx) === ES.On) otherOn++
    }
  }
  const hasR12 = plan.frames.some((f) => f.rule === 12)
  assert(otherOn === 0 && v.solved && hasR12, `rule12 环路闭合：小环外的边全部排除、终态合法、规则12 有帧 (R12=${hasR12})`)
}

// 规则13：对角 0-3 → 3 格在公共顶点的两条内边落环
{
  const w = 2
  const h = 2
  const puzzle: Puzzle = {
    id: 'r13',
    name: 'r13',
    width: w,
    height: h,
    cells: [0, null, null, 3],
    difficulty: 'custom',
  }
  const plan = planLogicSolve(puzzle, createEmptyState(puzzle))
  const eb = cellEdges(w, 1, 1)
  const on1 = edgeValue(plan.finalState, 'h', eb.top) === ES.On
  const on2 = edgeValue(plan.finalState, 'v', eb.left) === ES.On
  assert(on1 && on2, '对角 0-3：3 格公共顶点的两条内边落环（规则13 与规则4B 都覆盖）')
}

// 规则14：相邻两格计数在真实题库上确实产出结论（其余细节由 audit 校验）
{
  let r14 = 0
  for (const p of puzzles) {
    const plan = planLogicSolve(p, createEmptyState(p))
    r14 += plan.frames.filter((f) => f.rule === 14).length
  }
  assert(r14 > 0, `rule14 相邻两格计数：题库上共推出 ${r14} 格`)
}

// 前瞻规则效率回归：常规定式接管后，规则11（前瞻反证）应很少；所有题终态合法
{
  let r11 = 0
  let solvedAll = true
  for (const p of puzzles) {
    const plan = planLogicSolve(p, createEmptyState(p))
    r11 += plan.frames.filter((f) => f.rule === 11).length
    if (!validate(plan.finalState, p).solved) solvedAll = false
  }
  assert(solvedAll, `全部 ${puzzles.length} 题逻辑终态都是合法单环解`)
  assert(r11 <= 25, `前瞻反证帧总数 ${r11} ≤ 25（优化前为 135）`)
}

console.log('done')
