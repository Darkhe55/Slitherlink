import {
  cellEdges,
  edgeValue,
  hIndex,
  hWidth,
  setEdge,
  vIndex,
  vertexEdges,
} from './state'
import type { Axis, CellNumber, EdgeState, GameState, Puzzle } from './types'
import { EdgeState as ES } from './types'
import { probeEdge } from './coloring'

export interface LogicChange {
  axis: Axis
  index: number
  from: EdgeState
  to: EdgeState
}

export interface LogicStep {
  rule: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
  label: string
  changes: LogicChange[]
  maskCells: number[]
  maskVertices: number[]
  maskEdges: Array<{ axis: Axis; index: number }>
}

/** 动画回放用的单步（已拍平，推理期一次性写好） */
export interface PlaybackFrame {
  /** 第几条规则 */
  rule: LogicStep['rule']
  label: string
  change: LogicChange
  /** 同类型连拍序号（1 起） */
  streak: number
}

/** 完整解题计划：先推理完，动画只读它 */
export interface LogicPlan {
  puzzleId: string
  frames: PlaybackFrame[]
  /** 推理终态（与逐帧施加后一致） */
  finalState: GameState
  /** 规则步数（含无 change 的掩码步） */
  ruleSteps: number
  /** 是否推到不动点 */
  saturated: boolean
}

export interface LogicMasks {
  cells: boolean[]
  vertices: boolean[]
  h: boolean[]
  v: boolean[]
}

export function createMasks(w: number, h: number): LogicMasks {
  return {
    cells: new Array(w * h).fill(false),
    vertices: new Array((w + 1) * (h + 1)).fill(false),
    h: new Array((h + 1) * (w + 2)).fill(false),
    v: new Array((h + 2) * (w + 1)).fill(false),
  }
}

function isEdgeMasked(masks: LogicMasks, axis: Axis, index: number): boolean {
  return axis === 'h' ? masks.h[index]! : masks.v[index]!
}

function setEdgeMask(masks: LogicMasks, axis: Axis, index: number, on = true): void {
  if (axis === 'h') masks.h[index] = on
  else masks.v[index] = on
}

function cellMaskIndex(w: number, cx: number, cy: number) {
  return cy * w + cx
}

function vertexMaskIndex(w: number, px: number, py: number) {
  return py * (w + 1) + px
}

type Side = { axis: Axis; index: number }

function sharedGeometry(
  w: number,
  ax: number,
  ay: number,
  dir: 'H' | 'V',
) {
  const aE = cellEdges(w, ax, ay)
  const bx = dir === 'H' ? ax + 1 : ax
  const by = dir === 'H' ? ay : ay + 1
  const bE = cellEdges(w, bx, by)

  if (dir === 'H') {
    const shared: Side = { axis: 'v', index: aE.right }
    const vertices = [
      {
        px: ax + 1,
        py: ay,
        aSide: { axis: 'h' as Axis, index: aE.top },
        bSide: { axis: 'h' as Axis, index: bE.top },
        outward: { axis: 'v' as Axis, index: vertexEdges(w, ax + 1, ay).north },
      },
      {
        px: ax + 1,
        py: ay + 1,
        aSide: { axis: 'h' as Axis, index: aE.bottom },
        bSide: { axis: 'h' as Axis, index: bE.bottom },
        outward: { axis: 'v' as Axis, index: vertexEdges(w, ax + 1, ay + 1).south },
      },
    ]
    return { shared, vertices, a: aE, b: bE }
  }

  const shared: Side = { axis: 'h', index: aE.bottom }
  const vertices = [
    {
      px: ax,
      py: ay + 1,
      aSide: { axis: 'v' as Axis, index: aE.left },
      bSide: { axis: 'v' as Axis, index: bE.left },
      outward: { axis: 'h' as Axis, index: vertexEdges(w, ax, ay + 1).west },
    },
    {
      px: ax + 1,
      py: ay + 1,
      aSide: { axis: 'v' as Axis, index: aE.right },
      bSide: { axis: 'v' as Axis, index: bE.right },
      outward: { axis: 'h' as Axis, index: vertexEdges(w, ax + 1, ay + 1).east },
    },
  ]
  return { shared, vertices, a: aE, b: bE }
}

/**
 * 预先推完整条解题过程（与动画解耦）。
 * 返回不可变计划；动画阶段不得再调用本函数。
 */
