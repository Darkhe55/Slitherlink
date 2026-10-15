import { solvePuzzle, countSolutions } from '../src/solver.ts'
import type { Puzzle } from '../src/types.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL', msg)
    process.exitCode = 1
  } else {
    console.log('OK', msg)
  }
}

// 2x2 全 2：合法小盘，应有解
const p1: Puzzle = {
  id: 'c1',
  name: 'c1',
  width: 2,
  height: 2,
  cells: [2, 2, 2, 2],
  difficulty: 'custom',
}
const r1 = solvePuzzle(p1, 200000)
assert(r1.solved, `2x2 all-2 solvable (nodes=${r1.nodes})`)

// 1x1 数字 0：四边全排除
const p0: Puzzle = {
  id: 'c0',
  name: 'c0',
  width: 1,
  height: 1,
  cells: [0],
  difficulty: 'custom',
}
const r0 = solvePuzzle(p0, 50000)
assert(r0.solved, '1x1 zero solvable')

// 矛盾盘：1x1 数字 3 且不可能（单格需 3 边）—— 实际可解（三边在环上）？
// 用 2x2 矛盾：一格 0 与相邻强制冲突不易构造；
// 直接测空数字盘应有解（任意环）
const pEmpty: Puzzle = {
  id: 'ce',
  name: 'ce',
  width: 3,
  height: 3,
  cells: [null, null, null, null, null, null, null, null, null],
  difficulty: 'custom',
}
const cEmpty = countSolutions(pEmpty, 2, 300000)
assert(cEmpty.count >= 1, `blank 3x3 has solutions (${cEmpty.count})`)

// 无解：1x1 数字 4 不在类型里；改用构造矛盾
// 格 0 + 顶点规则无法单独无解。
// 2x1: [0, 3] — 0 排除左边全排除，3 需要 3 边…
const pHard: Puzzle = {
  id: 'ch',
  name: 'ch',
  width: 2,
  height: 1,
  cells: [0, 3],
  difficulty: 'custom',
}
const rH = solvePuzzle(pHard, 100000)
// 0: 四边排除；3: 需 3 边 — 共享边已被 0 排除，3 最多 3 边外侧 → 可解
console.log('2x1 [0,3] solved', rH.solved)

console.log('done')
