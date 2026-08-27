import { describe, expect, it } from 'vitest'
import { AutosaveScheduler, type AutosaveTimers } from './autosave'

/* A hand-cranked clock: timers fire only when advance() reaches them. */
class FakeTimers implements AutosaveTimers {
  private time = 0
  private nextId = 1
  private timers = new Map<number, { at: number; fn: () => void }>()

  now(): number {
    return this.time
  }

  set(fn: () => void, ms: number): number {
    const id = this.nextId++
    this.timers.set(id, { at: this.time + ms, fn })
    return id
  }

  clear(id: number): void {
    this.timers.delete(id)
  }

  advance(ms: number): void {
    const target = this.time + ms
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      this.time = due[1].at
      this.timers.delete(due[0])
      due[1].fn()
    }
    this.time = target
  }
}

const setup = (): { timers: FakeTimers; saved: number[]; sched: AutosaveScheduler } => {
  const timers = new FakeTimers()
  const saved: number[] = []
  const sched = new AutosaveScheduler((id) => saved.push(id), timers, 1500, 30_000)
  return { timers, saved, sched }
}

describe('AutosaveScheduler', () => {
  it('saves after a pause in typing, once', () => {
    const { timers, saved, sched } = setup()
    sched.changed(1)
    timers.advance(1000)
    sched.changed(1)
    timers.advance(1499)
    expect(saved).toEqual([])
    timers.advance(1)
    expect(saved).toEqual([1])
    timers.advance(10_000)
    expect(saved).toEqual([1])
  })

  it('the backstop fires during an unbroken burst', () => {
    const { timers, saved, sched } = setup()
    // Type every second forever: the debounce never gets its pause.
    for (let i = 0; i < 31; i++) {
      sched.changed(1)
      timers.advance(1000)
    }
    expect(saved).toEqual([1])
    // The streak restarts after the save.
    sched.changed(1)
    timers.advance(1500)
    expect(saved).toEqual([1, 1])
  })

  it('flush saves immediately, and only when something is pending', () => {
    const { saved, sched } = setup()
    sched.flush(1)
    expect(saved).toEqual([])
    sched.changed(1)
    sched.flush(1)
    expect(saved).toEqual([1])
    sched.flush(1)
    expect(saved).toEqual([1])
  })

  it('flushAll covers every pending doc; cancel forgets without saving', () => {
    const { timers, saved, sched } = setup()
    sched.changed(1)
    sched.changed(2)
    sched.changed(3)
    sched.cancel(2)
    sched.flushAll()
    expect(saved.sort()).toEqual([1, 3])
    timers.advance(5000)
    expect(saved.length).toBe(2)
  })

  it('docs schedule independently', () => {
    const { timers, saved, sched } = setup()
    sched.changed(1)
    timers.advance(1000)
    sched.changed(2)
    timers.advance(500)
    expect(saved).toEqual([1])
    timers.advance(1000)
    expect(saved).toEqual([1, 2])
  })
})
