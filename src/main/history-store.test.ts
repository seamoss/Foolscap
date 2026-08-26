import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  docKey,
  listSnapshots,
  pruneSnapshots,
  readSnapshot,
  selectSurvivors,
  writeSnapshot
} from './history-store'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('docKey', () => {
  it('is stable, hex, and distinct per path', () => {
    expect(docKey('/docs/a.md')).toBe(docKey('/docs/a.md'))
    expect(docKey('/docs/a.md')).toMatch(/^[0-9a-f]{16}$/)
    expect(docKey('/docs/a.md')).not.toBe(docKey('/docs/b.md'))
  })
})

describe('snapshot store', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'foolscap-history-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes, lists newest-first, and reads back', async () => {
    expect(await writeSnapshot(dir, 'one', '/d/a.md', 1000)).toBe(true)
    expect(await writeSnapshot(dir, 'two', '/d/a.md', 2000)).toBe(true)
    const listed = await listSnapshots(dir)
    expect(listed.map((s) => s.time)).toEqual([2000, 1000])
    expect(listed[0]?.size).toBe(3)
    expect(await readSnapshot(dir, listed[1]!.id)).toBe('one')
  })

  it('skips a snapshot identical to the newest — bursts mint one version', async () => {
    await writeSnapshot(dir, 'same', '/d/a.md', 1000)
    expect(await writeSnapshot(dir, 'same', '/d/a.md', 2000)).toBe(false)
    expect((await listSnapshots(dir)).length).toBe(1)
    // ...but an older identical snapshot doesn't block a new one.
    await writeSnapshot(dir, 'other', '/d/a.md', 3000)
    expect(await writeSnapshot(dir, 'same', '/d/a.md', 4000)).toBe(true)
  })

  it('names stay monotonic when the clock stands still', async () => {
    await writeSnapshot(dir, 'one', '/d/a.md', 1000)
    await writeSnapshot(dir, 'two', '/d/a.md', 1000)
    expect((await listSnapshots(dir)).map((s) => s.time)).toEqual([1001, 1000])
  })

  it('records the origin path once for the humans', async () => {
    await writeSnapshot(dir, 'one', '/d/a.md', 1000)
    expect(await readdir(dir)).toContain('meta.json')
  })

  it('readSnapshot refuses ids that are not snapshot names', async () => {
    await writeSnapshot(dir, 'one', '/d/a.md', 1000)
    expect(await readSnapshot(dir, '../session.json')).toBeNull()
    expect(await readSnapshot(dir, 'meta.json')).toBeNull()
    expect(await readSnapshot(dir, 'v-nope.md')).toBeNull()
  })

  it('an empty or missing folder lists as empty', async () => {
    expect(await listSnapshots(join(dir, 'nope'))).toEqual([])
  })
})

describe('selectSurvivors', () => {
  const now = 1_000_000 * DAY // an arbitrary fixed "now", bucket-aligned math-free

  it('keeps everything from the last hour', () => {
    const times = [now - 1, now - HOUR / 2, now - HOUR + 1]
    expect(selectSurvivors(times, now)).toEqual(new Set(times))
  })

  it('thins the last day to one per hour, keeping the newest per bucket', () => {
    const base = now - 5 * HOUR
    // Two in the same hour bucket, one in the next.
    const a = base + 1000
    const b = base + 2000
    const c = base + HOUR + 1000
    const keep = selectSurvivors([a, b, c], now)
    expect(keep.has(b)).toBe(true)
    expect(keep.has(a)).toBe(false)
    expect(keep.has(c)).toBe(true)
  })

  it('thins a month to one per day and beyond to one per week', () => {
    const sameDay = [now - 3 * DAY, now - 3 * DAY + HOUR]
    const sameWeek = [now - 40 * DAY, now - 40 * DAY + DAY]
    const keep = selectSurvivors([...sameDay, ...sameWeek], now)
    expect(keep.has(sameDay[1]!)).toBe(true)
    expect(keep.has(sameDay[0]!)).toBe(false)
    expect(keep.has(sameWeek[1]!)).toBe(true)
    expect(keep.has(sameWeek[0]!)).toBe(false)
  })

  it('always keeps the newest snapshot', () => {
    const only = [now - 100 * DAY]
    expect(selectSurvivors(only, now)).toEqual(new Set(only))
  })
})

describe('pruneSnapshots', () => {
  it('deletes the losers and keeps the survivors on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'foolscap-prune-'))
    const now = 1_000_000 * DAY
    const old = now - 5 * HOUR
    await writeSnapshot(dir, 'a', '/d/a.md', old + 1000)
    await writeSnapshot(dir, 'b', '/d/a.md', old + 2000)
    await writeSnapshot(dir, 'fresh', '/d/a.md', now - 1000)
    await pruneSnapshots(dir, now)
    expect((await listSnapshots(dir)).map((s) => s.time)).toEqual([now - 1000, old + 2000])
    await rm(dir, { recursive: true, force: true })
  })
})
