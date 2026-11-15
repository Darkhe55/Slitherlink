/** 规则回归：健全性 + 不得误截（可解题板必须照旧完整推出） */
import { chromium } from 'playwright-core'
import { edgePath, profileDir } from './_browser.mjs'

const EXE = edgePath()
const URL = 'http://127.0.0.1:5177/'
const PROFILE = profileDir('rules')

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  executablePath: EXE,
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')

const out = await page.evaluate(async () => {
  const logic = await import('/src/logic.ts')
  const solver = await import('/src/solver.ts')
  const puz = await import('/src/puzzles.ts')
  const UNK = 0, ON = 1, OFF = 2
  const rows = []

  const check = (puzzle, truth) => {
    const w = puzzle.width, h = puzzle.height
    const hArr = new Array((h + 1) * (w + 2)).fill(OFF)
    for (let hy = 0; hy <= h; hy++) for (let hx = 1; hx <= w; hx++) hArr[hy * (w + 2) + hx] = UNK
    const vArr = new Array((h + 2) * (w + 1)).fill(OFF)
    for (let vy = 1; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) vArr[vy * (w + 1) + vx] = UNK
    const st = { puzzleId: puzzle.id, width: w, height: h, h: hArr, v: vArr }
    const plan = logic.planLogicSolve(puzzle, st)
    let wrong = 0
    let left = 0
    const work = { h: hArr.slice(), v: vArr.slice() }
    for (const f of plan.frames) {
      if (f.change.axis === 'h') work.h[f.change.index] = f.change.to
      else work.v[f.change.index] = f.change.to
      if (truth) {
        const arr = f.change.axis === 'h' ? truth.h : truth.v
        if (arr[f.change.index] !== f.change.to) wrong++
      }
    }
    for (let hy = 0; hy <= h; hy++) for (let hx = 1; hx <= w; hx++) if (work.h[hy * (w + 2) + hx] === UNK) left++
    for (let vy = 1; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) if (work.v[vy * (w + 1) + vx] === UNK) left++
    return {
      id: puzzle.id,
      size: w + 'x' + h,
      frames: plan.frames.length,
      wrong,
      left,
      saturated: plan.saturated,
    }
  }

  // 1) 全部内置题（对照参考解）
  for (const p of puz.puzzles) rows.push(check(p, puz.getReferenceSolution(p.id)))

  // 2) 5 个合法 30x30（对照生成时的真解）
  let rs = 20260
  const rng = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff }
  for (let k = 0; k < 5; k++) {
    let inSet = null
    for (let a = 0; a < 40 && !inSet; a++) inSet = solver.randomHoleFreePolyomino(30, 30, 300 + Math.floor(rng() * 300), rng)
    const loop = solver.loopFromPolyomino(30, 30, inSet)
    const nums = solver.numbersFromLoop(30, 30, loop.h, loop.v)
    const p = { id: 'gen30-' + k, name: 'g', width: 30, height: 30, cells: nums, difficulty: 'custom' }
    const truth = solver.stateFromLoop(p, loop.h, loop.v)
    rows.push(check(p, truth))
  }

  // 3) 部分盘面（随机子集）也不得误截
  let partialWrong = 0
  let partialTruncated = 0
  let partialTested = 0
  let seed = 999
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (const p of puz.puzzles) {
    const truth = puz.getReferenceSolution(p.id)
    if (!truth) continue
    const w = p.width, h = p.height
    const real = []
    for (let hy = 0; hy <= h; hy++) for (let hx = 1; hx <= w; hx++) real.push(['h', hy * (w + 2) + hx])
    for (let vy = 1; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) real.push(['v', vy * (w + 1) + vx])
    for (let t = 0; t < 4; t++) {
      const hArr = new Array((h + 1) * (w + 2)).fill(OFF)
      const vArr = new Array((h + 2) * (w + 1)).fill(OFF)
      for (let hy = 0; hy <= h; hy++) for (let hx = 1; hx <= w; hx++) hArr[hy * (w + 2) + hx] = UNK
      for (let vy = 1; vy <= h; vy++) for (let vx = 0; vx <= w; vx++) vArr[vy * (w + 1) + vx] = UNK
      for (const [ax, i] of real) {
        if (rnd() < 0.5) {
          const v = ax === 'h' ? truth.h[i] : truth.v[i]
          if (ax === 'h') hArr[i] = v
          else vArr[i] = v
        }
      }
      const st = { puzzleId: p.id, width: w, height: h, h: hArr, v: vArr }
      const plan = logic.planLogicSolve(p, st)
      partialTested++
      if (plan.infeasible) partialTruncated++
      for (const f of plan.frames) {
        const arr = f.change.axis === 'h' ? truth.h : truth.v
        if (arr[f.change.index] !== f.change.to) { partialWrong++; break }
      }
    }
  }

  return { rows, partial: { tested: partialTested, wrong: partialWrong, truncated: partialTruncated } }
})

const bad = out.rows.filter((r) => r.wrong > 0 || r.infeasible)
console.log('检查题数:', out.rows.length)
console.log('推导与真解不一致:', out.rows.filter((r) => r.wrong > 0).length)
console.log('推导与真解不一致的题:', bad.length)
console.log('部分盘面: 测试', out.partial.tested, '不一致', out.partial.wrong, '被截断', out.partial.truncated)
console.log('\n未完全解出的题（应有未定边但不得报无解）:')
for (const r of out.rows.filter((r) => r.left > 0)) console.log('  ', JSON.stringify(r))

await ctx.close()
