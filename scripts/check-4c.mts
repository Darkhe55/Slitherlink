/**
 * 核查规则 4C：
 * 1) 四种斜向的边映射是否自洽
 * 2) 本地 A/B、传递 在参考解上是否会推出与真解相反的边
 * 3) 构造反例：合法局面下本地推断是否可能错误
 */
import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { cellEdges, edgeValue, vertexEdges, hIndex, vIndex } from '../src/state.ts'
import type { Side } from '../src/logic.ts'
import { EdgeState as ES } from '../src/types.ts'

// 复制 applyRule4c 的几何
type Case = {
  x3: number
  y3: number
  farPx: readonly [number, number]
  threeFar: (e: ReturnType<typeof cellEdges>) => Array<{ axis: 'h' | 'v'; index: number }>
  twoAtFar: (e: ReturnType<typeof cellEdges>) => Array<{ axis: 'h' | 'v'; index: number }>
}

function casesFor(x2: number, y2: number): Case[] {
  return [
    {
      x3: x2 + 1, y3: y2 + 1,
      farPx: [x2, y2],
      threeFar: (e) => [
        { axis: 'h', index: e.bottom },
        { axis: 'v', index: e.right },
      ],
      twoAtFar: (e) => [
        { axis: 'h', index: e.top },
        { axis: 'v', index: e.left },
      ],
    },
    {
      x3: x2 - 1, y3: y2 + 1,
      farPx: [x2 + 1, y2],
      threeFar: (e) => [
        { axis: 'h', index: e.bottom },
        { axis: 'v', index: e.left },
      ],
      twoAtFar: (e) => [
        { axis: 'h', index: e.top },
        { axis: 'v', index: e.right },
      ],
    },
    {
      x3: x2 + 1, y3: y2 - 1,
      farPx: [x2, y2 + 1],
      threeFar: (e) => [
        { axis: 'h', index: e.top },
        { axis: 'v', index: e.right },
      ],
      twoAtFar: (e) => [
        { axis: 'h', index: e.bottom },
        { axis: 'v', index: e.left },
      ],
    },
    {
      x3: x2 - 1, y3: y2 - 1,
      farPx: [x2 + 1, y2 + 1],
      threeFar: (e) => [
        { axis: 'h', index: e.top },
        { axis: 'v', index: e.left },
      ],
      twoAtFar: (e) => [
        { axis: 'h', index: e.bottom },
        { axis: 'v', index: e.right },
      ],
    },
  ]
}

function checkPuzzle(p: (typeof puzzles)[number], sol: NonNullable<ReturnType<typeof getReferenceSolution>>) {
  const w = p.width
  const h = p.height
  const issues: string[] = []

  for (let y2 = 0; y2 < h; y2++) {
    for (let x2 = 0; x2 < w; x2++) {
      if (p.cells[y2 * w + x2] !== 2) continue
      const e2 = cellEdges(w, x2, y2)
      for (const c of casesFor(x2, y2)) {
        if (c.x3 < 0 || c.y3 < 0 || c.x3 >= w || c.y3 >= h) continue
        if (p.cells[c.y3 * w + c.x3] !== 3) continue

        const e3 = cellEdges(w, c.x3, c.y3)
        const [fpx, fpy] = c.farPx
        const farVe = vertexEdges(w, fpx, fpy)
        const farAll = [
          { axis: 'h' as const, index: farVe.west },
          { axis: 'h' as const, index: farVe.east },
          { axis: 'v' as const, index: farVe.north },
          { axis: 'v' as const, index: farVe.south },
        ]
        const innerKeys = new Set(c.twoAtFar(e2).map((s) => `${s.axis}:${s.index}`))
        const farInner = farAll.filter((s) => innerKeys.has(`${s.axis}:${s.index}`))
        const farOuter = farAll.filter((s) => !innerKeys.has(`${s.axis}:${s.index}`))
        if (farInner.length !== 2 || farOuter.length !== 2) {
          issues.push(`map-bad at 2(${x2},${y2})-3(${c.x3},${c.y3}) inner=${farInner.length}`)
          continue
        }

        const st = (s: { axis: 'h' | 'v'; index: number }) => edgeValue(sol, s.axis, s.index)

        // 本地 A：一外边 On → 另一外边 Off
        const oA = st(farOuter[0]!)
        const oB = st(farOuter[1]!)
        if ((oA === ES.On && oB === ES.On)) {
          // 若规则要设另一条为 Off，会与真解冲突
          issues.push(`localA-would-false: 2(${x2},${y2})-3(${c.x3},${c.y3}) both outer On in truth`)
        }
        // 本地 B：一内边 Off → 另一内边 On
        const iA = st(farInner[0]!)
        const iB = st(farInner[1]!)
        if ((iA === ES.Forbidden && iB === ES.Forbidden)) {
          issues.push(`localB-would-false: 2(${x2},${y2})-3(${c.x3},${c.y3}) both inner Off in truth`)
        }

        // 传递：若 (一外 On 或 一内 Off)，则 3 对边都是 On
        const hasOnOuter = oA === ES.On || oB === ES.On
        const hasOffInner = iA === ES.Forbidden || iB === ES.Forbidden
        if (hasOnOuter || hasOffInner) {
          for (const s of c.threeFar(e3)) {
            if (st(s) !== ES.On) {
              issues.push(
                `transfer-would-false: 2(${x2},${y2})-3(${c.x3},${c.y3}) 3-far ${s.axis}[${s.index}] truth=${st(s)}`,
              )
            }
          }
        }
      }
    }
  }
  return issues
}

let total = 0
let bad = 0
const samples: string[] = []
for (const p of puzzles) {
  const sol = getReferenceSolution(p.id)
  if (!sol) continue
  const iss = checkPuzzle(p, sol)
  total++
  if (iss.length) {
    bad++
    samples.push(`${p.id}: ${iss.length} issues, e.g. ${iss[0]}`)
  }
}

console.log(`checked ${total} puzzles, ${bad} with 4C issues`)
for (const s of samples.slice(0, 12)) console.log(' ', s)

// 几何自检：四种情形的 threeFar 是否都是「不连公共顶点的两条」
// 公共顶点：
// A: 2(x,y) 3(x+1,y+1) share (x+1,y+1) — 3 顶点四边中连该点的是 top,left；对边 bottom,right ✓
console.log('done')
