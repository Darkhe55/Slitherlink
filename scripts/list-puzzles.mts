import { puzzles } from '../src/puzzles.ts'

const by: Record<string, number> = {}
for (const p of puzzles) {
  const k = `${p.width}x${p.height}`
  by[k] = (by[k] ?? 0) + 1
}
console.log('count', puzzles.length, by)
for (const p of puzzles.filter((x) => x.width === 25)) {
  console.log(p.id, p.name, p.cells.length)
}
