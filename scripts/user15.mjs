// src/state.ts
function hWidth(w) {
  return w + 2;
}
function hLength(w, h) {
  return (h + 1) * hWidth(w);
}
function vHeight(h) {
  return h + 2;
}
function vLength(w, h) {
  return vHeight(h) * (w + 1);
}
function hIndex(w, hx, hy) {
  return hy * hWidth(w) + hx;
}
function vIndex(w, vx, vy) {
  return vy * (w + 1) + vx;
}
function cellEdges(w, cx, cy) {
  return {
    top: hIndex(w, cx + 1, cy),
    bottom: hIndex(w, cx + 1, cy + 1),
    left: vIndex(w, cx, cy + 1),
    right: vIndex(w, cx + 1, cy + 1)
  };
}
function vertexEdges(w, px, py) {
  return {
    west: hIndex(w, px, py),
    east: hIndex(w, px + 1, py),
    north: vIndex(w, px, py),
    south: vIndex(w, px, py + 1)
  };
}
function allVertexPositions(w, h) {
  const pts = [];
  for (let py = 0; py <= h; py++) {
    for (let px = 0; px <= w; px++) {
      pts.push({ px, py });
    }
  }
  return pts;
}
function edgeValue(state2, axis, index) {
  return axis === "h" ? state2.h[index] : state2.v[index];
}
function setEdge(state2, axis, index, value) {
  if (axis === "h") state2.h[index] = value;
  else state2.v[index] = value;
}
function createEmptyState(puzzle2) {
  const { width: w, height: h } = puzzle2;
  const hArr = new Array(hLength(w, h)).fill(2 /* Forbidden */);
  const vArr = new Array(vLength(w, h)).fill(2 /* Forbidden */);
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      hArr[hIndex(w, hx, hy)] = 0 /* Unknown */;
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      vArr[vIndex(w, vx, vy)] = 0 /* Unknown */;
    }
  }
  return {
    puzzleId: puzzle2.id,
    width: w,
    height: h,
    h: hArr,
    v: vArr
  };
}

