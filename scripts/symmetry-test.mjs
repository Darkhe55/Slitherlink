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
function edgeValue(state, axis, index) {
  return axis === "h" ? state.h[index] : state.v[index];
}
function setEdge(state, axis, index, value) {
  if (axis === "h") state.h[index] = value;
  else state.v[index] = value;
}
function createEmptyState(puzzle) {
  const { width: w, height: h } = puzzle;
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
    puzzleId: puzzle.id,
    width: w,
    height: h,
    h: hArr,
    v: vArr
  };
}
function lockPads(state) {
  const { width: w, height: h } = state;
  for (let hy = 0; hy <= h; hy++) {
    state.h[hIndex(w, 0, hy)] = 2 /* Forbidden */;
    state.h[hIndex(w, w + 1, hy)] = 2 /* Forbidden */;
  }
  for (let vx = 0; vx <= w; vx++) {
    state.v[vIndex(w, vx, 0)] = 2 /* Forbidden */;
    state.v[vIndex(w, vx, h + 1)] = 2 /* Forbidden */;
  }
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
function onHasCycle(state, w, h) {
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
      if (edgeValue(state, "h", idx) !== 1 /* On */) continue;
      const seg = hx - 1;
      add(key(seg, hy), key(seg + 1, hy));
      add(key(seg + 1, hy), key(seg, hy));
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const idx = vIndex(w, vx, vy);
      if (edgeValue(state, "v", idx) !== 1 /* On */) continue;
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
function analyzeColors(puzzle, state) {
  const w = puzzle.width;
  const h = puzzle.height;
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
          const v = edgeValue(state, e.axis, e.index);
          if (v === 1 /* On */) constraints.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx + 1, pcy), kind: "on" });
          else if (v === 2 /* Forbidden */) constraints.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx + 1, pcy), kind: "off" });
        }
      }
      if (pcy + 1 < nRows) {
        const e = sharedEdgeBetween(w, h, pcx, pcy, pcx, pcy + 1);
        if (e) {
          const v = edgeValue(state, e.axis, e.index);
          if (v === 1 /* On */) constraints.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx, pcy + 1), kind: "on" });
          else if (v === 2 /* Forbidden */) constraints.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx, pcy + 1), kind: "off" });
        }
      }
    }
  }
  let conflict = false;
  const flip = (c) => c === COLOR_OUT ? COLOR_IN : COLOR_OUT;
  for (let iter = 0; iter < nCols * nRows + 2; iter++) {
    let changed = false;
    for (const c of constraints) {
      const ca = grid[c.a];
      const cb = grid[c.b];
      if (c.kind === "off") {
        if (ca !== COLOR_UNK && cb !== COLOR_UNK) {
          if (ca !== cb) conflict = true;
        } else if (ca !== COLOR_UNK && cb === COLOR_UNK) {
          grid[c.b] = ca;
          changed = true;
        } else if (cb !== COLOR_UNK && ca === COLOR_UNK) {
          grid[c.a] = cb;
          changed = true;
        }
      } else {
        if (ca !== COLOR_UNK && cb !== COLOR_UNK) {
          if (ca === cb) conflict = true;
        } else if (ca !== COLOR_UNK && cb === COLOR_UNK) {
          grid[c.b] = flip(ca);
          changed = true;
        } else if (cb !== COLOR_UNK && ca === COLOR_UNK) {
          grid[c.a] = flip(cb);
          changed = true;
        }
      }
    }
    if (!changed || conflict) break;
  }
  const inComponents = countComponents(w, h, grid, (c) => c === COLOR_IN || c === COLOR_UNK);
  const outComponents = countComponents(w, h, grid, (c) => c === COLOR_OUT || c === COLOR_UNK);
  return {
    grid,
    conflict,
    inComponents,
    outComponents,
    inConnected: inComponents <= 1,
    outConnected: outComponents <= 1,
    hasOnCycle: onHasCycle(state, w, h)
  };
}
function probeEdge(puzzle, state, axis, index, to) {
  const old = edgeValue(state, axis, index);
  if (axis === "h") state.h[index] = to;
  else state.v[index] = to;
  const a = analyzeColors(puzzle, state);
  if (axis === "h") state.h[index] = old;
  else state.v[index] = old;
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
function setEdgeMask(masks, axis, index, on = true) {
  if (axis === "h") masks.h[index] = on;
  else masks.v[index] = on;
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
function planLogicSolve(puzzle, state) {
  const w = puzzle.width;
  const h = puzzle.height;
  const work = {
    puzzleId: state.puzzleId,
    width: state.width,
    height: state.height,
    h: state.h.slice(),
    v: state.v.slice()
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
    for (const c of maskCells) masks.cells[c] = true;
    for (const v of maskVertices) masks.vertices[v] = true;
    for (const e of maskEdges) setEdgeMask(masks, e.axis, e.index, true);
    steps.push({ rule, label, changes: acc, maskCells, maskVertices, maskEdges });
  };
  const applyRule1 = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)];
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
        let on = 0;
        let off = 0;
        let unk = 0;
        for (const s of sides) {
          const v = edgeValue(work, s.axis, s.index);
          if (v === 1 /* On */) on++;
          else if (v === 2 /* Forbidden */) off++;
          else unk++;
        }
        if (on === n && unk > 0) {
          const acc = [];
          for (const s of sides) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          flush(1, `\u89C4\u52191\uFF1A(${cx},${cy})=${n} \u5DF2\u6EE1\uFF0C\u5176\u4F59\u6392\u9664`, acc);
          continue;
        }
        if (off + n === 4 && unk > 0) {
          const acc = [];
          for (const s of sides) trySet(s.axis, s.index, 1 /* On */, acc);
          flush(
            1,
            `\u89C4\u52191\uFF1A(${cx},${cy})=${n} \u7F3A\u53E3=${n - on}\uFF0C\u5176\u4F59\u5728\u73AF\u4E0A\u5E76\u63A9\u7801`,
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
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)];
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
        for (const c of corners) {
          const vi = vertexMaskIndex(w, c.px, c.py);
          if (masks.vertices[vi]) continue;
          const ve = vertexEdges(w, c.px, c.py);
          const all = [
            { axis: "h", index: ve.west },
            { axis: "h", index: ve.east },
            { axis: "v", index: ve.north },
            { axis: "v", index: ve.south }
          ];
          const onCellKeys = new Set(c.onCell.map((s) => `${s.axis}:${s.index}`));
          const offCell = all.filter((s) => !onCellKeys.has(`${s.axis}:${s.index}`));
          {
            const [o1, o2] = offCell;
            if (o1 && o2) {
              const v1 = edgeValue(work, o1.axis, o1.index);
              const v2 = edgeValue(work, o2.axis, o2.index);
              if (v1 === 2 /* Forbidden */ && v2 === 2 /* Forbidden */) {
                const acc = [];
                for (const s of c.onCell) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
                if (acc.length) {
                  flush(
                    2,
                    `\u89C4\u52192A\uFF1A\u6570\u5B571\u89D2(${c.px},${c.py})\u4E24\u5916\u8FB9\u6392\u9664 \u2192 \u8BE5\u89D2\u4E24\u8FB9\u6392\u9664\u5E76\u63A9\u7801`,
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
                flush(2, `\u89C4\u52192B\uFF1A\u6570\u5B571\u89D2(${c.px},${c.py})\u5916\u8FB9\u4E00\u6392\u9664\u4E00\u73AF \u2192 \u5BF9\u8FB9\u6392\u9664`, acc);
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
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)];
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
        for (const c of corners) {
          const vi = vertexMaskIndex(w, c.px, c.py);
          if (masks.vertices[vi]) continue;
          const ve = vertexEdges(w, c.px, c.py);
          const all = [
            { axis: "h", index: ve.west },
            { axis: "h", index: ve.east },
            { axis: "v", index: ve.north },
            { axis: "v", index: ve.south }
          ];
          const atVertex = new Set(c.onCell.map((s) => `${s.axis}:${s.index}`));
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
            flush(3, `\u89C4\u52193\uFF1A\u6570\u5B573\u89D2(${c.px},${c.py})\u5916\u8FB9\u5165\u73AF \u2192 \u5BF9\u8FB9\u5728\u73AF\u4E0A`, acc);
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
        let on = 0;
        let off = 0;
        let unk = 0;
        for (const s of all) {
          const v = edgeValue(work, s.axis, s.index);
          if (v === 1 /* On */) on++;
          else if (v === 2 /* Forbidden */) off++;
          else unk++;
        }
        if (unk === 0) continue;
        if (on === 2 && unk > 0) {
          const acc = [];
          for (const s of all) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          if (acc.length) {
            flush(4, `\u89C4\u52194\uFF1A\u70B9(${px},${py})\u5DF2 2 \u73AF\u8FB9 \u2192 \u4F59\u8FB9\u6392\u9664`, acc);
            continue;
          }
        }
        if (off === 3 && unk > 0) {
          const acc = [];
          for (const s of all) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          if (acc.length) {
            flush(4, `\u89C4\u52194\uFF1A\u70B9(${px},${py})\u5DF2 3 \u6392\u9664 \u2192 \u5269\u4F59\u6392\u9664`, acc);
            continue;
          }
        }
        if (off === 2 && on === 1 && unk === 1) {
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
        if (puzzle.cells[cellMaskIndex(w, cx, cy)] !== 1) continue;
        if (cx + 1 < w && puzzle.cells[cellMaskIndex(w, cx + 1, cy)] === 1) {
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
        if (cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx, cy + 1)] === 1) {
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
        if (puzzle.cells[cellMaskIndex(w, cx, cy)] !== 3) continue;
        if (cx + 1 < w && puzzle.cells[cellMaskIndex(w, cx + 1, cy)] === 3) {
          const key = `H:${cx}:${cy}`;
          if (!seen.has(key)) {
            seen.add(key);
            applyPair(cx, cy, "H");
          }
        }
        if (cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx, cy + 1)] === 3) {
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
      const probeOn = probeEdge(puzzle, work, s.axis, s.index, 1 /* On */);
      if (!probeOn.ok) {
        const acc = [];
        trySet(s.axis, s.index, 2 /* Forbidden */, acc);
        if (acc.length) {
          const why = probeOn.reason === "color-conflict" ? "\u67D3\u8272\u51B2\u7A81" : probeOn.reason === "in-disconnected" ? "\u82722\u222A\u65E0\u8272\u88C2\u5F00" : "\u82721\u222A\u65E0\u8272\u88C2\u5F00";
          flush(7, `\u89C4\u52197\uFF1A\u843D\u73AF\u4F1A${why} \u2192 \u6392\u9664`, acc);
        }
        continue;
      }
      const probeOff = probeEdge(puzzle, work, s.axis, s.index, 2 /* Forbidden */);
      if (!probeOff.ok && probeOff.reason === "color-conflict") {
        const probeOn2 = probeEdge(puzzle, work, s.axis, s.index, 1 /* On */);
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
    puzzleId: puzzle.id,
    frames,
    finalState: work,
    ruleSteps: steps.length,
    saturated
  };
}
function collectLogicSteps(puzzle, state) {
  const plan = planLogicSolve(puzzle, state);
  const steps = [];
  let cur = null;
  for (const f of plan.frames) {
    if (!cur || cur.rule !== f.rule || cur.label !== f.label) {
      cur = {
        rule: f.rule,
        label: f.label,
        changes: [],
        maskCells: [],
        maskVertices: [],
        maskEdges: []
      };
      steps.push(cur);
    }
    cur.changes.push(f.change);
  }
  return {
    steps,
    finalState: plan.finalState,
    masks: createMasks(puzzle.width, puzzle.height)
  };
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
function loopFromPolyomino(w, h, inSet) {
  const hOn = new Array((h + 1) * w).fill(false);
  const vOn = new Array(h * (w + 1)).fill(false);
  const cell = (cx, cy) => cx < 0 || cy < 0 || cx >= w || cy >= h ? false : inSet[cy * w + cx];
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const inside = cell(cx, cy);
      if (inside !== cell(cx, cy - 1)) hOn[cy * w + cx] = true;
      if (inside !== cell(cx, cy + 1)) hOn[(cy + 1) * w + cx] = true;
      if (inside !== cell(cx - 1, cy)) vOn[cy * (w + 1) + cx] = true;
      if (inside !== cell(cx + 1, cy)) vOn[cy * (w + 1) + cx + 1] = true;
    }
  }
  return { h: hOn, v: vOn };
}
function randomHoleFreePolyomino(w, h, targetSize, rng) {
  const inSet = new Array(w * h).fill(false);
  const cx0 = Math.floor(rng() * w);
  const cy0 = Math.floor(rng() * h);
  inSet[cy0 * w + cx0] = true;
  let size = 1;
  const has = (cx, cy) => cx >= 0 && cy >= 0 && cx < w && cy < h && inSet[cy * w + cx];
  const createsPinch = (cx, cy) => {
    const has2 = (x, y) => x === cx && y === cy || has(x, y);
    for (const [ox, oy] of [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1]
    ]) {
      const x = cx + ox;
      const y = cy + oy;
      const a = has2(x, y);
      const b = has2(x + 1, y);
      const c = has2(x, y + 1);
      const d = has2(x + 1, y + 1);
      if (a && d && !b && !c) return true;
      if (b && c && !a && !d) return true;
    }
    return false;
  };
  const neighborCount = (cx, cy) => {
    let n = 0;
    if (has(cx + 1, cy)) n++;
    if (has(cx - 1, cy)) n++;
    if (has(cx, cy + 1)) n++;
    if (has(cx, cy - 1)) n++;
    return n;
  };
  const max = Math.min(targetSize, w * h);
  while (size < max) {
    const candidates = [];
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (inSet[cy * w + cx]) continue;
        if (neighborCount(cx, cy) !== 1) continue;
        if (createsPinch(cx, cy)) continue;
        candidates.push([cx, cy]);
      }
    }
    if (!candidates.length) break;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    inSet[pick[1] * w + pick[0]] = true;
    size++;
  }
  return inSet;
}
function numbersFromLoop(w, h, hOn, vOn) {
  const nums = new Array(w * h).fill(0);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      let n = 0;
      if (hOn[cy * w + cx]) n++;
      if (hOn[(cy + 1) * w + cx]) n++;
      if (vOn[cy * (w + 1) + cx]) n++;
      if (vOn[cy * (w + 1) + cx + 1]) n++;
      nums[cy * w + cx] = n;
    }
  }
  return nums;
}
function stateFromLoop(puzzle, hOn, vOn) {
  const st = createEmptyState(puzzle);
  const w = puzzle.width;
  const h = puzzle.height;
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 0; hx < w; hx++) {
      setEdge(st, "h", hIndex(w, hx + 1, hy), hOn[hy * w + hx] ? 1 /* On */ : 2 /* Forbidden */);
    }
  }
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      setEdge(st, "v", vIndex(w, vx, vy + 1), vOn[vy * (w + 1) + vx] ? 1 /* On */ : 2 /* Forbidden */);
    }
  }
  lockPads(st);
  return st;
}
function cellSatisfied(state, w, cx, cy, target) {
  if (target === null) return true;
  const e = cellEdges(w, cx, cy);
  let on = 0;
  let unknown = 0;
  for (const [axis, index] of [
    ["h", e.top],
    ["h", e.bottom],
    ["v", e.left],
    ["v", e.right]
  ]) {
    const v = edgeValue(state, axis, index);
    if (v === 1 /* On */) on++;
    else if (v === 0 /* Unknown */) unknown++;
  }
  if (on > target) return false;
  if (on + unknown < target) return false;
  return true;
}
function vertexOk(state, w, px, py) {
  const e = vertexEdges(w, px, py);
  let on = 0;
  let unknown = 0;
  for (const [axis, index] of [
    ["h", e.west],
    ["h", e.east],
    ["v", e.north],
    ["v", e.south]
  ]) {
    const v = edgeValue(state, axis, index);
    if (v === 1 /* On */) on++;
    else if (v === 0 /* Unknown */) unknown++;
  }
  if (on > 2) return false;
  if (unknown === 0 && on === 1) return false;
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
function countSolutions(puzzle, limit = 2, maxNodes = 8e5) {
  const w = puzzle.width;
  const h = puzzle.height;
  const state = createEmptyState(puzzle);
  const edges = realEdges(w, h);
  let nodes = 0;
  let timedOut = false;
  let count = 0;
  let first = null;
  let second = null;
  const cellsOk = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (!cellSatisfied(state, w, cx, cy, puzzle.cells[cy * w + cx] ?? null)) return false;
      }
    }
    return true;
  };
  const vertsOk = () => {
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        if (!vertexOk(state, w, px, py)) return false;
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
        const snap = cloneState(state);
        if (!first) first = snap;
        else if (!second) second = snap;
      }
      return count >= limit;
    }
    const { axis, index } = edges[i];
    for (const val of [1 /* On */, 2 /* Forbidden */]) {
      setEdge(state, axis, index, val);
      if (cellsOk() && vertsOk()) {
        if (dfs(i + 1)) {
          setEdge(state, axis, index, 0 /* Unknown */);
          return true;
        }
      }
    }
    setEdge(state, axis, index, 0 /* Unknown */);
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

