import type { CellNumber, Puzzle } from './types'

const KEY = 'shuhui-saved-puzzles'

export type SavedPuzzle = Puzzle & {
  savedAt: number
  /** 可选参考解边串，暂无 */
}

function parseCells(s: string): CellNumber[] {
  return [...s].map((ch) => (ch === '.' ? null : (Number(ch) as 0 | 1 | 2 | 3)))
}

function encodeCells(cells: CellNumber[]): string {
  return cells.map((c) => (c === null ? '.' : String(c))).join('')
}

export function loadSavedPuzzles(): SavedPuzzle[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as Array<{
      id: string
      name: string
      width: number
      height: number
      cells: string
      difficulty?: string
      savedAt: number
    }>
    return arr
      .filter((x) => x && x.id && x.width > 0 && x.height > 0 && typeof x.cells === 'string')
      .map((x) => ({
        id: x.id,
        name: x.name || `自定义 · ${x.width}×${x.height}`,
        width: x.width,
        height: x.height,
        difficulty: (x.difficulty as Puzzle['difficulty']) || 'custom',
        cells: parseCells(x.cells),
        savedAt: x.savedAt || Date.now(),
      }))
  } catch {
    return []
  }
}

export function persistSavedPuzzles(list: SavedPuzzle[]): void {
  const payload = list.map((p) => ({
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    difficulty: p.difficulty,
    cells: encodeCells(p.cells),
    savedAt: p.savedAt,
  }))
  localStorage.setItem(KEY, JSON.stringify(payload))
}

/** 追加或覆盖同 id，返回最新列表 */
export function savePuzzleToLibrary(p: Puzzle): SavedPuzzle[] {
  const list = loadSavedPuzzles()
  const item: SavedPuzzle = { ...p, difficulty: 'custom', savedAt: Date.now() }
  const i = list.findIndex((x) => x.id === p.id)
  if (i >= 0) list[i] = item
  else list.push(item)
  persistSavedPuzzles(list)
  return list
}

export function removeSavedPuzzle(id: string): SavedPuzzle[] {
  const list = loadSavedPuzzles().filter((p) => p.id !== id)
  persistSavedPuzzles(list)
  return list
}
