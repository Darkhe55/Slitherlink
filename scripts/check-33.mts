import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { cellEdges, edgeValue } from '../src/state.ts'
import { EdgeState as ES } from '../src/types.ts'

let pairs = 0
let sharedOn = 0
let sharedOff = 0
let sharedUnk = 0

for (const p of puzzles) {
  const sol = getReferenceSolution(p.id)!
  const w = p.width
  const h = p.height
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      if (p.cells[cy * w + cx] !== 3) continue
      if (cx + 1 < w && p.cells[cy * w + cx + 1] === 3) {
        pairs++
        const e = cellEdges(w, cx, cy)
        const v = edgeValue(sol, 'v', e.right)
        if (v === ES.On) sharedOn++
        else if (v === ES.Forbidden) sharedOff++
        else sharedUnk++
      }
      if (cy + 1 < h && p.cells[(cy + 1) * w + cx] === 3) {
        pairs++
        const e = cellEdges(w, cx, cy)
        const v = edgeValue(sol, 'h', e.bottom)
        if (v === ES.On) sharedOn++
        else if (v === ES.Forbidden) sharedOff++
        else sharedUnk++
      }
    }
  }
}

console.log({ pairs, sharedOn, sharedOff, sharedUnk })
