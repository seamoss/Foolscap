import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parsePositions, PositionsStore, prunePositions } from './positions-store'

describe('parsePositions', () => {
  it('reads valid entries and drops garbage ones, never the file', () => {
    const raw = JSON.stringify({
      '/a.md': { head: 10, top: 4, at: 100 },
      '/b.md': { head: -1, top: 0, at: 100 },
      '/c.md': { head: 1.5, top: 0, at: 100 },
      '/d.md': 'nope',
      '/e.md': { head: 0, top: 0 }
    })
    expect(parsePositions(raw)).toEqual({ '/a.md': { head: 10, top: 4, at: 100 } })
  })

  it('is empty for anything that is not an object', () => {
    expect(parsePositions('not json')).toEqual({})
    expect(parsePositions('[1,2]')).toEqual({})
    expect(parsePositions('null')).toEqual({})
  })
})

describe('prunePositions', () => {
  it('keeps the most recently visited files', () => {
    const all = {
      '/old.md': { head: 0, top: 0, at: 1 },
      '/mid.md': { head: 0, top: 0, at: 2 },
      '/new.md': { head: 0, top: 0, at: 3 }
    }
    expect(Object.keys(prunePositions(all, 2))).toEqual(['/new.md', '/mid.md'])
    expect(prunePositions(all, 3)).toBe(all)
  })
})

describe('PositionsStore', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'foolscap-positions-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('starts empty without a file, remembers, flushes, and reloads', async () => {
    const file = join(dir, 'positions.json')
    const store = new PositionsStore()
    await store.open(file)
    expect(store.recall('/a.md')).toBeNull()
    store.remember('/a.md', { head: 42, top: 7 }, 1000)
    expect(store.recall('/a.md')).toEqual({ head: 42, top: 7 })
    await store.flush()
    const again = new PositionsStore()
    await again.open(file)
    expect(again.recall('/a.md')).toEqual({ head: 42, top: 7 })
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ '/a.md': { head: 42, top: 7, at: 1000 } })
  })

  it('lists recents newest first, forgetting files that vanished', async () => {
    const store = new PositionsStore()
    await store.open(join(dir, 'positions.json'))
    store.touch('/first.md', 1)
    store.remember('/second.md', { head: 5, top: 0 }, 2)
    store.touch('/gone.md', 3)
    store.touch('/third.md', 4)
    expect(store.recent(10, (p) => p !== '/gone.md')).toEqual(['/third.md', '/second.md', '/first.md'])
    expect(store.has('/gone.md')).toBe(false)
    expect(store.recent(2, () => true)).toEqual(['/third.md', '/second.md'])
    // A touch refreshes recency without disturbing the position.
    store.touch('/second.md', 9)
    expect(store.recent(1, () => true)).toEqual(['/second.md'])
    expect(store.recall('/second.md')).toEqual({ head: 5, top: 0 })
    expect(store.recall('/first.md')).toEqual({ head: 0, top: 0 })
    await store.flush()
  })

  it('refuses non-offsets and prunes to its cap by recency', async () => {
    const store = new PositionsStore(2)
    await store.open(join(dir, 'positions.json'))
    store.remember('/bad.md', { head: -3, top: 0 })
    expect(store.recall('/bad.md')).toBeNull()
    store.remember('/1.md', { head: 1, top: 0 }, 1)
    store.remember('/2.md', { head: 2, top: 0 }, 2)
    store.remember('/3.md', { head: 3, top: 0 }, 3)
    expect(store.recall('/1.md')).toBeNull()
    expect(store.recall('/3.md')).toEqual({ head: 3, top: 0 })
    // Revisiting refreshes recency.
    store.remember('/2.md', { head: 2, top: 0 }, 4)
    store.remember('/4.md', { head: 4, top: 0 }, 5)
    expect(store.recall('/3.md')).toBeNull()
    expect(store.recall('/2.md')).toEqual({ head: 2, top: 0 })
    await store.flush()
  })
})