// src/coloring.ts
var COLOR_UNK = 0;
var COLOR_OUT = 1;
var COLOR_IN = 2;
function padIndex(w, pcx, pcy) {
  return pcy * (w + 2) + pcx;
}
function sharedEdgeBetween(w, h, pcx1, pcy1, pcx2, pcy2) {
  const dx = pcx2 - pcx1;
  const dy = pcy2 - pcy1;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dx === 1) {
    const segY = pcy1 - 1;
    const vx = pcx1;
    if (segY < 0 || segY > h - 1) return null;
    if (vx < 0 || vx > w) return null;
    return { axis: "v", index: vIndex(w, vx, segY + 1) };
  }
  if (dx === -1) return sharedEdgeBetween(w, h, pcx2, pcy2, pcx1, pcy1);
  if (dy === 1) {
    const hy = pcy1;
    const segX = pcx1 - 1;
    if (hy < 0 || hy > h) return null;
    if (segX < 0 || segX > w - 1) return null;
    return { axis: "h", index: hIndex(w, segX + 1, hy) };
  }
  if (dy === -1) return sharedEdgeBetween(w, h, pcx2, pcy2, pcx1, pcy1);
  return null;
}
function onHasCycle(state2, w, h) {
  const key = (px, py) => py * (w + 1) + px;
  const adj = /* @__PURE__ */ new Map();
  const add = (a, b) => {
    const list = adj.get(a) ?? [];
    list.push(b);
    adj.set(a, list);
  };
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      const idx = hIndex(w, hx, hy);
      if (edgeValue(state2, "h", idx) !== 1 /* On */) continue;
      const seg = hx - 1;
      add(key(seg, hy), key(seg + 1, hy));
      add(key(seg + 1, hy), key(seg, hy));
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const idx = vIndex(w, vx, vy);
      if (edgeValue(state2, "v", idx) !== 1 /* On */) continue;
      const seg = vy - 1;
      add(key(vx, seg), key(vx, seg + 1));
      add(key(vx, seg + 1), key(vx, seg));
    }
  }
  const visited = /* @__PURE__ */ new Set();
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const stack = [[start, -1]];
    visited.add(start);
    while (stack.length) {
      const [cur, parent] = stack.pop();
      for (const nb of adj.get(cur) ?? []) {
        if (nb === parent) continue;
        if (visited.has(nb)) return true;
        visited.add(nb);
        stack.push([nb, cur]);
      }
    }
  }
  return false;
}
function countComponents(w, h, grid, accept) {
  const nCols = w + 2;
  const nRows = h + 2;
  const inSet = /* @__PURE__ */ new Set();
  for (let i = 0; i < grid.length; i++) {
    if (accept(grid[i])) inSet.add(i);
  }
  if (inSet.size === 0) return 0;
  let components = 0;
  const visited = /* @__PURE__ */ new Set();
  for (const start of inSet) {
    if (visited.has(start)) continue;
    components++;
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const cur = stack.pop();
      const pcx = cur % nCols;
      const pcy = Math.floor(cur / nCols);
      for (const [nx, ny] of [
        [pcx + 1, pcy],
        [pcx - 1, pcy],
        [pcx, pcy + 1],
        [pcx, pcy - 1]
      ]) {
        if (nx < 0 || ny < 0 || nx >= nCols || ny >= nRows) continue;
        const ni = padIndex(w, nx, ny);
        if (!inSet.has(ni) || visited.has(ni)) continue;
        visited.add(ni);
        stack.push(ni);
      }
    }
  }
  return components;
}
function analyzeColors(puzzle2, state2) {
  const w = puzzle2.width;
  const h = puzzle2.height;
  const nCols = w + 2;
  const nRows = h + 2;
  const grid = new Array(nCols * nRows).fill(COLOR_UNK);
  for (let pcx = 0; pcx < nCols; pcx++) {
    grid[padIndex(w, pcx, 0)] = COLOR_OUT;
    grid[padIndex(w, pcx, nRows - 1)] = COLOR_OUT;
  }
  for (let pcy = 0; pcy < nRows; pcy++) {
    grid[padIndex(w, 0, pcy)] = COLOR_OUT;
    grid[padIndex(w, nCols - 1, pcy)] = COLOR_OUT;
  }
  const constraints = [];
  for (let pcy = 0; pcy < nRows; pcy++) {
    for (let pcx = 0; pcx < nCols; pcx++) {
      if (pcx + 1 < nCols) {
        const e = sharedEdgeBetween(w, h, pcx, pcy, pcx + 1, pcy);
        if (e) {
          const v = edgeValue(state2, e.axis, e.index);
          if (v === 1 /* On */) constraints.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx + 1, pcy), kind: "on" });
          else if (v === 2 /* Forbidden */) constraints.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx + 1, pcy), kind: "off" });
        }
      }
      if (pcy + 1 < nRows) {
        const e = sharedEdgeBetween(w, h, pcx, pcy, pcx, pcy + 1);
        if (e) {
          const v = edgeValue(state2, e.axis, e.index);
          if (v === 1 /* On */) constraints.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx, pcy + 1), kind: "on" });
          else if (v === 2 /* Forbidden */) constraints.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx, pcy + 1), kind: "off" });
        }
      }
    }
  }
  let conflict = false;
  const flip = (c2) => c2 === COLOR_OUT ? COLOR_IN : COLOR_OUT;
  for (let iter = 0; iter < nCols * nRows + 2; iter++) {
    let changed = false;
    for (const c2 of constraints) {
      const ca = grid[c2.a];
      const cb = grid[c2.b];
      if (c2.kind === "off") {
        if (ca !== COLOR_UNK && cb !== COLOR_UNK) {
          if (ca !== cb) conflict = true;
        } else if (ca !== COLOR_UNK && cb === COLOR_UNK) {
          grid[c2.b] = ca;
          changed = true;
        } else if (cb !== COLOR_UNK && ca === COLOR_UNK) {
          grid[c2.a] = cb;
          changed = true;
        }
      } else {
        if (ca !== COLOR_UNK && cb !== COLOR_UNK) {
          if (ca === cb) conflict = true;
        } else if (ca !== COLOR_UNK && cb === COLOR_UNK) {
          grid[c2.b] = flip(ca);
          changed = true;
        } else if (cb !== COLOR_UNK && ca === COLOR_UNK) {
          grid[c2.a] = flip(cb);
          changed = true;
        }
      }
    }
    if (!changed || conflict) break;
  }
  const inComponents = countComponents(w, h, grid, (c2) => c2 === COLOR_IN || c2 === COLOR_UNK);
  const outComponents = countComponents(w, h, grid, (c2) => c2 === COLOR_OUT || c2 === COLOR_UNK);
  return {
    grid,
    conflict,
    inComponents,
    outComponents,
    inConnected: inComponents <= 1,
    outConnected: outComponents <= 1,
    hasOnCycle: onHasCycle(state2, w, h)
  };
}
function probeEdge(puzzle2, state2, axis, index, to) {
  const old = edgeValue(state2, axis, index);
  if (axis === "h") state2.h[index] = to;
  else state2.v[index] = to;
  const a = analyzeColors(puzzle2, state2);
  if (axis === "h") state2.h[index] = old;
  else state2.v[index] = old;
  if (a.conflict) return { ok: false, reason: "color-conflict" };
  if (!a.inConnected) return { ok: false, reason: "in-disconnected" };
  if (!a.outConnected) return { ok: false, reason: "out-disconnected" };
  return { ok: true };
}

