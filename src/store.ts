import type { CellNumber, Puzzle } from './types'

/** 单题进度存档（与 serializeState 的输出一致） */
export interface ProgressEntry {
  version: number
  puzzleId: string
  width: number
  height: number
  h: number[]
  v: number[]
  updatedAt?: number
}

/** 自定义题库条目（cells 用字符串存储，和 library.ts 的文件格式一致） */
export interface LibraryEntry {
  id: string
  name: string
  width: number
  height: number
  difficulty?: string
  cells: string
  savedAt?: number
}

export interface StoreData {
  version: 1
  library: LibraryEntry[]
  progress: Record<string, ProgressEntry>
  lastPuzzle: string | null
}

const EMPTY: StoreData = { version: 1, library: [], progress: {}, lastPuzzle: null }

/** localStorage 里的旧键（仅用于一次性迁移） */
const OLD_LIBRARY_KEY = 'shuhui-saved-puzzles'
const OLD_LAST_KEY = 'shuhui-last-puzzle'
const OLD_SAVE_PREFIX = 'shuhui-save:'

let cache: StoreData = { ...EMPTY, library: [], progress: {} }
let ready = false
/** true = 数据存在项目内文件（dev server）；false = 降级到浏览器 localStorage */
let usingProject = false
let flushHandle: number | null = null

function normalize(data: unknown): StoreData {
  const d = (data || {}) as Partial<StoreData>
  return {
    version: 1,
    library: Array.isArray(d.library) ? d.library : [],
    progress: d.progress && typeof d.progress === 'object' ? d.progress : {},
    lastPuzzle: typeof d.lastPuzzle === 'string' ? d.lastPuzzle : null,
  }
}

/** 从 localStorage 读旧数据（迁移 + 降级用） */
function readBrowserStore(): StoreData {
  const out: StoreData = { ...EMPTY, library: [], progress: {} }
  try {
    const rawLib = localStorage.getItem(OLD_LIBRARY_KEY)
    if (rawLib) {
      const arr = JSON.parse(rawLib) as LibraryEntry[]
      if (Array.isArray(arr)) out.library = arr
    }
    const last = localStorage.getItem(OLD_LAST_KEY)
    if (last) out.lastPuzzle = last
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(OLD_SAVE_PREFIX)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const entry = JSON.parse(raw) as ProgressEntry
        if (entry && entry.puzzleId) out.progress[entry.puzzleId] = entry
      } catch {
        /* 忽略坏条目 */
      }
    }
  } catch {
    /* localStorage 不可用 */
  }
  return out
}

/** 项目内存储不可用时，写一份到 localStorage 兜底 */
function mirrorToBrowser(): void {
  try {
    localStorage.setItem(OLD_LIBRARY_KEY, JSON.stringify(cache.library))
    if (cache.lastPuzzle) localStorage.setItem(OLD_LAST_KEY, cache.lastPuzzle)
    else localStorage.removeItem(OLD_LAST_KEY)
    for (const [id, entry] of Object.entries(cache.progress)) {
      localStorage.setItem(OLD_SAVE_PREFIX + id, JSON.stringify(entry))
    }
  } catch {
    /* 忽略 */
  }
}

async function postStore(): Promise<void> {
  await fetch('/__store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cache),
    keepalive: true,
  })
}

/** 防抖落盘；页面隐藏时立即刷一次，避免丢最后一次改动 */
function scheduleFlush(): void {
  if (!usingProject) return
  if (flushHandle !== null) clearTimeout(flushHandle)
  flushHandle = setTimeout(() => {
    flushHandle = null
    void postStore().catch(() => {})
  }, 250)
}

let unloadBound = false
function bindUnloadFlush(): void {
  if (unloadBound) return
  unloadBound = true
  const flush = () => {
    if (usingProject && flushHandle !== null) {
      clearTimeout(flushHandle)
      flushHandle = null
      void postStore().catch(() => {})
    }
  }
  addEventListener('pagehide', flush)
  addEventListener('beforeunload', flush)
}

/**
 * 启动时调用一次：
 * 优先用项目内文件（dev server 的 /__store），
 * 并把浏览器里已有的旧数据一次性迁进来；
 * 拿不到项目存储时才降级用 localStorage。
 */
export async function initStore(): Promise<void> {
  if (ready) return
  try {
    const res = await fetch('/__store', { cache: 'no-store' })
    if (res.ok) {
      const data = normalize(await res.json())
      const legacy = readBrowserStore()
      // 迁移：项目里没有的题库/进度/上次题目，从浏览器旧数据补进来
      const haveLib = new Set(data.library.map((p) => p.id))
      for (const p of legacy.library) if (!haveLib.has(p.id)) data.library.push(p)
      for (const [id, entry] of Object.entries(legacy.progress)) {
        if (!data.progress[id]) data.progress[id] = entry
      }
      if (!data.lastPuzzle && legacy.lastPuzzle) data.lastPuzzle = legacy.lastPuzzle
      cache = data
      usingProject = true
      ready = true
      bindUnloadFlush()
      if (
        legacy.library.length ||
        Object.keys(legacy.progress).length ||
        (legacy.lastPuzzle && !cache.lastPuzzle)
      ) {
        scheduleFlush()
      }
      return
    }
  } catch {
    /* 没有 dev server（例如 build 后的静态页面）→ 降级 */
  }
  cache = readBrowserStore()
  ready = true
}

export function storeReady(): boolean {
  return ready
}

export function storeInProject(): boolean {
  return usingProject
}

// —— 题库 ——

export function readLibrary(): LibraryEntry[] {
  return cache.library
}

export function writeLibrary(list: LibraryEntry[]): void {
  cache.library = list
  if (usingProject) scheduleFlush()
  else mirrorToBrowser()
}

// —— 进度 ——

export function readProgress(puzzleId: string): ProgressEntry | null {
  return cache.progress[puzzleId] ?? null
}

export function writeProgress(entry: ProgressEntry): void {
  cache.progress[entry.puzzleId] = entry
  if (usingProject) scheduleFlush()
  else mirrorToBrowser()
}

export function clearProgress(puzzleId: string): void {
  delete cache.progress[puzzleId]
  if (usingProject) scheduleFlush()
  else mirrorToBrowser()
}

// —— 上次题目 ——

export function readLastPuzzle(): string | null {
  return cache.lastPuzzle
}

export function writeLastPuzzle(id: string | null): void {
  cache.lastPuzzle = id
  if (usingProject) scheduleFlush()
  else mirrorToBrowser()
}

/** 供 UI/调试显示当前存储位置 */
export function storeLocationLabel(): string {
  return usingProject ? '项目内 data/ 目录' : '浏览器 localStorage（未连接开发服务器）'
}

export type { CellNumber, Puzzle }