export function planLogicSolve(
  puzzle: Puzzle,
  state: GameState,
): LogicPlan {
  const w = puzzle.width
  const h = puzzle.height

  const work: GameState = {
    puzzleId: state.puzzleId,
    width: state.width,
    height: state.height,
    h: state.h.slice(),
    v: state.v.slice(),
  }
  const masks = createMasks(w, h)
  const steps: LogicStep[] = []

  const trySet = (
    axis: Axis,
    index: number,
    to: EdgeState,
    acc: LogicChange[],
  ): boolean => {
    if (isEdgeMasked(masks, axis, index)) return false
    const from = edgeValue(work, axis, index)
    if (from !== ES.Unknown) return false
    if (from === to) return false
    acc.push({ axis, index, from, to })
    setEdge(work, axis, index, to)
    return true
  }

  const flush = (
    rule: LogicStep['rule'],
    label: string,
    acc: LogicChange[],
    maskCells: number[] = [],
    maskVertices: number[] = [],
    maskEdges: Array<{ axis: Axis; index: number }> = [],
  ) => {
    if (!acc.length && !maskCells.length && !maskVertices.length && !maskEdges.length) {
      return
    }
    for (const c of maskCells) masks.cells[c] = true
    for (const v of maskVertices) masks.vertices[v] = true
    for (const e of maskEdges) setEdgeMask(masks, e.axis, e.index, true)
    steps.push({ rule, label, changes: acc, maskCells, maskVertices, maskEdges })
  }

  const applyRule1 = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber
        if (n === null || n === undefined) continue
        const ci = cellMaskIndex(w, cx, cy)
        if (masks.cells[ci]) continue

        const e = cellEdges(w, cx, cy)
        const sides: Side[] = [
          { axis: 'h', index: e.top },
          { axis: 'h', index: e.bottom },
          { axis: 'v', index: e.left },
          { axis: 'v', index: e.right },
        ]
        let on = 0
        let off = 0
        let unk = 0
        for (const s of sides) {
          const v = edgeValue(work, s.axis, s.index)
          if (v === ES.On) on++
          else if (v === ES.Forbidden) off++
          else unk++
        }

        if (on === n && unk > 0) {
          const acc: LogicChange[] = []
          for (const s of sides) trySet(s.axis, s.index, ES.Forbidden, acc)
          flush(1, `规则1：(${cx},${cy})=${n} 已满，其余排除`, acc)
          continue
        }
        if (off + n === 4 && unk > 0) {
          const acc: LogicChange[] = []
          for (const s of sides) trySet(s.axis, s.index, ES.On, acc)
          flush(
            1,
            `规则1：(${cx},${cy})=${n} 缺口=${n - on}，其余在环上并掩码`,
            acc,
            [ci],
            [],
            sides.map((s) => ({ axis: s.axis, index: s.index })),
          )
        }
      }
    }
  }

  const applyRule2 = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber
        if (n !== 1) continue
        const ci = cellMaskIndex(w, cx, cy)
        if (masks.cells[ci]) continue

        const e = cellEdges(w, cx, cy)
        const corners = [
          {
            px: cx,
            py: cy,
            onCell: [
              { axis: 'h' as Axis, index: e.top },
              { axis: 'v' as Axis, index: e.left },
            ],
          },
          {
            px: cx + 1,
            py: cy,
            onCell: [
              { axis: 'h' as Axis, index: e.top },
              { axis: 'v' as Axis, index: e.right },
            ],
          },
          {
            px: cx,
            py: cy + 1,
            onCell: [
              { axis: 'h' as Axis, index: e.bottom },
              { axis: 'v' as Axis, index: e.left },
            ],
          },
          {
            px: cx + 1,
            py: cy + 1,
            onCell: [
              { axis: 'h' as Axis, index: e.bottom },
              { axis: 'v' as Axis, index: e.right },
            ],
          },
        ]

        for (const c of corners) {
          const vi = vertexMaskIndex(w, c.px, c.py)
          if (masks.vertices[vi]) continue
          const ve = vertexEdges(w, c.px, c.py)
          const all: Side[] = [
            { axis: 'h', index: ve.west },
            { axis: 'h', index: ve.east },
            { axis: 'v', index: ve.north },
            { axis: 'v', index: ve.south },
          ]
          const onCellKeys = new Set(c.onCell.map((s) => `${s.axis}:${s.index}`))
          const offCell = all.filter((s) => !onCellKeys.has(`${s.axis}:${s.index}`))

          {
            const [o1, o2] = offCell
            if (o1 && o2) {
              const v1 = edgeValue(work, o1.axis, o1.index)
              const v2 = edgeValue(work, o2.axis, o2.index)
              if (v1 === ES.Forbidden && v2 === ES.Forbidden) {
                const acc: LogicChange[] = []
                for (const s of c.onCell) trySet(s.axis, s.index, ES.Forbidden, acc)
                if (acc.length) {
                  flush(
                    2,
                    `规则2A：数字1角(${c.px},${c.py})两外边排除 → 该角两边排除并掩码`,
                    acc,
                    [],
                    [vi],
                    all.map((s) => ({ axis: s.axis, index: s.index })),
                  )
                  continue
                }
              }
            }
          }

          {
            const [o1, o2] = offCell
            if (o1 && o2) {
              const v1 = edgeValue(work, o1.axis, o1.index)
              const v2 = edgeValue(work, o2.axis, o2.index)
              const hasOff = v1 === ES.Forbidden || v2 === ES.Forbidden
              const hasOn = v1 === ES.On || v2 === ES.On
              if (hasOff && hasOn) {
                const acc: LogicChange[] = []
                const cellSides: Side[] = [
                  { axis: 'h', index: e.top },
                  { axis: 'h', index: e.bottom },
                  { axis: 'v', index: e.left },
                  { axis: 'v', index: e.right },
                ]
                for (const s of cellSides) {
                  if (!onCellKeys.has(`${s.axis}:${s.index}`)) {
                    trySet(s.axis, s.index, ES.Forbidden, acc)
                  }
                }
                flush(2, `规则2B：数字1角(${c.px},${c.py})外边一排除一环 → 对边排除`, acc)
              }
            }
          }
        }
      }
    }
  }

  /**
   * 规则3：数字 2 —— 外边一叉一环 ⇔ 对边一叉一环
   * 角点外边（不在 2 周围）一 On 一 Off
   *   ⇔ 不连该点的两条对边也是一 On 一 Off。
   * 已知一侧的一条时，可定另一侧的对应边。
   */
  const applyRule2c = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber
        if (n !== 2) continue
        const ci = cellMaskIndex(w, cx, cy)
        if (masks.cells[ci]) continue

        const e = cellEdges(w, cx, cy)
        const corners = [
          {
            px: cx,
            py: cy,
            at: [
              { axis: 'h' as Axis, index: e.top },
              { axis: 'v' as Axis, index: e.left },
            ],
            far: [
              { axis: 'h' as Axis, index: e.bottom },
              { axis: 'v' as Axis, index: e.right },
            ],
          },
          {
            px: cx + 1,
            py: cy,
            at: [
              { axis: 'h' as Axis, index: e.top },
              { axis: 'v' as Axis, index: e.right },
            ],
            far: [
              { axis: 'h' as Axis, index: e.bottom },
              { axis: 'v' as Axis, index: e.left },
            ],
          },
          {
            px: cx,
            py: cy + 1,
            at: [
              { axis: 'h' as Axis, index: e.bottom },
              { axis: 'v' as Axis, index: e.left },
            ],
            far: [
              { axis: 'h' as Axis, index: e.top },
              { axis: 'v' as Axis, index: e.right },
            ],
          },
          {
            px: cx + 1,
            py: cy + 1,
            at: [
              { axis: 'h' as Axis, index: e.bottom },
              { axis: 'v' as Axis, index: e.right },
            ],
            far: [
              { axis: 'h' as Axis, index: e.top },
              { axis: 'v' as Axis, index: e.left },
            ],
          },
        ]

        const isOneOnOneOff = (arr: Side[]): boolean => {
          const a = edgeValue(work, arr[0]!.axis, arr[0]!.index)
          const b = edgeValue(work, arr[1]!.axis, arr[1]!.index)
          return (
            (a === ES.On && b === ES.Forbidden) ||
            (a === ES.Forbidden && b === ES.On)
          )
        }

        /** 对侧两条应成「一 On 一 Off」：已知一条则定另一条 */
        const forcePair = (arr: Side[], px: number, py: number, label: string) => {
          const a = edgeValue(work, arr[0]!.axis, arr[0]!.index)
          const b = edgeValue(work, arr[1]!.axis, arr[1]!.index)
          const acc: LogicChange[] = []
          if (a === ES.On && b === ES.Unknown) {
            trySet(arr[1]!.axis, arr[1]!.index, ES.Forbidden, acc)
          } else if (a === ES.Forbidden && b === ES.Unknown) {
            trySet(arr[1]!.axis, arr[1]!.index, ES.On, acc)
          } else if (b === ES.On && a === ES.Unknown) {
            trySet(arr[0]!.axis, arr[0]!.index, ES.Forbidden, acc)
          } else if (b === ES.Forbidden && a === ES.Unknown) {
            trySet(arr[0]!.axis, arr[0]!.index, ES.On, acc)
          }
          if (acc.length) {
            flush(3, `规则3：数字2角(${px},${py}) ${label} 一叉一环对应`, acc)
          }
        }

        for (const c of corners) {
          const vi = vertexMaskIndex(w, c.px, c.py)
          if (masks.vertices[vi]) continue

          const ve = vertexEdges(w, c.px, c.py)
          const all: Side[] = [
            { axis: 'h', index: ve.west },
            { axis: 'h', index: ve.east },
            { axis: 'v', index: ve.north },
            { axis: 'v', index: ve.south },
          ]
          const atKeys = new Set(c.at.map((s) => `${s.axis}:${s.index}`))
          const outer = all.filter((s) => !atKeys.has(`${s.axis}:${s.index}`))

          // 外边一叉一环 → 对边一叉一环
          if (isOneOnOneOff(outer)) {
            forcePair(c.far, c.px, c.py, '外边→对边')
          }
          // 对边一叉一环 → 外边一叉一环
          if (isOneOnOneOff(c.far)) {
            forcePair(outer, c.px, c.py, '对边→外边')
          }
        }
      }
    }
  }

  /**
   * 规则4C：斜角 23 传递
   * 数字 3 与数字 2 斜向相邻：
   * 看数字 2 的对角顶点（相对公共顶点），
   * 若该点「有一条环上外边」或「有一条排除内边」，
   * 则数字 3 中不连公共顶点的两条对边都在环上。
   */
  const applyRule4c = () => {
    for (let y2 = 0; y2 < h; y2++) {
      for (let x2 = 0; x2 < w; x2++) {
        if (puzzle.cells[cellMaskIndex(w, x2, y2)] !== 2) continue

        const cases = [
          {
            x3: x2 + 1, y3: y2 + 1,
            farPx: [x2, y2] as const,
            threeFar: (e: ReturnType<typeof cellEdges>) =>
              [
                { axis: 'h' as Axis, index: e.bottom },
                { axis: 'v' as Axis, index: e.right },
              ] as Side[],
            twoAtFar: (e: ReturnType<typeof cellEdges>) =>
              [
                { axis: 'h' as Axis, index: e.top },
                { axis: 'v' as Axis, index: e.left },
              ] as Side[],
          },
          {
            // 3 在 2 左下方：公共顶点 Vc = 2 的左下角 (x2, y2+1)；
            // 2 的对角顶点 = 右上角 (x2+1, y2)
            x3: x2 - 1, y3: y2 + 1,
            farPx: [x2 + 1, y2] as const,
            threeFar: (e: ReturnType<typeof cellEdges>) =>
              [
                { axis: 'h' as Axis, index: e.bottom },
                { axis: 'v' as Axis, index: e.left },
              ] as Side[],
            twoAtFar: (e: ReturnType<typeof cellEdges>) =>
              [
                { axis: 'h' as Axis, index: e.top },
                { axis: 'v' as Axis, index: e.right },
              ] as Side[],
          },
          {
            // 3 在 2 右上方：公共顶点 Vc = 2 的右上角 (x2+1, y2)；
            // 2 的对角顶点 = 左下角 (x2, y2+1)
            x3: x2 + 1, y3: y2 - 1,
            farPx: [x2, y2 + 1] as const,
            threeFar: (e: ReturnType<typeof cellEdges>) =>
              [
                { axis: 'h' as Axis, index: e.top },
                { axis: 'v' as Axis, index: e.right },
              ] as Side[],
            twoAtFar: (e: ReturnType<typeof cellEdges>) =>
              [
                { axis: 'h' as Axis, index: e.bottom },
                { axis: 'v' as Axis, index: e.left },
              ] as Side[],
          },
          {
            // 3 在 2 左上方：公共顶点 Vc = 2 的左上角 (x2, y2)；
            // 2 的对角顶点 = 右下角 (x2+1, y2+1)
            x3: x2 - 1, y3: y2 - 1,
            farPx: [x2 + 1, y2 + 1] as const,
            threeFar: (e: ReturnType<typeof cellEdges>) =>
              [
                { axis: 'h' as Axis, index: e.top },
                { axis: 'v' as Axis, index: e.left },
              ] as Side[],
            twoAtFar: (e: ReturnType<typeof cellEdges>) =>
              [
                { axis: 'h' as Axis, index: e.bottom },
                { axis: 'v' as Axis, index: e.right },
              ] as Side[],
          },
        ]

        for (const c of cases) {
          if (c.x3 < 0 || c.y3 < 0 || c.x3 >= w || c.y3 >= h) continue
          if (puzzle.cells[cellMaskIndex(w, c.x3, c.y3)] !== 3) continue

          const e2 = cellEdges(w, x2, y2)
          const e3 = cellEdges(w, c.x3, c.y3)
          const [fpx, fpy] = c.farPx

          const farVe = vertexEdges(w, fpx, fpy)
          const farAll: Side[] = [
            { axis: 'h', index: farVe.west },
            { axis: 'h', index: farVe.east },
            { axis: 'v', index: farVe.north },
            { axis: 'v', index: farVe.south },
          ]
          const farInnerKeys = new Set(c.twoAtFar(e2).map((s) => `${s.axis}:${s.index}`))
          const farInner = farAll.filter((s) => farInnerKeys.has(`${s.axis}:${s.index}`))
          const farOuter = farAll.filter((s) => !farInnerKeys.has(`${s.axis}:${s.index}`))
          if (farInner.length !== 2 || farOuter.length !== 2) continue

          // —— 4C 本地成对推断（在数字2-3斜对角几何下严格成立）——
          // 证明：设 O1=On。若 O2 也 On，则 Vf 度数已 2 → N=W=Off；
          //   A=N+S+W+E=2 迫使 S=E=On；Vc=S+E+Bt+Bl=2+Bt+Bl∈{0,2} → Bt=Bl=Off；
          //   于是 B=Bt+Bb+Bl+Br=Bb+Br ≤ 2，与 B=3 矛盾。故 O1=On ⇒ O2=Off。
          // 同理 N=Off ⇒ W=On（若 N=W=Off，则无论 O1+O2=0 或 2，都会推出 B=Bb+Br≤2）。
          {
            const a = edgeValue(work, farOuter[0]!.axis, farOuter[0]!.index)
            const b = edgeValue(work, farOuter[1]!.axis, farOuter[1]!.index)
            const acc: LogicChange[] = []
            if (a === ES.On && b === ES.Unknown) {
              trySet(farOuter[1]!.axis, farOuter[1]!.index, ES.Forbidden, acc)
            } else if (b === ES.On && a === ES.Unknown) {
              trySet(farOuter[0]!.axis, farOuter[0]!.index, ES.Forbidden, acc)
            }
            if (acc.length) {
              flush(4, `规则4C：2角(${fpx},${fpy}) 外边一环 → 另一外边排除`, acc)
            }
          }
          {
            const a = edgeValue(work, farInner[0]!.axis, farInner[0]!.index)
            const b = edgeValue(work, farInner[1]!.axis, farInner[1]!.index)
            const acc: LogicChange[] = []
            if (a === ES.Forbidden && b === ES.Unknown) {
              trySet(farInner[1]!.axis, farInner[1]!.index, ES.On, acc)
            } else if (b === ES.Forbidden && a === ES.Unknown) {
              trySet(farInner[0]!.axis, farInner[0]!.index, ES.On, acc)
            }
            if (acc.length) {
              flush(4, `规则4C：2角(${fpx},${fpy}) 内边一叉 → 另一内边落环`, acc)
            }
          }

          const hasOnOuter = farOuter.some((s) => edgeValue(work, s.axis, s.index) === ES.On)
          const hasOffInner = farInner.some((s) => edgeValue(work, s.axis, s.index) === ES.Forbidden)
          if (!hasOnOuter && !hasOffInner) continue

          // —— 传递：3 的两条对边都在环上（保持不变）——
          const acc: LogicChange[] = []
          for (const s of c.threeFar(e3)) {
            trySet(s.axis, s.index, ES.On, acc)
          }
          if (acc.length) {
            flush(
              4,
              `规则4C：斜角23 (${x2},${y2})-(${c.x3},${c.y3}) → 3 对边落环`,
              acc,
            )
          }
        }
      }
    }
  }

  const applyRule3 = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber
        if (n !== 3) continue
        const ci = cellMaskIndex(w, cx, cy)
        if (masks.cells[ci]) continue

        const e = cellEdges(w, cx, cy)
        const corners = [
          {
            px: cx,
            py: cy,
            onCell: [
              { axis: 'h' as Axis, index: e.top },
              { axis: 'v' as Axis, index: e.left },
            ],
          },
          {
            px: cx + 1,
            py: cy,
            onCell: [
              { axis: 'h' as Axis, index: e.top },
              { axis: 'v' as Axis, index: e.right },
            ],
          },
          {
            px: cx,
            py: cy + 1,
            onCell: [
              { axis: 'h' as Axis, index: e.bottom },
              { axis: 'v' as Axis, index: e.left },
            ],
          },
          {
            px: cx + 1,
            py: cy + 1,
            onCell: [
              { axis: 'h' as Axis, index: e.bottom },
              { axis: 'v' as Axis, index: e.right },
            ],
          },
        ]

        for (const c of corners) {
          const vi = vertexMaskIndex(w, c.px, c.py)
          if (masks.vertices[vi]) continue
          const ve = vertexEdges(w, c.px, c.py)
          const all: Side[] = [
            { axis: 'h', index: ve.west },
            { axis: 'h', index: ve.east },
            { axis: 'v', index: ve.north },
            { axis: 'v', index: ve.south },
          ]
          const atVertex = new Set(c.onCell.map((s) => `${s.axis}:${s.index}`))
          const offCell = all.filter((s) => !atVertex.has(`${s.axis}:${s.index}`))

          // 3A：外边一环一× → 另一外边×，不连该点的两边落环
          const offOn = offCell.filter((s) => edgeValue(work, s.axis, s.index) === ES.On)
          if (offOn.length === 1) {
            const acc: LogicChange[] = []
            for (const s of offCell) {
              if (edgeValue(work, s.axis, s.index) === ES.On) continue
              trySet(s.axis, s.index, ES.Forbidden, acc)
            }
            const cellSides: Side[] = [
              { axis: 'h', index: e.top },
              { axis: 'h', index: e.bottom },
              { axis: 'v', index: e.left },
              { axis: 'v', index: e.right },
            ]
            for (const s of cellSides) {
              if (!atVertex.has(`${s.axis}:${s.index}`)) {
                trySet(s.axis, s.index, ES.On, acc)
              }
            }
            if (acc.length) {
              flush(4, `规则4A：数字3角(${c.px},${c.py})外边入环 → 对边在环上`, acc)
            }
            continue
          }

          // 3B：两外边都排除 → 该角两边必须落环
          // （顶点度数只能 0/2；两内边若也排除则 3 最多 2 条环边，矛盾）
          const offOff = offCell.filter((s) => edgeValue(work, s.axis, s.index) === ES.Forbidden)
          if (offOff.length === 2) {
            const acc: LogicChange[] = []
            for (const s of c.onCell) {
              trySet(s.axis, s.index, ES.On, acc)
            }
            if (acc.length) {
              flush(
                4,
                `规则4B：数字3角(${c.px},${c.py})两外边× → 该角两边落环`,
                acc,
              )
            }
          }
        }
      }
    }
  }

  const applyRule4 = () => {
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        const vi = vertexMaskIndex(w, px, py)
        if (masks.vertices[vi]) continue
        const ve = vertexEdges(w, px, py)
        const all: Side[] = [
          { axis: 'h', index: ve.west },
          { axis: 'h', index: ve.east },
          { axis: 'v', index: ve.north },
          { axis: 'v', index: ve.south },
        ]
        let on = 0
        let off = 0
        let unk = 0
        for (const s of all) {
          const v = edgeValue(work, s.axis, s.index)
          if (v === ES.On) on++
          else if (v === ES.Forbidden) off++
          else unk++
        }
        if (unk === 0) continue

        if (on === 2 && unk > 0) {
          const acc: LogicChange[] = []
          for (const s of all) trySet(s.axis, s.index, ES.Forbidden, acc)
          if (acc.length) {
            flush(
              5,
              `规则5：点(${px},${py})已 2 环边 → 余边排除并掩码`,
              acc,
              [],
              [vi],
              all.map((s) => ({ axis: s.axis, index: s.index })),
            )
            continue
          }
        }
        if (off === 3 && unk > 0) {
          const acc: LogicChange[] = []
          for (const s of all) trySet(s.axis, s.index, ES.Forbidden, acc)
          if (acc.length) {
            flush(
              5,
              `规则5：点(${px},${py})已 3 排除 → 剩余排除并掩码`,
              acc,
              [],
              [vi],
              all.map((s) => ({ axis: s.axis, index: s.index })),
            )
            continue
          }
        }
        if (off === 2 && on === 1 && unk === 1) {
          const acc: LogicChange[] = []
          for (const s of all) trySet(s.axis, s.index, ES.On, acc)
          if (acc.length) {
            flush(
              5,
              `规则5：点(${px},${py}) 2排除+1环 → 剩余在环上并掩码`,
              acc,
              [],
              [vi],
              all.map((s) => ({ axis: s.axis, index: s.index })),
            )
          }
        }
      }
    }
  }

  const applyRule5 = () => {
    const seen = new Set<string>()
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (puzzle.cells[cellMaskIndex(w, cx, cy)] !== 1) continue
        if (cx + 1 < w && puzzle.cells[cellMaskIndex(w, cx + 1, cy)] === 1) {
          const key = `H:${cx}:${cy}`
          if (!seen.has(key)) {
            seen.add(key)
            const g = sharedGeometry(w, cx, cy, 'H')
            const acc: LogicChange[] = []
            for (const v of g.vertices) {
              const o = edgeValue(work, v.outward.axis, v.outward.index)
              if (o === ES.Forbidden) {
                trySet(g.shared.axis, g.shared.index, ES.Forbidden, acc)
              }
            }
            if (acc.length) {
              flush(6, `规则6：1-1 外向排除 → 共享边排除`, acc)
            }
          }
        }
        if (cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx, cy + 1)] === 1) {
          const key = `V:${cx}:${cy}`
          if (!seen.has(key)) {
            seen.add(key)
            const g = sharedGeometry(w, cx, cy, 'V')
            const acc: LogicChange[] = []
            for (const v of g.vertices) {
              const o = edgeValue(work, v.outward.axis, v.outward.index)
              if (o === ES.Forbidden) {
                trySet(g.shared.axis, g.shared.index, ES.Forbidden, acc)
              }
            }
            if (acc.length) {
              flush(6, `规则6：1-1 外向排除 → 共享边排除`, acc)
            }
          }
        }
      }
    }
  }

  /**
   * 规则7：相邻 3-3。
   * 可证明的结论（对任意单环解都成立）：
   *   - 两条「外向」边（共享边延长线，即两个端点上不属于这两格的那条边）都排除；
   *   - 两格的「外侧对边」（A.left / B.right 或 A.top / B.bottom）都在环上。
   * 反例说明「共享边一定在环上」不成立：2×1 骨牌本身就是合法单环，
   * 此时两格都数 3、共享边为叉。因此规则7 不再推断共享边。
   * （骨牌闭环由规则12「环路闭合」处理：闭环后其余边全叉。）
   */
  const applyRule6 = () => {
    const seen = new Set<string>()
    const applyPair = (cx: number, cy: number, dir: 'H' | 'V') => {
      const g = sharedGeometry(w, cx, cy, dir)
      const acc: LogicChange[] = []
      for (const v of g.vertices) {
        trySet(v.outward.axis, v.outward.index, ES.Forbidden, acc)
      }
      if (dir === 'H') {
        trySet('v', g.a.left, ES.On, acc)
        trySet('v', g.b.right, ES.On, acc)
      } else {
        trySet('h', g.a.top, ES.On, acc)
        trySet('h', g.b.bottom, ES.On, acc)
      }
      if (acc.length) {
        flush(7, `规则7：双3 外向× + 各自外侧对边落环（共享边不定）`, acc)
      }
    }

    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (puzzle.cells[cellMaskIndex(w, cx, cy)] !== 3) continue
        if (cx + 1 < w && puzzle.cells[cellMaskIndex(w, cx + 1, cy)] === 3) {
          const key = `H:${cx}:${cy}`
          if (!seen.has(key)) {
            seen.add(key)
            applyPair(cx, cy, 'H')
          }
        }
        if (cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx, cy + 1)] === 3) {
          const key = `V:${cx}:${cy}`
          if (!seen.has(key)) {
            seen.add(key)
            applyPair(cx, cy, 'V')
          }
        }
      }
    }
  }

  // —— 规则12：环路闭合（提前闭环检测）——
  /**
   * 规则12：单环解中，「已确定的环边」一旦自身闭合成环，
   * 这个环就只能是最终解的那个环 → 其余所有未定边必须全部排除。
   * 反之，若 On 边图里出现了环，但还存在别的 On 边（另一条链/另一个环），
   * 最终不可能并成单环 → 记冲突。
   *
   * 依据：最终解是「一条」单环；已 On 的边在解里也必须是 On，
   * 它们若含环，则该环就是解环本身，任何其它 On 边都会变成第二段/第二个环。
   */
  const applyRule12 = () => {
    const vCount = (w + 1) * (h + 1)
    const parent = new Int32Array(vCount)
    for (let i = 0; i < vCount; i++) parent[i] = i
    const find = (x: number): number => {
      let r = x
      while (parent[r] !== r) r = parent[r]!
      while (parent[x] !== r) {
        const nx = parent[x]!
        parent[x] = r
        x = nx
      }
      return r
    }

    const onEdges: Side[] = []
    const real: Side[] = []
    for (let hy = 0; hy <= h; hy++) {
      for (let hx = 1; hx <= w; hx++) real.push({ axis: 'h', index: hIndex(w, hx, hy) })
    }
    for (let vy = 1; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) real.push({ axis: 'v', index: vIndex(w, vx, vy) })
    }
    for (const s of real) {
      if (edgeValue(work, s.axis, s.index) === ES.On) onEdges.push(s)
    }
    if (!onEdges.length) return

    let cycleEdge: Side | null = null
    const usedVertex = new Set<number>()
    for (const s of onEdges) {
      // 端点：h 边 (hx-1,hy)-(hx,hy)；v 边 (vx,vy-1)-(vx,vy)
      let a: number
      let b: number
      if (s.axis === 'h') {
        const hy = Math.floor(s.index / hWidth(w))
        const hx = s.index % hWidth(w)
        a = hy * (w + 1) + (hx - 1)
        b = hy * (w + 1) + hx
      } else {
        const vy = Math.floor(s.index / (w + 1))
        const vx = s.index % (w + 1)
        a = (vy - 1) * (w + 1) + vx
        b = vy * (w + 1) + vx
      }
      usedVertex.add(a)
      usedVertex.add(b)
      const ra = find(a)
      const rb = find(b)
      if (ra === rb) cycleEdge = s
      else parent[ra] = rb
    }
    if (!cycleEdge) return

    // 出现环：合法的唯一可能是「On 边恰好组成这一个环」（每个端点度数 2、只有一个连通分量）
    const deg = new Map<number, number>()
    for (const s of onEdges) {
      let a: number
      let b: number
      if (s.axis === 'h') {
        const hy = Math.floor(s.index / hWidth(w))
        const hx = s.index % hWidth(w)
        a = hy * (w + 1) + (hx - 1)
        b = hy * (w + 1) + hx
      } else {
        const vy = Math.floor(s.index / (w + 1))
        const vx = s.index % (w + 1)
        a = (vy - 1) * (w + 1) + vx
        b = vy * (w + 1) + vx
      }
      deg.set(a, (deg.get(a) ?? 0) + 1)
      deg.set(b, (deg.get(b) ?? 0) + 1)
    }
    const allDeg2 = [...deg.values()].every((d) => d === 2)
    const singleComponent = onEdges.length === usedVertex.size
    // 环边没组成「干净的单环」时不做结论（可能只是中间状态的链，交给其它规则/前瞻）
    if (!allDeg2 || !singleComponent) return

    // 已经是完整单环：其余未定边全部排除
    const acc: LogicChange[] = []
    for (const s of real) {
      trySet(s.axis, s.index, ES.Forbidden, acc)
    }
    if (acc.length) {
      flush(12, `规则12：已确定的环边自身闭合成环（单环）→ 其余边全部排除`, acc)
    }
  }

  // —— 规则13：对角 0-3 ——
  /**
   * 规则13：数字 0 与数字 3 斜对角相邻（共用一个顶点）。
   * 0 格在公共顶点上的两条边全部排除；该顶点度数只能 0/2。
   * 3 格若在公共顶点上一条都不连（度 0），它另外两条边最多补 2 < 3，矛盾；
   * 所以 3 格在公共顶点上的两条边必须都在环上。
   */
  const applyRule13 = () => {
    const dirs = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const nA = puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber
        if (nA !== 0) continue
        for (const [dx, dy] of dirs) {
          const bx = cx + dx
          const by = cy + dy
          if (bx < 0 || by < 0 || bx >= w || by >= h) continue
          if (puzzle.cells[cellMaskIndex(w, bx, by)] !== 3) continue
          const sx = cx + (dx > 0 ? 1 : 0)
          const sy = cy + (dy > 0 ? 1 : 0)
          const ve = vertexEdges(w, sx, sy)
          const vertexAll: Side[] = [
            { axis: 'h', index: ve.west },
            { axis: 'h', index: ve.east },
            { axis: 'v', index: ve.north },
            { axis: 'v', index: ve.south },
          ]
          const eb = cellEdges(w, bx, by)
          const bKeys = new Set(
            [
              { axis: 'h', index: eb.top },
              { axis: 'h', index: eb.bottom },
              { axis: 'v', index: eb.left },
              { axis: 'v', index: eb.right },
            ].map((s) => `${s.axis}:${s.index}`),
          )
          const inner = vertexAll.filter((s) => bKeys.has(`${s.axis}:${s.index}`))
          if (inner.length !== 2) continue
          const acc: LogicChange[] = []
          for (const s of inner) trySet(s.axis, s.index, ES.On, acc)
          if (acc.length) {
            flush(
              13,
              `规则13：对角 0-3 (${cx},${cy})-(${bx},${by}) → 3 格在公共顶点的两条边落环`,
              acc,
            )
          }
        }
      }
    }
  }

  // —— 规则14：相邻两格计数（公共边 + 外围边） ——
  /**
   * 规则14：相邻两格 A、B 的数字为 nA、nB，公共边 s，其余 6 条边记为「外围边」。
   * 每条外围边只属于 A/B 之一，公共边同时属于两格，故任一完整解满足
   *     nA + nB =（外围边在环上的条数 outOn）+ 2·s
   * 于是：
   *   - s 已知：outOn 被唯一确定；若 outOn 等于外围边最多/最少可达到值，
   *     则剩余未知的外围边全部落环 / 全部排除；
   *   - s 未知：两种取值各对应 outOn = nA+nB 与 nA+nB−2，
   *     落在可达区间之外的取值不可能 → 公共边被确定。
   * 全部推导只用到两条格数字和若干条边的当前状态，属局部可判定。
   */
  const applyRule14 = () => {
    const seen = new Set<string>()
    const runPair = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      shared: Side,
      outer: Side[],
      nA: number,
      nB: number,
    ) => {
      let outMin = 0
      let outMax = 0
      const pending: Side[] = []
      for (const s of outer) {
        const v = edgeValue(work, s.axis, s.index)
        if (v === ES.On) outMin++
        else if (v === ES.Forbidden) continue
        else pending.push(s)
        outMax++
      }
      const sum = nA + nB
      const sVal = edgeValue(work, shared.axis, shared.index)
      const acc: LogicChange[] = []

      if (sVal === ES.Unknown) {
        const okOff = sum >= outMin && sum <= outMax // s=0 → outOn = sum
        const okOn = sum - 2 >= outMin && sum - 2 <= outMax // s=1 → outOn = sum-2
        if (!okOff && !okOn) {
          // 盘面已矛盾：留给后续规则/冲突检测，这里不落子
        } else if (okOff && !okOn) {
          trySet(shared.axis, shared.index, ES.Forbidden, acc)
        } else if (!okOff && okOn) {
          trySet(shared.axis, shared.index, ES.On, acc)
        }
        if (acc.length) {
          flush(
            14,
            `规则14：相邻两格(${ax},${ay})=${nA} 与 (${bx},${by})=${nB}：公共边只能取${acc[0]!.to === ES.On ? '环' : '叉'}（外围边可达 ${outMin}..${outMax}，需要 ${sum} 或 ${sum - 2}）`,
            acc,
          )
        }
        return
      }

      const outOn = sum - (sVal === ES.On ? 2 : 0)
      if (outOn < outMin || outOn > outMax) return
      if (!pending.length) return
      if (outOn === outMax) {
        for (const s of pending) trySet(s.axis, s.index, ES.On, acc)
      } else if (outOn === outMin) {
        for (const s of pending) trySet(s.axis, s.index, ES.Forbidden, acc)
      }
      if (acc.length) {
        flush(
          14,
          `规则14：相邻两格(${ax},${ay})=${nA} 与 (${bx},${by})=${nB}：公共边已定，外围边需 ${outOn} 条 → 剩余外围边${outOn === outMax ? '落环' : '排除'}`,
          acc,
        )
      }
    }

    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const nA = puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber
        if (nA === null || nA === undefined) continue
        // 水平右邻
        if (cx + 1 < w) {
          const nB = puzzle.cells[cellMaskIndex(w, cx + 1, cy)] as CellNumber
          if (nB !== null && nB !== undefined) {
            const key = `H:${cx}:${cy}`
            if (!seen.has(key)) {
              seen.add(key)
              const ea = cellEdges(w, cx, cy)
              const eb = cellEdges(w, cx + 1, cy)
              runPair(
                cx,
                cy,
                cx + 1,
                cy,
                { axis: 'v', index: ea.right },
                [
                  { axis: 'h', index: ea.top },
                  { axis: 'h', index: ea.bottom },
                  { axis: 'v', index: ea.left },
                  { axis: 'h', index: eb.top },
                  { axis: 'h', index: eb.bottom },
                  { axis: 'v', index: eb.right },
                ],
                nA,
                nB,
              )
            }
          }
        }
        // 垂直下邻
        if (cy + 1 < h) {
          const nB = puzzle.cells[cellMaskIndex(w, cx, cy + 1)] as CellNumber
          if (nB !== null && nB !== undefined) {
            const key = `V:${cx}:${cy}`
            if (!seen.has(key)) {
              seen.add(key)
              const ea = cellEdges(w, cx, cy)
              const eb = cellEdges(w, cx, cy + 1)
              runPair(
                cx,
                cy,
                cx,
                cy + 1,
                { axis: 'h', index: ea.bottom },
                [
                  { axis: 'h', index: ea.top },
                  { axis: 'v', index: ea.left },
                  { axis: 'v', index: ea.right },
                  { axis: 'h', index: eb.bottom },
                  { axis: 'v', index: eb.left },
                  { axis: 'v', index: eb.right },
                ],
                nA,
                nB,
              )
            }
          }
        }
      }
    }
  }

  // —— 规则15：二选一同异约束传播 ——
  /**
   * 规则15：把「恰好一条在环上」/「两条同进同出」这类局部事实编码成同或/异或约束，
   * 用带权并查集传播——只要某条边已被确定，同类的边全部随之确定。
   * 这一族结论在数回里常以「一个顶点还差一条边，两条候选边各自连着别的顶点」的链出现，
   * 是规则1/5 的额度饱和覆盖不到的部分。
   *
   * 约束来源（全部是单环解的必然条件）：
   *   - 顶点度 ∈ {0,2}：
   *       on=1、未定 2 条      → 这两条恰好一条在环上（异或 1）
   *       on=0、排除 2 条、未定 2 条 → 这两条同进同出（异或 0）——角点两条真实边即此例
   *   - 格数字：已 on = n−1、未定 2 条 → 这两条恰好一条在环上（异或 1）
   *
   * 只做「必要条件的传递」，不假设、不枚举，属于可证明的局部演绎。
   */
  const applyRule15 = () => {
    const edgeList: Side[] = []
    const idOf = new Map<string, number>()
    const addEdge = (s: Side) => {
      const k = `${s.axis}:${s.index}`
      if (!idOf.has(k)) {
        idOf.set(k, edgeList.length)
        edgeList.push(s)
      }
    }
    for (let hy = 0; hy <= h; hy++) {
      for (let hx = 1; hx <= w; hx++) addEdge({ axis: 'h', index: hIndex(w, hx, hy) })
    }
    for (let vy = 1; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) addEdge({ axis: 'v', index: vIndex(w, vx, vy) })
    }
    const N = edgeList.length
    const parent = new Int32Array(N)
    const diff = new Uint8Array(N) // 与父节点的取值奇偶差
    for (let i = 0; i < N; i++) parent[i] = i
    const find = (x: number): number => {
      if (parent[x] === x) return x
      const p = parent[x]!
      const r = find(p)
      diff[x] = (diff[x]! ^ diff[p]!) as 0 | 1
      parent[x] = r
      return r
    }
    const union = (a: number, b: number, p: 0 | 1): boolean => {
      const ra = find(a)
      const rb = find(b)
      const pa = diff[a]!
      const pb = diff[b]!
      if (ra === rb) return (pa ^ pb) === p
      parent[ra] = rb
      diff[ra] = (pa ^ pb ^ p) as 0 | 1
      return true
    }
    const addXor = (s1: Side, s2: Side, p: 0 | 1) => {
      const a = idOf.get(`${s1.axis}:${s1.index}`)
      const b = idOf.get(`${s2.axis}:${s2.index}`)
      if (a === undefined || b === undefined) return
      union(a, b, p) // 矛盾留给其它规则/冲突检测
    }

    // 顶点约束
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        const ve = vertexEdges(w, px, py)
        const all: Side[] = [
          { axis: 'h', index: ve.west },
          { axis: 'h', index: ve.east },
          { axis: 'v', index: ve.north },
          { axis: 'v', index: ve.south },
        ]
        let on = 0
        let off = 0
        const unk: Side[] = []
        for (const s of all) {
          const v = edgeValue(work, s.axis, s.index)
          if (v === ES.On) on++
          else if (v === ES.Forbidden) off++
          else unk.push(s)
        }
        if (on === 1 && unk.length === 2) addXor(unk[0]!, unk[1]!, 1)
        else if (on === 0 && off === 2 && unk.length === 2) addXor(unk[0]!, unk[1]!, 0)
      }
    }
    // 格约束
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber
        if (n === null || n === undefined) continue
        const e = cellEdges(w, cx, cy)
        const all: Side[] = [
          { axis: 'h', index: e.top },
          { axis: 'h', index: e.bottom },
          { axis: 'v', index: e.left },
          { axis: 'v', index: e.right },
        ]
        let on = 0
        const unk: Side[] = []
        for (const s of all) {
          const v = edgeValue(work, s.axis, s.index)
          if (v === ES.On) on++
          else if (v === ES.Unknown) unk.push(s)
        }
        if (on === n - 1 && unk.length === 2) addXor(unk[0]!, unk[1]!, 1)
      }
    }

    // 类取值：从已知边反推每个类的实际取值
    const classVal = new Map<number, boolean>() // true = On
    for (let i = 0; i < N; i++) {
      const s = edgeList[i]!
      const v = edgeValue(work, s.axis, s.index)
      if (v === ES.Unknown) continue
      const r = find(i)
      const val = ((v === ES.On) ? 1 : 0) ^ diff[i]!
      const prev = classVal.get(r)
      if (prev === undefined) classVal.set(r, val === 1)
      // 同类的已知边取值不一致说明盘面矛盾，交给其它规则
    }
    if (!classVal.size) return

    // 由已知类确定同类未定边
    const acc: LogicChange[] = []
    for (let i = 0; i < N; i++) {
      const s = edgeList[i]!
      if (edgeValue(work, s.axis, s.index) !== ES.Unknown) continue
      const r = find(i)
      const base = classVal.get(r)
      if (base === undefined) continue
      const to = (base ? 1 : 0) ^ diff[i]! ? ES.On : ES.Forbidden
      trySet(s.axis, s.index, to, acc)
    }
    if (acc.length) {
      flush(
        15,
        `规则15：二选一同异约束传播（恰好一条/同进同出）→ 由已定边推出同类未定边 ${acc.length} 条`,
        acc,
      )
    }
  }

  const applyRule7 = () => {
    // 内置题有参考解可复核，沿用完整染色启发式；导入/自定义题改用可证明的 soundOnly，
    // 避免染色启发式误报导致成片标叉。
    const heuristicOk = !puzzle.id.startsWith('custom-') && !puzzle.id.startsWith('img-')
    const real: Side[] = []
    for (let hy = 0; hy <= h; hy++) {
      for (let hx = 1; hx <= w; hx++) {
        real.push({ axis: 'h', index: hIndex(w, hx, hy) })
      }
    }
    for (let vy = 1; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) {
        real.push({ axis: 'v', index: vIndex(w, vx, vy) })
      }
    }

    for (const s of real) {
      if (isEdgeMasked(masks, s.axis, s.index)) continue
      const cur = edgeValue(work, s.axis, s.index)
      if (cur !== ES.Unknown) continue

      const probeOn = probeEdge(puzzle, work, s.axis, s.index, ES.On, !heuristicOk)
      if (!probeOn.ok) {
        const acc: LogicChange[] = []
        trySet(s.axis, s.index, ES.Forbidden, acc)
        if (acc.length) {
          flush(8, `规则8：落环会染色坍缩冲突 → 排除`, acc)
        }
        continue
      }

      const probeOff = probeEdge(puzzle, work, s.axis, s.index, ES.Forbidden, !heuristicOk)
      if (!probeOff.ok) {
        const probeOn2 = probeEdge(puzzle, work, s.axis, s.index, ES.On, !heuristicOk)
        if (probeOn2.ok) {
          const acc: LogicChange[] = []
          trySet(s.axis, s.index, ES.On, acc)
          if (acc.length) {
            flush(8, `规则8：排除会染色坍缩冲突 → 落环`, acc)
          }
        }
      }
    }
  }

  // —— 规则9：对角3-3 + 1-2-1 组合 ——
  const applyRule9 = () => {
    // 9b：对角 3-3 → 两个格各自的外边（远离对方的两条边）全部落环
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (puzzle.cells[cellMaskIndex(w, cx, cy)] !== 3) continue
        // 正斜对角：A=(cx,cy), B=(cx+1,cy+1)
        if (cx + 1 < w && cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx + 1, cy + 1)] === 3) {
          const acc: LogicChange[] = []
          const ea = cellEdges(w, cx, cy)
          const eb = cellEdges(w, cx + 1, cy + 1)
          // A 的外边 = top + left；B 的外边 = bottom + right
          trySet('h', ea.top, ES.On, acc)
          trySet('v', ea.left, ES.On, acc)
          trySet('h', eb.bottom, ES.On, acc)
          trySet('v', eb.right, ES.On, acc)
          if (acc.length) flush(9, `规则9b：对角3-3 (${cx},${cy})-(${cx+1},${cy+1}) → 外边落环`, acc)
        }
        // 反斜对角：A=(cx,cy), B=(cx-1,cy+1)
        // 共享顶点是 (cx,cy+1)：A 在该顶点的两条边是 bottom/left，B 的是 top/right，
        // 因此各自的"外边"是 A.top/A.right 与 B.bottom/B.left。
        // （3 只有一个叉边，且它必须落在共享顶点上，否则该顶点度数会是 3 或 4）
        if (cx > 0 && cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx - 1, cy + 1)] === 3) {
          const acc: LogicChange[] = []
          const ea = cellEdges(w, cx, cy)
          const eb = cellEdges(w, cx - 1, cy + 1)
          trySet('h', ea.top, ES.On, acc)
          trySet('v', ea.right, ES.On, acc)
          trySet('h', eb.bottom, ES.On, acc)
          trySet('v', eb.left, ES.On, acc)
          if (acc.length) {
            flush(9, `规则9b：反斜对角3-3 (${cx},${cy})-(${cx - 1},${cy + 1}) → 外边落环`, acc)
          }
        }
      }
    }

    // 9c：1-2-1 直线（贴墙或不能向外侧延伸）
    // 水平：A=1, B=2, C=1 排成一行
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx + 2 < w; cx++) {
        const nA = puzzle.cells[cellMaskIndex(w, cx, cy)]
        const nB = puzzle.cells[cellMaskIndex(w, cx + 1, cy)]
        const nC = puzzle.cells[cellMaskIndex(w, cx + 2, cy)]
        if (nA !== 1 || nB !== 2 || nC !== 1) continue
        // 贴墙：在顶边(cy=0) 或底边(cy=h-1)
        if (cy !== 0 && cy !== h - 1) continue
        const acc: LogicChange[] = []
        const eB = cellEdges(w, cx + 1, cy)
        const eA = cellEdges(w, cx, cy)
        const eC = cellEdges(w, cx + 2, cy)
        if (cy === 0) {
          // 贴顶边：B 的上边落环，A/C 的外边和下边排除
          trySet('h', eB.top, ES.On, acc)
          trySet('v', eA.left, ES.Forbidden, acc)
          trySet('h', eA.bottom, ES.Forbidden, acc)
          trySet('v', eC.right, ES.Forbidden, acc)
          trySet('h', eC.bottom, ES.Forbidden, acc)
        } else {
          // 贴底边：B 的下边落环，A/C 的外边和上边排除
          trySet('h', eB.bottom, ES.On, acc)
          trySet('v', eA.left, ES.Forbidden, acc)
          trySet('h', eA.top, ES.Forbidden, acc)
          trySet('v', eC.right, ES.Forbidden, acc)
          trySet('h', eC.top, ES.Forbidden, acc)
        }
        if (acc.length) flush(9, `规则9c：1-2-1 贴墙 (${cx},${cy}) → 中2落环`, acc)
      }
    }
    // 垂直：A=1, B=2, C=1 排成一列
    for (let cy = 0; cy + 2 < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const nA = puzzle.cells[cellMaskIndex(w, cx, cy)]
        const nB = puzzle.cells[cellMaskIndex(w, cx, cy + 1)]
        const nC = puzzle.cells[cellMaskIndex(w, cx, cy + 2)]
        if (nA !== 1 || nB !== 2 || nC !== 1) continue
        if (cx !== 0 && cx !== w - 1) continue
        const acc: LogicChange[] = []
        const eB = cellEdges(w, cx, cy + 1)
        const eA = cellEdges(w, cx, cy)
        const eC = cellEdges(w, cx, cy + 2)
        if (cx === 0) {
          // 贴左边：B 的左边落环，A/C 的外边和右边排除
          trySet('v', eB.left, ES.On, acc)
          trySet('h', eA.top, ES.Forbidden, acc)
          trySet('v', eA.right, ES.Forbidden, acc)
          trySet('h', eC.bottom, ES.Forbidden, acc)
          trySet('v', eC.right, ES.Forbidden, acc)
        } else {
          // 贴右边：B 的右边落环，A/C 的外边和左边排除
          trySet('v', eB.right, ES.On, acc)
          trySet('h', eA.top, ES.Forbidden, acc)
          trySet('v', eA.left, ES.Forbidden, acc)
          trySet('h', eC.bottom, ES.Forbidden, acc)
          trySet('v', eC.left, ES.Forbidden, acc)
        }
        if (acc.length) flush(9, `规则9c：1-2-1 贴墙竖 (${cx},${cy}) → 中2落环`, acc)
      }
    }

    // 注意：曾经这里有一条"L 拐角 1-2-1 → 1-2 共享边排除"的规则，但它不成立：
    // B=2、上方=1、右方=1 时，B.top/B.right 的四种组合（××、环环、环×、×环）
    // 在真实解里都出现过，推不出任何必然结论，已删除。
    // 需要"封闭"条件（贴墙）的 1-2-1 才有效，见上面的 9c。
  }


  // —— 规则11 预计算：每格/每顶点的四条边 + 边到格/顶点的反查 ——
  const cellSides: Array<{ n: CellNumber; sides: Side[] }> = []
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const e = cellEdges(w, cx, cy)
      cellSides.push({
        n: puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber,
        sides: [
          { axis: 'h', index: e.top },
          { axis: 'h', index: e.bottom },
          { axis: 'v', index: e.left },
          { axis: 'v', index: e.right },
        ],
      })
    }
  }
  const vertexSides: Side[][] = []
  for (let py = 0; py <= h; py++) {
    for (let px = 0; px <= w; px++) {
      const t = vertexEdges(w, px, py)
      vertexSides.push([
        { axis: 'h', index: t.west },
        { axis: 'h', index: t.east },
        { axis: 'v', index: t.north },
        { axis: 'v', index: t.south },
      ])
    }
  }
  const hLen = (w + 2) * (h + 1)
  const vLen = (h + 2) * (w + 1)
  const hEdgeCells: number[][] = Array.from({ length: hLen }, () => [])
  const vEdgeCells: number[][] = Array.from({ length: vLen }, () => [])
  for (let ci = 0; ci < cellSides.length; ci++) {
    for (const s of cellSides[ci]!.sides) {
      if (s.axis === 'h') hEdgeCells[s.index]!.push(ci)
      else vEdgeCells[s.index]!.push(ci)
    }
  }
  const hEdgeVerts: number[][] = Array.from({ length: hLen }, () => [])
  const vEdgeVerts: number[][] = Array.from({ length: vLen }, () => [])
  for (let vi = 0; vi < vertexSides.length; vi++) {
    for (const s of vertexSides[vi]!) {
      if (s.axis === 'h') hEdgeVerts[s.index]!.push(vi)
      else vEdgeVerts[s.index]!.push(vi)
    }
  }

  /**
   * 在 hArr/vArr 上传播格子+顶点约束到不动点；出现矛盾返回 true（数组就地修改）。
   * 用「脏队列」实现：只有计数变化的格/顶点才重新检查，单次传播代价与改动量成正比，
   * 而不是每轮全盘扫描（25×30 这类大题的规则11 探测因此快 1~2 个数量级）。
   */
  const propagate = (hArr: EdgeState[], vArr: EdgeState[]): boolean => {
    const totalCells = cellSides.length
    const totalVerts = vertexSides.length
    const cellN = new Int32Array(totalCells)
    const cellOn = new Int32Array(totalCells)
    const cellUnk = new Int32Array(totalCells)
    const vertOn = new Int32Array(totalVerts)
    const vertUnk = new Int32Array(totalVerts)
    for (let ci = 0; ci < totalCells; ci++) {
      const n = cellSides[ci]!.n
      cellN[ci] = n === null || n === undefined ? -1 : n
      let on = 0
      let unk = 0
      for (const s of cellSides[ci]!.sides) {
        const v = s.axis === 'h' ? hArr[s.index]! : vArr[s.index]!
        if (v === ES.On) on++
        else if (v === ES.Unknown) unk++
      }
      cellOn[ci] = on
      cellUnk[ci] = unk
    }
    for (let vi = 0; vi < totalVerts; vi++) {
      let on = 0
      let unk = 0
      for (const s of vertexSides[vi]!) {
        const v = s.axis === 'h' ? hArr[s.index]! : vArr[s.index]!
        if (v === ES.On) on++
        else if (v === ES.Unknown) unk++
      }
      vertOn[vi] = on
      vertUnk[vi] = unk
    }

    const cap = totalCells + totalVerts + 8 * (hLen + vLen)
    const queue = new Int32Array(cap)
    let head = 0
    let tail = 0
    for (let ci = 0; ci < totalCells; ci++) queue[tail++] = ci
    for (let vi = 0; vi < totalVerts; vi++) queue[tail++] = totalCells + vi

    const setEdgeLocal = (axis: Axis, index: number, to: EdgeState) => {
      if (axis === 'h') hArr[index] = to
      else vArr[index] = to
      const cells = axis === 'h' ? hEdgeCells[index]! : vEdgeCells[index]!
      for (const c of cells) {
        cellUnk[c]!--
        if (to === ES.On) cellOn[c]!++
        if (tail < cap) queue[tail++] = c
      }
      const verts = axis === 'h' ? hEdgeVerts[index]! : vEdgeVerts[index]!
      for (const v of verts) {
        vertUnk[v]!--
        if (to === ES.On) vertOn[v]!++
        if (tail < cap) queue[tail++] = totalCells + v
      }
    }

    while (head < tail) {
      const id = queue[head++]!
      if (id < totalCells) {
        const n = cellN[id]!
        if (n < 0) continue
        const on = cellOn[id]!
        const unk = cellUnk[id]!
        if (on > n || on + unk < n) return true
        if (unk === 0) continue
        let to: EdgeState = ES.Unknown
        if (on === n) to = ES.Forbidden
        else if (on + unk === n) to = ES.On
        if (to === ES.Unknown) continue
        for (const s of cellSides[id]!.sides) {
          const cur = s.axis === 'h' ? hArr[s.index]! : vArr[s.index]!
          if (cur === ES.Unknown) setEdgeLocal(s.axis, s.index, to)
        }
      } else {
        const vi = id - totalCells
        const on = vertOn[vi]!
        const unk = vertUnk[vi]!
        if (on > 2) return true
        // 线头：只有 1 条环边且没有未定边可救 → 永远闭不成环
        if (on === 1 && unk === 0) return true
        if (unk === 0) continue
        let to: EdgeState = ES.Unknown
        if (on === 2) to = ES.Forbidden // 度数已满，其余排除
        else if (on === 1 && unk === 1) to = ES.On // 还差一条才能闭合成 2 度
        else if (on === 0 && unk === 1) to = ES.Forbidden // 只能取 0 度
        if (to === ES.Unknown) continue
        for (const s of vertexSides[vi]!) {
          const cur = s.axis === 'h' ? hArr[s.index]! : vArr[s.index]!
          if (cur === ES.Unknown) setEdgeLocal(s.axis, s.index, to)
        }
      }
    }
    return false
  }

  /**
   * 规则11：线头检测（一步前瞻 + 传播）。
   * 对每条未定边分别试"落环"/"打叉"，各跑一遍传播：若某种填法会推出矛盾
   * （格子环边数超过数字或补不上；顶点度数为 1 且没有未定边可救 = 线头无法闭合），
   * 则该填法错误，此边必定是另一种填法。
   *
   * 每轮只落「一条」前瞻结论就返回主循环：连锁后果交给规则1-15 常规传播，
   * 回放里前瞻帧更少（也不让前瞻包揽本该由常规规则完成的推演）。
   * 探测顺序按「局部紧张度」排序，先试最可能一步推死的边，避免整盘反复空扫。
   */
  const applyRule11 = () => {
    const vertexTightness = (px: number, py: number): number => {
      const ve = vertexEdges(w, px, py)
      let on = 0
      let unk = 0
      for (const [axis, index] of [
        ['h', ve.west],
        ['h', ve.east],
        ['v', ve.north],
        ['v', ve.south],
      ] as const) {
        const v = edgeValue(work, axis, index)
        if (v === ES.On) on++
        else if (v === ES.Unknown) unk++
      }
      // 已经 1 条环边、只剩少量未定 → 最容易推出线头矛盾
      if (on === 1) return 3 + (4 - unk) * 4
      if (on === 2 && unk > 0) return 6
      if (on === 0 && unk > 0) return 1
      return 0
    }
    const cellTightness = (cx: number, cy: number): number => {
      const n = puzzle.cells[cellMaskIndex(w, cx, cy)] as CellNumber
      if (n === null || n === undefined) return 0
      const e = cellEdges(w, cx, cy)
      let on = 0
      let unk = 0
      for (const [axis, index] of [
        ['h', e.top],
        ['h', e.bottom],
        ['v', e.left],
        ['v', e.right],
      ] as const) {
        const v = edgeValue(work, axis, index)
        if (v === ES.On) on++
        else if (v === ES.Unknown) unk++
      }
      if (on === n - 1 && unk > 0) return 5 + (3 - unk) * 3
      if (on === n && unk > 0) return 2
      if (on < n && unk === 0) return 8
      return 0
    }
    type Cand = { axis: Axis; index: number; score: number }
    const cands: Cand[] = []
    for (let hy = 0; hy <= h; hy++) {
      for (let hx = 1; hx <= w; hx++) {
        const index = hIndex(w, hx, hy)
        if (edgeValue(work, 'h', index) !== ES.Unknown) continue
        let score =
          vertexTightness(hx - 1, hy) + vertexTightness(hx, hy) +
          cellTightness(hx - 1, hy - 1) + cellTightness(hx - 1, hy)
        cands.push({ axis: 'h', index, score })
      }
    }
    for (let vy = 1; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) {
        const index = vIndex(w, vx, vy)
        if (edgeValue(work, 'v', index) !== ES.Unknown) continue
        const score =
          vertexTightness(vx, vy - 1) + vertexTightness(vx, vy) +
          cellTightness(vx - 1, vy - 1) + cellTightness(vx, vy - 1)
        cands.push({ axis: 'v', index, score })
      }
    }
    if (!cands.length) return
    cands.sort((a, b) => b.score - a.score)

    const probe = (axis: Axis, index: number): boolean => {
      if (edgeValue(work, axis, index) !== ES.Unknown) return false
      const tryFill = (to: EdgeState): boolean => {
        const hArr = work.h.slice()
        const vArr = work.v.slice()
        if (axis === 'h') hArr[index] = to
        else vArr[index] = to
        return propagate(hArr, vArr)
      }
      const okOn = !tryFill(ES.On)
      const okOff = okOn ? !tryFill(ES.Forbidden) : true
      const acc: LogicChange[] = []
      if (okOn && !okOff) trySet(axis, index, ES.On, acc)
      else if (!okOn && okOff) trySet(axis, index, ES.Forbidden, acc)
      if (acc.length) {
        const banned = acc[0]!.to === ES.On ? ES.Forbidden : ES.On
        flush(
          11,
          `规则11：填成${banned === ES.On ? '环' : '叉'}会形成无法闭合的线头 → 必为${acc[0]!.to === ES.On ? '环' : '叉'}`,
          acc,
        )
        return true
      }
      return false
    }
    for (const c of cands) {
      if (probe(c.axis, c.index)) return
    }
  }

  // —— 推到不动点（完整推理，与动画无关）——
  let saturated = true
  for (let guard = 0; guard < 400; guard++) {
    const before = steps.length
    applyRule1()
    applyRule2()
    applyRule2c()
    applyRule3()
    applyRule4c()
    applyRule4()
    applyRule5()
    applyRule6()
    applyRule9()
    applyRule12()
    applyRule13()
    applyRule14()
    applyRule15()
    applyRule7()
    if (steps.length === before) {
      // 常规规则推不动了，用线头检测做一步前瞻破局
      applyRule11()
      if (steps.length === before) {
        saturated = true
        break
      }
    }
    if (guard === 399) saturated = false
  }

  // 拍平为回放帧，并预计算同类型连拍序号
  const frames: PlaybackFrame[] = []
  let lastType: EdgeState | null = null
  let streak = 0
  for (const step of steps) {
    for (const change of step.changes) {
      if (change.to === lastType) streak++
      else {
        streak = 1
        lastType = change.to
      }
      frames.push({
        rule: step.rule,
        label: step.label,
        change,
        streak,
      })
    }
  }

  return {
    puzzleId: puzzle.id,
    frames,
    finalState: work,
    ruleSteps: steps.length,
    saturated,
  }
}