// src/logic.ts
function createMasks(w, h) {
  return {
    cells: new Array(w * h).fill(false),
    vertices: new Array((w + 1) * (h + 1)).fill(false),
    h: new Array((h + 1) * (w + 2)).fill(false),
    v: new Array((h + 2) * (w + 1)).fill(false)
  };
}
function isEdgeMasked(masks, axis, index) {
  return axis === "h" ? masks.h[index] : masks.v[index];
}
function setEdgeMask(masks, axis, index, on2 = true) {
  if (axis === "h") masks.h[index] = on2;
  else masks.v[index] = on2;
}
function cellMaskIndex(w, cx, cy) {
  return cy * w + cx;
}
function vertexMaskIndex(w, px, py) {
  return py * (w + 1) + px;
}
function sharedGeometry(w, ax, ay, dir) {
  const aE = cellEdges(w, ax, ay);
  const bx = dir === "H" ? ax + 1 : ax;
  const by = dir === "H" ? ay : ay + 1;
  const bE = cellEdges(w, bx, by);
  if (dir === "H") {
    const shared2 = { axis: "v", index: aE.right };
    const vertices2 = [
      {
        px: ax + 1,
        py: ay,
        aSide: { axis: "h", index: aE.top },
        bSide: { axis: "h", index: bE.top },
        outward: { axis: "v", index: vertexEdges(w, ax + 1, ay).north }
      },
      {
        px: ax + 1,
        py: ay + 1,
        aSide: { axis: "h", index: aE.bottom },
        bSide: { axis: "h", index: bE.bottom },
        outward: { axis: "v", index: vertexEdges(w, ax + 1, ay + 1).south }
      }
    ];
    return { shared: shared2, vertices: vertices2, a: aE, b: bE };
  }
  const shared = { axis: "h", index: aE.bottom };
  const vertices = [
    {
      px: ax,
      py: ay + 1,
      aSide: { axis: "v", index: aE.left },
      bSide: { axis: "v", index: bE.left },
      outward: { axis: "h", index: vertexEdges(w, ax, ay + 1).west }
    },
    {
      px: ax + 1,
      py: ay + 1,
      aSide: { axis: "v", index: aE.right },
      bSide: { axis: "v", index: bE.right },
      outward: { axis: "h", index: vertexEdges(w, ax + 1, ay + 1).east }
    }
  ];
  return { shared, vertices, a: aE, b: bE };
}
function planLogicSolve(puzzle2, state2) {
  const w = puzzle2.width;
  const h = puzzle2.height;
  const work = {
    puzzleId: state2.puzzleId,
    width: state2.width,
    height: state2.height,
    h: state2.h.slice(),
    v: state2.v.slice()
  };
  const masks = createMasks(w, h);
  const steps = [];
  const trySet = (axis, index, to, acc) => {
    if (isEdgeMasked(masks, axis, index)) return false;
    const from = edgeValue(work, axis, index);
    if (from !== 0 /* Unknown */) return false;
    if (from === to) return false;
    acc.push({ axis, index, from, to });
    setEdge(work, axis, index, to);
    return true;
  };
  const flush = (rule, label, acc, maskCells = [], maskVertices = [], maskEdges = []) => {
    if (!acc.length && !maskCells.length && !maskVertices.length && !maskEdges.length) {
      return;
    }
    for (const c2 of maskCells) masks.cells[c2] = true;
    for (const v of maskVertices) masks.vertices[v] = true;
    for (const e of maskEdges) setEdgeMask(masks, e.axis, e.index, true);
    steps.push({ rule, label, changes: acc, maskCells, maskVertices, maskEdges });
  };
  const applyRule1 = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle2.cells[cellMaskIndex(w, cx, cy)];
        if (n === null || n === void 0) continue;
        const ci = cellMaskIndex(w, cx, cy);
        if (masks.cells[ci]) continue;
        const e = cellEdges(w, cx, cy);
        const sides = [
          { axis: "h", index: e.top },
          { axis: "h", index: e.bottom },
          { axis: "v", index: e.left },
          { axis: "v", index: e.right }
        ];
        let on2 = 0;
        let off2 = 0;
        let unk2 = 0;
        for (const s of sides) {
          const v = edgeValue(work, s.axis, s.index);
          if (v === 1 /* On */) on2++;
          else if (v === 2 /* Forbidden */) off2++;
          else unk2++;
        }
        if (on2 === n && unk2 > 0) {
          const acc = [];
          for (const s of sides) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          flush(1, `\u89C4\u52191\uFF1A(${cx},${cy})=${n} \u5DF2\u6EE1\uFF0C\u5176\u4F59\u6392\u9664`, acc);
          continue;
        }
        if (off2 + n === 4 && unk2 > 0) {
          const acc = [];
          for (const s of sides) trySet(s.axis, s.index, 1 /* On */, acc);
          flush(
            1,
            `\u89C4\u52191\uFF1A(${cx},${cy})=${n} \u7F3A\u53E3=${n - on2}\uFF0C\u5176\u4F59\u5728\u73AF\u4E0A\u5E76\u63A9\u7801`,
            acc,
            [ci],
            [],
            sides.map((s) => ({ axis: s.axis, index: s.index }))
          );
        }
      }
    }
  };
  const applyRule2 = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle2.cells[cellMaskIndex(w, cx, cy)];
        if (n !== 1) continue;
        const ci = cellMaskIndex(w, cx, cy);
        if (masks.cells[ci]) continue;
        const e = cellEdges(w, cx, cy);
        const corners = [
          {
            px: cx,
            py: cy,
            onCell: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.left }
            ]
          },
          {
            px: cx + 1,
            py: cy,
            onCell: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.right }
            ]
          },
          {
            px: cx,
            py: cy + 1,
            onCell: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.left }
            ]
          },
          {
            px: cx + 1,
            py: cy + 1,
            onCell: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.right }
            ]
          }
        ];
        for (const c2 of corners) {
          const vi = vertexMaskIndex(w, c2.px, c2.py);
          if (masks.vertices[vi]) continue;
          const ve = vertexEdges(w, c2.px, c2.py);
          const all = [
            { axis: "h", index: ve.west },
            { axis: "h", index: ve.east },
            { axis: "v", index: ve.north },
            { axis: "v", index: ve.south }
          ];
          const onCellKeys = new Set(c2.onCell.map((s) => `${s.axis}:${s.index}`));
          const offCell = all.filter((s) => !onCellKeys.has(`${s.axis}:${s.index}`));
          {
            const [o1, o2] = offCell;
            if (o1 && o2) {
              const v1 = edgeValue(work, o1.axis, o1.index);
              const v2 = edgeValue(work, o2.axis, o2.index);
              if (v1 === 2 /* Forbidden */ && v2 === 2 /* Forbidden */) {
                const acc = [];
                for (const s of c2.onCell) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
                if (acc.length) {
                  flush(
                    2,
                    `\u89C4\u52192A\uFF1A\u6570\u5B571\u89D2(${c2.px},${c2.py})\u4E24\u5916\u8FB9\u6392\u9664 \u2192 \u8BE5\u89D2\u4E24\u8FB9\u6392\u9664\u5E76\u63A9\u7801`,
                    acc,
                    [],
                    [vi],
                    all.map((s) => ({ axis: s.axis, index: s.index }))
                  );
                  continue;
                }
              }
            }
          }
          {
            const [o1, o2] = offCell;
            if (o1 && o2) {
              const v1 = edgeValue(work, o1.axis, o1.index);
              const v2 = edgeValue(work, o2.axis, o2.index);
              const hasOff = v1 === 2 /* Forbidden */ || v2 === 2 /* Forbidden */;
              const hasOn = v1 === 1 /* On */ || v2 === 1 /* On */;
              if (hasOff && hasOn) {
                const acc = [];
                const cellSides = [
                  { axis: "h", index: e.top },
                  { axis: "h", index: e.bottom },
                  { axis: "v", index: e.left },
                  { axis: "v", index: e.right }
                ];
                for (const s of cellSides) {
                  if (!onCellKeys.has(`${s.axis}:${s.index}`)) {
                    trySet(s.axis, s.index, 2 /* Forbidden */, acc);
                  }
                }
                flush(2, `\u89C4\u52192B\uFF1A\u6570\u5B571\u89D2(${c2.px},${c2.py})\u5916\u8FB9\u4E00\u6392\u9664\u4E00\u73AF \u2192 \u5BF9\u8FB9\u6392\u9664`, acc);
              }
            }
          }
        }
      }
    }
  };
  const applyRule3 = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle2.cells[cellMaskIndex(w, cx, cy)];
        if (n !== 3) continue;
        const ci = cellMaskIndex(w, cx, cy);
        if (masks.cells[ci]) continue;
        const e = cellEdges(w, cx, cy);
        const corners = [
          {
            px: cx,
            py: cy,
            onCell: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.left }
            ]
          },
          {
            px: cx + 1,
            py: cy,
            onCell: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.right }
            ]
          },
          {
            px: cx,
            py: cy + 1,
            onCell: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.left }
            ]
          },
          {
            px: cx + 1,
            py: cy + 1,
            onCell: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.right }
            ]
          }
        ];
        for (const c2 of corners) {
          const vi = vertexMaskIndex(w, c2.px, c2.py);
          if (masks.vertices[vi]) continue;
          const ve = vertexEdges(w, c2.px, c2.py);
          const all = [
            { axis: "h", index: ve.west },
            { axis: "h", index: ve.east },
            { axis: "v", index: ve.north },
            { axis: "v", index: ve.south }
          ];
          const atVertex = new Set(c2.onCell.map((s) => `${s.axis}:${s.index}`));
          const offCell = all.filter((s) => !atVertex.has(`${s.axis}:${s.index}`));
          const offOn = offCell.filter((s) => edgeValue(work, s.axis, s.index) === 1 /* On */);
          if (offOn.length !== 1) continue;
          const acc = [];
          for (const s of offCell) {
            if (edgeValue(work, s.axis, s.index) === 1 /* On */) continue;
            trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          }
          const cellSides = [
            { axis: "h", index: e.top },
            { axis: "h", index: e.bottom },
            { axis: "v", index: e.left },
            { axis: "v", index: e.right }
          ];
          for (const s of cellSides) {
            if (!atVertex.has(`${s.axis}:${s.index}`)) {
              trySet(s.axis, s.index, 1 /* On */, acc);
            }
          }
          if (acc.length) {
            flush(3, `\u89C4\u52193\uFF1A\u6570\u5B573\u89D2(${c2.px},${c2.py})\u5916\u8FB9\u5165\u73AF \u2192 \u5BF9\u8FB9\u5728\u73AF\u4E0A`, acc);
          }
        }
      }
    }
  };
  const applyRule4 = () => {
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        const vi = vertexMaskIndex(w, px, py);
        if (masks.vertices[vi]) continue;
        const ve = vertexEdges(w, px, py);
        const all = [
          { axis: "h", index: ve.west },
          { axis: "h", index: ve.east },
          { axis: "v", index: ve.north },
          { axis: "v", index: ve.south }
        ];
        let on2 = 0;
        let off2 = 0;
        let unk2 = 0;
        for (const s of all) {
          const v = edgeValue(work, s.axis, s.index);
          if (v === 1 /* On */) on2++;
          else if (v === 2 /* Forbidden */) off2++;
          else unk2++;
        }
        if (unk2 === 0) continue;
        if (on2 === 2 && unk2 > 0) {
          const acc = [];
          for (const s of all) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          if (acc.length) {
            flush(
              4,
              `\u89C4\u52194\uFF1A\u70B9(${px},${py})\u5DF2 2 \u73AF\u8FB9 \u2192 \u4F59\u8FB9\u6392\u9664\u5E76\u63A9\u7801`,
              acc,
              [],
              [vi],
              all.map((s) => ({ axis: s.axis, index: s.index }))
            );
            continue;
          }
        }
        if (off2 === 3 && unk2 > 0) {
          const acc = [];
          for (const s of all) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          if (acc.length) {
            flush(
              4,
              `\u89C4\u52194\uFF1A\u70B9(${px},${py})\u5DF2 3 \u6392\u9664 \u2192 \u5269\u4F59\u6392\u9664\u5E76\u63A9\u7801`,
              acc,
              [],
              [vi],
              all.map((s) => ({ axis: s.axis, index: s.index }))
            );
            continue;
          }
        }
        if (off2 === 2 && on2 === 1 && unk2 === 1) {
          const acc = [];
          for (const s of all) trySet(s.axis, s.index, 1 /* On */, acc);
          if (acc.length) {
            flush(
              4,
              `\u89C4\u52194\uFF1A\u70B9(${px},${py}) 2\u6392\u9664+1\u73AF \u2192 \u5269\u4F59\u5728\u73AF\u4E0A\u5E76\u63A9\u7801`,
              acc,
              [],
              [vi],
              all.map((s) => ({ axis: s.axis, index: s.index }))
            );
          }
        }
      }
    }
  };
  const applyRule5 = () => {
    const seen = /* @__PURE__ */ new Set();
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (puzzle2.cells[cellMaskIndex(w, cx, cy)] !== 1) continue;
        if (cx + 1 < w && puzzle2.cells[cellMaskIndex(w, cx + 1, cy)] === 1) {
          const key = `H:${cx}:${cy}`;
          if (!seen.has(key)) {
            seen.add(key);
            const g = sharedGeometry(w, cx, cy, "H");
            const acc = [];
            for (const v of g.vertices) {
              const o = edgeValue(work, v.outward.axis, v.outward.index);
              if (o === 2 /* Forbidden */) {
                trySet(g.shared.axis, g.shared.index, 2 /* Forbidden */, acc);
              }
            }
            if (acc.length) {
              flush(5, `\u89C4\u52195\uFF1A1-1 \u5916\u5411\u6392\u9664 \u2192 \u5171\u4EAB\u8FB9\u6392\u9664`, acc);
            }
          }
        }
        if (cy + 1 < h && puzzle2.cells[cellMaskIndex(w, cx, cy + 1)] === 1) {
          const key = `V:${cx}:${cy}`;
          if (!seen.has(key)) {
            seen.add(key);
            const g = sharedGeometry(w, cx, cy, "V");
            const acc = [];
            for (const v of g.vertices) {
              const o = edgeValue(work, v.outward.axis, v.outward.index);
              if (o === 2 /* Forbidden */) {
                trySet(g.shared.axis, g.shared.index, 2 /* Forbidden */, acc);
              }
            }
            if (acc.length) {
              flush(5, `\u89C4\u52195\uFF1A1-1 \u5916\u5411\u6392\u9664 \u2192 \u5171\u4EAB\u8FB9\u6392\u9664`, acc);
            }
          }
        }
      }
    }
  };
  const applyRule6 = () => {
    const seen = /* @__PURE__ */ new Set();
    const applyPair = (cx, cy, dir) => {
      const g = sharedGeometry(w, cx, cy, dir);
      const acc = [];
      for (const v of g.vertices) {
        trySet(v.outward.axis, v.outward.index, 2 /* Forbidden */, acc);
      }
      trySet(g.shared.axis, g.shared.index, 1 /* On */, acc);
      if (dir === "H") {
        trySet("v", g.a.left, 1 /* On */, acc);
        trySet("v", g.b.right, 1 /* On */, acc);
      } else {
        trySet("h", g.a.top, 1 /* On */, acc);
        trySet("h", g.b.bottom, 1 /* On */, acc);
      }
      if (acc.length) {
        flush(6, `\u89C4\u52196\uFF1A\u53CC3 \u5916\u5411\xD7 + \u5171\u4EAB\u8FB9\u4E0E\u5BF9\u8FB9\u843D\u73AF`, acc);
      }
    };
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (puzzle2.cells[cellMaskIndex(w, cx, cy)] !== 3) continue;
        if (cx + 1 < w && puzzle2.cells[cellMaskIndex(w, cx + 1, cy)] === 3) {
          const key = `H:${cx}:${cy}`;
          if (!seen.has(key)) {
            seen.add(key);
            applyPair(cx, cy, "H");
          }
        }
        if (cy + 1 < h && puzzle2.cells[cellMaskIndex(w, cx, cy + 1)] === 3) {
          const key = `V:${cx}:${cy}`;
          if (!seen.has(key)) {
            seen.add(key);
            applyPair(cx, cy, "V");
          }
        }
      }
    }
  };
  const applyRule7 = () => {
    const real = [];
    for (let hy = 0; hy <= h; hy++) {
      for (let hx = 1; hx <= w; hx++) {
        real.push({ axis: "h", index: hIndex(w, hx, hy) });
      }
    }
    for (let vy = 1; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) {
        real.push({ axis: "v", index: vIndex(w, vx, vy) });
      }
    }
    for (const s of real) {
      if (isEdgeMasked(masks, s.axis, s.index)) continue;
      const cur = edgeValue(work, s.axis, s.index);
      if (cur !== 0 /* Unknown */) continue;
      const probeOn = probeEdge(puzzle2, work, s.axis, s.index, 1 /* On */);
      if (!probeOn.ok) {
        const acc = [];
        trySet(s.axis, s.index, 2 /* Forbidden */, acc);
        if (acc.length) {
          const why = probeOn.reason === "color-conflict" ? "\u67D3\u8272\u51B2\u7A81" : probeOn.reason === "in-disconnected" ? "\u82722\u222A\u65E0\u8272\u88C2\u5F00" : "\u82721\u222A\u65E0\u8272\u88C2\u5F00";
          flush(7, `\u89C4\u52197\uFF1A\u843D\u73AF\u4F1A${why} \u2192 \u6392\u9664`, acc);
        }
        continue;
      }
      const probeOff = probeEdge(puzzle2, work, s.axis, s.index, 2 /* Forbidden */);
      if (!probeOff.ok && probeOff.reason === "color-conflict") {
        const probeOn2 = probeEdge(puzzle2, work, s.axis, s.index, 1 /* On */);
        if (probeOn2.ok) {
          const acc = [];
          trySet(s.axis, s.index, 1 /* On */, acc);
          if (acc.length) {
            flush(7, `\u89C4\u52197\uFF1A\u6392\u9664\u4F1A\u540C\u8272\u51B2\u7A81 \u2192 \u843D\u73AF`, acc);
          }
        }
      }
    }
  };
  let saturated = true;
  for (let guard = 0; guard < 400; guard++) {
    const before = steps.length;
    applyRule1();
    applyRule2();
    applyRule3();
    applyRule4();
    applyRule5();
    applyRule6();
    applyRule7();
    if (steps.length === before) {
      saturated = true;
      break;
    }
    if (guard === 399) saturated = false;
  }
  const frames = [];
  let lastType = null;
  let streak = 0;
  for (const step of steps) {
    for (const change of step.changes) {
      if (change.to === lastType) streak++;
      else {
        streak = 1;
        lastType = change.to;
      }
      frames.push({
        rule: step.rule,
        label: step.label,
        change,
        streak
      });
    }
  }
  return {
    puzzleId: puzzle2.id,
    frames,
    finalState: work,
    ruleSteps: steps.length,
    saturated
  };
}

