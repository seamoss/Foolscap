import { describe, expect, it } from 'vitest'
import { ClosedTabs } from './closed-tabs'

describe('ClosedTabs', () => {
  it('pops most recently closed first', () => {
    const stack = new ClosedTabs()
    stack.push('/a.md')
    stack.push('/b.md')
    expect(stack.pop(() => true)).toBe('/b.md')
    expect(stack.pop(() => true)).toBe('/a.md')
    expect(stack.pop(() => true)).toBeNull()
  })

  it('lists a re-closed path once, at the front of the line', () => {
    const stack = new ClosedTabs()
    stack.push('/a.md')
    stack.push('/b.md')
    stack.push('/a.md')
    expect(stack.size).toBe(2)
    expect(stack.pop(() => true)).toBe('/a.md')
    expect(stack.pop(() => true)).toBe('/b.md')
  })

  it('skips and forgets paths that no longer exist', () => {
    const stack = new ClosedTabs()
    stack.push('/gone.md')
    stack.push('/also-gone.md')
    expect(stack.pop((p) => !p.includes('gone'))).toBeNull()
    expect(stack.size).toBe(0)
    stack.push('/here.md')
    stack.push('/gone.md')
    expect(stack.pop((p) => p === '/here.md')).toBe('/here.md')
  })

  it('keeps only the newest entries past the cap', () => {
    const stack = new ClosedTabs(2)
    stack.push('/1.md')
    stack.push('/2.md')
    stack.push('/3.md')
    expect(stack.size).toBe(2)
    expect(stack.pop(() => true)).toBe('/3.md')
    expect(stack.pop(() => true)).toBe('/2.md')
    expect(stack.pop(() => true)).toBeNull()
  })
})
