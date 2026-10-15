import { readFileSync } from 'node:fs'
const t = readFileSync('src/puzzles-data.ts', 'utf8')
const names = [...t.matchAll(/name: "([^"]+)"/g)].map((m) => m[1])
console.log('total', names.length)
console.log('first 10', names.slice(0, 10))
console.log('human', names.filter((n) => n.includes('名题') || n.includes('15')))
const ids = [...t.matchAll(/id: "([^"]+)"/g)].map((m) => m[1])
console.log('ids first 8', ids.slice(0, 8))
console.log('human id', ids.filter((i) => i.includes('human')))