// src/puzzles.ts
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 1831565813;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
var solutions = /* @__PURE__ */ new Map();
function hideBlanks(full, blankRatio, puzzle, rng) {
  if (blankRatio <= 0) return full.slice();
  const w = puzzle.width;
  const h = puzzle.height;
  const targetBlanks = Math.max(1, Math.floor(w * h * blankRatio));
  const order = full.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const cells = full.slice();
  const hidden = [];
  for (const idx of order) {
    if (hidden.length >= targetBlanks) break;
    if (cells[idx] === null) continue;
    cells[idx] = null;
    hidden.push(idx);
  }
  const test = { ...puzzle, cells };
  let c = countSolutions(test, 2, 25e4);
  while (c.timedOut === false && c.count > 1 && hidden.length) {
    const idx = hidden.pop();
    cells[idx] = full[idx];
    const t2 = { ...puzzle, cells };
    c = countSolutions(t2, 2, 25e4);
  }
  if (c.timedOut && hidden.length > 1) {
    while (hidden.length > 1) {
      const idx = hidden.pop();
      cells[idx] = full[idx];
    }
  }
  return cells;
}
function buildPuzzle(spec) {
  const { width: w, height: h, seed, fillRatio, blankRatio } = spec;
  for (let attempt = 0; attempt < 16; attempt++) {
    const rng = mulberry32(seed + attempt * 9973);
    const target = Math.max(3, Math.floor(w * h * fillRatio));
    const inSet = randomHoleFreePolyomino(w, h, target, rng);
    const { h: hOn, v: vOn } = loopFromPolyomino(w, h, inSet);
    const raw = numbersFromLoop(w, h, hOn, vOn);
    if (raw.some((n) => n > 3)) continue;
    const full = raw.map((n) => n);
    const base = {
      id: spec.id,
      name: spec.name,
      width: w,
      height: h,
      difficulty: spec.difficulty
    };
    const cells = blankRatio > 0 ? hideBlanks(full, blankRatio, base, rng) : full;
    const puzzle = { ...base, cells };
    solutions.set(puzzle.id, stateFromLoop(puzzle, hOn, vOn));
    return puzzle;
  }
  throw new Error(`failed to build puzzle ${spec.id}`);
}
function batch(prefix, label, width, height, difficulty, fillRatio, count, seedBase, blankRatio = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = String.fromCharCode(65 + i % 26) + (i >= 26 ? String(Math.floor(i / 26)) : "");
    out.push({
      id: `${prefix}-${n}`,
      name: `${label} ${n}${blankRatio > 0 ? " \xB7 \u7A7A\u767D" : ""}`,
      width,
      height,
      difficulty,
      seed: seedBase + i * 131,
      fillRatio,
      blankRatio
    });
  }
  return out;
}
var specs = [
  ...batch("easy-5x5", "\u5165\u95E8 \xB7 5\xD75", 5, 5, "easy", 0.38, 6, 20240501, 0),
  ...batch("medium-10x10", "\u8FDB\u9636 \xB7 10\xD710", 10, 10, "medium", 0.36, 5, 20240701, 0),
  ...batch("hard-10x10", "\u6311\u6218 \xB7 10\xD710", 10, 10, "hard", 0.28, 3, 20240901, 0),
  ...batch("easy-7x7", "\u4F11\u95F2 \xB7 7\xD77", 7, 7, "easy", 0.36, 4, 20241101, 0),
  ...batch("hard-8x8", "\u786C\u6838 \xB7 8\xD78", 8, 8, "hard", 0.26, 2, 20241201, 0),
  // 最高难度：25×25
  ...batch("expert-25x25", "\u4E13\u5BB6 \xB7 25\xD725", 25, 25, "hard", 0.22, 3, 20250601, 0),
  // 空白格：部分不显示数字，仍尽量保持唯一解
  ...batch("blank-5x5", "\u7A7A\u767D \xB7 5\xD75", 5, 5, "easy", 0.42, 3, 20250101, 0.16),
  ...batch("blank-7x7", "\u7A7A\u767D \xB7 7\xD77", 7, 7, "medium", 0.38, 2, 20250201, 0.18),
  ...batch("blank-10x10", "\u7A7A\u767D \xB7 10\xD710", 10, 10, "hard", 0.34, 2, 20250401, 0.12)
];
var puzzles = specs.map((s) => buildPuzzle(s));