// src/validate.ts
function countOnAroundCell(state2, w, cx, cy) {
  const e = cellEdges(w, cx, cy);
  let n = 0;
  if (edgeValue(state2, "h", e.top) === 1 /* On */) n++;
  if (edgeValue(state2, "h", e.bottom) === 1 /* On */) n++;
  if (edgeValue(state2, "v", e.left) === 1 /* On */) n++;
  if (edgeValue(state2, "v", e.right) === 1 /* On */) n++;
  return n;
}
function degreeAt(state2, w, px, py) {
  const e = vertexEdges(w, px, py);
  let d = 0;
  if (edgeValue(state2, "h", e.west) === 1 /* On */) d++;
  if (edgeValue(state2, "h", e.east) === 1 /* On */) d++;
  if (edgeValue(state2, "v", e.north) === 1 /* On */) d++;
  if (edgeValue(state2, "v", e.south) === 1 /* On */) d++;
  return d;
}
function analyzeLoop(state2, w, h) {
  const pts = allVertexPositions(w, h);
  let onEdgeCount = 0;
  for (const s of state2.h) if (s === 1 /* On */) onEdgeCount++;
  for (const s of state2.v) if (s === 1 /* On */) onEdgeCount++;
  if (onEdgeCount === 0) return { kind: "empty" };
  const key = (px, py) => py * (w + 1) + px;
  const adj = /* @__PURE__ */ new Map();
  for (const { px, py } of pts) {
    const e = vertexEdges(w, px, py);
    const nbrs = [];
    if (edgeValue(state2, "h", e.west) === 1 /* On */ && px > 0) nbrs.push(key(px - 1, py));
    if (edgeValue(state2, "h", e.east) === 1 /* On */ && px < w) nbrs.push(key(px + 1, py));
    if (edgeValue(state2, "v", e.north) === 1 /* On */ && py > 0) nbrs.push(key(px, py - 1));
    if (edgeValue(state2, "v", e.south) === 1 /* On */ && py < h) nbrs.push(key(px, py + 1));
    if (nbrs.length) adj.set(key(px, py), nbrs);
  }
  for (const { px, py } of pts) {
    const d = degreeAt(state2, w, px, py);
    if (d === 1) return { kind: "open" };
    if (d >= 3) return { kind: "branch" };
  }
  const visited = /* @__PURE__ */ new Set();
  let components = 0;
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    components++;
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const cur = stack.pop();
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
  }
  if (components > 1) return { kind: "multiple" };
  return { kind: "single" };
}
function validate(state2, puzzle2) {
  const w = puzzle2.width;
  const h = puzzle2.height;
  const badPoints = [];
  const badCells = [];
  for (const { px, py } of allVertexPositions(w, h)) {
    const d = degreeAt(state2, w, px, py);
    if (d === 1 || d >= 3) {
      badPoints.push({ px, py, degree: d });
    }
  }
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const expected = puzzle2.cells[cy * w + cx];
      if (expected === null) continue;
      const actual = countOnAroundCell(state2, w, cx, cy);
      if (actual !== expected) {
        badCells.push({ cx, cy, expected, actual });
      }
    }
  }
  const loop = analyzeLoop(state2, w, h);
  const solved = badPoints.length === 0 && badCells.length === 0 && loop.kind === "single";
  return { badPoints, badCells, loop, solved };
}

