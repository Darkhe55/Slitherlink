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
function solvePuzzle(puzzle, maxNodes = 4e5) {
  const w = puzzle.width;
  const h = puzzle.height;
  const state = createEmptyState(puzzle);
  const edges = realEdges(w, h);
  let nodes = 0;
  let timedOut = false;
  let found = null;
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
      if (cellsOk() && vertsOk() && dfs(i + 1)) return true;
    }
    setEdge(state, axis, index, 0 /* Unknown */);
    return false;
  };
  const ok = dfs(0);
  return { solved: ok, solution: found, nodes, timedOut };
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

// scripts/custom-solve.mts
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else {
    console.log("OK", msg);
  }
}
var p1 = {
  id: "c1",
  name: "c1",
  width: 2,
  height: 2,
  cells: [2, 2, 2, 2],
  difficulty: "custom"
};
var r1 = solvePuzzle(p1, 2e5);
assert(r1.solved, `2x2 all-2 solvable (nodes=${r1.nodes})`);
var p0 = {
  id: "c0",
  name: "c0",
  width: 1,
  height: 1,
  cells: [0],
  difficulty: "custom"
};
var r0 = solvePuzzle(p0, 5e4);
assert(r0.solved, "1x1 zero solvable");
var pEmpty = {
  id: "ce",
  name: "ce",
  width: 3,
  height: 3,
  cells: [null, null, null, null, null, null, null, null, null],
  difficulty: "custom"
};
var cEmpty = countSolutions(pEmpty, 2, 3e5);
assert(cEmpty.count >= 1, `blank 3x3 has solutions (${cEmpty.count})`);
var pHard = {
  id: "ch",
  name: "ch",
  width: 2,
  height: 1,
  cells: [0, 3],
  difficulty: "custom"
};
var rH = solvePuzzle(pHard, 1e5);
console.log("2x1 [0,3] solved", rH.solved);
console.log("done");
