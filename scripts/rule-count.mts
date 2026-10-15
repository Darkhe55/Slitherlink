import { collectLogicSteps } from '../src/logic.ts'
import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { createEmptyState, edgeValue } from '../src/state.ts'
import { EdgeState as ES } from '../src/types.ts'

const byRule = new Map<number, number>()
let conflicts = 0

for (const p of puzzles) {
  const sol = getReferenceSolution(p.id)
  if (!sol) {
    console.log('skip (no ref solution)', p.id)
    continue
  }
  const { steps } = collectLogicSteps(p, createEmptyState(p))
  for (const s of steps) {
    byRule.set(s.rule, (byRule.get(s.rule) ?? 0) + s.changes.length)
    for (const c of s.changes) {
      const t = edgeValue(sol, c.axis, c.index)
      if (c.to === ES.On && t !== ES.On) conflicts++
      if (c.to === ES.Forbidden && t === ES.On) conflicts++
    }
  }
}

console.log('changes by rule:', Object.fromEntries([...byRule.entries()].sort()))
console.log('conflicts', conflicts)