// src/solver.ts
function cloneState(s) {
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    h: s.h.slice(),
    v: s.v.slice()
  };
}
function cellSatisfied(state2, w, cx, cy, target) {
  if (target === null) return true;
  const e = cellEdges(w, cx, cy);
  let on2 = 0;
  let unknown = 0;
  for (const [axis, index] of [
    ["h", e.top],
    ["h", e.bottom],
    ["v", e.left],
    ["v", e.right]
  ]) {
    const v = edgeValue(state2, axis, index);
    if (v === 1 /* On */) on2++;
    else if (v === 0 /* Unknown */) unknown++;
  }
  if (on2 > target) return false;
  if (on2 + unknown < target) return false;
  return true;
}
function vertexOk(state2, w, px, py) {
  const e = vertexEdges(w, px, py);
  let on2 = 0;
  let unknown = 0;
  for (const [axis, index] of [
    ["h", e.west],
    ["h", e.east],
    ["v", e.north],
    ["v", e.south]
  ]) {
    const v = edgeValue(state2, axis, index);
    if (v === 1 /* On */) on2++;
    else if (v === 0 /* Unknown */) unknown++;
  }
  if (on2 > 2) return false;
  if (unknown === 0 && on2 === 1) return false;
  return true;
}
function realEdges(w, h) {
  const edges = [];
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) edges.push({ axis: "h", index: hIndex(w, hx, hy) });
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) edges.push({ axis: "v", index: vIndex(w, vx, vy) });
  }
  return edges;
}
function countSolutions(puzzle2, limit = 2, maxNodes = 8e5) {
  const w = puzzle2.width;
  const h = puzzle2.height;
  const state2 = createEmptyState(puzzle2);
  const edges = realEdges(w, h);
  let nodes = 0;
  let timedOut = false;
  let count = 0;
  let first = null;
  let second = null;
  const cellsOk = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (!cellSatisfied(state2, w, cx, cy, puzzle2.cells[cy * w + cx] ?? null)) return false;
      }
    }
    return true;
  };
  const vertsOk = () => {
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        if (!vertexOk(state2, w, px, py)) return false;
      }
    }
    return true;
  };
  const dfs = (i) => {
    if (nodes++ > maxNodes) {
      timedOut = true;
      return true;
    }
    if (count >= limit) return true;
    if (i === edges.length) {
      if (cellsOk() && vertsOk()) {
        count++;
        const snap = cloneState(state2);
        if (!first) first = snap;
        else if (!second) second = snap;
      }
      return count >= limit;
    }
    const { axis, index } = edges[i];
    for (const val of [1 /* On */, 2 /* Forbidden */]) {
      setEdge(state2, axis, index, val);
      if (cellsOk() && vertsOk()) {
        if (dfs(i + 1)) {
          setEdge(state2, axis, index, 0 /* Unknown */);
          return true;
        }
      }
    }
    setEdge(state2, axis, index, 0 /* Unknown */);
    return false;
  };
  dfs(0);
  return {
    count,
    capped: count >= limit,
    nodes,
    timedOut,
    first,
    second
  };
}

