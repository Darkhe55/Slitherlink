// src/state.ts
function hWidth(w) {
  return w + 2;
}
function isHPad(w, hx) {
  return hx === 0 || hx === w + 1;
}
function isVPad(h, vy) {
  return vy === 0 || vy === h + 1;
}
function isPadEdge(w, h, axis, index) {
  if (axis === "h") {
    const hx = index % hWidth(w);
    return isHPad(w, hx);
  }
  const stride = w + 1;
  const vy = Math.floor(index / stride);
  return isVPad(h, vy);
}

// src/render.ts
function metricsFor(puzzle2) {
  const cell = puzzle2.width >= 10 ? 48 : 64;
  const pad = cell * 0.35;
  return {
    cell,
    pad,
    width: puzzle2.width,
    height: puzzle2.height,
    svgWidth: pad * 2 + puzzle2.width * cell,
    svgHeight: pad * 2 + puzzle2.height * cell
  };
}
function hitTest(m2, puzzle2, px, py) {
  const w = puzzle2.width;
  const h = puzzle2.height;
  let best = null;
  for (let hy = 0; hy <= h; hy++) {
    const y = m2.pad + hy * m2.cell;
    const distY = Math.abs(py - y);
    if (distY > m2.cell * 0.35) continue;
    const hx = Math.floor((px - m2.pad) / m2.cell);
    if (hx < 0 || hx > w - 1) continue;
    const distX = Math.abs(px - (m2.pad + (hx + 0.5) * m2.cell));
    const dist = distY + distX * 0.15;
    const index = hy * (w + 2) + (hx + 1);
    if (isPadEdge(w, h, "h", index)) continue;
    if (!best || dist < best.dist) best = { axis: "h", index, dist };
  }
  for (let vx = 0; vx <= w; vx++) {
    const x = m2.pad + vx * m2.cell;
    const distX = Math.abs(px - x);
    if (distX > m2.cell * 0.35) continue;
    const vy = Math.floor((py - m2.pad) / m2.cell);
    if (vy < 0 || vy > h - 1) continue;
    const distY = Math.abs(py - (m2.pad + (vy + 0.5) * m2.cell));
    const dist = distX + distY * 0.15;
    const index = (vy + 1) * (w + 1) + vx;
    if (isPadEdge(w, h, "v", index)) continue;
    if (!best || dist < best.dist) best = { axis: "v", index, dist };
  }
  return best ? { axis: best.axis, index: best.index } : null;
}

// scripts/hit-test.mts
var puzzle = {
  id: "t",
  name: "t",
  width: 5,
  height: 5,
  cells: Array(25).fill(0),
  difficulty: "easy"
};
var m = metricsFor(puzzle);
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else {
    console.log("OK", msg);
  }
}
var midX = m.pad + 0.5 * m.cell;
var midY = m.pad;
var hit = hitTest(m, puzzle, midX, midY);
assert(!!hit && hit.axis === "h", `mid first H edge axis=h (got ${hit?.axis})`);
assert(!!hit && hit.index === 1, `mid first H edge index=1 (got ${hit?.index})`);
var hitR = hitTest(m, puzzle, m.pad + m.cell - 0.5, m.pad);
assert(!!hitR && hitR.index === 1, `near right of H0 index=1 (got ${hitR?.index})`);
var hit2 = hitTest(m, puzzle, m.pad + 1.5 * m.cell, m.pad);
assert(!!hit2 && hit2.axis === "h" && hit2.index === 2, `mid H1 index=2 (got ${hit2?.index})`);
var hitV = hitTest(m, puzzle, m.pad, m.pad + 0.5 * m.cell);
assert(!!hitV && hitV.axis === "v", `mid first V edge axis=v (got ${hitV?.axis})`);
assert(!!hitV && hitV.index === 6, `mid first V edge index=6 (got ${hitV?.index})`);
console.log("metrics", m);
