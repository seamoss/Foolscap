import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HistoryEntry } from '../shared/types'
import { atomicWriteFile } from './files'

/* Version history: full snapshots of saved documents, one folder per
 * document under userData/history. Full copies, not diffs — markdown is
 * small, and a snapshot that is a plain readable file can never be
 * corrupted into unreadability by a bug in a diff chain. Autosave makes
 * "just don't save" stop working as an undo of last resort; this store is
 * what replaces it. */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/* Snapshot files are named v-<epoch ms>.md; the strict shape doubles as the
 * traversal guard on ids arriving over IPC. */
const SNAP_RE = /^v-(\d+)\.md$/

export function docKey(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16)
}

function snapTime(name: string): number | null {
  const m = SNAP_RE.exec(name)
  if (!m || m[1] === undefined) return null
  const time = Number(m[1])
  return Number.isSafeInteger(time) ? time : null
}

/* Newest first. */
export async function listSnapshots(dir: string): Promise<HistoryEntry[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const entries: HistoryEntry[] = []
  for (const name of names) {
    const time = snapTime(name)
    if (time === null) continue
    try {
      const info = await stat(join(dir, name))
      entries.push({ id: name, time, size: info.size })
    } catch {
      // pruned or removed between readdir and stat — skip
    }
  }
  return entries.sort((a, b) => b.time - a.time)
}

export async function readSnapshot(dir: string, id: string): Promise<string | null> {
  if (!SNAP_RE.test(id)) return null
  try {
    return await readFile(join(dir, id), 'utf8')
  } catch {
    return null
  }
}

/* Write one snapshot; returns false when the newest existing snapshot is
 * already this content (a burst of autosaves must not mint identical
 * versions). A meta.json records the origin path — the folder name is a
 * hash, and a human poking around the store deserves an answer to "of
 * what?". */
export async function writeSnapshot(
  dir: string,
  content: string,
  originPath: string,
  now: number
): Promise<boolean> {
  await mkdir(dir, { recursive: true })
  const existing = await listSnapshots(dir)
  const newest = existing[0]
  if (newest && (await readSnapshot(dir, newest.id)) === content) return false
  // Monotonic names even if the clock stalls within a millisecond.
  const time = newest ? Math.max(now, newest.time + 1) : now
  await atomicWriteFile(join(dir, `v-${time}.md`), content)
  if (existing.length === 0) {
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ path: originPath })).catch(() => undefined)
  }
  return true
}

/* Tiered retention, Time-Machine style: everything from the last hour, one
 * per hour for a day, one per day for a month, one per week beyond. The
 * newest snapshot in each bucket survives; the newest overall always does.
 * Pure — pruneSnapshots feeds it real files, tests feed it synthetic
 * times. */
export function selectSurvivors(times: number[], now: number): Set<number> {
  const sorted = [...times].sort((a, b) => b - a)
  const keep = new Set<number>()
  const buckets = new Set<string>()
  for (const time of sorted) {
    const age = now - time
    let bucket: string
    if (age < HOUR) bucket = `m${time}`
    else if (age < DAY) bucket = `h${Math.floor(time / HOUR)}`
    else if (age < 30 * DAY) bucket = `d${Math.floor(time / DAY)}`
    else bucket = `w${Math.floor(time / WEEK)}`
    if (!buckets.has(bucket)) {
      buckets.add(bucket)
      keep.add(time)
    }
  }
  if (sorted[0] !== undefined) keep.add(sorted[0])
  return keep
}

export async function pruneSnapshots(dir: string, now: number): Promise<void> {
  const entries = await listSnapshots(dir)
  const keep = selectSurvivors(
    entries.map((e) => e.time),
    now
  )
  for (const entry of entries) {
    if (!keep.has(entry.time)) await unlink(join(dir, entry.id)).catch(() => undefined)
  }
}
