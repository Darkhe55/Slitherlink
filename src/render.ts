import type { Axis, EdgeState, GameState, Puzzle, ValidationResult } from './types'
import { EdgeState as ES } from './types'
import { cellEdges, edgeValue, isPadEdge } from './state'
import { validate } from './validate'

export interface BoardMetrics {
  cell: number
  pad: number
  width: number
  height: number
  svgWidth: number
  svgHeight: number
  /** 相对 10×10 标准格（48）的缩放，描边/叉点都乘它 */
  k: number
}

/** 10×10 基准格距；叉、线宽、点、字号均按此比例缩放 */
export const BASE_CELL = 48

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  // 所有盘面统一基准格距，保证叉/线/点与 10×10 同比例
  const cell = BASE_CELL
  const pad = cell * 0.35
  return {
    cell,
    pad,
    width: puzzle.width,
    height: puzzle.height,
    svgWidth: pad * 2 + puzzle.width * cell,
    svgHeight: pad * 2 + puzzle.height * cell,
    k: cell / BASE_CELL,
  }
}

/** 顶点像素坐标 */
export function pointXY(m: BoardMetrics, px: number, py: number) {
  return {
    x: m.pad + px * m.cell,
    y: m.pad + py * m.cell,
  }
}

export interface HitEdge {
  axis: Axis
  index: number
}

/**
 * 将指针事件坐标转为 viewBox 坐标（经 getScreenCTM，避免 CSS 缩放偏移）。
 */
