// src/state.ts
function hWidth(w2) {
  return w2 + 2;
}
function hLength(w2, h2) {
  return (h2 + 1) * hWidth(w2);
}
function vHeight(h2) {
  return h2 + 2;
}
function vLength(w2, h2) {
  return vHeight(h2) * (w2 + 1);
}
function hIndex(w2, hx, hy) {
  return hy * hWidth(w2) + hx;
}
function vIndex(w2, vx, vy) {
  return vy * (w2 + 1) + vx;
}
function cellEdges(w2, cx, cy) {
  return {
    top: hIndex(w2, cx + 1, cy),
    bottom: hIndex(w2, cx + 1, cy + 1),
    left: vIndex(w2, cx, cy + 1),
    right: vIndex(w2, cx + 1, cy + 1)
  };
}
function vertexEdges(w2, px, py) {
  return {
    west: hIndex(w2, px, py),
    east: hIndex(w2, px + 1, py),
    north: vIndex(w2, px, py),
    south: vIndex(w2, px, py + 1)
  };
}
function allVertexPositions(w2, h2) {
  const pts = [];
  for (let py = 0; py <= h2; py++) {
    for (let px = 0; px <= w2; px++) {
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
  const { width: w2, height: h2 } = puzzle;
  const hArr = new Array(hLength(w2, h2)).fill(2 /* Forbidden */);
  const vArr = new Array(vLength(w2, h2)).fill(2 /* Forbidden */);
  for (let hy = 0; hy <= h2; hy++) {
    for (let hx = 1; hx <= w2; hx++) {
      hArr[hIndex(w2, hx, hy)] = 0 /* Unknown */;
    }
  }
  for (let vy = 1; vy <= h2; vy++) {
    for (let vx = 0; vx <= w2; vx++) {
      vArr[vIndex(w2, vx, vy)] = 0 /* Unknown */;
    }
  }
  return {
    puzzleId: puzzle.id,
    width: w2,
    height: h2,
    h: hArr,
    v: vArr
  };
}
function lockPads(state) {
  const { width: w2, height: h2 } = state;
  for (let hy = 0; hy <= h2; hy++) {
    state.h[hIndex(w2, 0, hy)] = 2 /* Forbidden */;
    state.h[hIndex(w2, w2 + 1, hy)] = 2 /* Forbidden */;
  }
  for (let vx = 0; vx <= w2; vx++) {
    state.v[vIndex(w2, vx, 0)] = 2 /* Forbidden */;
    state.v[vIndex(w2, vx, h2 + 1)] = 2 /* Forbidden */;
  }
}

// src/solver.ts
function loopFromPolyomino(w2, h2, inSet) {
  const hOn = new Array((h2 + 1) * w2).fill(false);
  const vOn = new Array(h2 * (w2 + 1)).fill(false);
  const cell = (cx, cy) => cx < 0 || cy < 0 || cx >= w2 || cy >= h2 ? false : inSet[cy * w2 + cx];
  for (let cy = 0; cy < h2; cy++) {
    for (let cx = 0; cx < w2; cx++) {
      const inside = cell(cx, cy);
      if (inside !== cell(cx, cy - 1)) {
        hOn[cy * w2 + cx] = true;
      }
      if (inside !== cell(cx, cy + 1)) {
        hOn[(cy + 1) * w2 + cx] = true;
      }
      if (inside !== cell(cx - 1, cy)) {
        vOn[cy * (w2 + 1) + cx] = true;
      }
      if (inside !== cell(cx + 1, cy)) {
        vOn[cy * (w2 + 1) + cx + 1] = true;
      }
    }
  }
  return { h: hOn, v: vOn };
}
function randomHoleFreePolyomino(w2, h2, targetSize, rng) {
  const inSet = new Array(w2 * h2).fill(false);
  const cx0 = Math.floor(rng() * w2);
  const cy0 = Math.floor(rng() * h2);
  inSet[cy0 * w2 + cx0] = true;
  let size = 1;
  const has = (cx, cy) => cx >= 0 && cy >= 0 && cx < w2 && cy < h2 && inSet[cy * w2 + cx];
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
  const max = Math.min(targetSize, w2 * h2);
  while (size < max) {
    const candidates = [];
    for (let cy = 0; cy < h2; cy++) {
      for (let cx = 0; cx < w2; cx++) {
        if (inSet[cy * w2 + cx]) continue;
        if (neighborCount(cx, cy) !== 1) continue;
        if (createsPinch(cx, cy)) continue;
        candidates.push([cx, cy]);
      }
    }
    if (!candidates.length) break;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    inSet[pick[1] * w2 + pick[0]] = true;
    size++;
  }
  return inSet;
}
function numbersFromLoop(w2, h2, hOn, vOn) {
  const nums = new Array(w2 * h2).fill(0);
  for (let cy = 0; cy < h2; cy++) {
    for (let cx = 0; cx < w2; cx++) {
      let n = 0;
      if (hOn[cy * w2 + cx]) n++;
      if (hOn[(cy + 1) * w2 + cx]) n++;
      if (vOn[cy * (w2 + 1) + cx]) n++;
      if (vOn[cy * (w2 + 1) + cx + 1]) n++;
      nums[cy * w2 + cx] = n;
    }
  }
  return nums;
}
function stateFromLoop(puzzle, hOn, vOn) {
  const st2 = createEmptyState(puzzle);
  const w2 = puzzle.width;
  const h2 = puzzle.height;
  for (let hy = 0; hy <= h2; hy++) {
    for (let hx = 0; hx < w2; hx++) {
      const idx = hIndex(w2, hx + 1, hy);
      setEdge(st2, "h", idx, hOn[hy * w2 + hx] ? 1 /* On */ : 2 /* Forbidden */);
    }
  }
  for (let vy = 0; vy < h2; vy++) {
    for (let vx = 0; vx <= w2; vx++) {
      const idx = vIndex(w2, vx, vy + 1);
      setEdge(st2, "v", idx, vOn[vy * (w2 + 1) + vx] ? 1 /* On */ : 2 /* Forbidden */);
    }
  }
  lockPads(st2);
  return st2;
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
function buildPuzzle(opts) {
  const { width: w2, height: h2, seed, fillRatio } = opts;
  for (let attempt = 0; attempt < 20; attempt++) {
    const rng = mulberry32(seed + attempt * 9973);
    const target = Math.max(3, Math.floor(w2 * h2 * fillRatio));
    const inSet = randomHoleFreePolyomino(w2, h2, target, rng);
    const { h: hOn, v: vOn } = loopFromPolyomino(w2, h2, inSet);
    const raw = numbersFromLoop(w2, h2, hOn, vOn);
    if (raw.some((n) => n > 3)) continue;
    const cells = raw.map((n) => n);
    const puzzle = {
      id: opts.id,
      name: opts.name,
      width: w2,
      height: h2,
      difficulty: opts.difficulty,
      cells
    };
    const sol = stateFromLoop(puzzle, hOn, vOn);
    solutions.set(puzzle.id, sol);
    return puzzle;
  }
  throw new Error(`failed to build puzzle ${opts.id}`);
}
var puzzles = [
  buildPuzzle({
    id: "easy-5x5-a",
    name: "\u5165\u95E8 \xB7 5\xD75 A",
    width: 5,
    height: 5,
    difficulty: "easy",
    seed: 20240501,
    fillRatio: 0.35
  }),
  buildPuzzle({
    id: "easy-5x5-b",
    name: "\u5165\u95E8 \xB7 5\xD75 B",
    width: 5,
    height: 5,
    difficulty: "easy",
    seed: 20240502,
    fillRatio: 0.45
  }),
  buildPuzzle({
    id: "medium-10x10-a",
    name: "\u8FDB\u9636 \xB7 10\xD710 A",
    width: 10,
    height: 10,
    difficulty: "medium",
    seed: 20240510,
    fillRatio: 0.38
  }),
  buildPuzzle({
    id: "hard-10x10-a",
    name: "\u6311\u6218 \xB7 10\xD710 B",
    width: 10,
    height: 10,
    difficulty: "hard",
    seed: 20240511,
    fillRatio: 0.28
  })
];
function getReferenceSolution(id) {
  return solutions.get(id) ?? null;
}

// src/validate.ts
function countOnAroundCell(state, w2, cx, cy) {
  const e = cellEdges(w2, cx, cy);
  let n = 0;
  if (edgeValue(state, "h", e.top) === 1 /* On */) n++;
  if (edgeValue(state, "h", e.bottom) === 1 /* On */) n++;
  if (edgeValue(state, "v", e.left) === 1 /* On */) n++;
  if (edgeValue(state, "v", e.right) === 1 /* On */) n++;
  return n;
}
function degreeAt(state, w2, px, py) {
  const e = vertexEdges(w2, px, py);
  let d = 0;
  if (edgeValue(state, "h", e.west) === 1 /* On */) d++;
  if (edgeValue(state, "h", e.east) === 1 /* On */) d++;
  if (edgeValue(state, "v", e.north) === 1 /* On */) d++;
  if (edgeValue(state, "v", e.south) === 1 /* On */) d++;
  return d;
}
function analyzeLoop(state, w2, h2) {
  const pts = allVertexPositions(w2, h2);
  let onEdgeCount = 0;
  for (const s of state.h) if (s === 1 /* On */) onEdgeCount++;
  for (const s of state.v) if (s === 1 /* On */) onEdgeCount++;
  if (onEdgeCount === 0) return { kind: "empty" };
  const key = (px, py) => py * (w2 + 1) + px;
  const adj = /* @__PURE__ */ new Map();
  for (const { px, py } of pts) {
    const e = vertexEdges(w2, px, py);
    const nbrs = [];
    if (edgeValue(state, "h", e.west) === 1 /* On */ && px > 0) nbrs.push(key(px - 1, py));
    if (edgeValue(state, "h", e.east) === 1 /* On */ && px < w2) nbrs.push(key(px + 1, py));
    if (edgeValue(state, "v", e.north) === 1 /* On */ && py > 0) nbrs.push(key(px, py - 1));
    if (edgeValue(state, "v", e.south) === 1 /* On */ && py < h2) nbrs.push(key(px, py + 1));
    if (nbrs.length) adj.set(key(px, py), nbrs);
  }
  for (const { px, py } of pts) {
    const d = degreeAt(state, w2, px, py);
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
  const w2 = puzzle.width;
  const h2 = puzzle.height;
  const badPoints = [];
  const badCells = [];
  for (const { px, py } of allVertexPositions(w2, h2)) {
    const d = degreeAt(state, w2, px, py);
    if (d === 1 || d >= 3) {
      badPoints.push({ px, py, degree: d });
    }
  }
  for (let cy = 0; cy < h2; cy++) {
    for (let cx = 0; cx < w2; cx++) {
      const expected = puzzle.cells[cy * w2 + cx];
      if (expected === null) continue;
      const actual = countOnAroundCell(state, w2, cx, cy);
      if (actual !== expected) {
        badCells.push({ cx, cy, expected, actual });
      }
    }
  }
  const loop = analyzeLoop(state, w2, h2);
  const solved = badPoints.length === 0 && badCells.length === 0 && loop.kind === "single";
  return { badPoints, badCells, loop, solved };
}

// scripts/check.mts
console.log("puzzle count:", puzzles.length);
if (puzzles.length < 4) {
  console.error("expected 4 puzzles");
  process.exitCode = 1;
}
for (const p2 of puzzles) {
  console.log("---", p2.id, `${p2.width}x${p2.height}`, p2.difficulty);
  console.log("cells:", p2.cells.join(""));
  const sol = getReferenceSolution(p2.id);
  if (!sol) {
    console.error("missing reference solution");
    process.exitCode = 1;
    continue;
  }
  const result = validate(sol, p2);
  console.log("ref solution solved:", result.solved, "loop:", result.loop.kind);
  if (!result.solved) {
    console.error("ref solution invalid", result.badCells, result.badPoints);
    process.exitCode = 1;
  }
}
var p = puzzles[0];
var st = createEmptyState(p);
lockPads(st);
var w = p.width;
var h = p.height;
var padOk = true;
for (let hy = 0; hy <= h; hy++) {
  if (st.h[hIndex(w, 0, hy)] !== 2 /* Forbidden */) padOk = false;
  if (st.h[hIndex(w, w + 1, hy)] !== 2 /* Forbidden */) padOk = false;
}
for (let vx = 0; vx <= w; vx++) {
  if (st.v[vIndex(w, vx, 0)] !== 2 /* Forbidden */) padOk = false;
  if (st.v[vIndex(w, vx, h + 1)] !== 2 /* Forbidden */) padOk = false;
}
console.log("pads locked:", padOk);
var fourOk = true;
for (let py = 0; py <= h; py++) {
  for (let px = 0; px <= w; px++) {
    const e = {
      west: hIndex(w, px, py),
      east: hIndex(w, px + 1, py),
      north: vIndex(w, px, py),
      south: vIndex(w, px, py + 1)
    };
    for (const idx of [e.west, e.east]) {
      if (idx < 0 || idx >= st.h.length) fourOk = false;
    }
    for (const idx of [e.north, e.south]) {
      if (idx < 0 || idx >= st.v.length) fourOk = false;
    }
  }
}
console.log("every vertex has 4 in-range edges:", fourOk);
console.log("h length", st.h.length, "expect", (h + 1) * (w + 2));
console.log("v length", st.v.length, "expect", (h + 2) * (w + 1));
var corner = {
  west: hIndex(w, 0, 0),
  east: hIndex(w, 1, 0),
  north: vIndex(w, 0, 0),
  south: vIndex(w, 0, 1)
};
console.log(
  "corner(0,0) states",
  edgeValue(st, "h", corner.west),
  edgeValue(st, "h", corner.east),
  edgeValue(st, "v", corner.north),
  edgeValue(st, "v", corner.south)
);