/** 兼容旧接口：内部走 planLogicSolve */
export function collectLogicSteps(
  puzzle: Puzzle,
  state: GameState,
): { steps: LogicStep[]; finalState: GameState; masks: LogicMasks } {
  const plan = planLogicSolve(puzzle, state)
  // 重建 steps 仅用于测试脚本；动画请用 plan.frames
  const steps: LogicStep[] = []
  let cur: LogicStep | null = null
  for (const f of plan.frames) {
    if (!cur || cur.rule !== f.rule || cur.label !== f.label) {
      cur = {
        rule: f.rule,
        label: f.label,
        changes: [],
        maskCells: [],
        maskVertices: [],
        maskEdges: [],
      }
      steps.push(cur)
    }
    cur.changes.push(f.change)
  }
  return {
    steps,
    finalState: plan.finalState,
    masks: createMasks(puzzle.width, puzzle.height),
  }
}

export function flattenChanges(steps: LogicStep[]): Array<{
  rule: LogicStep['rule']
  label: string
  change: LogicChange
  after: LogicStep
}> {
  const out: ReturnType<typeof flattenChanges> = []
  for (const step of steps) {
    for (const change of step.changes) {
      out.push({ rule: step.rule, label: step.label, change, after: step })
    }
  }
  return out
}
