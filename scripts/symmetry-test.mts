import { collectLogicSteps } from '../src/logic.ts'
import { puzzles, getReferenceSolution } from '../src/puzzles.ts'
import { createEmptyState, hIndex, vIndex, edgeValue, setEdge, lockPads } from '../src/state.ts'
import type { CellNumber, GameState, Puzzle, EdgeState } from '../src/types.ts'
import { EdgeState as ES } from '../src/types.ts'

/** 90° 顺时针旋转 (w,h) 格盘：新宽=旧高，新高=旧宽 */
function rotateCW(p: Puzzle): Puzzle {
  const w = p.width
  const h = p.height
  const cells: CellNumber[] = new Array(w * h).fill(null)
  // 新 (cx',cy') 来自旧 (cx,cy)
  // cx' = h-1-cy, cy' = cx
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const ncx = h - 1 - cy
      const ncy = cx
      cells[ncy * h + ncx] = p.cells[cy * w + cx]!
    }
  }
  return {
    id: p.id + '-rot',
    name: p.name,
    width: h,
    height: w,
    cells,
    difficulty: p.difficulty,
  }
}

/** 水平翻转 */
function flipH(p: Puzzle): Puzzle {
  const w = p.width
  const h = p.height
  const cells: CellNumber[] = new Array(w * h).fill(null)
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      cells[cy * w + (w - 1 - cx)] = p.cells[cy * w + cx]!
    }
  }
  return { ...p, id: p.id + '-flip', cells }
}

/** 将解的边从源盘映射到旋转后盘的边状态 */
function rotateSolution(src: GameState, w: number, h: number): { h: EdgeState[]; v: EdgeState[] } {
  // 旧 h[hx,hy] 连接 (hx,hy)-(hx+1,hy)，hx=0..w-1, hy=0..h
  // 旋转变成新的竖边
  // 旧点 (px,py) → 新点 (h-py, px)
  // 旧横边 (hx,hy)-(hx+1,hy) → 新竖边连接 (h-hy, hx)-(h-hy, hx+1)?
  // 旧点 A(hx,hy) → 新 A'(h-hy, hx)
  // 旧点 B(hx+1,hy) → 新 B'(h-hy, hx+1)
  // A'B' 是竖边：x=h-hy, y 从 hx 到 hx+1
  // 新盘 w'=h, h'=w
  // 新竖边逻辑索引 vIndex(w', x, y)= y*(w'+1)+x, y 在 0..h'-1 对应真实
  // 真实竖边 y_seg = hx (0..w-1), x = h-hy (0..h)
  // 注意 padding：逻辑 vy = y_seg+1
  const w2 = h
  const h2 = w
  const outH = new Array<EdgeState>((h2 + 1) * (w2 + 2)).fill(ES.Forbidden)
  const outV = new Array<EdgeState>((h2 + 2) * (w2 + 1)).fill(ES.Forbidden)

  // 先填真实边 Unknown 语义：直接映射状态
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 0; hx < w; hx++) {
      const st = src.h[hIndex(w, hx + 1, hy)]!
      // 新竖边：x = h-hy, segY = hx → 逻辑 vy=hx+1
      const x = h - hy
      const vy = hx + 1
      outV[vIndex(w2, x, vy)] = st
    }
  }
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const st = src.v[vIndex(w, vx, vy + 1)]!
      // 旧竖边 (vx,vy)-(vx,vy+1) → 新横边
      // A(vx,vy)→(h-vy,vx), B(vx,vy+1)→(h-vy-1,vx)
      // 是横边：y=vx, x 从 h-vy-1 到 h-vy
      // segX = h-vy-1, rowY = vx → 逻辑 hx=segX+1
      const segX = h - vy - 1
      const rowY = vx
      outH[hIndex(w2, segX + 1, rowY)] = st
    }
  }
  lockPads({
    puzzleId: 'tmp',
    width: w2,
    height: h2,
    h: outH,
    v: outV,
  })
  return { h: outH, v: outV }
}

function flipSolution(src: GameState, w: number, h: number): { h: EdgeState[]; v: EdgeState[] } {
  const outH = new Array<EdgeState>((h + 1) * (w + 2)).fill(ES.Forbidden)
  const outV = new Array<EdgeState>((h + 2) * (w + 1)).fill(ES.Forbidden)
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 0; hx < w; hx++) {
      // 旧横边 seg=hx 映射到 seg=w-1-hx
      const st = src.h[hIndex(w, hx + 1, hy)]!
      outH[hIndex(w, w - hx, hy)] = st
    }
  }
  for (let vy = 0; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const st = src.v[vIndex(w, vx, vy)]!
      // pad 也处理；真实 vy 1..h
      if (vy === 0 || vy === h + 1) continue
      outV[vIndex(w, w - vx, vy)] = st
    }
  }
  lockPads({ puzzleId: 'tmp', width: w, height: h, h: outH, v: outV })
  return { h: outH, v: outV }
}

function edgesOf(state: GameState, w: number, h: number) {
  const list: Array<[string, number, number]> = []
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      list.push(['h', hIndex(w, hx, hy), state.h[hIndex(w, hx, hy)]!])
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      list.push(['v', vIndex(w, vx, vy), state.v[vIndex(w, vx, vy)]!])
    }
  }
  return list
}

function compare(
  label: string,
  a: { h: EdgeState[]; v: EdgeState[] },
  b: { h: EdgeState[]; v: EdgeState[] },
  w: number,
  h: number,
): number {
  let diff = 0
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      const i = hIndex(w, hx, hy)
      if (a.h[i] !== b.h[i]) {
        diff++
        if (diff <= 5) console.log(`  ${label} h[${hx},${hy}] ${a.h[i]} vs ${b.h[i]}`)
      }
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const i = vIndex(w, vx, vy)
      if (a.v[i] !== b.v[i]) {
        diff++
        if (diff <= 5) console.log(`  ${label} v[${vx},${vy}] ${a.v[i]} vs ${b.v[i]}`)
      }
    }
  }
  return diff
}

let fail = 0
let tested = 0

for (const p of puzzles) {
  // 原盘推演
  const { finalState: raw } = collectLogicSteps(p, createEmptyState(p))
  tested++

  // 旋转 90°
  const pr = rotateCW(p)
  const { finalState: rot } = collectLogicSteps(pr, createEmptyState(pr))
  const mapped = rotateSolution(raw, p.width, p.height)
  const d1 = compare(`${p.id} CW`, mapped, rot, pr.width, pr.height)
  if (d1) {
    fail++
    console.log(`FAIL ${p.id} CW diffs=${d1}`)
  }

  // 水平翻转
  const pf = flipH(p)
  const { finalState: flip } = collectLogicSteps(pf, createEmptyState(pf))
  const mappedF = flipSolution(raw, p.width, p.height)
  const d2 = compare(`${p.id} H`, mappedF, flip, pf.width, pf.height)
  if (d2) {
    fail++
    console.log(`FAIL ${p.id} HFlip diffs=${d2}`)
  }
}

console.log(`tested ${tested} puzzles × 2 transforms`)
if (fail) {
  console.log('FAIL symmetry violations', fail)
  process.exitCode = 1
} else {
  console.log('OK all rules equivariant under CW rotation and H flip')
}
