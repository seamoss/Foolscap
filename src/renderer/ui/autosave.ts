/* When autosave writes: a pause in typing (debounce), a long unbroken burst
 * (backstop — the debounce alone would never fire mid-flow), or the document
 * leaving the foreground (flush). Pure scheduling: the caller supplies the
 * actual save and, in tests, the clock. */

export interface AutosaveTimers {
  set(fn: () => void, ms: number): number
  clear(id: number): void
  now(): number
}

const realTimers: AutosaveTimers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
  now: () => Date.now()
}

export const AUTOSAVE_DEBOUNCE_MS = 1500
export const AUTOSAVE_BACKSTOP_MS = 30_000

interface Pending {
  timer: number
  /* When this streak of edits began — the backstop's anchor. */
  firstEditAt: number
}

export class AutosaveScheduler {
  private pending = new Map<number, Pending>()

  constructor(
    private readonly save: (docId: number) => void,
    private readonly timers: AutosaveTimers = realTimers,
    private readonly debounceMs = AUTOSAVE_DEBOUNCE_MS,
    private readonly backstopMs = AUTOSAVE_BACKSTOP_MS
  ) {}

  /* An edit landed in the document. */
  changed(docId: number): void {
    const now = this.timers.now()
    const entry = this.pending.get(docId)
    if (entry) this.timers.clear(entry.timer)
    const firstEditAt = entry?.firstEditAt ?? now
    if (now - firstEditAt >= this.backstopMs) {
      this.fire(docId)
      return
    }
    this.pending.set(docId, {
      firstEditAt,
      timer: this.timers.set(() => this.fire(docId), this.debounceMs)
    })
  }

  /* Save now if anything is pending — tab switches, window blur. */
  flush(docId: number): void {
    const entry = this.pending.get(docId)
    if (!entry) return
    this.timers.clear(entry.timer)
    this.fire(docId)
  }

  flushAll(): void {
    for (const docId of [...this.pending.keys()]) this.flush(docId)
  }

  /* Forget without saving — the doc closed, cleaned, or hit a conflict. */
  cancel(docId: number): void {
    const entry = this.pending.get(docId)
    if (!entry) return
    this.timers.clear(entry.timer)
    this.pending.delete(docId)
  }

  cancelAll(): void {
    for (const docId of [...this.pending.keys()]) this.cancel(docId)
  }

  private fire(docId: number): void {
    this.pending.delete(docId)
    this.save(docId)
  }
}

/* The renderer owns the setting; main hears about it so close guards know
 * whether a dirty file-backed tab can be quietly flushed. On by default —
 * the history store is what makes that a safe default. */
const AUTOSAVE_KEY = 'foolscap:autosave'

export function autosaveEnabled(): boolean {
  return localStorage.getItem(AUTOSAVE_KEY) !== '0'
}

export function setAutosaveEnabled(on: boolean): void {
  localStorage.setItem(AUTOSAVE_KEY, on ? '1' : '0')
  window.foolscap.setAutosaveEnabled(on)
}
