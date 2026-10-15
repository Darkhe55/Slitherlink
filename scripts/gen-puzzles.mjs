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

// scripts/gen-puzzles.mts
import { writeFileSync } from "node:fs";
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 1831565813;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
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
  let c = countSolutions(test, 2, 2e5);
  while (c.timedOut === false && c.count > 1 && hidden.length) {
    const idx = hidden.pop();
    cells[idx] = full[idx];
    c = countSolutions({ ...puzzle, cells }, 2, 2e5);
  }
  if (c.timedOut && hidden.length > 1) {
    while (hidden.length > 1) {
      const idx = hidden.pop();
      cells[idx] = full[idx];
    }
  }
  return cells;
}
function buildOne(spec) {
  const { width: w, height: h, seed, fillRatio, blankRatio } = spec;
  for (let attempt = 0; attempt < 12; attempt++) {
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
    const sol = stateFromLoop(puzzle, hOn, vOn);
    return { puzzle, sol, series: spec.series };
  }
  throw new Error("build failed " + spec.id);
}
function batch(prefix, label, series, width, height, difficulty, fillRatio, count, seedBase, blankRatio = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = String.fromCharCode(65 + i % 26) + (i >= 26 ? String(Math.floor(i / 26)) : "");
    out.push({
      id: `${prefix}-${n}`,
      name: `${label} ${n}`,
      width,
      height,
      difficulty,
      seed: seedBase + i * 131,
      fillRatio,
      blankRatio,
      series
    });
  }
  return out;
}
var specs = [
  // —— 经典风格（模拟 Nikoli 常见盘）——
  ...batch("classic-5x5", "\u7ECF\u5178 \xB7 5\xD75", "classic", 5, 5, "easy", 0.42, 6, 100001, 0),
  ...batch("classic-10x10", "\u7ECF\u5178 \xB7 10\xD710", "classic", 10, 10, "medium", 0.38, 8, 100101, 0),
  ...batch("classic-15x15", "\u7ECF\u5178 \xB7 15\xD715", "classic", 15, 15, "hard", 0.32, 4, 100201, 0),
  ...batch("classic-20x20", "\u7ECF\u5178 \xB7 20\xD720", "classic", 20, 20, "hard", 0.28, 3, 100301, 0),
  // —— 入门 / 进阶 ——
  ...batch("easy-5x5", "\u5165\u95E8 \xB7 5\xD75", "easy", 5, 5, "easy", 0.38, 6, 20240501, 0),
  ...batch("medium-10x10", "\u8FDB\u9636 \xB7 10\xD710", "medium", 10, 10, "medium", 0.36, 5, 20240701, 0),
  ...batch("hard-10x10", "\u6311\u6218 \xB7 10\xD710", "hard", 10, 10, "hard", 0.28, 3, 20240901, 0),
  ...batch("easy-7x7", "\u4F11\u95F2 \xB7 7\xD77", "easy", 7, 7, "easy", 0.36, 4, 20241101, 0),
  ...batch("hard-8x8", "\u786C\u6838 \xB7 8\xD78", "hard", 8, 8, "hard", 0.26, 2, 20241201, 0),
  ...batch("expert-25x25", "\u4E13\u5BB6 \xB7 25\xD725", "expert", 25, 25, "hard", 0.22, 3, 20250601, 0),
  ...batch("blank-5x5", "\u7A7A\u767D \xB7 5\xD75", "blank", 5, 5, "easy", 0.42, 3, 20250101, 0.16),
  ...batch("blank-7x7", "\u7A7A\u767D \xB7 7\xD77", "blank", 7, 7, "medium", 0.38, 2, 20250201, 0.18),
  ...batch("blank-10x10", "\u7A7A\u767D \xB7 10\xD710", "blank", 10, 10, "hard", 0.34, 2, 20250401, 0.12)
];
console.log("generating", specs.length, "puzzles\u2026");
var t0 = Date.now();
var items = specs.map((s, i) => {
  const r = buildOne(s);
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${specs.length}`);
  return r;
});
console.log("built in", Date.now() - t0, "ms");
var lines = [];
lines.push("/* \u81EA\u52A8\u751F\u6210\uFF0C\u52FF\u624B\u6539\u3002scripts/gen-puzzles.mts */");
lines.push(`export type RawPuzzle = {`);
lines.push(`  id: string`);
lines.push(`  name: string`);
lines.push(`  width: number`);
lines.push(`  height: number`);
lines.push(`  difficulty: 'easy'|'medium'|'hard'|'custom'`);
lines.push(`  series: string`);
lines.push(`  /** \u6570\u5B57\u4E32\uFF1A0-3 \u6216 . */`);
lines.push(`  cells: string`);
lines.push(`  /** \u89E3\uFF1A\u6A2A\u8FB9(\u542Bpad)+\u7AD6\u8FB9(\u542Bpad)\uFF0C0-2 */`);
lines.push(`  solH: string`);
lines.push(`  solV: string`);
lines.push(`}`);
lines.push(``);
lines.push(`export const RAW_PUZZLES: RawPuzzle[] = [`);
for (const { puzzle: p, sol, series } of items) {
  const cells = p.cells.map((c) => c === null ? "." : String(c)).join("");
  const solH = sol.h.map((v) => String(v)).join("");
  const solV = sol.v.map((v) => String(v)).join("");
  lines.push(
    `  { id: ${JSON.stringify(p.id)}, name: ${JSON.stringify(p.name)}, width: ${p.width}, height: ${p.height}, difficulty: ${JSON.stringify(p.difficulty)}, series: ${JSON.stringify(series)}, cells: ${JSON.stringify(cells)}, solH: ${JSON.stringify(solH)}, solV: ${JSON.stringify(solV)} },`
  );
}
var MANUAL_PUZZLES = [
  {
    id: "human-15x15-a",
    name: "\u540D\u9898 \xB7 15\xD715 A",
    width: 15,
    height: 15,
    difficulty: "hard",
    series: "human",
    cells: ".23..22.........2221.3.....2.32....3..31.3....21.1.2......213....3..23.3.3.122..303.21..122.1......222.2.322...12......1..2.1...32.322.....3..2..312.32.3..3.....1...222....2.32....3...133...1..133.3.21.3..23.....2..2..1.2...3"
  }
];
for (const m of MANUAL_PUZZLES) {
  lines.push(
    `  { id: ${JSON.stringify(m.id)}, name: ${JSON.stringify(m.name)}, width: ${m.width}, height: ${m.height}, difficulty: ${JSON.stringify(m.difficulty)}, series: ${JSON.stringify(m.series)}, cells: ${JSON.stringify(m.cells)}, solH: "", solV: "" },`
  );
}
lines.push(`]`);
lines.push(``);
writeFileSync("src/puzzles-data.ts", lines.join("\n"));
console.log("wrote src/puzzles-data.ts", items.length, "puzzles");
