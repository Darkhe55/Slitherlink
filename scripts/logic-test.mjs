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
function collectLogicSteps(puzzle, state) {
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
    for (const c of maskCells) {
      if (!masks.cells[c]) masks.cells[c] = true;
    }
    for (const v of maskVertices) {
      if (!masks.vertices[v]) masks.vertices[v] = true;
    }
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
          for (const s of sides) {
            trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          }
          flush(1, `\u89C4\u52191\uFF1A(${cx},${cy})=${n} \u5DF2\u6EE1\uFF0C\u5176\u4F59\u6392\u9664`, acc);
          continue;
        }
        if (off + n === 4 && unk > 0) {
          const acc = [];
          for (const s of sides) {
            trySet(s.axis, s.index, 1 /* On */, acc);
          }
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
            ],
            offCell: []
            // 填 vertexEdges 后算
          },
          {
            px: cx + 1,
            py: cy,
            onCell: [
              { axis: "h", index: e.top },
              { axis: "v", index: e.right }
            ],
            offCell: []
          },
          {
            px: cx,
            py: cy + 1,
            onCell: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.left }
            ],
            offCell: []
          },
          {
            px: cx + 1,
            py: cy + 1,
            onCell: [
              { axis: "h", index: e.bottom },
              { axis: "v", index: e.right }
            ],
            offCell: []
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
          const onCellKeys = new Set(
            c.onCell.map((s) => `${s.axis}:${s.index}`)
          );
          c.offCell = all.filter((s) => !onCellKeys.has(`${s.axis}:${s.index}`));
          {
            const [o1, o2] = c.offCell;
            if (o1 && o2) {
              const v1 = edgeValue(work, o1.axis, o1.index);
              const v2 = edgeValue(work, o2.axis, o2.index);
              if (v1 === 2 /* Forbidden */ && v2 === 2 /* Forbidden */) {
                const acc = [];
                for (const s of c.onCell) {
                  trySet(s.axis, s.index, 2 /* Forbidden */, acc);
                }
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
            const [o1, o2] = c.offCell;
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
                const atVertex = new Set(
                  c.onCell.map((s) => `${s.axis}:${s.index}`)
                );
                for (const s of cellSides) {
                  if (!atVertex.has(`${s.axis}:${s.index}`)) {
                    trySet(s.axis, s.index, 2 /* Forbidden */, acc);
                  }
                }
                flush(
                  2,
                  `\u89C4\u52192B\uFF1A\u6570\u5B571\u89D2(${c.px},${c.py})\u5916\u8FB9\u4E00\u6392\u9664\u4E00\u73AF \u2192 \u5BF9\u8FB9\u6392\u9664`,
                  acc
                );
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
          const offOn = offCell.filter(
            (s) => edgeValue(work, s.axis, s.index) === 1 /* On */
          );
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
          for (const s of all) {
            trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          }
          if (acc.length) {
            flush(4, `\u89C4\u52194\uFF1A\u70B9(${px},${py})\u5DF2 2 \u73AF\u8FB9 \u2192 \u4F59\u8FB9\u6392\u9664`, acc);
            continue;
          }
        }
        if (off === 3 && unk > 0) {
          const acc = [];
          for (const s of all) {
            trySet(s.axis, s.index, 2 /* Forbidden */, acc);
          }
          if (acc.length) {
            flush(4, `\u89C4\u52194\uFF1A\u70B9(${px},${py})\u5DF2 3 \u6392\u9664 \u2192 \u5269\u4F59\u6392\u9664`, acc);
            continue;
          }
        }
        if (off === 2 && on === 1 && unk === 1) {
          const acc = [];
          for (const s of all) {
            trySet(s.axis, s.index, 1 /* On */, acc);
          }
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
  for (let guard = 0; guard < 200; guard++) {
    const before = steps.length;
    applyRule1();
    applyRule2();
    applyRule3();
    applyRule4();
    if (steps.length === before) break;
  }
  return { steps, finalState: work, masks };
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
console.log("done");
