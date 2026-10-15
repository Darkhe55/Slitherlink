import { collectLogicSteps } from '../src/logic.ts'
import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { createEmptyState, edgeValue } from '../src/state.ts'

let totalSteps = 0
let bad = 0

for (const p of puzzles) {
  const sol = getReferenceSolution(p.id)
  if (!sol) {
    console.error('no solution', p.id)
    process.exitCode = 1
    continue
  }
  const st = createEmptyState(p)
  const { steps } = collectLogicSteps(p, st)
  totalSteps += steps.length

  for (const step of steps) {
    for (const c of step.changes) {
      const truth = edgeValue(sol, c.axis, c.index)
      if (c.to === 1 && truth !== 1) {
        console.log(`CONFLICT ${p.id} RULE${step.rule} set ${c.axis}[${c.index}]=On sol=${truth}`)
        console.log('  ', step.label)
        bad++
      }
      if (c.to === 2 && truth === 1) {
        console.log(`CONFLICT ${p.id} RULE${step.rule} set ${c.axis}[${c.index}]=Off sol=On`)
        console.log('  ', step.label)
        bad++
      }
    }
  }
}

console.log('total steps from empty', totalSteps, 'conflicts', bad)
if (bad) process.exitCode = 1
else console.log('OK no conflicts with reference solutions')
