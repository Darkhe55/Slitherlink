import { collectLogicSteps } from '../src/logic.ts'
import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { createEmptyState, edgeValue, setEdge, hIndex, vIndex } from '../src/state.ts'
import { EdgeState as ES } from '../src/types.ts'
import { validate } from '../src/validate.ts'
import type { EdgeState, GameState } from '../src/types.ts'

type Stat = {
  id: string
  size: string
  steps: number
  on: number
  off: number
  unk: number
  solvedByRules: boolean
  vsTruth: { correctOn: number; wrongOn: number; correctOff: number; wrongOff: number }
}

const stats: Stat[] = []

for (const p of puzzles) {
  const sol = getReferenceSolution(p.id)!
  const st = createEmptyState(p)
  const { steps, finalState } = collectLogicSteps(p, st)

  let on = 0, off = 0, unk = 0
  let correctOn = 0, wrongOn = 0, correctOff = 0, wrongOff = 0

  for (let hy = 0; hy <= p.height; hy++) {
    for (let hx = 1; hx <= p.width; hx++) {
      const i = hIndex(p.width, hx, hy)
      const v = finalState.h[i]!
      const t = sol.h[i]!
      if (v === ES.On) {
        on++
        if (t === ES.On) correctOn++
        else wrongOn++
      } else if (v === ES.Forbidden) {
        off++
        if (t === ES.Forbidden) correctOff++
        else wrongOff++
      } else unk++
    }
  }
  for (let vy = 1; vy <= p.height; vy++) {
    for (let vx = 0; vx <= p.width; vx++) {
      const i = vIndex(p.width, vx, vy)
      const v = finalState.v[i]!
      const t = sol.v[i]!
      if (v === ES.On) {
        on++
        if (t === ES.On) correctOn++
        else wrongOn++
      } else if (v === ES.Forbidden) {
        off++
        if (t === ES.Forbidden) correctOff++
        else wrongOff++
      } else unk++
    }
  }

  const result = validate(finalState, p)
  stats.push({
    id: p.id,
    size: `${p.width}x${p.height}`,
    steps: steps.length,
    on,
    off,
    unk,
    solvedByRules: result.solved,
    vsTruth: { correctOn, wrongOn, correctOff, wrongOff },
  })
}

// 汇总
const bySize = new Map<string, { n: number; solved: number; unkSum: number; steps: number }>()
for (const s of stats) {
  const g = bySize.get(s.size) ?? { n: 0, solved: 0, unkSum: 0, steps: 0 }
  g.n++
  if (s.solvedByRules) g.solved++
  g.unkSum += s.unk
  g.steps += s.steps
  bySize.set(s.size, g)
}

console.log('=== 按尺寸 ===')
for (const [size, g] of bySize) {
  console.log(
    `${size}: ${g.solved}/${g.n} 规则全解 · 平均剩余未知 ${(g.unkSum / g.n).toFixed(1)} · 平均步数 ${(g.steps / g.n).toFixed(1)}`,
  )
}

const total = stats.length
const solved = stats.filter((s) => s.solvedByRules).length
const avgUnk = stats.reduce((a, s) => a + s.unk, 0) / total
const avgOn = stats.reduce((a, s) => a + s.on, 0) / total
console.log(`\n全部: ${solved}/${total} 规则可全解`)
console.log(`平均确定环边 ${avgOn.toFixed(1)} · 平均剩余未知 ${avgUnk.toFixed(1)}`)

// 冲突
const conflicts = stats.reduce(
  (a, s) => a + s.vsTruth.wrongOn + s.vsTruth.wrongOff,
  0,
)
console.log(`与真解冲突 ${conflicts}`)

// 样例：未全解的前 5
console.log('\n=== 未全解样例 ===')
for (const s of stats.filter((x) => !x.solvedByRules).slice(0, 5)) {
  console.log(
    `${s.id} steps=${s.steps} on=${s.on} off=${s.off} unk=${s.unk} truthOnCorrect=${s.vsTruth.correctOn}`,
  )
}
