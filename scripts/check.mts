import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { validate } from '../src/validate.ts'
import { createEmptyState, lockPads, hIndex, vIndex, edgeValue } from '../src/state.ts'
import { EdgeState as ES } from '../src/types.ts'

console.log('puzzle count:', puzzles.length)
if (puzzles.length < 4) {
  console.error('expected 4 puzzles')
  process.exitCode = 1
}

for (const p of puzzles) {
  console.log('---', p.id, `${p.width}x${p.height}`, p.difficulty)
  console.log('cells:', p.cells.join(''))
  const sol = getReferenceSolution(p.id)
  if (!sol) {
    console.error('missing reference solution')
    process.exitCode = 1
    continue
  }
  const result = validate(sol, p)
  console.log('ref solution solved:', result.solved, 'loop:', result.loop.kind)
  if (!result.solved) {
    console.error('ref solution invalid', result.badCells, result.badPoints)
    process.exitCode = 1
  }
}

const p = puzzles[0]!
const st = createEmptyState(p)
lockPads(st)
const w = p.width
const h = p.height
let padOk = true
for (let hy = 0; hy <= h; hy++) {
  if (st.h[hIndex(w, 0, hy)] !== ES.Forbidden) padOk = false
  if (st.h[hIndex(w, w + 1, hy)] !== ES.Forbidden) padOk = false
}
for (let vx = 0; vx <= w; vx++) {
  if (st.v[vIndex(w, vx, 0)] !== ES.Forbidden) padOk = false
  if (st.v[vIndex(w, vx, h + 1)] !== ES.Forbidden) padOk = false
}
console.log('pads locked:', padOk)

let fourOk = true
for (let py = 0; py <= h; py++) {
  for (let px = 0; px <= w; px++) {
    const e = {
      west: hIndex(w, px, py),
      east: hIndex(w, px + 1, py),
      north: vIndex(w, px, py),
      south: vIndex(w, px, py + 1),
    }
    for (const idx of [e.west, e.east]) {
      if (idx < 0 || idx >= st.h.length) fourOk = false
    }
    for (const idx of [e.north, e.south]) {
      if (idx < 0 || idx >= st.v.length) fourOk = false
    }
  }
}
console.log('every vertex has 4 in-range edges:', fourOk)
console.log('h length', st.h.length, 'expect', (h + 1) * (w + 2))
console.log('v length', st.v.length, 'expect', (h + 2) * (w + 1))

// 角点：四边分别为 pad/real
const corner = {
  west: hIndex(w, 0, 0),
  east: hIndex(w, 1, 0),
  north: vIndex(w, 0, 0),
  south: vIndex(w, 0, 1),
}
console.log(
  'corner(0,0) states',
  edgeValue(st, 'h', corner.west),
  edgeValue(st, 'h', corner.east),
  edgeValue(st, 'v', corner.north),
  edgeValue(st, 'v', corner.south),
)