export function clientToViewBox(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

/**
 * 将 viewBox 坐标命中到最近真实边。
 * 仅处理真实边（无 pad）。
 */
export function hitTest(
  m: BoardMetrics,
  puzzle: Puzzle,
  px: number,
  py: number,
): HitEdge | null {
  const w = puzzle.width
  const h = puzzle.height

  // 横边：y 接近格线，x 在 (0..W) 之间
  let best: { axis: Axis; index: number; dist: number } | null = null

  // 横边候选：线段 hx 覆盖 x ∈ [pad+hx*cell, pad+(hx+1)*cell]
  for (let hy = 0; hy <= h; hy++) {
    const y = m.pad + hy * m.cell
    const distY = Math.abs(py - y)
    if (distY > m.cell * 0.35) continue
    // floor：点在边中点时不能进位到下一条边
    const hx = Math.floor((px - m.pad) / m.cell)
    if (hx < 0 || hx > w - 1) continue
    const distX = Math.abs(px - (m.pad + (hx + 0.5) * m.cell))
    const dist = distY + distX * 0.15
    const index = hy * (w + 2) + (hx + 1) // 逻辑索引
    if (isPadEdge(w, h, 'h', index)) continue
    if (!best || dist < best.dist) best = { axis: 'h', index, dist }
  }

  // 竖边候选
  for (let vx = 0; vx <= w; vx++) {
    const x = m.pad + vx * m.cell
    const distX = Math.abs(px - x)
    if (distX > m.cell * 0.35) continue
    const vy = Math.floor((py - m.pad) / m.cell)
    if (vy < 0 || vy > h - 1) continue
    const distY = Math.abs(py - (m.pad + (vy + 0.5) * m.cell))
    const dist = distX + distY * 0.15
    const index = (vy + 1) * (w + 1) + vx
    if (isPadEdge(w, h, 'v', index)) continue
    if (!best || dist < best.dist) best = { axis: 'v', index, dist }
  }

  return best ? { axis: best.axis, index: best.index } : null
}

/**
 * 打叉：臂长 = 格距 × 1/6（10×10 基准：48×1/6=8），随 k 等比。
 */
function xMark(
  m: BoardMetrics,
  axis: Axis,
  index: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const s = m.cell / 6
  const sw = Math.max(1.2, 2 * m.k)
  return `
    <g class="edge-off-group" data-axis="${axis}" data-index="${index}">
      <line class="edge-off-mark" x1="${mx - s}" y1="${my - s}" x2="${mx + s}" y2="${my + s}" stroke-width="${sw}" />
      <line class="edge-off-mark" x1="${mx - s}" y1="${my + s}" x2="${mx + s}" y2="${my - s}" stroke-width="${sw}" />
    </g>
  `
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
  colorGrid?: Array<'out' | 'in' | `t${number}` | 'unk'> | null,
): string {
  const m = metricsFor(puzzle)
  const w = puzzle.width
  const h = puzzle.height

  const overshoot = new Set(
    result.badCells.filter((c) => c.actual > c.expected).map((c) => c.cy * w + c.cx),
  )
  const badCellSet = overshoot
  const badPointSet = new Set(result.badPoints.map((p) => p.py * (w + 1) + p.px))

  // 描边按 10×10 基准等比（k=cell/48）
  const swOn = 6 * m.k
  const swGuide = 2 * m.k
  const swHit = 18 * m.k
  const rPoint = 3.2 * m.k
  const numSize = 22 * m.k

  const parts: string[] = []
  parts.push(
    `<svg class="board-svg" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">`,
  )

  // 染色层：半透明铺在格底，不遮数字/边
  // 色1=点阵花纹，色2=斜线花纹；细化类为纯色，便于区分
  if (colorGrid && colorGrid.length === w * h) {
    const pat = Math.max(6, 10 * m.k)
    const dotR = Math.max(1, 1.3 * m.k)
    const sw = Math.max(1, 1.4 * m.k)
    parts.push(`<defs>`)
    parts.push(
      `<pattern id="pat-out" width="${pat}" height="${pat}" patternUnits="userSpaceOnUse">` +
        `<rect width="${pat}" height="${pat}" fill="#3d8f6e" opacity="0.13"/>` +
        `<circle cx="${pat * 0.25}" cy="${pat * 0.25}" r="${dotR}" fill="#2d6b52" opacity="0.4"/>` +
        `<circle cx="${pat * 0.75}" cy="${pat * 0.75}" r="${dotR}" fill="#2d6b52" opacity="0.4"/>` +
        `</pattern>`,
    )
    parts.push(
      `<pattern id="pat-in" width="${pat}" height="${pat}" patternUnits="userSpaceOnUse">` +
        `<rect width="${pat}" height="${pat}" fill="#c45c26" opacity="0.13"/>` +
        `<path d="M0 ${pat} L${pat} 0 M${-pat} ${pat * 0.5} L${pat * 0.5} ${-pat} M${pat * 0.5} ${pat * 1.5} L${pat * 1.5} ${pat * 0.5}" stroke="#a34a1c" stroke-width="${sw}" opacity="0.45"/>` +
        `</pattern>`,
    )
    parts.push(
      `<pattern id="pat-ref" width="${pat}" height="${pat}" patternUnits="userSpaceOnUse">` +
        `<rect width="${pat}" height="${pat}" fill="none"/>` +
        `</pattern>`,
    )
    parts.push(`</defs>`)
    parts.push(`<g class="color-layer" pointer-events="none">`)
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const c = colorGrid[cy * w + cx]
        if (!c || c === 'unk') continue
        const x = m.pad + cx * m.cell
        const y = m.pad + cy * m.cell
        let fill = 'url(#pat-out)'
        let cls = 'cell-tint-out'
        if (c === 'in') {
          fill = 'url(#pat-in)'
          cls = 'cell-tint-in'
        } else if (c !== 'out') {
          const n = Number(c.slice(1)) || 0
          const palette = [
            '#5b6fd6',
            '#8a5bb8',
            '#3d8fb8',
            '#c48a26',
            '#6b8e23',
            '#b85b8a',
            '#2d8a7a',
            '#8b6914',
          ]
          fill = palette[n % palette.length]!
          cls = 'cell-tint-ref'
        }
        parts.push(
          `<rect class="${cls}" data-cls="${c}" x="${x + 1}" y="${y + 1}" width="${m.cell - 2}" height="${m.cell - 2}" rx="${6 * m.k}" fill="${fill}" />`,
        )
      }
    }
    parts.push(`</g>`)
  }

  // 错误格高亮
  const inset = 3 * m.k
  const errR = 8 * m.k
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      if (!badCellSet.has(cy * w + cx)) continue
      const x = m.pad + cx * m.cell
      const y = m.pad + cy * m.cell
      parts.push(
        `<rect class="cell-error" x="${x + inset}" y="${y + inset}" width="${m.cell - inset * 2}" height="${m.cell - inset * 2}" rx="${errR}" />`,
      )
    }
  }

  // 真实横边
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 0; hx < w; hx++) {
      const index = hy * (w + 2) + (hx + 1)
      const st = edgeValue(state, 'h', index)
      const x1 = m.pad + hx * m.cell
      const x2 = m.pad + (hx + 1) * m.cell
      const y = m.pad + hy * m.cell
      if (st === ES.On) {
        parts.push(
          `<line class="edge-on" data-axis="h" data-index="${index}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="${swOn}" />`,
        )
      } else if (st === ES.Forbidden) {
        parts.push(xMark(m, 'h', index, x1, y, x2, y))
      } else {
        parts.push(
          `<line class="edge-guide" data-axis="h" data-index="${index}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="${swGuide}" />`,
        )
      }
      parts.push(
        `<line class="edge-hit" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" data-axis="h" data-index="${index}" stroke-width="${swHit}" />`,
      )
    }
  }

  // 真实竖边
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const index = (vy + 1) * (w + 1) + vx
      const st = edgeValue(state, 'v', index)
      const x = m.pad + vx * m.cell
      const y1 = m.pad + vy * m.cell
      const y2 = m.pad + (vy + 1) * m.cell
      if (st === ES.On) {
        parts.push(
          `<line class="edge-on" data-axis="v" data-index="${index}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke-width="${swOn}" />`,
        )
      } else if (st === ES.Forbidden) {
        parts.push(xMark(m, 'v', index, x, y1, x, y2))
      } else {
        parts.push(
          `<line class="edge-guide" data-axis="v" data-index="${index}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke-width="${swGuide}" />`,
        )
      }
      parts.push(
        `<line class="edge-hit" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" data-axis="v" data-index="${index}" stroke-width="${swHit}" />`,
      )
    }
  }

  // 顶点
  for (let py = 0; py <= h; py++) {
    for (let px = 0; px <= w; px++) {
      const { x, y } = pointXY(m, px, py)
      parts.push(`<circle class="point" cx="${x}" cy="${y}" r="${rPoint}" />`)
      if (badPointSet.has(py * (w + 1) + px)) {
        parts.push(
          `<circle class="point-error" cx="${x}" cy="${y}" r="${7 * m.k}" fill="none" stroke="#c23b2e" stroke-width="${2 * m.k}" />`,
        )
      }
    }
  }

  // 数字
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const num = puzzle.cells[cy * w + cx]
      if (num === null || num === undefined) continue
      const x = m.pad + (cx + 0.5) * m.cell
      const y = m.pad + (cy + 0.5) * m.cell
      const bad = badCellSet.has(cy * w + cx)
      const e = cellEdges(w, cx, cy)
      let on = 0
      if (edgeValue(state, 'h', e.top) === ES.On) on++
      if (edgeValue(state, 'h', e.bottom) === ES.On) on++
      if (edgeValue(state, 'v', e.left) === ES.On) on++
      if (edgeValue(state, 'v', e.right) === ES.On) on++
      const satisfied = on === num
      const cls = bad ? 'num error' : satisfied ? 'num satisfied' : 'num'
      parts.push(
        `<text class="${cls}" x="${x}" y="${y}" style="font-size:${numSize}px">${num}</text>`,
      )
    }
  }

  parts.push('</svg>')
  return parts.join('\n')
}

export function validateNow(puzzle: Puzzle, state: GameState): ValidationResult {
  return validate(state, puzzle)
}

export function edgeDisplay(state: GameState, axis: Axis, index: number): EdgeState {
  return edgeValue(state, axis, index)
}