// scripts/user15.mts
var raw = `
. 2 3 . . 2 2 . . . . . . . .
. 2 2 2 1 . 3 . . . . . 2 . 3
2 . . . . 3 . . 3 1 . 3 . . .
. 2 1 . 1 . 2 . . . . . . 2 1
3 . . . . 3 . . 2 3 . 3 . 3 .
1 2 2 . . 3 0 3 . 2 1 . . 1 2
2 . 1 . . . . . . 2 2 2 . 2 .
3 2 2 . . . 1 2 . . . . . . 1
. . 2 . 1 . . . 3 2 . 3 2 2 .
. . . . 3 . . 2 . . 3 1 2 . 3
2 . 3 . . 3 . . . . . 1 . . .
2 2 2 . . . . 2 . 3 2 . . . .
3 . . . 1 3 3 . . . 1 . . 1 3
3 . 3 . 2 1 . 3 . . 2 3 . . .
. . 2 . . 2 . . 1 . 2 . . . 3
`.trim().split("\n").map((r) => r.trim().split(/\s+/));
var cells = [];
for (const row of raw) {
  for (const ch of row) {
    cells.push(ch === "." ? null : Number(ch));
  }
}
console.log("cells", cells.length, "filled", cells.filter((c2) => c2 !== null).length);
var puzzle = {
  id: "user-15x15",
  name: "\u7528\u6237 15\xD715",
  width: 15,
  height: 15,
  cells,
  difficulty: "hard"
};
var state = createEmptyState(puzzle);
var t0 = Date.now();
var plan = planLogicSolve(puzzle, state);
var t1 = Date.now();
var on = 0;
var off = 0;
var unk = 0;
for (let hy = 0; hy <= 15; hy++) {
  for (let hx = 1; hx <= 15; hx++) {
    const v = edgeValue(plan.finalState, "h", hIndex(15, hx, hy));
    if (v === 1 /* On */) on++;
    else if (v === 2 /* Forbidden */) off++;
    else unk++;
  }
}
for (let vy = 1; vy <= 15; vy++) {
  for (let vx = 0; vx <= 15; vx++) {
    const v = edgeValue(plan.finalState, "v", vIndex(15, vx, vy));
    if (v === 1 /* On */) on++;
    else if (v === 2 /* Forbidden */) off++;
    else unk++;
  }
}
console.log("plan frames", plan.frames.length, "ruleSteps", plan.ruleSteps, "ms", t1 - t0);
console.log("after rules: on", on, "off", off, "unknown", unk);
console.log("saturated", plan.saturated);
var result = validate(plan.finalState, puzzle);
console.log("validate solved", result.solved, "loop", result.loop.kind, "badCells", result.badCells.length, "badPoints", result.badPoints.length);
var byRule = {};
for (const f of plan.frames) {
  byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
}
console.log("frames by rule", byRule);
console.log("backtracking countSolutions\u2026");
var t2 = Date.now();
var c = countSolutions(puzzle, 2, 3e6);
console.log("solutions", c.count, "capped", c.capped, "timeout", c.timedOut, "nodes", c.nodes, "ms", Date.now() - t2);
if (c.first) {
  let agree = 0;
  let logicUnknownButSolved = 0;
  let conflict = 0;
  for (let hy = 0; hy <= 15; hy++) {
    for (let hx = 1; hx <= 15; hx++) {
      const i = hIndex(15, hx, hy);
      const a = plan.finalState.h[i];
      const b = c.first.h[i];
      if (a === 0 /* Unknown */) {
        if (b !== 0 /* Unknown */) logicUnknownButSolved++;
      } else if (a === b) agree++;
      else conflict++;
    }
  }
  for (let vy = 1; vy <= 15; vy++) {
    for (let vx = 0; vx <= 15; vx++) {
      const i = vIndex(15, vx, vy);
      const a = plan.finalState.v[i];
      const b = c.first.v[i];
      if (a === 0 /* Unknown */) {
        if (b !== 0 /* Unknown */) logicUnknownButSolved++;
      } else if (a === b) agree++;
      else conflict++;
    }
  }
  console.log("vs first solution: agree", agree, "logic-still-unknown", logicUnknownButSolved, "CONFLICT", conflict);
}
