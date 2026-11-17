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

// src/validate.ts
function countOnAroundCell(state, w, cx, cy) {
  const e = cellEdges(w, cx, cy);
  let n = 0;
  if (edgeValue(state, "h", e.top) === 1 /* On */) n++;
  if (edgeValue(state, "h", e.bottom) === 1 /* On */) n++;
  if (edgeValue(state, "v", e.left) === 1 /* On */) n++;
  if (edgeValue(state, "v", e.right) === 1 /* On */) n++;
  return n;
}
function degreeAt(state, w, px, py) {
  const e = vertexEdges(w, px, py);
  let d = 0;
  if (edgeValue(state, "h", e.west) === 1 /* On */) d++;
  if (edgeValue(state, "h", e.east) === 1 /* On */) d++;
  if (edgeValue(state, "v", e.north) === 1 /* On */) d++;
  if (edgeValue(state, "v", e.south) === 1 /* On */) d++;
  return d;
}
function analyzeLoop(state, w, h) {
  const pts = allVertexPositions(w, h);
  let onEdgeCount = 0;
  for (const s of state.h) if (s === 1 /* On */) onEdgeCount++;
  for (const s of state.v) if (s === 1 /* On */) onEdgeCount++;
  if (onEdgeCount === 0) return { kind: "empty" };
  const key = (px, py) => py * (w + 1) + px;
  const adj = /* @__PURE__ */ new Map();
  for (const { px, py } of pts) {
    const e = vertexEdges(w, px, py);
    const nbrs = [];
    if (edgeValue(state, "h", e.west) === 1 /* On */ && px > 0) nbrs.push(key(px - 1, py));
    if (edgeValue(state, "h", e.east) === 1 /* On */ && px < w) nbrs.push(key(px + 1, py));
    if (edgeValue(state, "v", e.north) === 1 /* On */ && py > 0) nbrs.push(key(px, py - 1));
    if (edgeValue(state, "v", e.south) === 1 /* On */ && py < h) nbrs.push(key(px, py + 1));
    if (nbrs.length) adj.set(key(px, py), nbrs);
  }
  for (const { px, py } of pts) {
    const d = degreeAt(state, w, px, py);
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
function validate(state, puzzle) {
  const w = puzzle.width;
  const h = puzzle.height;
  const badPoints = [];
  const badCells = [];
  for (const { px, py } of allVertexPositions(w, h)) {
    const d = degreeAt(state, w, px, py);
    if (d === 1 || d >= 3) {
      badPoints.push({ px, py, degree: d });
    }
  }
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const expected = puzzle.cells[cy * w + cx];
      if (expected === null) continue;
      const actual = countOnAroundCell(state, w, cx, cy);
      if (actual !== expected) {
        badCells.push({ cx, cy, expected, actual });
      }
    }
  }
  const loop = analyzeLoop(state, w, h);
  const solved = badPoints.length === 0 && badCells.length === 0 && loop.kind === "single";
  return { badPoints, badCells, loop, solved };
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
var DSU = class {
  parent;
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    let r = x;
    while (this.parent[r] !== r) r = this.parent[r];
    while (this.parent[x] !== r) {
      const nx = this.parent[x];
      this.parent[x] = r;
      x = nx;
    }
    return r;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
};
function neighborPairs(w, h) {
  const nCols = w + 2;
  const nRows = h + 2;
  const pairs = [];
  for (let pcy = 0; pcy < nRows; pcy++) {
    for (let pcx = 0; pcx < nCols; pcx++) {
      if (pcx + 1 < nCols) {
        const e = sharedEdgeBetween(w, h, pcx, pcy, pcx + 1, pcy);
        pairs.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx + 1, pcy), e });
      }
      if (pcy + 1 < nRows) {
        const e = sharedEdgeBetween(w, h, pcx, pcy, pcx, pcy + 1);
        pairs.push({ a: padIndex(w, pcx, pcy), b: padIndex(w, pcx, pcy + 1), e });
      }
    }
  }
  return pairs;
}
function collapseColors(puzzle, state) {
  const w = puzzle.width;
  const h = puzzle.height;
  const nCols = w + 2;
  const nRows = h + 2;
  const N = nCols * nRows;
  const mark = new Array(N);
  const fixed = new Array(N).fill(false);
  for (let i = 0; i < N; i++) mark[i] = 10 + i;
  for (let pcx = 0; pcx < nCols; pcx++) {
    for (const pcy of [0, nRows - 1]) {
      const i = padIndex(w, pcx, pcy);
      mark[i] = COLOR_OUT;
      fixed[i] = true;
    }
  }
  for (let pcy = 0; pcy < nRows; pcy++) {
    for (const pcx of [0, nCols - 1]) {
      const i = padIndex(w, pcx, pcy);
      mark[i] = COLOR_OUT;
      fixed[i] = true;
    }
  }
  let conflict = false;
  const forced = [];
  const flip = (c) => c === COLOR_OUT ? COLOR_IN : c === COLOR_IN ? COLOR_OUT : c;
  for (let round = 0; round < N + 4; round++) {
    const dsu = new DSU(N);
    for (const { a, b, e } of neighborPairs(w, h)) {
      if (!e) continue;
      const v = edgeValue(state, e.axis, e.index);
      if (v === 2 /* Forbidden */) dsu.union(a, b);
    }
    const classMark = /* @__PURE__ */ new Map();
    const classFixed = /* @__PURE__ */ new Map();
    for (let i = 0; i < N; i++) {
      const r = dsu.find(i);
      if (mark[i] === COLOR_OUT || mark[i] === COLOR_IN) {
        const prev = classMark.get(r);
        if (prev !== void 0 && prev !== mark[i] && (prev === COLOR_OUT || prev === COLOR_IN)) {
          if (prev !== mark[i]) conflict = true;
        }
        classMark.set(r, mark[i]);
        classFixed.set(r, true);
      } else if (!classMark.has(r)) {
        classMark.set(r, mark[i]);
        classFixed.set(r, false);
      }
    }
    const onClass = [];
    for (const { a, b, e } of neighborPairs(w, h)) {
      if (!e) continue;
      if (edgeValue(state, e.axis, e.index) !== 1 /* On */) continue;
      onClass.push({ a: dsu.find(a), b: dsu.find(b) });
    }
    const adj = /* @__PURE__ */ new Map();
    for (const { a, b } of onClass) {
      if (a === b) {
        conflict = true;
        continue;
      }
      const la = adj.get(a) ?? [];
      la.push(b);
      adj.set(a, la);
      const lb = adj.get(b) ?? [];
      lb.push(a);
      adj.set(b, lb);
    }
    const queue = [];
    for (const r of classMark.keys()) {
      if (classFixed.get(r)) queue.push(r);
    }
    const seen = new Set(queue);
    while (queue.length) {
      const r = queue.pop();
      const c0 = classMark.get(r);
      const nc = flip(c0);
      if (nc !== COLOR_OUT && nc !== COLOR_IN) continue;
      for (const nb of adj.get(r) ?? []) {
        const prev = classMark.get(nb);
        if (prev === COLOR_OUT || prev === COLOR_IN) {
          if (prev !== nc) conflict = true;
        } else {
          classMark.set(nb, nc);
          classFixed.set(nb, true);
          if (!seen.has(nb)) {
            seen.add(nb);
            queue.push(nb);
          }
        }
      }
    }
    let changed = false;
    for (let i = 0; i < N; i++) {
      const r = dsu.find(i);
      const cm = classMark.get(r);
      const was = mark[i];
      const wasFixed = fixed[i];
      if (cm === COLOR_OUT || cm === COLOR_IN) {
        if (was !== cm) {
          if (wasFixed && was !== cm) conflict = true;
          mark[i] = cm;
          fixed[i] = true;
          changed = true;
        }
      }
    }
    const cav = applyCavities(w, h, mark, fixed, state);
    if (cav.conflict) conflict = true;
    if (cav.forced.length) {
      changed = true;
      for (const f of cav.forced) {
        forced.push(f);
        mark[f.i] = f.to;
        fixed[f.i] = true;
      }
    }
    const bridge = applyNarrowBridge(w, h, mark, state);
    if (bridge.conflict) conflict = true;
    if (bridge.forced.length) {
      changed = true;
      for (const f of bridge.forced) {
        forced.push(f);
        mark[f.i] = f.to;
        fixed[f.i] = true;
      }
    }
    if (!changed || conflict) break;
  }
  return { mark, fixed, conflict, forced };
}
function applyCavities(w, h, mark, fixed, state) {
  const nCols = w + 2;
  const nRows = h + 2;
  const N = nCols * nRows;
  const forced = [];
  let conflict = false;
  const colorOf = (i) => {
    const m = mark[i];
    return m === COLOR_OUT || m === COLOR_IN ? m : COLOR_UNK;
  };
  const neigh = (i) => {
    const pcx = i % nCols;
    const pcy = Math.floor(i / nCols);
    const out = [];
    for (const [nx, ny] of [
      [pcx + 1, pcy],
      [pcx - 1, pcy],
      [pcx, pcy + 1],
      [pcx, pcy - 1]
    ]) {
      if (nx < 0 || ny < 0 || nx >= nCols || ny >= nRows) continue;
      const e = sharedEdgeBetween(w, h, pcx, pcy, nx, ny);
      if (e && edgeValue(state, e.axis, e.index) === 1 /* On */) continue;
      out.push(padIndex(w, nx, ny));
    }
    return out;
  };
  const visited = new Uint8Array(N);
  const cavities = [];
  for (let s = 0; s < N; s++) {
    if (visited[s]) continue;
    const sc = colorOf(s);
    if (sc === COLOR_OUT || sc === COLOR_IN) continue;
    const comp = [];
    const stack = [s];
    visited[s] = 1;
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      for (const nb of neigh(cur)) {
        if (visited[nb]) continue;
        const nc = colorOf(nb);
        if (nc === COLOR_OUT || nc === COLOR_IN) continue;
        visited[nb] = 1;
        stack.push(nb);
      }
    }
    let surround = COLOR_UNK;
    let mixed = false;
    let hasIn = false;
    let hasOut = false;
    for (const c of comp) {
      const m = mark[c];
      if (m === COLOR_IN) hasIn = true;
      if (m === COLOR_OUT) hasOut = true;
      for (const nb of neigh(c)) {
        const nc = colorOf(nb);
        if (nc === COLOR_OUT || nc === COLOR_IN) {
          if (surround === COLOR_UNK) surround = nc;
          else if (surround !== nc) mixed = true;
        }
      }
    }
    if (mixed || surround === COLOR_UNK) continue;
    cavities.push({ cells: comp, surround, hasIn, hasOut });
  }
  for (const cav of cavities) {
    if (cav.surround === COLOR_IN) {
      for (const i of cav.cells) {
        if (colorOf(i) === COLOR_IN) continue;
        if (fixed[i] && mark[i] !== COLOR_IN) {
          conflict = true;
          continue;
        }
        forced.push({ i, to: COLOR_IN });
      }
    }
  }
  const outCavs = cavities.filter((c) => c.surround === COLOR_OUT);
  if (outCavs.length >= 2) {
    const withIn = outCavs.filter((c) => c.hasIn || c.cells.some((i) => mark[i] === COLOR_IN));
    const rest = outCavs.filter((c) => !withIn.includes(c));
    if (withIn.length >= 1) {
      for (const cav of rest) {
        for (const i of cav.cells) {
          if (colorOf(i) === COLOR_OUT) continue;
          if (fixed[i] && mark[i] !== COLOR_OUT) {
            conflict = true;
            continue;
          }
          forced.push({ i, to: COLOR_OUT });
        }
      }
    } else {
      const canFill = [];
      for (let ci = 0; ci < outCavs.length; ci++) {
        const cav = outCavs[ci];
        let ok = true;
        for (const i of cav.cells) {
          if (fixed[i] && mark[i] !== COLOR_OUT) ok = false;
        }
        if (ok) canFill.push(ci);
      }
      if (canFill.length === 1) {
        const cav = outCavs[canFill[0]];
        for (const i of cav.cells) {
          if (colorOf(i) === COLOR_OUT) continue;
          forced.push({ i, to: COLOR_OUT });
        }
      }
    }
  }
  return { forced, conflict };
}
function applyNarrowBridge(w, h, mark, state) {
  const nCols = w + 2;
  const nRows = h + 2;
  const N = nCols * nRows;
  const forced = [];
  let conflict = false;
  const colorOf = (i) => {
    const m = mark[i];
    return m === COLOR_OUT || m === COLOR_IN ? m : COLOR_UNK;
  };
  const adj = new Array(N);
  for (let pcy = 0; pcy < nRows; pcy++) {
    for (let pcx = 0; pcx < nCols; pcx++) {
      const out = [];
      for (const [nx, ny] of [
        [pcx + 1, pcy],
        [pcx - 1, pcy],
        [pcx, pcy + 1],
        [pcx, pcy - 1]
      ]) {
        if (nx < 0 || ny < 0 || nx >= nCols || ny >= nRows) continue;
        const e = sharedEdgeBetween(w, h, pcx, pcy, nx, ny);
        if (e && edgeValue(state, e.axis, e.index) === 1 /* On */) continue;
        out.push(ny * nCols + nx);
      }
      adj[pcy * nCols + pcx] = out;
    }
  }
  const forColor = (target) => {
    const other = target === COLOR_IN ? COLOR_OUT : COLOR_IN;
    const inSet = new Uint8Array(N);
    let total = 0;
    for (let i = 0; i < N; i++) {
      if (colorOf(i) === target) {
        inSet[i] = 1;
        total++;
      }
    }
    if (total < 2) return;
    const disc = new Array(N).fill(-1);
    const low = new Array(N).fill(-1);
    const sub = new Array(N).fill(0);
    const sep = new Array(N).fill(0);
    const isBridge = new Uint8Array(N);
    let compsWithTarget = 0;
    let timer = 0;
    const dfs = (u, parent) => {
      disc[u] = low[u] = timer++;
      sub[u] = inSet[u] ? 1 : 0;
      for (const v of adj[u]) {
        if (colorOf(v) === other) continue;
        if (v === parent) continue;
        if (disc[v] === -1) {
          dfs(v, u);
          sub[u] += sub[v];
          if (low[v] < low[u]) low[u] = low[v];
          if (low[v] >= disc[u] && sub[v] > 0) sep[u]++;
        } else if (disc[v] < low[u]) {
          low[u] = disc[v];
        }
      }
      const parts = (total - sub[u] > 0 ? 1 : 0) + sep[u];
      if (parts >= 2) isBridge[u] = 1;
    };
    for (let i = 0; i < N; i++) {
      if (colorOf(i) === other) continue;
      if (disc[i] !== -1) continue;
      dfs(i, -1);
      if (sub[i] > 0) compsWithTarget++;
    }
    if (compsWithTarget >= 2) conflict = true;
    for (let b = 0; b < N; b++) {
      if (!isBridge[b]) continue;
      if (colorOf(b) === target) continue;
      forced.push({ i: b, to: target });
    }
  };
  forColor(COLOR_IN);
  forColor(COLOR_OUT);
  return { forced, conflict };
}
function probeEdge(puzzle, state, axis, index, to) {
  const old = edgeValue(state, axis, index);
  if (axis === "h") state.h[index] = to;
  else state.v[index] = to;
  const a = collapseColors(puzzle, state);
  let completes = false;
  if (!a.conflict) {
    completes = validate(state, puzzle).solved;
  }
  if (axis === "h") state.h[index] = old;
  else state.v[index] = old;
  if (a.conflict) return { ok: false, reason: "collapse-conflict" };
  if (a.forced.length === 0 && !completes) {
    return { ok: true };
  }
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
                const cellSides2 = [
                  { axis: "h", index: e.top },
                  { axis: "h", index: e.bottom },
                  { axis: "v", index: e.left },
                  { axis: "v", index: e.right }
                ];
                for (const s of cellSides2) {
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
  const applyRule2c = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)];
        if (n !== 2) continue;
        const ci = cellMaskIndex(w, cx, cy);
        if (masks.cells[ci]) continue;
        const e = cellEdges(w, cx, cy);
        const corners = [
          {
            px: cx,
            py: cy,
            at: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.left }
            ],
            far: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.right }
            ]
          },
          {
            px: cx + 1,
            py: cy,
            at: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.right }
            ],
            far: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.left }
            ]
          },
          {
            px: cx,
            py: cy + 1,
            at: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.left }
            ],
            far: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.right }
            ]
          },
          {
            px: cx + 1,
            py: cy + 1,
            at: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.right }
            ],
            far: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.left }
            ]
          }
        ];
        const isOneOnOneOff = (arr) => {
          const a = edgeValue(work, arr[0].axis, arr[0].index);
          const b = edgeValue(work, arr[1].axis, arr[1].index);
          return a === 1 /* On */ && b === 2 /* Forbidden */ || a === 2 /* Forbidden */ && b === 1 /* On */;
        };
        const forcePair = (arr, px, py, label) => {
          const a = edgeValue(work, arr[0].axis, arr[0].index);
          const b = edgeValue(work, arr[1].axis, arr[1].index);
          const acc = [];
          if (a === 1 /* On */ && b === 0 /* Unknown */) {
            trySet(arr[1].axis, arr[1].index, 2 /* Forbidden */, acc);
          } else if (a === 2 /* Forbidden */ && b === 0 /* Unknown */) {
            trySet(arr[1].axis, arr[1].index, 1 /* On */, acc);
          } else if (b === 1 /* On */ && a === 0 /* Unknown */) {
            trySet(arr[0].axis, arr[0].index, 2 /* Forbidden */, acc);
          } else if (b === 2 /* Forbidden */ && a === 0 /* Unknown */) {
            trySet(arr[0].axis, arr[0].index, 1 /* On */, acc);
          }
          if (acc.length) {
            flush(3, `\u89C4\u52193\uFF1A\u6570\u5B572\u89D2(${px},${py}) ${label} \u4E00\u53C9\u4E00\u73AF\u5BF9\u5E94`, acc);
          }
        };
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
          const atKeys = new Set(c.at.map((s) => `${s.axis}:${s.index}`));
          const outer = all.filter((s) => !atKeys.has(`${s.axis}:${s.index}`));
          if (isOneOnOneOff(outer)) {
            forcePair(c.far, c.px, c.py, "\u5916\u8FB9\u2192\u5BF9\u8FB9");
          }
          if (isOneOnOneOff(c.far)) {
            forcePair(outer, c.px, c.py, "\u5BF9\u8FB9\u2192\u5916\u8FB9");
          }
        }
      }
    }
  };
  const applyRule4c = () => {
    for (let y2 = 0; y2 < h; y2++) {
      for (let x2 = 0; x2 < w; x2++) {
        if (puzzle.cells[cellMaskIndex(w, x2, y2)] !== 2) continue;
        const cases = [
          {
            x3: x2 + 1,
            y3: y2 + 1,
            farPx: [x2, y2],
            threeFar: (e) => [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.right }
            ],
            twoAtFar: (e) => [
              { axis: "h", index: e.top },
              { axis: "v", index: e.left }
            ]
          },
          {
            // 3 在 2 左下方：公共顶点 Vc = 2 的左下角 (x2, y2+1)；
            // 2 的对角顶点 = 右上角 (x2+1, y2)
            x3: x2 - 1,
            y3: y2 + 1,
            farPx: [x2 + 1, y2],
            threeFar: (e) => [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.left }
            ],
            twoAtFar: (e) => [
              { axis: "h", index: e.top },
              { axis: "v", index: e.right }
            ]
          },
          {
            // 3 在 2 右上方：公共顶点 Vc = 2 的右上角 (x2+1, y2)；
            // 2 的对角顶点 = 左下角 (x2, y2+1)
            x3: x2 + 1,
            y3: y2 - 1,
            farPx: [x2, y2 + 1],
            threeFar: (e) => [
              { axis: "h", index: e.top },
              { axis: "v", index: e.right }
            ],
            twoAtFar: (e) => [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.left }
            ]
          },
          {
            // 3 在 2 左上方：公共顶点 Vc = 2 的左上角 (x2, y2)；
            // 2 的对角顶点 = 右下角 (x2+1, y2+1)
            x3: x2 - 1,
            y3: y2 - 1,
            farPx: [x2 + 1, y2 + 1],
            threeFar: (e) => [
              { axis: "h", index: e.top },
              { axis: "v", index: e.left }
            ],
            twoAtFar: (e) => [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.right }
            ]
          }
        ];
        for (const c of cases) {
          if (c.x3 < 0 || c.y3 < 0 || c.x3 >= w || c.y3 >= h) continue;
          if (puzzle.cells[cellMaskIndex(w, c.x3, c.y3)] !== 3) continue;
          const e2 = cellEdges(w, x2, y2);
          const e3 = cellEdges(w, c.x3, c.y3);
          const [fpx, fpy] = c.farPx;
          const farVe = vertexEdges(w, fpx, fpy);
          const farAll = [
            { axis: "h", index: farVe.west },
            { axis: "h", index: farVe.east },
            { axis: "v", index: farVe.north },
            { axis: "v", index: farVe.south }
          ];
          const farInnerKeys = new Set(c.twoAtFar(e2).map((s) => `${s.axis}:${s.index}`));
          const farInner = farAll.filter((s) => farInnerKeys.has(`${s.axis}:${s.index}`));
          const farOuter = farAll.filter((s) => !farInnerKeys.has(`${s.axis}:${s.index}`));
          if (farInner.length !== 2 || farOuter.length !== 2) continue;
          {
            const a = edgeValue(work, farOuter[0].axis, farOuter[0].index);
            const b = edgeValue(work, farOuter[1].axis, farOuter[1].index);
            const acc2 = [];
            if (a === 1 /* On */ && b === 0 /* Unknown */) {
              trySet(farOuter[1].axis, farOuter[1].index, 2 /* Forbidden */, acc2);
            } else if (b === 1 /* On */ && a === 0 /* Unknown */) {
              trySet(farOuter[0].axis, farOuter[0].index, 2 /* Forbidden */, acc2);
            }
            if (acc2.length) {
              flush(4, `\u89C4\u52194C\uFF1A2\u89D2(${fpx},${fpy}) \u5916\u8FB9\u4E00\u73AF \u2192 \u53E6\u4E00\u5916\u8FB9\u6392\u9664`, acc2);
            }
          }
          {
            const a = edgeValue(work, farInner[0].axis, farInner[0].index);
            const b = edgeValue(work, farInner[1].axis, farInner[1].index);
            const acc2 = [];
            if (a === 2 /* Forbidden */ && b === 0 /* Unknown */) {
              trySet(farInner[1].axis, farInner[1].index, 1 /* On */, acc2);
            } else if (b === 2 /* Forbidden */ && a === 0 /* Unknown */) {
              trySet(farInner[0].axis, farInner[0].index, 1 /* On */, acc2);
            }
            if (acc2.length) {
              flush(4, `\u89C4\u52194C\uFF1A2\u89D2(${fpx},${fpy}) \u5185\u8FB9\u4E00\u53C9 \u2192 \u53E6\u4E00\u5185\u8FB9\u843D\u73AF`, acc2);
            }
          }
          const hasOnOuter = farOuter.some((s) => edgeValue(work, s.axis, s.index) === 1 /* On */);
          const hasOffInner = farInner.some((s) => edgeValue(work, s.axis, s.index) === 2 /* Forbidden */);
          if (!hasOnOuter && !hasOffInner) continue;
          const acc = [];
          for (const s of c.threeFar(e3)) {
            trySet(s.axis, s.index, 1 /* On */, acc);
          }
          if (acc.length) {
            flush(
              4,
              `\u89C4\u52194C\uFF1A\u659C\u89D223 (${x2},${y2})-(${c.x3},${c.y3}) \u2192 3 \u5BF9\u8FB9\u843D\u73AF`,
              acc
            );
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
          if (offOn.length === 1) {
            const acc = [];
            for (const s of offCell) {
              if (edgeValue(work, s.axis, s.index) === 1 /* On */) continue;
              trySet(s.axis, s.index, 2 /* Forbidden */, acc);
            }
            const cellSides2 = [
              { axis: "h", index: e.top },
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.left },
              { axis: "v", index: e.right }
            ];
            for (const s of cellSides2) {
              if (!atVertex.has(`${s.axis}:${s.index}`)) {
                trySet(s.axis, s.index, 1 /* On */, acc);
              }
            }
            if (acc.length) {
              flush(4, `\u89C4\u52194A\uFF1A\u6570\u5B573\u89D2(${c.px},${c.py})\u5916\u8FB9\u5165\u73AF \u2192 \u5BF9\u8FB9\u5728\u73AF\u4E0A`, acc);
            }
            continue;
          }
          const offOff = offCell.filter((s) => edgeValue(work, s.axis, s.index) === 2 /* Forbidden */);
          if (offOff.length === 2) {
            const acc = [];
            for (const s of c.onCell) {
              trySet(s.axis, s.index, 1 /* On */, acc);
            }
            if (acc.length) {
              flush(
                4,
                `\u89C4\u52194B\uFF1A\u6570\u5B573\u89D2(${c.px},${c.py})\u4E24\u5916\u8FB9\xD7 \u2192 \u8BE5\u89D2\u4E24\u8FB9\u843D\u73AF`,
                acc
              );
            }
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
            flush(
              5,
              `\u89C4\u52195\uFF1A\u70B9(${px},${py})\u5DF2 2 \u73AF\u8FB9 \u2192 \u4F59\u8FB9\u6392\u9664\u5E76\u63A9\u7801`,
              acc,
              [],
              [vi],
              all.map((s) => ({ axis: s.axis, index: s.index }))
            );
            continue;
          }
        }
        if (off === 3 && unk > 0) {
          const acc = [];
          for (const s of all) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          if (acc.length) {
            flush(
              5,
              `\u89C4\u52195\uFF1A\u70B9(${px},${py})\u5DF2 3 \u6392\u9664 \u2192 \u5269\u4F59\u6392\u9664\u5E76\u63A9\u7801`,
              acc,
              [],
              [vi],
              all.map((s) => ({ axis: s.axis, index: s.index }))
            );
            continue;
          }
        }
        if (off === 2 && on === 1 && unk === 1) {
          const acc = [];
          for (const s of all) trySet(s.axis, s.index, 1 /* On */, acc);
          if (acc.length) {
            flush(
              5,
              `\u89C4\u52195\uFF1A\u70B9(${px},${py}) 2\u6392\u9664+1\u73AF \u2192 \u5269\u4F59\u5728\u73AF\u4E0A\u5E76\u63A9\u7801`,
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
              flush(6, `\u89C4\u52196\uFF1A1-1 \u5916\u5411\u6392\u9664 \u2192 \u5171\u4EAB\u8FB9\u6392\u9664`, acc);
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
              flush(6, `\u89C4\u52196\uFF1A1-1 \u5916\u5411\u6392\u9664 \u2192 \u5171\u4EAB\u8FB9\u6392\u9664`, acc);
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
      if (dir === "H") {
        trySet("v", g.a.left, 1 /* On */, acc);
        trySet("v", g.b.right, 1 /* On */, acc);
      } else {
        trySet("h", g.a.top, 1 /* On */, acc);
        trySet("h", g.b.bottom, 1 /* On */, acc);
      }
      if (acc.length) {
        flush(7, `\u89C4\u52197\uFF1A\u53CC3 \u5916\u5411\xD7 + \u5404\u81EA\u5916\u4FA7\u5BF9\u8FB9\u843D\u73AF\uFF08\u5171\u4EAB\u8FB9\u4E0D\u5B9A\uFF09`, acc);
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
  const applyRule12 = () => {
    const vCount = (w + 1) * (h + 1);
    const parent = new Int32Array(vCount);
    for (let i = 0; i < vCount; i++) parent[i] = i;
    const find = (x) => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) {
        const nx = parent[x];
        parent[x] = r;
        x = nx;
      }
      return r;
    };
    const onEdges = [];
    const real = [];
    for (let hy = 0; hy <= h; hy++) {
      for (let hx = 1; hx <= w; hx++) real.push({ axis: "h", index: hIndex(w, hx, hy) });
    }
    for (let vy = 1; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) real.push({ axis: "v", index: vIndex(w, vx, vy) });
    }
    for (const s of real) {
      if (edgeValue(work, s.axis, s.index) === 1 /* On */) onEdges.push(s);
    }
    if (!onEdges.length) return;
    let cycleEdge = null;
    const usedVertex = /* @__PURE__ */ new Set();
    for (const s of onEdges) {
      let a;
      let b;
      if (s.axis === "h") {
        const hy = Math.floor(s.index / hWidth(w));
        const hx = s.index % hWidth(w);
        a = hy * (w + 1) + (hx - 1);
        b = hy * (w + 1) + hx;
      } else {
        const vy = Math.floor(s.index / (w + 1));
        const vx = s.index % (w + 1);
        a = (vy - 1) * (w + 1) + vx;
        b = vy * (w + 1) + vx;
      }
      usedVertex.add(a);
      usedVertex.add(b);
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) cycleEdge = s;
      else parent[ra] = rb;
    }
    if (!cycleEdge) return;
    const deg = /* @__PURE__ */ new Map();
    for (const s of onEdges) {
      let a;
      let b;
      if (s.axis === "h") {
        const hy = Math.floor(s.index / hWidth(w));
        const hx = s.index % hWidth(w);
        a = hy * (w + 1) + (hx - 1);
        b = hy * (w + 1) + hx;
      } else {
        const vy = Math.floor(s.index / (w + 1));
        const vx = s.index % (w + 1);
        a = (vy - 1) * (w + 1) + vx;
        b = vy * (w + 1) + vx;
      }
      deg.set(a, (deg.get(a) ?? 0) + 1);
      deg.set(b, (deg.get(b) ?? 0) + 1);
    }
    const allDeg2 = [...deg.values()].every((d) => d === 2);
    const singleComponent = onEdges.length === usedVertex.size;
    if (!allDeg2 || !singleComponent) return;
    const acc = [];
    for (const s of real) {
      trySet(s.axis, s.index, 2 /* Forbidden */, acc);
    }
    if (acc.length) {
      flush(12, `\u89C4\u521912\uFF1A\u5DF2\u786E\u5B9A\u7684\u73AF\u8FB9\u81EA\u8EAB\u95ED\u5408\u6210\u73AF\uFF08\u5355\u73AF\uFF09\u2192 \u5176\u4F59\u8FB9\u5168\u90E8\u6392\u9664`, acc);
    }
  };
  const applyRule13 = () => {
    const dirs = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ];
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const nA = puzzle.cells[cellMaskIndex(w, cx, cy)];
        if (nA !== 0) continue;
        for (const [dx, dy] of dirs) {
          const bx = cx + dx;
          const by = cy + dy;
          if (bx < 0 || by < 0 || bx >= w || by >= h) continue;
          if (puzzle.cells[cellMaskIndex(w, bx, by)] !== 3) continue;
          const sx = cx + (dx > 0 ? 1 : 0);
          const sy = cy + (dy > 0 ? 1 : 0);
          const ve = vertexEdges(w, sx, sy);
          const vertexAll = [
            { axis: "h", index: ve.west },
            { axis: "h", index: ve.east },
            { axis: "v", index: ve.north },
            { axis: "v", index: ve.south }
          ];
          const eb = cellEdges(w, bx, by);
          const bKeys = new Set(
            [
              { axis: "h", index: eb.top },
              { axis: "h", index: eb.bottom },
              { axis: "v", index: eb.left },
              { axis: "v", index: eb.right }
            ].map((s) => `${s.axis}:${s.index}`)
          );
          const inner = vertexAll.filter((s) => bKeys.has(`${s.axis}:${s.index}`));
          if (inner.length !== 2) continue;
          const acc = [];
          for (const s of inner) trySet(s.axis, s.index, 1 /* On */, acc);
          if (acc.length) {
            flush(
              13,
              `\u89C4\u521913\uFF1A\u5BF9\u89D2 0-3 (${cx},${cy})-(${bx},${by}) \u2192 3 \u683C\u5728\u516C\u5171\u9876\u70B9\u7684\u4E24\u6761\u8FB9\u843D\u73AF`,
              acc
            );
          }
        }
      }
    }
  };
  const applyRule14 = () => {
    const seen = /* @__PURE__ */ new Set();
    const runPair = (ax, ay, bx, by, shared, outer, nA, nB) => {
      let outMin = 0;
      let outMax = 0;
      const pending = [];
      for (const s of outer) {
        const v = edgeValue(work, s.axis, s.index);
        if (v === 1 /* On */) outMin++;
        else if (v === 2 /* Forbidden */) continue;
        else pending.push(s);
        outMax++;
      }
      const sum = nA + nB;
      const sVal = edgeValue(work, shared.axis, shared.index);
      const acc = [];
      if (sVal === 0 /* Unknown */) {
        const okOff = sum >= outMin && sum <= outMax;
        const okOn = sum - 2 >= outMin && sum - 2 <= outMax;
        if (!okOff && !okOn) {
        } else if (okOff && !okOn) {
          trySet(shared.axis, shared.index, 2 /* Forbidden */, acc);
        } else if (!okOff && okOn) {
          trySet(shared.axis, shared.index, 1 /* On */, acc);
        }
        if (acc.length) {
          flush(
            14,
            `\u89C4\u521914\uFF1A\u76F8\u90BB\u4E24\u683C(${ax},${ay})=${nA} \u4E0E (${bx},${by})=${nB}\uFF1A\u516C\u5171\u8FB9\u53EA\u80FD\u53D6${acc[0].to === 1 /* On */ ? "\u73AF" : "\u53C9"}\uFF08\u5916\u56F4\u8FB9\u53EF\u8FBE ${outMin}..${outMax}\uFF0C\u9700\u8981 ${sum} \u6216 ${sum - 2}\uFF09`,
            acc
          );
        }
        return;
      }
      const outOn = sum - (sVal === 1 /* On */ ? 2 : 0);
      if (outOn < outMin || outOn > outMax) return;
      if (!pending.length) return;
      if (outOn === outMax) {
        for (const s of pending) trySet(s.axis, s.index, 1 /* On */, acc);
      } else if (outOn === outMin) {
        for (const s of pending) trySet(s.axis, s.index, 2 /* Forbidden */, acc);
      }
      if (acc.length) {
        flush(
          14,
          `\u89C4\u521914\uFF1A\u76F8\u90BB\u4E24\u683C(${ax},${ay})=${nA} \u4E0E (${bx},${by})=${nB}\uFF1A\u516C\u5171\u8FB9\u5DF2\u5B9A\uFF0C\u5916\u56F4\u8FB9\u9700 ${outOn} \u6761 \u2192 \u5269\u4F59\u5916\u56F4\u8FB9${outOn === outMax ? "\u843D\u73AF" : "\u6392\u9664"}`,
          acc
        );
      }
    };
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const nA = puzzle.cells[cellMaskIndex(w, cx, cy)];
        if (nA === null || nA === void 0) continue;
        if (cx + 1 < w) {
          const nB = puzzle.cells[cellMaskIndex(w, cx + 1, cy)];
          if (nB !== null && nB !== void 0) {
            const key = `H:${cx}:${cy}`;
            if (!seen.has(key)) {
              seen.add(key);
              const ea = cellEdges(w, cx, cy);
              const eb = cellEdges(w, cx + 1, cy);
              runPair(
                cx,
                cy,
                cx + 1,
                cy,
                { axis: "v", index: ea.right },
                [
                  { axis: "h", index: ea.top },
                  { axis: "h", index: ea.bottom },
                  { axis: "v", index: ea.left },
                  { axis: "h", index: eb.top },
                  { axis: "h", index: eb.bottom },
                  { axis: "v", index: eb.right }
                ],
                nA,
                nB
              );
            }
          }
        }
        if (cy + 1 < h) {
          const nB = puzzle.cells[cellMaskIndex(w, cx, cy + 1)];
          if (nB !== null && nB !== void 0) {
            const key = `V:${cx}:${cy}`;
            if (!seen.has(key)) {
              seen.add(key);
              const ea = cellEdges(w, cx, cy);
              const eb = cellEdges(w, cx, cy + 1);
              runPair(
                cx,
                cy,
                cx,
                cy + 1,
                { axis: "h", index: ea.bottom },
                [
                  { axis: "h", index: ea.top },
                  { axis: "v", index: ea.left },
                  { axis: "v", index: ea.right },
                  { axis: "h", index: eb.bottom },
                  { axis: "v", index: eb.left },
                  { axis: "v", index: eb.right }
                ],
                nA,
                nB
              );
            }
          }
        }
      }
    }
  };
  const applyRule15 = () => {
    const edgeList = [];
    const idOf = /* @__PURE__ */ new Map();
    const addEdge = (s) => {
      const k = `${s.axis}:${s.index}`;
      if (!idOf.has(k)) {
        idOf.set(k, edgeList.length);
        edgeList.push(s);
      }
    };
    for (let hy = 0; hy <= h; hy++) {
      for (let hx = 1; hx <= w; hx++) addEdge({ axis: "h", index: hIndex(w, hx, hy) });
    }
    for (let vy = 1; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) addEdge({ axis: "v", index: vIndex(w, vx, vy) });
    }
    const N = edgeList.length;
    const parent = new Int32Array(N);
    const diff = new Uint8Array(N);
    for (let i = 0; i < N; i++) parent[i] = i;
    const find = (x) => {
      if (parent[x] === x) return x;
      const p = parent[x];
      const r = find(p);
      diff[x] = diff[x] ^ diff[p];
      parent[x] = r;
      return r;
    };
    const union = (a, b, p) => {
      const ra = find(a);
      const rb = find(b);
      const pa = diff[a];
      const pb = diff[b];
      if (ra === rb) return (pa ^ pb) === p;
      parent[ra] = rb;
      diff[ra] = pa ^ pb ^ p;
      return true;
    };
    const addXor = (s1, s2, p) => {
      const a = idOf.get(`${s1.axis}:${s1.index}`);
      const b = idOf.get(`${s2.axis}:${s2.index}`);
      if (a === void 0 || b === void 0) return;
      union(a, b, p);
    };
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        const ve = vertexEdges(w, px, py);
        const all = [
          { axis: "h", index: ve.west },
          { axis: "h", index: ve.east },
          { axis: "v", index: ve.north },
          { axis: "v", index: ve.south }
        ];
        let on = 0;
        let off = 0;
        const unk = [];
        for (const s of all) {
          const v = edgeValue(work, s.axis, s.index);
          if (v === 1 /* On */) on++;
          else if (v === 2 /* Forbidden */) off++;
          else unk.push(s);
        }
        if (on === 1 && unk.length === 2) addXor(unk[0], unk[1], 1);
        else if (on === 0 && off === 2 && unk.length === 2) addXor(unk[0], unk[1], 0);
      }
    }
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const n = puzzle.cells[cellMaskIndex(w, cx, cy)];
        if (n === null || n === void 0) continue;
        const e = cellEdges(w, cx, cy);
        const all = [
          { axis: "h", index: e.top },
          { axis: "h", index: e.bottom },
          { axis: "v", index: e.left },
          { axis: "v", index: e.right }
        ];
        let on = 0;
        const unk = [];
        for (const s of all) {
          const v = edgeValue(work, s.axis, s.index);
          if (v === 1 /* On */) on++;
          else if (v === 0 /* Unknown */) unk.push(s);
        }
        if (on === n - 1 && unk.length === 2) addXor(unk[0], unk[1], 1);
      }
    }
    const classVal = /* @__PURE__ */ new Map();
    for (let i = 0; i < N; i++) {
      const s = edgeList[i];
      const v = edgeValue(work, s.axis, s.index);
      if (v === 0 /* Unknown */) continue;
      const r = find(i);
      const val = (v === 1 /* On */ ? 1 : 0) ^ diff[i];
      const prev = classVal.get(r);
      if (prev === void 0) classVal.set(r, val === 1);
    }
    if (!classVal.size) return;
    const acc = [];
    for (let i = 0; i < N; i++) {
      const s = edgeList[i];
      if (edgeValue(work, s.axis, s.index) !== 0 /* Unknown */) continue;
      const r = find(i);
      const base = classVal.get(r);
      if (base === void 0) continue;
      const to = (base ? 1 : 0) ^ diff[i] ? 1 /* On */ : 2 /* Forbidden */;
      trySet(s.axis, s.index, to, acc);
    }
    if (acc.length) {
      flush(
        15,
        `\u89C4\u521915\uFF1A\u4E8C\u9009\u4E00\u540C\u5F02\u7EA6\u675F\u4F20\u64AD\uFF08\u6070\u597D\u4E00\u6761/\u540C\u8FDB\u540C\u51FA\uFF09\u2192 \u7531\u5DF2\u5B9A\u8FB9\u63A8\u51FA\u540C\u7C7B\u672A\u5B9A\u8FB9 ${acc.length} \u6761`,
        acc
      );
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
          flush(8, `\u89C4\u52198\uFF1A\u843D\u73AF\u4F1A\u67D3\u8272\u574D\u7F29\u51B2\u7A81 \u2192 \u6392\u9664`, acc);
        }
        continue;
      }
      const probeOff = probeEdge(puzzle, work, s.axis, s.index, 2 /* Forbidden */);
      if (!probeOff.ok) {
        const probeOn2 = probeEdge(puzzle, work, s.axis, s.index, 1 /* On */);
        if (probeOn2.ok) {
          const acc = [];
          trySet(s.axis, s.index, 1 /* On */, acc);
          if (acc.length) {
            flush(8, `\u89C4\u52198\uFF1A\u6392\u9664\u4F1A\u67D3\u8272\u574D\u7F29\u51B2\u7A81 \u2192 \u843D\u73AF`, acc);
          }
        }
      }
    }
  };
  const applyRule9 = () => {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (puzzle.cells[cellMaskIndex(w, cx, cy)] !== 3) continue;
        if (cx + 1 < w && cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx + 1, cy + 1)] === 3) {
          const acc = [];
          const ea = cellEdges(w, cx, cy);
          const eb = cellEdges(w, cx + 1, cy + 1);
          trySet("h", ea.top, 1 /* On */, acc);
          trySet("v", ea.left, 1 /* On */, acc);
          trySet("h", eb.bottom, 1 /* On */, acc);
          trySet("v", eb.right, 1 /* On */, acc);
          if (acc.length) flush(9, `\u89C4\u52199b\uFF1A\u5BF9\u89D23-3 (${cx},${cy})-(${cx + 1},${cy + 1}) \u2192 \u5916\u8FB9\u843D\u73AF`, acc);
        }
        if (cx > 0 && cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx - 1, cy + 1)] === 3) {
          const acc = [];
          const ea = cellEdges(w, cx, cy);
          const eb = cellEdges(w, cx - 1, cy + 1);
          trySet("h", ea.top, 1 /* On */, acc);
          trySet("v", ea.right, 1 /* On */, acc);
          trySet("h", eb.bottom, 1 /* On */, acc);
          trySet("v", eb.left, 1 /* On */, acc);
          if (acc.length) {
            flush(9, `\u89C4\u52199b\uFF1A\u53CD\u659C\u5BF9\u89D23-3 (${cx},${cy})-(${cx - 1},${cy + 1}) \u2192 \u5916\u8FB9\u843D\u73AF`, acc);
          }
        }
      }
    }
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx + 2 < w; cx++) {
        const nA = puzzle.cells[cellMaskIndex(w, cx, cy)];
        const nB = puzzle.cells[cellMaskIndex(w, cx + 1, cy)];
        const nC = puzzle.cells[cellMaskIndex(w, cx + 2, cy)];
        if (nA !== 1 || nB !== 2 || nC !== 1) continue;
        if (cy !== 0 && cy !== h - 1) continue;
        const acc = [];
        const eB = cellEdges(w, cx + 1, cy);
        const eA = cellEdges(w, cx, cy);
        const eC = cellEdges(w, cx + 2, cy);
        if (cy === 0) {
          trySet("h", eB.top, 1 /* On */, acc);
          trySet("v", eA.left, 2 /* Forbidden */, acc);
          trySet("h", eA.bottom, 2 /* Forbidden */, acc);
          trySet("v", eC.right, 2 /* Forbidden */, acc);
          trySet("h", eC.bottom, 2 /* Forbidden */, acc);
        } else {
          trySet("h", eB.bottom, 1 /* On */, acc);
          trySet("v", eA.left, 2 /* Forbidden */, acc);
          trySet("h", eA.top, 2 /* Forbidden */, acc);
          trySet("v", eC.right, 2 /* Forbidden */, acc);
          trySet("h", eC.top, 2 /* Forbidden */, acc);
        }
        if (acc.length) flush(9, `\u89C4\u52199c\uFF1A1-2-1 \u8D34\u5899 (${cx},${cy}) \u2192 \u4E2D2\u843D\u73AF`, acc);
      }
    }
    for (let cy = 0; cy + 2 < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const nA = puzzle.cells[cellMaskIndex(w, cx, cy)];
        const nB = puzzle.cells[cellMaskIndex(w, cx, cy + 1)];
        const nC = puzzle.cells[cellMaskIndex(w, cx, cy + 2)];
        if (nA !== 1 || nB !== 2 || nC !== 1) continue;
        if (cx !== 0 && cx !== w - 1) continue;
        const acc = [];
        const eB = cellEdges(w, cx, cy + 1);
        const eA = cellEdges(w, cx, cy);
        const eC = cellEdges(w, cx, cy + 2);
        if (cx === 0) {
          trySet("v", eB.left, 1 /* On */, acc);
          trySet("h", eA.top, 2 /* Forbidden */, acc);
          trySet("v", eA.right, 2 /* Forbidden */, acc);
          trySet("h", eC.bottom, 2 /* Forbidden */, acc);
          trySet("v", eC.right, 2 /* Forbidden */, acc);
        } else {
          trySet("v", eB.right, 1 /* On */, acc);
          trySet("h", eA.top, 2 /* Forbidden */, acc);
          trySet("v", eA.left, 2 /* Forbidden */, acc);
          trySet("h", eC.bottom, 2 /* Forbidden */, acc);
          trySet("v", eC.left, 2 /* Forbidden */, acc);
        }
        if (acc.length) flush(9, `\u89C4\u52199c\uFF1A1-2-1 \u8D34\u5899\u7AD6 (${cx},${cy}) \u2192 \u4E2D2\u843D\u73AF`, acc);
      }
    }
  };
  const cellSides = [];
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const e = cellEdges(w, cx, cy);
      cellSides.push({
        n: puzzle.cells[cellMaskIndex(w, cx, cy)],
        sides: [
          { axis: "h", index: e.top },
          { axis: "h", index: e.bottom },
          { axis: "v", index: e.left },
          { axis: "v", index: e.right }
        ]
      });
    }
  }
  const vertexSides = [];
  for (let py = 0; py <= h; py++) {
    for (let px = 0; px <= w; px++) {
      const t = vertexEdges(w, px, py);
      vertexSides.push([
        { axis: "h", index: t.west },
        { axis: "h", index: t.east },
        { axis: "v", index: t.north },
        { axis: "v", index: t.south }
      ]);
    }
  }
  const hLen = (w + 2) * (h + 1);
  const vLen = (h + 2) * (w + 1);
  const hEdgeCells = Array.from({ length: hLen }, () => []);
  const vEdgeCells = Array.from({ length: vLen }, () => []);
  for (let ci = 0; ci < cellSides.length; ci++) {
    for (const s of cellSides[ci].sides) {
      if (s.axis === "h") hEdgeCells[s.index].push(ci);
      else vEdgeCells[s.index].push(ci);
    }
  }
  const hEdgeVerts = Array.from({ length: hLen }, () => []);
  const vEdgeVerts = Array.from({ length: vLen }, () => []);
  for (let vi = 0; vi < vertexSides.length; vi++) {
    for (const s of vertexSides[vi]) {
      if (s.axis === "h") hEdgeVerts[s.index].push(vi);
      else vEdgeVerts[s.index].push(vi);
    }
  }
  const propagate = (hArr, vArr) => {
    const totalCells = cellSides.length;
    const totalVerts = vertexSides.length;
    const cellN = new Int32Array(totalCells);
    const cellOn = new Int32Array(totalCells);
    const cellUnk = new Int32Array(totalCells);
    const vertOn = new Int32Array(totalVerts);
    const vertUnk = new Int32Array(totalVerts);
    for (let ci = 0; ci < totalCells; ci++) {
      const n = cellSides[ci].n;
      cellN[ci] = n === null || n === void 0 ? -1 : n;
      let on = 0;
      let unk = 0;
      for (const s of cellSides[ci].sides) {
        const v = s.axis === "h" ? hArr[s.index] : vArr[s.index];
        if (v === 1 /* On */) on++;
        else if (v === 0 /* Unknown */) unk++;
      }
      cellOn[ci] = on;
      cellUnk[ci] = unk;
    }
    for (let vi = 0; vi < totalVerts; vi++) {
      let on = 0;
      let unk = 0;
      for (const s of vertexSides[vi]) {
        const v = s.axis === "h" ? hArr[s.index] : vArr[s.index];
        if (v === 1 /* On */) on++;
        else if (v === 0 /* Unknown */) unk++;
      }
      vertOn[vi] = on;
      vertUnk[vi] = unk;
    }
    const cap = totalCells + totalVerts + 8 * (hLen + vLen);
    const queue = new Int32Array(cap);
    let head = 0;
    let tail = 0;
    for (let ci = 0; ci < totalCells; ci++) queue[tail++] = ci;
    for (let vi = 0; vi < totalVerts; vi++) queue[tail++] = totalCells + vi;
    const setEdgeLocal = (axis, index, to) => {
      if (axis === "h") hArr[index] = to;
      else vArr[index] = to;
      const cells = axis === "h" ? hEdgeCells[index] : vEdgeCells[index];
      for (const c of cells) {
        cellUnk[c]--;
        if (to === 1 /* On */) cellOn[c]++;
        if (tail < cap) queue[tail++] = c;
      }
      const verts = axis === "h" ? hEdgeVerts[index] : vEdgeVerts[index];
      for (const v of verts) {
        vertUnk[v]--;
        if (to === 1 /* On */) vertOn[v]++;
        if (tail < cap) queue[tail++] = totalCells + v;
      }
    };
    while (head < tail) {
      const id = queue[head++];
      if (id < totalCells) {
        const n = cellN[id];
        if (n < 0) continue;
        const on = cellOn[id];
        const unk = cellUnk[id];
        if (on > n || on + unk < n) return true;
        if (unk === 0) continue;
        let to = 0 /* Unknown */;
        if (on === n) to = 2 /* Forbidden */;
        else if (on + unk === n) to = 1 /* On */;
        if (to === 0 /* Unknown */) continue;
        for (const s of cellSides[id].sides) {
          const cur = s.axis === "h" ? hArr[s.index] : vArr[s.index];
          if (cur === 0 /* Unknown */) setEdgeLocal(s.axis, s.index, to);
        }
      } else {
        const vi = id - totalCells;
        const on = vertOn[vi];
        const unk = vertUnk[vi];
        if (on > 2) return true;
        if (on === 1 && unk === 0) return true;
        if (unk === 0) continue;
        let to = 0 /* Unknown */;
        if (on === 2) to = 2 /* Forbidden */;
        else if (on === 1 && unk === 1) to = 1 /* On */;
        else if (on === 0 && unk === 1) to = 2 /* Forbidden */;
        if (to === 0 /* Unknown */) continue;
        for (const s of vertexSides[vi]) {
          const cur = s.axis === "h" ? hArr[s.index] : vArr[s.index];
          if (cur === 0 /* Unknown */) setEdgeLocal(s.axis, s.index, to);
        }
      }
    }
    return false;
  };
  const applyRule11 = () => {
    const vertexTightness = (px, py) => {
      const ve = vertexEdges(w, px, py);
      let on = 0;
      let unk = 0;
      for (const [axis, index] of [
        ["h", ve.west],
        ["h", ve.east],
        ["v", ve.north],
        ["v", ve.south]
      ]) {
        const v = edgeValue(work, axis, index);
        if (v === 1 /* On */) on++;
        else if (v === 0 /* Unknown */) unk++;
      }
      if (on === 1) return 3 + (4 - unk) * 4;
      if (on === 2 && unk > 0) return 6;
      if (on === 0 && unk > 0) return 1;
      return 0;
    };
    const cellTightness = (cx, cy) => {
      const n = puzzle.cells[cellMaskIndex(w, cx, cy)];
      if (n === null || n === void 0) return 0;
      const e = cellEdges(w, cx, cy);
      let on = 0;
      let unk = 0;
      for (const [axis, index] of [
        ["h", e.top],
        ["h", e.bottom],
        ["v", e.left],
        ["v", e.right]
      ]) {
        const v = edgeValue(work, axis, index);
        if (v === 1 /* On */) on++;
        else if (v === 0 /* Unknown */) unk++;
      }
      if (on === n - 1 && unk > 0) return 5 + (3 - unk) * 3;
      if (on === n && unk > 0) return 2;
      if (on < n && unk === 0) return 8;
      return 0;
    };
    const cands = [];
    for (let hy = 0; hy <= h; hy++) {
      for (let hx = 1; hx <= w; hx++) {
        const index = hIndex(w, hx, hy);
        if (edgeValue(work, "h", index) !== 0 /* Unknown */) continue;
        let score = vertexTightness(hx - 1, hy) + vertexTightness(hx, hy) + cellTightness(hx - 1, hy - 1) + cellTightness(hx - 1, hy);
        cands.push({ axis: "h", index, score });
      }
    }
    for (let vy = 1; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) {
        const index = vIndex(w, vx, vy);
        if (edgeValue(work, "v", index) !== 0 /* Unknown */) continue;
        const score = vertexTightness(vx, vy - 1) + vertexTightness(vx, vy) + cellTightness(vx - 1, vy - 1) + cellTightness(vx, vy - 1);
        cands.push({ axis: "v", index, score });
      }
    }
    if (!cands.length) return;
    cands.sort((a, b) => b.score - a.score);
    const probe = (axis, index) => {
      if (edgeValue(work, axis, index) !== 0 /* Unknown */) return false;
      const tryFill = (to) => {
        const hArr = work.h.slice();
        const vArr = work.v.slice();
        if (axis === "h") hArr[index] = to;
        else vArr[index] = to;
        return propagate(hArr, vArr);
      };
      const okOn = !tryFill(1 /* On */);
      const okOff = okOn ? !tryFill(2 /* Forbidden */) : true;
      const acc = [];
      if (okOn && !okOff) trySet(axis, index, 1 /* On */, acc);
      else if (!okOn && okOff) trySet(axis, index, 2 /* Forbidden */, acc);
      if (acc.length) {
        const banned = acc[0].to === 1 /* On */ ? 2 /* Forbidden */ : 1 /* On */;
        flush(
          11,
          `\u89C4\u521911\uFF1A\u586B\u6210${banned === 1 /* On */ ? "\u73AF" : "\u53C9"}\u4F1A\u5F62\u6210\u65E0\u6CD5\u95ED\u5408\u7684\u7EBF\u5934 \u2192 \u5FC5\u4E3A${acc[0].to === 1 /* On */ ? "\u73AF" : "\u53C9"}`,
          acc
        );
        return true;
      }
      return false;
    };
    for (const c of cands) {
      if (probe(c.axis, c.index)) return;
    }
  };
  let saturated = true;
  for (let guard = 0; guard < 400; guard++) {
    const before = steps.length;
    applyRule1();
    applyRule2();
    applyRule2c();
    applyRule3();
    applyRule4c();
    applyRule4();
    applyRule5();
    applyRule6();
    applyRule9();
    applyRule12();
    applyRule13();
    applyRule14();
    applyRule15();
    applyRule7();
    if (steps.length === before) {
      applyRule11();
      if (steps.length === before) {
        saturated = true;
        break;
      }
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

// src/puzzles-data.ts
var RAW_PUZZLES = [
  { id: "classic-5x5-A", name: "\u7ECF\u5178 \xB7 5\xD75 A", width: 5, height: 5, difficulty: "easy", series: "classic", cells: "1000031101233332202212321", solH: "222222221222222221212221212221121122221222", solV: "222222222222112222111111122221221122222222" },
  { id: "classic-5x5-B", name: "\u7ECF\u5178 \xB7 5\xD75 B", width: 5, height: 5, difficulty: "easy", series: "classic", cells: "3210012310232112222311111", solH: "212222222112222211222221111221111122222222", solV: "222222112222122122112222122221222222222222" },
  { id: "classic-5x5-C", name: "\u7ECF\u5178 \xB7 5\xD75 C", width: 5, height: 5, difficulty: "easy", series: "classic", cells: "0132101122022331312102231", solH: "222122222221122222122221221222121222221122", solV: "222222221122221221221111212122221212222222" },
  { id: "classic-5x5-D", name: "\u7ECF\u5178 \xB7 5\xD75 D", width: 5, height: 5, difficulty: "easy", series: "classic", cells: "0233313021023320011200013", solH: "222121222121222212122222122222222222222212", solV: "222222221111212221221111222211222211222222" },
  { id: "classic-5x5-E", name: "\u7ECF\u5178 \xB7 5\xD75 E", width: 5, height: 5, difficulty: "easy", series: "classic", cells: "2320021220332211032101321", solH: "221222221212222212122212122222212222221122", solV: "222222211222122122111212222112221212222222" },
  { id: "classic-5x5-F", name: "\u7ECF\u5178 \xB7 5\xD75 F", width: 5, height: 5, difficulty: "easy", series: "classic", cells: "3223312212003220132100110", solH: "211121221121222221212222122222211222222222", solV: "222222122111221221222112221212222222222222" },
  { id: "classic-10x10-A", name: "\u7ECF\u5178 \xB7 10\xD710 A", width: 10, height: 10, difficulty: "medium", series: "classic", cells: "0000131023000022212200013123230000221203000233232300130212130002232223011222222212212231221333201013", solH: "222222122212222222222122222221212212222221121212222221221212222212122212222212122212222222222212221112222122222121212222221212222212", solV: "222222222222222211221122222112121222212211122222221222122221111112222122211212222111111222221111121212221112112111122221122222222222" },
  { id: "classic-10x10-B", name: "\u7ECF\u5178 \xB7 10\xD710 B", width: 10, height: 10, difficulty: "medium", series: "classic", cells: "0023200000122131000032132000002212311000332322310022112221002232322000222022310023223221102322222231", solH: "222212222222222121222222211211222222211211222222212211212222221211122222211121112222211121112222221121112222221221111122211211111122", solV: "222222222222221122222222122122222122122222222212212222211112211222122222212222221122222212222221222112112222221211222221222222222222" },
  { id: "classic-10x10-C", name: "\u7ECF\u5178 \xB7 10\xD710 C", width: 10, height: 10, difficulty: "medium", series: "classic", cells: "0013222213101222222333222223132212231213122231232201313220320011312132000022211100000231000000001000", solH: "222211111112222211111212212111112212221211121212211221121212222221212122222121222122222221212112222222122222222222212222222222222222", solV: "222222222222221222222122222222112111222211211221221221222111221121221121122112222121212122222121222222222112222222222222222222222222" },
  { id: "classic-10x10-D", name: "\u7ECF\u5178 \xB7 10\xD710 D", width: 10, height: 10, difficulty: "medium", series: "classic", cells: "3121222332223232120313213233220122312131122112311032232321001111122220000132213100001013200000000100", solH: "211111112122212121121212222221221212221221212222222121112122211212112222211122111222222222112122222221222122222222221222222222222222", solV: "222222222221222222111221111212221211121111122221122211222122221222122111222222222122212222221121212222222211222222222222222222222222" },
  { id: "classic-10x10-E", name: "\u7ECF\u5178 \xB7 10\xD710 E", width: 10, height: 10, difficulty: "medium", series: "classic", cells: "0113231000233232100030212121103222222231313322211031212221003132123100312221100031312310002323210000", solH: "222212122222221222222222212121222222212111211122212212111122212121112222212111122222212112212222212121122222212221122222221212222222", solV: "222222222222221111222221111112222122222122222112212221212111222222212222212221212221122221221222222121122122222111122222222222222222" },
  { id: "classic-10x10-F", name: "\u7ECF\u5178 \xB7 10\xD710 F", width: 10, height: 10, difficulty: "medium", series: "classic", cells: "2322321231302212323123222121131223323223222021222332232222211001011221000001233100000131100000001000", solH: "221221221122212112122122212111212112221212211212211121212212221121122112212212221122222222221222222222222122222222212222222222222222", solV: "222222222222112112121212222211122211221222212221111211212222221121112112112222222221221222222211112222222112222222222222222222222222" },
  { id: "classic-10x10-G", name: "\u7ECF\u5178 \xB7 10\xD710 G", width: 10, height: 10, difficulty: "medium", series: "classic", cells: "1322223100121221200033232310002212110000223220000022112200002323222001322222221311231222320011002222", solH: "221122112222221211212222212211222222221212122222211122222222211121222222221212122222222221212212212212121222222112212122222222221112", solV: "222222222222121212122222122212222111121122221222122222222211222222122221222221111121222211112121211221212121112222222122122222222222" },
  { id: "classic-10x10-H", name: "\u7ECF\u5178 \xB7 10\xD710 H", width: 10, height: 10, difficulty: "medium", series: "classic", cells: "0013222232000123231300013111220001233231012311212213212222330231221312131222212302320023210010000100", solH: "222211112122222211122212222221121212222221212122222212122112221122212122221121121212221121121112221212212112222122221222222222222222", solV: "222222222222221222111222222211121222212222122222211112222211221221212212121112221222122221221212221221122211222222222222222222222222" },
  { id: "classic-15x15-A", name: "\u7ECF\u5178 \xB7 15\xD715 A", width: 15, height: 15, difficulty: "hard", series: "classic", cells: "000000000000013000000000000122000000011111312000001132131323001013213232212013112223121232012203221232222021323123221231131312312133122022222123211122001113231211221000013032312232000013220113223000132110001101000012310000000", solH: "22222222222222212222222222222222222222222222222112222222222111121212222222121121212122221222121211212222222212211121222222212121211221222212121121212212222121111212212222222111121222211222222221212222212222222212121212222222221122222112122222211222222222222222221222222222", solV: "22222222222222222222222222222211222222222222221122222222222212212222222122212112222221122112122122112121122221112211221122211211221211221122112121212221221112112212222211122211222222112112122122222122111211112222221122212111222212212222222222222211222222222222222222222222" },
  { id: "classic-15x15-B", name: "\u7ECF\u5178 \xB7 15\xD715 B", width: 15, height: 15, difficulty: "hard", series: "classic", cells: "000000000000000000000000000000000000000000010000000000100231000100002312221001320113122221011132313222323233232232222122311121121313232123223222221123002112112232322012221221211123013222232323232001013231222213000001023231232", solH: "22222222222222222222222222222222222222222222222222222222222222222122222222222212212222222122221221212222222121212221212221221222122211222121211212121211221121121121112112222122122111211122221111111112111222221121121212112222122221222221122222221212222121222222222212122122", solV: "22222222222222222222222222222222222222222222222222222222222222222222222222222112222222222112121222211222121121222221211121111211211112111211222112222222212211222211211212222221222222222221122222122222222222212211211211111122222221112111122122222222111121122222222222222222" },
  { id: "classic-15x15-C", name: "\u7ECF\u5178 \xB7 15\xD715 C", width: 15, height: 15, difficulty: "hard", series: "classic", cells: "000000000100000000000002310000000000122211000000001312223211000000222130223000000122032212000000122231213000000132221322000001311232322001001233211212023223211223223130211233213223023333221323012001021231212223000132222222222", solH: "22222222222222222222222222212222222222222221222222222222221121212222222222212121211122222222222212111222222222212122212222222221221212222222222112122122222222221212121122222122121212112122212112121221221222121212122212112222121211212122122222211112112112222222111112211112", solV: "22222222222222222222222222222222222222222112222222222222121222222222221221211222222222211212222122222221122112222222222121121211222222221121211122222212221112112222222111222221221121122211211221222221111211212211111221112222222222221222121122221222212122212222222222222222" },
  { id: "classic-15x15-D", name: "\u7ECF\u5178 \xB7 15\xD715 D", width: 15, height: 15, difficulty: "hard", series: "classic", cells: "000000000000000010000000000000232010000000000312232000000000232313110101000320222133333100232321212021100320222223333100222322221101000321222223100000222222212000000232322323110000121222212231000232222332322000222222121213100", solH: "22222222222222222222222222222222222212222222222222221212122222222222211222122222222222112121212121222221121122212122222211211112121222222112111112121222221221111112222222222211111122222222222211121222222222121211222122222221111212222222222211111212121222221111111111112222", solV: "22222222222222222222222222222222222222222222222221122222222222221221112222222222221112122222222212222121111112222211222122221222122222221111122222112222222222221112222221222222111122222222222211111221112222221222212211112222112222111111222212222222222212222222222222222222" },
  { id: "classic-20x20-A", name: "\u7ECF\u5178 \xB7 20\xD720 A", width: 20, height: 20, difficulty: "hard", series: "classic", cells: "0000000000000000000000000000000000000000000000011000000000000000011321011100000000001323221313100000000012120312230000000010023323121310000001310011212212000000022210103222310000002212323231212000000031312221312231000000213231223122100000002230323032332001000031223032212122231000232232222313122210002212212213231211000022223232311231000000323221112232200000002122232323122210000032222222222322310000", solH: "222222222222222222222222222222222222222222222222222222222222222222222222221122222222222222222212122211122222222222222112121212222222222222121212221222222222212221221112122222222222222221211222222222221211212122212222222221211122212111222222222121211221211122222222222121212122122222222221212121212121221222222112212122111211222222211211221212121112222222111122211212222222222221112121212122222222212111121222112222222221111112221212112222222111111121112111222222", solV: "222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222212122222222222222221121121221222222222221222212112222222222222111122121222222221122221222212222222221122222112112222222212221111212222222222121222112122212222222212112211212222222222211221122111122222222122112211222212112222221121121122122212222122222112211212222222112221111222112222222111222222111222222222222222111112212222222122222211221122122222222222222222222222222" },
  { id: "classic-20x20-B", name: "\u7ECF\u5178 \xB7 20\xD720 B", width: 20, height: 20, difficulty: "hard", series: "classic", cells: "0000000000000000000000000000000000000111000000000000100022230000000000023211312200000000001312222223000000000002221322220000000000123223122200000000001231223232000011110012213121220001321310022231212200001323000222322223000013121113122112220000013233112223232000000130212222220222000000233222222323230000001101222222122100000132122212131222000001221213332223130000001233221222222300000000112323223223", solH: "222222222222222222222222222222222222222222222222222222222222221112222222222222212221211222222222222212112122122222222222221112122222222222222222112212222222222222222221221222222222222222222121212122222221111222122121111222222112122222212221122222221212221211211212222222112212111112112222222221212221111211222222222121211211121212222222221211112112211222222221222111121211222222222211121212221212222222211212212222221222222222212212122222122222222222211211212112", solV: "222222222222222222222222222222222222222222222222222222222222222222222222222222221221222222222222112212122222222222221222121111222222222222221211111222222222221211121111222222222221121211111222222222221212122221222212221222111212222222222112222112112121222221221221222222212222222211112222211222222222122212122222212222222211122212211121222222222222221221222222222112212222112212222222122221111111121222222221111221111112222222222212112111121222222222222222222222" },
  { id: "classic-20x20-C", name: "\u7ECF\u5178 \xB7 20\xD720 C", width: 20, height: 20, difficulty: "hard", series: "classic", cells: "0000001312221323222300000002332232222323000010101122113212030112323123122221233213221222311223332211011323223223111112330022111221223232322101313222312121221232002323222132322222210001011232222222223200000013222222222222000000011322222222220000000001132223232200000000000113110122000000000000010001320000000000000000001100000000000000000000000000000000000000000000000000000000000000000000000000000000", solH: "222222221111221211211222222222121212221222122222222221212121221212222221212212121122121222111222212222212221222211122221221212121212222212121122112121212222212121112111222211222221222211212122221122222212122122222222212222222222222222222222222222222212222222222222222222222212222222222222222222222212221212222222222222222212222122222222222222222222211222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222", solV: "222222222222222222222222222212221211121121222222221112111211112222222222221222112221222211112112112211112212221111212111111222222211112111222222111222122222212211111221221211122122221112211222111112211111111221222222211111111111111222222211111111111111222222222111111111111222222222221111111111222222222222211222211222222222222222222121222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222" },
  { id: "easy-5x5-A", name: "\u5165\u95E8 \xB7 5\xD75 A", width: 5, height: 5, difficulty: "easy", series: "easy", cells: "0131300222012221321301111", solH: "222111222212122222222221121222111122222222", solV: "222222221221222112222112212221222222222222" },
  { id: "easy-5x5-B", name: "\u5165\u95E8 \xB7 5\xD75 B", width: 5, height: 5, difficulty: "easy", series: "easy", cells: "0100023211211232332131100", solH: "222222222122222121112221211222212222122222", solV: "222222222222211222122221111122112222222222" },
  { id: "easy-5x5-C", name: "\u5165\u95E8 \xB7 5\xD75 C", width: 5, height: 5, difficulty: "easy", series: "easy", cells: "0010011310332201212132231", solH: "222222222212222122222221212222112222122122", solV: "222222222222221122111122122212112112222222" },
  { id: "easy-5x5-D", name: "\u5165\u95E8 \xB7 5\xD75 D", width: 5, height: 5, difficulty: "easy", series: "easy", cells: "0132012131321201321013210", solH: "222122222221222112122211222222122222211222", solV: "222222221122221212122122221122212122222222" },
  { id: "easy-5x5-E", name: "\u5165\u95E8 \xB7 5\xD75 E", width: 5, height: 5, difficulty: "easy", series: "easy", cells: "0110022310313112212302321", solH: "222222222112222121222212111222121122221222", solV: "222222222222212122121222212221221122222222" },
  { id: "easy-5x5-F", name: "\u5165\u95E8 \xB7 5\xD75 F", width: 5, height: 5, difficulty: "easy", series: "easy", cells: "1110022310222002331022210", solH: "222222221112222211222222122222122222111222", solV: "222222222222122122112222111122122122222222" },
  { id: "medium-10x10-A", name: "\u8FDB\u9636 \xB7 10\xD710 A", width: 10, height: 10, difficulty: "medium", series: "medium", cells: "3333221222121223331323222111322121231010323231000031223100003221100000303100000032200000003210000000", solH: "212121111122221212121212221111212212221111122122212121122222212221222222212211222222212122222222212122222222212222222222211222222222", solV: "222222222221111122221212222111121112222221121222221222221111222222121121222222112222222212212222222211222222221212222222222222222222" },
  { id: "medium-10x10-B", name: "\u8FDB\u9636 \xB7 10\xD710 B", width: 10, height: 10, difficulty: "medium", series: "medium", cells: "0023200000113121001032232201322121122113233332232301010221130000012232000013312300001121320000133223", solH: "222212222222222121222222212112222122221112122212212121212212221212121212222222212112222222122112222222212112222222212112222222121112", solV: "222222222222221122222222122122222112211221121222221212121111121112222222122212222222112222222111221222221221222222211122122222222222" },
  { id: "medium-10x10-C", name: "\u8FDB\u9636 \xB7 10\xD710 C", width: 10, height: 10, difficulty: "medium", series: "medium", cells: "0000000000000001000100012320230013203222011232222313222132130112312132012221312313223222320111132223", solH: "222222222222222222222222222222122212222211212122222211212212221111221212221111212112222211212112221121222112221112222112222222121112", solV: "222222222222222222222222222222222222221122112221222112122222112112212222112212222212212222212211221212211111222222211122122222222222" },
  { id: "medium-10x10-D", name: "\u8FDB\u9636 \xB7 10\xD710 D", width: 10, height: 10, difficulty: "medium", series: "medium", cells: "0000132223001022323201332111230122232322012222122212212122231332323101011222231000131111000001000000", solH: "222222121112222222222112222121212112222212121112222111221112221111121122222121212212221222211222222222111222222212222222222222222222", solV: "222222222222222211122122222111122221112222212212211122222222212221212222212112111111222222211122122222112222222222222222222222222222" },
  { id: "medium-10x10-E", name: "\u8FDB\u9636 \xB7 10\xD710 E", width: 10, height: 10, difficulty: "medium", series: "medium", cells: "3223322311231213232322132202213322222323112132131100222122000012113100001220100000123100000001100000", solH: "211121211222211212221212211212121122221221121122212211221212222121221222222222222222222222212222222221222222222211222222222222222222", solV: "222222222221221111212222122111211122112222211111221121122122112122222112112222221121122222211222222222121222222222222222222222222222" },
  { id: "hard-10x10-A", name: "\u6311\u6218 \xB7 10\xD710 A", width: 10, height: 10, difficulty: "hard", series: "hard", cells: "0000013200000101131001131222101332231332112123120313312123220112322131001323101000010100000000000000", solH: "222222212222222222221222222212221222221222122122222122121212222121121212221221212222222222222122222212122222222222222222222222222222", solV: "222222222222222221122222222212122222112112222111112111221221212221211122211122221111211222211112222222222222222222222222222222222222" },
  { id: "hard-10x10-B", name: "\u6311\u6218 \xB7 10\xD710 B", width: 10, height: 10, difficulty: "hard", series: "hard", cells: "0000001110000102223100132313100022231310013022131100223212230021323211013130100000313100000132200000", solH: "222222222222222222211122222212121122222222121222222121121222222121121112222221221112222121212222222121222222222121222222222112222222", solV: "222222222222222222222222222212212222111212222221121212222122221222222112122212221211122222121222222222121222222212122222222222222222" },
  { id: "hard-10x10-C", name: "\u6311\u6218 \xB7 10\xD710 C", width: 10, height: 10, difficulty: "hard", series: "hard", cells: "3200000000221000000032200000003031100000323231000021222100002322210000122123100023223200002322231000", solH: "212222222222221222222222212222222222212122222222212121222222212112222222221111222222221111122222221121122222221221122222211211122222", solV: "222222222221122222222212122222222211222222221221222222221121122222122221222221122222222212222212222112112222221211221222222222222222" },
  { id: "easy-7x7-A", name: "\u4F11\u95F2 \xB7 7\xD77 A", width: 7, height: 7, difficulty: "easy", series: "easy", cells: "0001320001213101321310012213000122200233220131213", solH: "222221222222222122222112122222112112222221212222212222222121212222111112", solV: "222222222222112222221212221221222222122122222112222111122212222122222222" },
  { id: "easy-7x7-B", name: "\u4F11\u95F2 \xB7 7\xD77 B", width: 7, height: 7, difficulty: "easy", series: "easy", cells: "0000023000113101232321311121022333201311120010013", solH: "222222212222222122222212122221121122221212122222221222222122222222222212", solV: "222222222222221122222121222112112122222122111111221122112222221122222222" },
  { id: "easy-7x7-C", name: "\u4F11\u95F2 \xB7 7\xD77 C", width: 7, height: 7, difficulty: "easy", series: "easy", cells: "1231000312100022210002223100313221021202311333210", solH: "222122222211222222212122222222212222212222222212121122222121122221212222", solV: "222222222211222212212222211222222111122212111222212222122111122222222222" },
  { id: "easy-7x7-D", name: "\u4F11\u95F2 \xB7 7\xD77 D", width: 7, height: 7, difficulty: "easy", series: "easy", cells: "1000000310000021100002331000221110123233333212122", solH: "222222222212222222222222222222122222221222222211221212211212122211111112", solV: "222222222222222211222222112222221111222212212222221111111222222122222222" },
  { id: "hard-8x8-A", name: "\u786C\u6838 \xB7 8\xD78 A", width: 8, height: 8, difficulty: "hard", series: "hard", cells: "0000000000000100010113102333322121112022333223331010010100000000", solH: "222222222222222222222222221222221212222221212121122212112122212122121222222222222222222222", solV: "222222222222222222222222222222221122211111122122222221111121111222222222222222222222222222" },
  { id: "hard-8x8-B", name: "\u786C\u6838 \xB7 8\xD78 B", width: 8, height: 8, difficulty: "hard", series: "hard", cells: "3322310012221000221000002200000013100000231000001231000032100000", solH: "212111222222121122222211222222222222222222122222222212222222221122222222112222222122222222", solV: "222222222111221222122122222112222222112222222121222222112222222122122222112222222222222222" },
  { id: "expert-25x25-A", name: "\u4E13\u5BB6 \xB7 25\xD725 A", width: 25, height: 25, difficulty: "hard", series: "expert", cells: "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000002310000000000000000000001221100000000000000000000223131000000000000000000121322100100000000000001122221210132010100000001322123321012233332000000012322212111312121310000001321222313221322210110001023132131122122221023111323213123113222223102323322231321232232331200122111222132232212021331023123222312202121323221101310222212222323222112310320131232311322232310010010003222122122222110000000001322323323212231000000", solH: "222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222122222222222222222222222221222222222222222222222222222121222222222222222222222212122222222222222222222222221122222122222222222222211122122222212121222222222211122212222121212122222222221122121211121111122222222221121221211121111222211222121121221221221112222221212221121221122222121222221121211121221122121221222221112111121121112121212222221221211121121212222112222221221121212222222222221222212221212211212221212222222222221221212211211122222222222221121121211111122222222", solV: "222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222221122222222222222222222222121222222222222222222222221121122222222222222222222122111222222222222222222221122112211222222222222212221111122121111122222222222111221222122222122222222122121121222122222222222222212112122212222122121221112212112211112211221121111221211221111111222212222222221211221222211122112211222122222221111221221212221222121111111122112211221221112211111111222222222221121221221122222222222222121121111222221222222222222222222222222222222222" },
  { id: "expert-25x25-B", name: "\u4E13\u5BB6 \xB7 25\xD725 B", width: 25, height: 25, difficulty: "hard", series: "expert", cells: "3221023333321310000000000212323120212321100000000022211122232221232000000003122323222222322211111100221213223122211323222231002332211213222311122111000011223233122132323100000001321212111322222231000000012232233222231121011000000131312112112233222310000112131232323212112130000132223223121323222313100001222121232231211223200000001232001122123231100000000001000002323101000000000000000001320310000000000000000000012320000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", solH: "211222212121221222222222222212112121212122222222222222222112111211212212222222222212221212212112221222222222212112222121121212211111222221212121121212112121111222222121112122122121212222222222211112212222122211222222222211212121212212111222222222222221212111211212211222222222121211212112121121222222211121221222122112121222222211211221222121222221222222222112122122111122212222222222221222221121121222222222222222222221121222222222222222222222221121222222222222222222222222212222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222", solV: "222222222222222222222222221212221111112112222222222221221122222211122222222222211222221121221112222222221212111112122111212222222221222111212212221112222122221112222211211222212222222222222111121121111222222222212222122211121122122222222221112111221122222222222222211212222222211121212222222221212111121222221222222122121112112111211121222222212221211112222111122222222221122221222211122222222222222222222112222222222222222222222122212222222222222222222222211222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222" },
  { id: "expert-25x25-C", name: "\u4E13\u5BB6 \xB7 25\xD725 C", width: 25, height: 25, difficulty: "hard", series: "expert", cells: "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000012320101010000000000010113203233323101000000003231232312212222310000000232222122222212211000000021222222222232323110000003231311132212131213100000312121323122212132220000023233322323222332313100003111121120202111121300000233231323232333322231000002213231222212121122000001312212223223221222310000132223322121213231110000032122111223132222100000001232333331232312310000000", solH: "222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222212222222222222222222222221121212121222222222222212121121221222221222222222222221121211222112222222222221222112112222112222222222212122221122212121212222222212121212122211121222222222211221222122222122221222222211212121121211212121222222212121112121212121121222222221221212222221212211222222221121212222221111111222222221212122212212121111222222211221212121212221222222222211222121221222212222222222222121212122121221222222222", solV: "222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222211222222222222222222222212221111111222222222221111221121221112112222222211111222122111222122222222122111212211111211222222222112112221112221221122222212212211121112221111222222221111112111121111121222221222222222222222222122222221111221111111111212122222222121121111122222222222222122122111111122222212222222112111122122111222222222122112222112111121222222222211111111211112112222222222222222222222222222222222" },
  { id: "blank-5x5-A", name: "\u7A7A\u767D \xB7 5\xD75 A", width: 5, height: 5, difficulty: "easy", series: "blank", cells: "32213112230011300122001.1", solH: "211111221112122222212222221222222222222122", solV: "222222122221222112222121222112222112222222" },
  { id: "blank-5x5-B", name: "\u7A7A\u767D \xB7 5\xD75 B", width: 5, height: 5, difficulty: "easy", series: "blank", cells: "123332202223321.110010000", solH: "222121221121222212112222122221222222222222", solV: "222222221111122221111122112222222222222222" },
  { id: "blank-5x5-C", name: "\u7A7A\u767D \xB7 5\xD75 C", width: 5, height: 5, difficulty: "easy", series: "blank", cells: "32200313103120032200.1310", solH: "211222221212222121222212222221212222111222", solV: "222222121222212122121222211222122122222222" },
  { id: "blank-7x7-A", name: "\u7A7A\u767D \xB7 7\xD77 A", width: 7, height: 7, difficulty: "medium", series: "blank", cells: "312233232312133123211222200011231001321000010.000", solH: "211112122212121212212221112212212222222112222222112222221222222222222222", solV: "222222221222111221112221121112222112222221221222211222222222222222222222" },
  { id: "blank-7x7-B", name: "\u7A7A\u767D \xB7 7\xD77 B", width: 7, height: 7, difficulty: "medium", series: "blank", cells: "0100000131000022.00002122010332223121323223221213", solH: "222222222221222222222222222212122222221212122212122222211121212211111112", solV: "222222222222222221122222211222221221222211121112222111121222222122222222" },
  { id: "blank-10x10-A", name: "\u7A7A\u767D \xB7 10\xD710 A", width: 10, height: 10, difficulty: "hard", series: "blank", cells: "000132131100.023231300122203220131232322002221221200131123230001132112000001323200000131230000002311", solH: "222221111222222221121212222221121222222112121222222121221122222222211212222212111212222222112122222222212222222222212212222222221222", solV: "222222222222222122212222222211211222212221112212211121122211212221222112221122222212222122222221111222222121112222222112222222222222" },
  { id: "blank-10x10-B", name: "\u7A7A\u767D \xB7 10\xD710 B", width: 10, height: 10, difficulty: "hard", series: "blank", cells: "1232023223311232112123321232330102322222000022212.00013213220000121323000001230100000123100000001100", solH: "222122212212211212121122212121212122221212122212222221212112222221121122222221121222222222221212222222221222222222211222222222222222", solV: "222222222222211221121112221122221211122111112222112112222222212221222212212112222221211122222211222222222121222222222222222222222222" },
  { id: "human-15x15-a", name: "\u540D\u9898 \xB7 15\xD715 A", width: 15, height: 15, difficulty: "hard", series: "human", cells: ".23..22.........2221.3.....2.32....3..31.3....21.1.2......213....3..23.3.3.122..303.21..122.1......222.2.322...12......1..2.1...32.322.....3..2..312.32.3..3.....1...222....2.32....3...133...1..133.3.21.3..23.....2..2..1.2...3", solH: "", solV: "" },
  { id: "human-25x30-img", name: "\u8BC6\u56FE \xB7 25\xD730", width: 25, height: 30, difficulty: "hard", series: "human", cells: ".33.2.1..1.1....23.3..12.....2...1..1313..2...2....3.112..3.2...3.3.2.2.322.2.32.2....21...120......131..30.3......13...13.2.23.3.2...12.1.3..2..11.13.....3.3322.22.1321..33..3........2...222..1..1.2.3.11..3..233..22..23.2..132................12...2..2.2212212.....23..2312...3.3..3.1....1..2....0.3.....1...2.1..3.2...2......332.3211.12.22.3..2223223..2.....223.3....12.1..12.321.2....22.3.2..3.2..3........2...1.1..3.2.213.12.2....212.2..21....3..22.....31.23.2...3..1..33.....2...32.01.1.01..311.1213.2.2.....3.3..2...21.....2.3.32..21.1.2...2.3.3..20.2....2...23.3.2.121....231.3.3.202.122.322.......22..2...3.3.....12..2.33.2..........22.13..12...21131.2.1.23.........0..2.....3.21..3.3..1.3.32...3.32.....3.22.132.2..3.23..212..232..2.......1.2", solH: "", solV: "" }
];

// src/puzzles.ts
function parseCells(s) {
  return [...s].map((ch) => ch === "." ? null : Number(ch));
}
function parseEdges(s) {
  return [...s].map((ch) => Number(ch));
}
function toPuzzle(r) {
  return {
    id: r.id,
    name: r.name,
    width: r.width,
    height: r.height,
    difficulty: r.difficulty,
    cells: parseCells(r.cells)
  };
}
function toSolution(r) {
  if (!r.solH || !r.solV) return null;
  const st = {
    puzzleId: r.id,
    width: r.width,
    height: r.height,
    h: parseEdges(r.solH),
    v: parseEdges(r.solV)
  };
  lockPads(st);
  return st;
}
var puzzles = RAW_PUZZLES.map(toPuzzle);
var solutions = /* @__PURE__ */ new Map();
for (const r of RAW_PUZZLES) {
  const sol = toSolution(r);
  if (sol) solutions.set(r.id, sol);
}

// scripts/logic-test.mts
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else {
    console.log("OK", msg);
  }
}
{
  const puzzle = {
    id: "n0",
    name: "n0",
    width: 1,
    height: 1,
    cells: [0],
    difficulty: "easy"
  };
  const st = createEmptyState(puzzle);
  const { steps, finalState } = collectLogicSteps(puzzle, st);
  assert(steps.length > 0, `number0 produces steps (${steps.length})`);
  const allOff = finalState.h.every((v) => v === 2 /* Forbidden */) && finalState.v.every((v) => v === 2 /* Forbidden */);
  assert(allOff, "number0 fills all edges Forbidden");
}
{
  const puzzle = {
    id: "r1b",
    name: "r1b",
    width: 2,
    height: 1,
    cells: [1, 1],
    difficulty: "easy"
  };
  const st = createEmptyState(puzzle);
  const w = 2;
  setEdge(st, "h", hIndex(w, 1, 0), 2 /* Forbidden */);
  setEdge(st, "h", hIndex(w, 1, 1), 2 /* Forbidden */);
  setEdge(st, "v", vIndex(w, 0, 1), 2 /* Forbidden */);
  const { steps } = collectLogicSteps(puzzle, st);
  const turnOn = steps.some(
    (s) => s.changes.some(
      (c) => c.to === 1 /* On */ && c.axis === "v" && c.index === vIndex(w, 1, 1)
    )
  );
  assert(turnOn, "rule1 case B turns remaining edge On");
}
{
  const puzzle = {
    id: "r4",
    name: "r4",
    width: 2,
    height: 2,
    cells: [null, null, null, null],
    difficulty: "easy"
  };
  const st = createEmptyState(puzzle);
  const w = 2;
  setEdge(st, "h", hIndex(w, 1, 1), 1 /* On */);
  setEdge(st, "v", vIndex(w, 1, 1), 1 /* On */);
  const { steps } = collectLogicSteps(puzzle, st);
  const excluded = steps.some(
    (s) => s.changes.some(
      (c) => c.to === 2 /* Forbidden */ && (c.axis === "h" && c.index === hIndex(w, 2, 1) || c.axis === "v" && c.index === vIndex(w, 1, 2))
    )
  );
  assert(excluded, "rule4 case A excludes remaining edges at vertex");
}
{
  const w = 3;
  const h = 3;
  const puzzle = {
    id: "r12",
    name: "r12",
    width: w,
    height: h,
    cells: [null, null, null, null, null, null, null, null, null],
    difficulty: "custom"
  };
  const st = createEmptyState(puzzle);
  const e = cellEdges(w, 0, 0);
  setEdge(st, "h", e.top, 1 /* On */);
  setEdge(st, "h", e.bottom, 1 /* On */);
  setEdge(st, "v", e.left, 1 /* On */);
  setEdge(st, "v", e.right, 1 /* On */);
  const plan = planLogicSolve(puzzle, st);
  const v = validate(plan.finalState, puzzle);
  const loopEdges = /* @__PURE__ */ new Set([
    `h:${e.top}`,
    `h:${e.bottom}`,
    `v:${e.left}`,
    `v:${e.right}`
  ]);
  let otherOn = 0;
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) {
      const idx = hIndex(w, hx, hy);
      if (!loopEdges.has(`h:${idx}`) && edgeValue(plan.finalState, "h", idx) === 1 /* On */) otherOn++;
    }
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const idx = vIndex(w, vx, vy);
      if (!loopEdges.has(`v:${idx}`) && edgeValue(plan.finalState, "v", idx) === 1 /* On */) otherOn++;
    }
  }
  const hasR12 = plan.frames.some((f) => f.rule === 12);
  assert(otherOn === 0 && v.solved && hasR12, `rule12 \u73AF\u8DEF\u95ED\u5408\uFF1A\u5C0F\u73AF\u5916\u7684\u8FB9\u5168\u90E8\u6392\u9664\u3001\u7EC8\u6001\u5408\u6CD5\u3001\u89C4\u521912 \u6709\u5E27 (R12=${hasR12})`);
}
{
  const w = 2;
  const h = 2;
  const puzzle = {
    id: "r13",
    name: "r13",
    width: w,
    height: h,
    cells: [0, null, null, 3],
    difficulty: "custom"
  };
  const plan = planLogicSolve(puzzle, createEmptyState(puzzle));
  const eb = cellEdges(w, 1, 1);
  const on1 = edgeValue(plan.finalState, "h", eb.top) === 1 /* On */;
  const on2 = edgeValue(plan.finalState, "v", eb.left) === 1 /* On */;
  assert(on1 && on2, "\u5BF9\u89D2 0-3\uFF1A3 \u683C\u516C\u5171\u9876\u70B9\u7684\u4E24\u6761\u5185\u8FB9\u843D\u73AF\uFF08\u89C4\u521913 \u4E0E\u89C4\u52194B \u90FD\u8986\u76D6\uFF09");
}
{
  let r14 = 0;
  for (const p of puzzles) {
    const plan = planLogicSolve(p, createEmptyState(p));
    r14 += plan.frames.filter((f) => f.rule === 14).length;
  }
  assert(r14 > 0, `rule14 \u76F8\u90BB\u4E24\u683C\u8BA1\u6570\uFF1A\u9898\u5E93\u4E0A\u5171\u63A8\u51FA ${r14} \u683C`);
}
{
  let r11 = 0;
  let solvedAll = true;
  for (const p of puzzles) {
    const plan = planLogicSolve(p, createEmptyState(p));
    r11 += plan.frames.filter((f) => f.rule === 11).length;
    if (!validate(plan.finalState, p).solved) solvedAll = false;
  }
  assert(solvedAll, `\u5168\u90E8 ${puzzles.length} \u9898\u903B\u8F91\u7EC8\u6001\u90FD\u662F\u5408\u6CD5\u5355\u73AF\u89E3`);
  assert(r11 <= 25, `\u524D\u77BB\u53CD\u8BC1\u5E27\u603B\u6570 ${r11} \u2264 25\uFF08\u4F18\u5316\u524D\u4E3A 135\uFF09`);
}
console.log("done");
