import { describe, expect, it } from 'vitest'
import { formatSize, formatVersionTime } from './versions'

/* Local-time construction keeps these green in any timezone. */
const at = (y: number, m: number, d: number, h = 12, min = 30): number =>
  new Date(y, m - 1, d, h, min).getTime()

describe('formatVersionTime', () => {
  const now = at(2026, 8, 26, 15, 0)

  it('same day reads as Today', () => {
    expect(formatVersionTime(at(2026, 8, 26, 9, 5), now)).toBe('Today at 09:05')
  })

  it('the day before reads as Yesterday, even across month edges', () => {
    expect(formatVersionTime(at(2026, 8, 25, 23, 59), now)).toBe('Yesterday at 23:59')
    expect(formatVersionTime(at(2026, 7, 31), at(2026, 8, 1))).toBe('Yesterday at 12:30')
  })

  it('same year drops the year, other years keep it', () => {
    expect(formatVersionTime(at(2026, 8, 20, 14, 2), now)).toBe('Aug 20 at 14:02')
    expect(formatVersionTime(at(2025, 12, 31, 8, 0), now)).toBe('Dec 31, 2025 at 08:00')
  })
})

describe('formatSize', () => {
  it('bytes below 1 KB, otherwise KB with one decimal', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(4300)).toBe('4.2 KB')
  })
})
