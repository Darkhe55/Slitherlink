import {
  cellEdges,
  edgeValue,
  hIndex,
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
  rule: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
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

  const applyRule6 = () => {
    const seen = new Set<string>()
    const applyPair = (cx: number, cy: number, dir: 'H' | 'V') => {
      const g = sharedGeometry(w, cx, cy, dir)
      const acc: LogicChange[] = []
      for (const v of g.vertices) {
        trySet(v.outward.axis, v.outward.index, ES.Forbidden, acc)
      }
      trySet(g.shared.axis, g.shared.index, ES.On, acc)
      if (dir === 'H') {
        trySet('v', g.a.left, ES.On, acc)
        trySet('v', g.b.right, ES.On, acc)
      } else {
        trySet('h', g.a.top, ES.On, acc)
        trySet('h', g.b.bottom, ES.On, acc)
      }
      if (acc.length) {
        flush(7, `规则7：双3 外向× + 共享边与对边落环`, acc)
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

  const applyRule7 = () => {
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

      const probeOn = probeEdge(puzzle, work, s.axis, s.index, ES.On)
      if (!probeOn.ok) {
        const acc: LogicChange[] = []
        trySet(s.axis, s.index, ES.Forbidden, acc)
        if (acc.length) {
          flush(8, `规则8：落环会染色坍缩冲突 → 排除`, acc)
        }
        continue
      }

      const probeOff = probeEdge(puzzle, work, s.axis, s.index, ES.Forbidden)
      if (!probeOff.ok) {
        const probeOn2 = probeEdge(puzzle, work, s.axis, s.index, ES.On)
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
        // 反斜对角：A=(cx+1,cy), B=(cx,cy+1)
        if (cx >= 0 && cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx, cy + 1)] === 3) {
          const acc: LogicChange[] = []
          const ea = cellEdges(w, cx + 1, cy)
          const eb = cellEdges(w, cx, cy + 1)
          // A 的外边 = top + right；B 的外边 = bottom + left
          trySet('h', ea.top, ES.On, acc)
          trySet('v', ea.right, ES.On, acc)
          trySet('h', eb.bottom, ES.On, acc)
          trySet('v', eb.left, ES.On, acc)
          if (acc.length) flush(9, `规则9b：对角3-3 (${cx+1},${cy})-(${cx},${cy+1}) → 外边落环`, acc)
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

    // 9c-L：L 拐角，拐角格=2，两臂=1 → 1-2 共享边排除
    // L 形：B=2 在拐角，A=1 在 B 上方，C=1 在 B 右方（或对称方向）
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (puzzle.cells[cellMaskIndex(w, cx, cy)] !== 2) continue
        // 方向1：上方=1，右方=1
        if (cy > 0 && cx + 1 < w
          && puzzle.cells[cellMaskIndex(w, cx, cy - 1)] === 1
          && puzzle.cells[cellMaskIndex(w, cx + 1, cy)] === 1) {
          const acc: LogicChange[] = []
          const eB = cellEdges(w, cx, cy)
          // B-top（与 A 共享）和 B-right（与 C 共享）都排除
          trySet('h', eB.top, ES.Forbidden, acc)
          trySet('v', eB.right, ES.Forbidden, acc)
          if (acc.length) flush(9, `规则9c-L：L拐角1-2-1 (${cx},${cy}) → 共享边排除`, acc)
        }
        // 方向2：上方=1，左方=1
        if (cy > 0 && cx > 0
          && puzzle.cells[cellMaskIndex(w, cx, cy - 1)] === 1
          && puzzle.cells[cellMaskIndex(w, cx - 1, cy)] === 1) {
          const acc: LogicChange[] = []
          const eB = cellEdges(w, cx, cy)
          trySet('h', eB.top, ES.Forbidden, acc)
          trySet('v', eB.left, ES.Forbidden, acc)
          if (acc.length) flush(9, `规则9c-L：L拐角1-2-1 (${cx},${cy}) → 共享边排除`, acc)
        }
        // 方向3：下方=1，右方=1
        if (cy + 1 < h && cx + 1 < w
          && puzzle.cells[cellMaskIndex(w, cx, cy + 1)] === 1
          && puzzle.cells[cellMaskIndex(w, cx + 1, cy)] === 1) {
          const acc: LogicChange[] = []
          const eB = cellEdges(w, cx, cy)
          trySet('h', eB.bottom, ES.Forbidden, acc)
          trySet('v', eB.right, ES.Forbidden, acc)
          if (acc.length) flush(9, `规则9c-L：L拐角1-2-1 (${cx},${cy}) → 共享边排除`, acc)
        }
        // 方向4：下方=1，左方=1
        if (cy + 1 < h && cx > 0
          && puzzle.cells[cellMaskIndex(w, cx, cy + 1)] === 1
          && puzzle.cells[cellMaskIndex(w, cx - 1, cy)] === 1) {
          const acc: LogicChange[] = []
          const eB = cellEdges(w, cx, cy)
          trySet('h', eB.bottom, ES.Forbidden, acc)
          trySet('v', eB.left, ES.Forbidden, acc)
          if (acc.length) flush(9, `规则9c-L：L拐角1-2-1 (${cx},${cy}) → 共享边排除`, acc)
        }
      }
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
    applyRule7()
    applyRule9()
    if (steps.length === before) {
      saturated = true
      break
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