// scripts/symmetry-test.mts
function rotateCW(p) {
  const w = p.width;
  const h = p.height;
  const cells = new Array(w * h).fill(null);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const ncx = h - 1 - cy;
      const ncy = cx;
      cells[ncy * h + ncx] = p.cells[cy * w + cx];
    }
  }
  return {
    id: p.id + "-rot",
    name: p.name,
    width: h,
    height: w,
    cells,
    difficulty: p.difficulty
  };
}
function flipH(p) {
  const w = p.width;
  const h = p.height;
  const cells = new Array(w * h).fill(null);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      cells[cy * w + (w - 1 - cx)] = p.cells[cy * w + cx];
    }
  }
  return { ...p, id: p.id + "-flip", cells };
}
function rotateSolution(src, w, h) {
  const w2 = h;
  const h2 = w;
  const outH = new Array((h2 + 1) * (w2 + 2)).fill(2 /* Forbidden */);
  const outV = new Array((h2 + 2) * (w2 + 1)).fill(2 /* Forbidden */);
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 0; hx < w; hx++) {
      const st = src.h[hIndex(w, hx + 1, hy)];
      const x = h - hy;
      const vy = hx + 1;
      outV[vIndex(w2, x, vy)] = st;
    }
  }
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const st = src.v[vIndex(w, vx, vy + 1)];
      const segX = h - vy - 1;
      const rowY = vx;
      outH[hIndex(w2, segX + 1, rowY)] = st;
    }
  }
  lockPads({
    puzzleId: "tmp",
    width: w2,
    height: h2,
    h: outH,
    v: outV
  });
  return { h: outH, v: outV };
}
function flipSolution(src, w, h) {
  const outH = new Array((h + 1) * (w + 2)).fill(2 /* Forbidden */);
  const outV = new Array((h + 2) * (w + 1)).fill(2 /* Forbidden */);
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 0; hx < w; hx++) {
      const st = src.h[hIndex(w, hx + 1, hy)];
      outH[hIndex(w, w - hx, hy)] = st;
    }
  }
  for (let vy = 0; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const st = src.v[vIndex(w, vx, vy)];
      if (vy === 0 || vy === h + 1) continue;
      outV[vIndex(w, w - vx, vy)] = st;
    }
  }
  lockPads({ puzzleId: "tmp", width: w, height: h, h: outH, v: outV });
  return { h: outH, v: outV };
}
function compare(label, a, b, w, h) {
  let diff = 0;
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      const i = hIndex(w, hx, hy);
      if (a.h[i] !== b.h[i]) {
        diff++;
        if (diff <= 5) console.log(`  ${label} h[${hx},${hy}] ${a.h[i]} vs ${b.h[i]}`);
      }
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const i = vIndex(w, vx, vy);
      if (a.v[i] !== b.v[i]) {
        diff++;
        if (diff <= 5) console.log(`  ${label} v[${vx},${vy}] ${a.v[i]} vs ${b.v[i]}`);
      }
    }
  }
  return diff;
}
var fail = 0;
var tested = 0;
for (const p of puzzles) {
  const { finalState: raw } = collectLogicSteps(p, createEmptyState(p));
  tested++;
  const pr = rotateCW(p);
  const { finalState: rot } = collectLogicSteps(pr, createEmptyState(pr));
  const mapped = rotateSolution(raw, p.width, p.height);
  const d1 = compare(`${p.id} CW`, mapped, rot, pr.width, pr.height);
  if (d1) {
    fail++;
    console.log(`FAIL ${p.id} CW diffs=${d1}`);
  }
  const pf = flipH(p);
  const { finalState: flip } = collectLogicSteps(pf, createEmptyState(pf));
  const mappedF = flipSolution(raw, p.width, p.height);
  const d2 = compare(`${p.id} H`, mappedF, flip, pf.width, pf.height);
  if (d2) {
    fail++;
    console.log(`FAIL ${p.id} HFlip diffs=${d2}`);
  }
}
console.log(`tested ${tested} puzzles \xD7 2 transforms`);
if (fail) {
  console.log("FAIL symmetry violations", fail);
  process.exitCode = 1;
} else {
  console.log("OK all rules equivariant under CW rotation and H flip");
}
