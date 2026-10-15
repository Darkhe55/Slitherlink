import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { cellEdges, edgeValue } from '../src/state.ts'
import { EdgeState as ES } from '../src/types.ts'

let pairs = 0
let bothOppOn = 0
let miss = 0

for (const p of puzzles) {
  const sol = getReferenceSolution(p.id)!
  const w = p.width
  const h = p.height
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      if (p.cells[cy * w + cx] !== 3) continue
      if (cx + 1 < w && p.cells[cy * w + cx + 1] === 3) {
        pairs++
        const a = cellEdges(w, cx, cy)
        const b = cellEdges(w, cx + 1, cy)
        const ok =
          edgeValue(sol, 'v', a.left) === ES.On &&
          edgeValue(sol, 'v', b.right) === ES.On
        if (ok) bothOppOn++
        else {
          miss++
          console.log('miss H', cx, cy, edgeValue(sol, 'v', a.left), edgeValue(sol, 'v', b.right))
        }
      }
      if (cy + 1 < h && p.cells[(cy + 1) * w + cx] === 3) {
        pairs++
        const a = cellEdges(w, cx, cy)
        const b = cellEdges(w, cx, cy + 1)
        const ok =
          edgeValue(sol, 'h', a.top) === ES.On &&
          edgeValue(sol, 'h', b.bottom) === ES.On
        if (ok) bothOppOn++
        else {
          miss++
          console.log('miss V', cx, cy, edgeValue(sol, 'h', a.top), edgeValue(sol, 'h', b.bottom))
        }
      }
    }
  }
}

console.log({ pairs, bothOppOn, miss })
