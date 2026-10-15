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
      if (inside !== cell(cx, cy - 1)) {
        hOn[cy * w + cx] = true;
      }
      if (inside !== cell(cx, cy + 1)) {
        hOn[(cy + 1) * w + cx] = true;
      }
      if (inside !== cell(cx - 1, cy)) {
        vOn[cy * (w + 1) + cx] = true;
      }
      if (inside !== cell(cx + 1, cy)) {
        vOn[cy * (w + 1) + cx + 1] = true;
      }
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
  const neighbors = (cx, cy) => [
    [cx + 1, cy],
    [cx - 1, cy],
    [cx, cy + 1],
    [cx, cy - 1]
  ];
  while (size < targetSize) {
    const frontier = [];
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (inSet[cy * w + cx]) continue;
        let n = 0;
        for (const [nx, ny] of neighbors(cx, cy)) {
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && inSet[ny * w + nx]) n++;
        }
        if (n > 0) frontier.push([cx, cy, n]);
      }
    }
    if (!frontier.length) break;
    const ones = frontier.filter(([, , n]) => n === 1);
    const pool = ones.length ? ones : frontier;
    const pick = pool[Math.floor(rng() * pool.length)];
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
      const idx = hIndex(w, hx + 1, hy);
      setEdge(st, "h", idx, hOn[hy * w + hx] ? 1 /* On */ : 2 /* Forbidden */);
    }
  }
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      const idx = vIndex(w, vx, vy + 1);
      setEdge(st, "v", idx, vOn[vy * (w + 1) + vx] ? 1 /* On */ : 2 /* Forbidden */);
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
function solvePuzzle(puzzle, maxNodes = 2e5) {
  const w = puzzle.width;
  const h = puzzle.height;
  const state = createEmptyState(puzzle);
  let nodes = 0;
  let timedOut = false;
  let found = null;
  const realH = [];
  const realV = [];
  for (let hy = 0; hy <= h; hy++) {
    for (let hx = 1; hx <= w; hx++) realH.push(hIndex(w, hx, hy));
  }
  for (let vy = 1; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) realV.push(vIndex(w, vx, vy));
  }
  const edges = [
    ...realH.map((index) => ({ axis: "h", index })),
    ...realV.map((index) => ({ axis: "v", index }))
  ];
  function cellsOk() {
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const t = puzzle.cells[cy * w + cx] ?? null;
        if (!cellSatisfied(state, w, cx, cy, t)) return false;
      }
    }
    return true;
  }
  function vertsOk() {
    for (let py = 0; py <= h; py++) {
      for (let px = 0; px <= w; px++) {
        if (!vertexOk(state, w, px, py)) return false;
      }
    }
    return true;
  }
  function dfs(i) {
    if (nodes++ > maxNodes) {
      timedOut = true;
      return false;
    }
    if (i === edges.length) {
      if (cellsOk() && vertsOk()) {
        found = cloneState(state);
        return true;
      }
      return false;
    }
    const { axis, index } = edges[i];
    for (const val of [1 /* On */, 2 /* Forbidden */]) {
      setEdge(state, axis, index, val);
      if (cellsOk() && vertsOk()) {
        if (dfs(i + 1)) return true;
      }
    }
    setEdge(state, axis, index, 0 /* Unknown */);
    return false;
  }
  const ok = dfs(0);
  return { solved: ok, solution: found, nodes, timedOut };
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
function buildPuzzle(opts) {
  const { width: w, height: h, seed, fillRatio } = opts;
  const rng = mulberry32(seed);
  const target = Math.max(3, Math.floor(w * h * fillRatio));
  const inSet = randomHoleFreePolyomino(w, h, target, rng);
  const { h: hOn, v: vOn } = loopFromPolyomino(w, h, inSet);
  const raw = numbersFromLoop(w, h, hOn, vOn);
  const cells = raw.map((n) => n);
  void rng;
  return {
    id: opts.id,
    name: opts.name,
    width: w,
    height: h,
    difficulty: opts.difficulty,
    cells
  };
}
function withSolutions(puzzles2) {
  return puzzles2.filter((p) => {
    const r = solvePuzzle(p, 15e4);
    return r.solved;
  });
}
var built = [
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
var puzzles = withSolutions(built);
function getPuzzle(id) {
  return puzzles.find((p) => p.id === id);
}
function referenceSolution(p) {
  const rng = mulberry32(
    p.id.includes("5x5-a") ? 20240501 : p.id.includes("5x5-b") ? 20240502 : p.id.includes("10x10-a") ? 20240510 : 20240511
  );
  const inSet = randomHoleFreePolyomino(p.width, p.height, Math.max(3, Math.floor(p.width * p.height * (p.difficulty === "hard" ? 0.28 : p.difficulty === "medium" ? 0.38 : 0.35))), rng);
  const { h, v } = loopFromPolyomino(p.width, p.height, inSet);
  return stateFromLoop(p, h, v);
}
export {
  getPuzzle,
  puzzles,
  referenceSolution
};
