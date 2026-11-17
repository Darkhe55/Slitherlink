/**
 * 逻辑解谜器审计：
 *   1. 从空盘推理，每一步结论都不能与参考解冲突（有参考解的题）
 *   2. 推理终态必须是「合法单环解」（全部 53 题，含两张无参考解的导入题）
 *   3. 统计前瞻反证帧（规则11）与各规则帧数：前瞻帧越少，说明常规局部定式覆盖越多
 *
 * 用法：npm run audit
 */
import { planLogicSolve } from '../src/logic.ts'
import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { createEmptyState } from '../src/state.ts'
import { validate } from '../src/validate.ts'
import { edgeValue } from '../src/state.ts'
import { EdgeState as ES } from '../src/types.ts'

let totalFrames = 0
let totalR11 = 0
let totalUnkAfter = 0
let bad = 0
const rows: string[] = []

for (const p of puzzles) {
  const sol = getReferenceSolution(p.id)
  const st = createEmptyState(p)
  const plan = planLogicSolve(p, st)
  totalFrames += plan.frames.length

  const byRule = new Map<number, number>()
  for (const f of plan.frames) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1)
  const r11 = byRule.get(11) ?? 0
  totalR11 += r11

  // 1) 与参考解比对
  let wrong = 0
  if (sol) {
    for (const f of plan.frames) {
      const truth = edgeValue(sol, f.change.axis, f.change.index)
      if (f.change.to === ES.On && truth !== ES.On) wrong++
      if (f.change.to === ES.Forbidden && truth === ES.On) wrong++
    }
  }

  // 2) 终态必须是合法单环解
  const v = validate(plan.finalState, p)
  const unk = countUnknown(plan)
  totalUnkAfter += unk
  const ok = wrong === 0 && v.solved
  if (!ok) {
    bad++
    console.log(`BAD ${p.id} wrong=${wrong} solved=${v.solved} loop=${v.loop.kind} badPoints=${v.badPoints.length} badCells=${v.badCells.length}`)
  }

  const ruleStr = [...byRule.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, n]) => `R${r}=${n}`)
    .join(' ')
  rows.push(
    `${p.id.padEnd(18)} ${(p.width + 'x' + p.height).padEnd(7)} frames=${String(plan.frames.length).padStart(4)} step=${String(plan.ruleSteps).padStart(3)} R11(前瞻)=${String(r11).padStart(3)} unk=${String(unk).padStart(2)} ${sol ? 'ref-ok' : 'no-ref'} ${ok ? 'solved' : 'FAIL'}`,
  )
  if (r11 > 0) console.log(`  · ${p.id}: ${ruleStr}`)
}

function countUnknown(plan: ReturnType<typeof planLogicSolve>): number {
  let unk = 0
  for (const x of plan.finalState.h) if (x === ES.Unknown) unk++
  for (const x of plan.finalState.v) if (x === ES.Unknown) unk++
  return unk
}

console.log(rows.join('\n'))
console.log('')
console.log(
  `TOTAL puzzles=${puzzles.length} frames=${totalFrames} 前瞻反证帧(R11)=${totalR11} 终态未定边=${totalUnkAfter} 问题题数=${bad}`,
)
if (bad) process.exitCode = 1
else console.log('OK 全部推理结论与参考解一致，终态均为合法单环解')
