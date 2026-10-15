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
    const aSides = /* @__PURE__ */ new Set([aE.top, aE.bottom, aE.left, aE.right]);
    const bSides = /* @__PURE__ */ new Set([bE.top, bE.bottom, bE.left, bE.right]);
    const vertices2 = [
      {
        px: ax + 1,
        py: ay,
        // 顶点四边
        all: null,
        // A、B 在该顶点的非共享边
        aSide: { axis: "h", index: aE.top },
        bSide: { axis: "h", index: bE.top },
        // 外向：北
        outward: { axis: "v", index: vertexEdges(w, ax + 1, ay).north }
      },
      {
        px: ax + 1,
        py: ay + 1,
        all: null,
        aSide: { axis: "h", index: aE.bottom },
        bSide: { axis: "h", index: bE.bottom },
        outward: { axis: "v", index: vertexEdges(w, ax + 1, ay + 1).south }
      }
    ];
    void aSides;
    void bSides;
    return { shared: shared2, vertices: vertices2, a: aE, b: bE };
  }
  const shared = { axis: "h", index: aE.bottom };
  const vertices = [
    {
      px: ax,
      py: ay + 1,
      all: null,
      aSide: { axis: "v", index: aE.left },
      bSide: { axis: "v", index: bE.left },
      // 外向：西
      outward: { axis: "h", index: vertexEdges(w, ax, ay + 1).west }
    },
    {
      px: ax + 1,
      py: ay + 1,
      all: null,
      aSide: { axis: "v", index: aE.right },
      bSide: { axis: "v", index: bE.right },
      outward: { axis: "h", index: vertexEdges(w, ax + 1, ay + 1).east }
    }
  ];
  return { shared, vertices, a: aE, b: bE };
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
              flush(
                5,
                `\u89C4\u52195\uFF1A1-1(${cx},${cy})|(${cx + 1},${cy}) \u5916\u5411\u6392\u9664 \u2192 \u5171\u4EAB\u8FB9\u6392\u9664`,
                acc
              );
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
              flush(
                5,
                `\u89C4\u52195\uFF1A1-1(${cx},${cy})|(${cx},${cy + 1}) \u5916\u5411\u6392\u9664 \u2192 \u5171\u4EAB\u8FB9\u6392\u9664`,
                acc
              );
            }
          }
        }
      }
    }
  };
  const applyRule6 = () => {
    const seen = /* @__PURE__ */ new Set();
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        if (puzzle.cells[cellMaskIndex(w, cx, cy)] !== 3) continue;
        if (cx + 1 < w && puzzle.cells[cellMaskIndex(w, cx + 1, cy)] === 3) {
          const key = `H:${cx}:${cy}`;
          if (!seen.has(key)) {
            seen.add(key);
            const g = sharedGeometry(w, cx, cy, "H");
            const acc = [];
            for (const v of g.vertices) {
              trySet(v.outward.axis, v.outward.index, 2 /* Forbidden */, acc);
            }
            if (acc.length) {
              flush(
                6,
                `\u89C4\u52196\uFF1A\u53CC3(${cx},${cy})|(${cx + 1},${cy}) \u5171\u4EAB\u9876\u70B9\u5916\u5411\u6392\u9664`,
                acc
              );
            }
          }
        }
        if (cy + 1 < h && puzzle.cells[cellMaskIndex(w, cx, cy + 1)] === 3) {
          const key = `V:${cx}:${cy}`;
          if (!seen.has(key)) {
            seen.add(key);
            const g = sharedGeometry(w, cx, cy, "V");
            const acc = [];
            for (const v of g.vertices) {
              trySet(v.outward.axis, v.outward.index, 2 /* Forbidden */, acc);
            }
            if (acc.length) {
              flush(
                6,
                `\u89C4\u52196\uFF1A\u53CC3(${cx},${cy})|(${cx},${cy + 1}) \u5171\u4EAB\u9876\u70B9\u5916\u5411\u6392\u9664`,
                acc
              );
            }
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
    applyRule5();
    applyRule6();
    if (steps.length === before) break;
  }
  return { steps, finalState: work, masks };
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
  ...batch("hard-10x10", "\u6311\u6218 \xB7 10\xD710", 10, 10, "hard", 0.28, 4, 20240901, 0),
  ...batch("easy-7x7", "\u4F11\u95F2 \xB7 7\xD77", 7, 7, "easy", 0.36, 4, 20241101, 0),
  ...batch("hard-8x8", "\u786C\u6838 \xB7 8\xD78", 8, 8, "hard", 0.26, 3, 20241201, 0),
  // 空白格：部分不显示数字，仍尽量保持唯一解
  ...batch("blank-5x5", "\u7A7A\u767D \xB7 5\xD75", 5, 5, "easy", 0.42, 3, 20250101, 0.16),
  ...batch("blank-7x7", "\u7A7A\u767D \xB7 7\xD77", 7, 7, "medium", 0.38, 3, 20250201, 0.18),
  ...batch("blank-10x10", "\u7A7A\u767D \xB7 10\xD710", 10, 10, "hard", 0.34, 2, 20250401, 0.12)
];
var puzzles = specs.map((s) => buildPuzzle(s));
function getReferenceSolution(id) {
  return solutions.get(id) ?? null;
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
  const solved2 = badPoints.length === 0 && badCells.length === 0 && loop.kind === "single";
  return { badPoints, badCells, loop, solved: solved2 };
}

// scripts/rule-power.mts
var stats = [];
for (const p of puzzles) {
  const sol = getReferenceSolution(p.id);
  const st = createEmptyState(p);
  const { steps, finalState } = collectLogicSteps(p, st);
  let on = 0, off = 0, unk = 0;
  let correctOn = 0, wrongOn = 0, correctOff = 0, wrongOff = 0;
  for (let hy = 0; hy <= p.height; hy++) {
    for (let hx = 1; hx <= p.width; hx++) {
      const i = hIndex(p.width, hx, hy);
      const v = finalState.h[i];
      const t = sol.h[i];
      if (v === 1 /* On */) {
        on++;
        if (t === 1 /* On */) correctOn++;
        else wrongOn++;
      } else if (v === 2 /* Forbidden */) {
        off++;
        if (t === 2 /* Forbidden */) correctOff++;
        else wrongOff++;
      } else unk++;
    }
  }
  for (let vy = 1; vy <= p.height; vy++) {
    for (let vx = 0; vx <= p.width; vx++) {
      const i = vIndex(p.width, vx, vy);
      const v = finalState.v[i];
      const t = sol.v[i];
      if (v === 1 /* On */) {
        on++;
        if (t === 1 /* On */) correctOn++;
        else wrongOn++;
      } else if (v === 2 /* Forbidden */) {
        off++;
        if (t === 2 /* Forbidden */) correctOff++;
        else wrongOff++;
      } else unk++;
    }
  }
  const result = validate(finalState, p);
  stats.push({
    id: p.id,
    size: `${p.width}x${p.height}`,
    steps: steps.length,
    on,
    off,
    unk,
    solvedByRules: result.solved,
    vsTruth: { correctOn, wrongOn, correctOff, wrongOff }
  });
}
var bySize = /* @__PURE__ */ new Map();
for (const s of stats) {
  const g = bySize.get(s.size) ?? { n: 0, solved: 0, unkSum: 0, steps: 0 };
  g.n++;
  if (s.solvedByRules) g.solved++;
  g.unkSum += s.unk;
  g.steps += s.steps;
  bySize.set(s.size, g);
}
console.log("=== \u6309\u5C3A\u5BF8 ===");
for (const [size, g] of bySize) {
  console.log(
    `${size}: ${g.solved}/${g.n} \u89C4\u5219\u5168\u89E3 \xB7 \u5E73\u5747\u5269\u4F59\u672A\u77E5 ${(g.unkSum / g.n).toFixed(1)} \xB7 \u5E73\u5747\u6B65\u6570 ${(g.steps / g.n).toFixed(1)}`
  );
}
var total = stats.length;
var solved = stats.filter((s) => s.solvedByRules).length;
var avgUnk = stats.reduce((a, s) => a + s.unk, 0) / total;
var avgOn = stats.reduce((a, s) => a + s.on, 0) / total;
console.log(`
\u5168\u90E8: ${solved}/${total} \u89C4\u5219\u53EF\u5168\u89E3`);
console.log(`\u5E73\u5747\u786E\u5B9A\u73AF\u8FB9 ${avgOn.toFixed(1)} \xB7 \u5E73\u5747\u5269\u4F59\u672A\u77E5 ${avgUnk.toFixed(1)}`);
var conflicts = stats.reduce(
  (a, s) => a + s.vsTruth.wrongOn + s.vsTruth.wrongOff,
  0
);
console.log(`\u4E0E\u771F\u89E3\u51B2\u7A81 ${conflicts}`);
console.log("\n=== \u672A\u5168\u89E3\u6837\u4F8B ===");
for (const s of stats.filter((x) => !x.solvedByRules).slice(0, 5)) {
  console.log(
    `${s.id} steps=${s.steps} on=${s.on} off=${s.off} unk=${s.unk} truthOnCorrect=${s.vsTruth.correctOn}`
  );
}
