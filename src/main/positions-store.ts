import { readFile } from 'node:fs/promises'
import type { DocPosition } from '../shared/types'
import { atomicWriteFile } from './files'

/* Where you were in each file — caret and top-of-view as document offsets
 * — so a file reopens where you left it. userData/positions.json, beside
 * the session and history stores; the newest files up to the cap, the
 * rest age out. Offsets, not pixels: a changed text size or window width
 * can't strand the view, and a shortened file just clamps.
 *
 * The visit timestamps double as the recents list: every file opened or
 * looked at is here, newest first, and the palette's "Open: …" entries
 * read from it — no second list to keep in step. */

interface Stored extends DocPosition {
  /* Epoch ms of the last visit — the pruning order. */
  at: number
}

export const POSITIONS_CAP = 500

/* Debounce for the on-disk copy; memory is always current. */
const WRITE_DELAY_MS = 1000

const isOffset = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

/* Garbage in any entry drops that entry, never the file. */
export function parsePositions(raw: string): Record<string, Stored> {
  const out: Record<string, Stored> = {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return out
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return out
  for (const [path, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const v = value as Record<string, unknown>
    if (isOffset(v['head']) && isOffset(v['top']) && isOffset(v['at'])) {
      out[path] = { head: v['head'], top: v['top'], at: v['at'] }
    }
  }
  return out
}

/* Keep the most recently visited `cap` files. */
export function prunePositions(
  all: Record<string, Stored>,
  cap: number
): Record<string, Stored> {
  const entries = Object.entries(all)
  if (entries.length <= cap) return all
  entries.sort((a, b) => b[1].at - a[1].at)
  return Object.fromEntries(entries.slice(0, cap))
}

export class PositionsStore {
  private entries: Record<string, Stored> = {}
  private file: string | null = null
  private writeTimer: NodeJS.Timeout | undefined
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly cap = POSITIONS_CAP) {}

  /* Read the file once at launch; recall is synchronous from then on so a
   * document load can carry its position in the same payload. */
  async open(file: string): Promise<void> {
    this.file = file
    try {
      this.entries = parsePositions(await readFile(file, 'utf8'))
    } catch {
      this.entries = {} // first launch, or unreadable — start empty
    }
  }

  recall(path: string): DocPosition | null {
    const found = this.entries[path]
    return found ? { head: found.head, top: found.top } : null
  }

  has(path: string): boolean {
    return path in this.entries
  }

  /* An open counts as a visit even before any position is recorded, so a
   * file lands in recents the moment it is opened. */
  touch(path: string, now = Date.now()): void {
    const found = this.entries[path]
    this.remember(path, found ? { head: found.head, top: found.top } : { head: 0, top: 0 }, now)
  }

  /* Most recently visited first, skipping files that no longer exist (and
   * forgetting them, so they never come back as ghosts). */
  recent(limit: number, exists: (path: string) => boolean): string[] {
    const ordered = Object.entries(this.entries)
      .sort((a, b) => b[1].at - a[1].at)
      .map(([path]) => path)
    const out: string[] = []
    let forgot = false
    for (const path of ordered) {
      if (out.length >= limit) break
      if (exists(path)) out.push(path)
      else {
        delete this.entries[path]
        forgot = true
      }
    }
    if (forgot) {
      clearTimeout(this.writeTimer)
      this.writeTimer = setTimeout(() => void this.flush(), WRITE_DELAY_MS)
    }
    return out
  }

  remember(path: string, position: DocPosition, now = Date.now()): void {
    if (!isOffset(position.head) || !isOffset(position.top)) return
    this.entries[path] = { head: position.head, top: position.top, at: now }
    this.entries = prunePositions(this.entries, this.cap)
    clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => void this.flush(), WRITE_DELAY_MS)
  }

  /* Write now — the quit path calls this after the last remember. Writes
   * serialize so a debounce firing mid-flush cannot interleave. */
  flush(): Promise<void> {
    clearTimeout(this.writeTimer)
    this.writeTimer = undefined
    const file = this.file
    if (!file) return Promise.resolve()
    const snapshot = JSON.stringify(this.entries)
    this.writing = this.writing
      .then(() => atomicWriteFile(file, snapshot))
      .catch(() => undefined) // losing a position is never worth a dialog
    return this.writing
  }
}

export const positions = new PositionsStore()
