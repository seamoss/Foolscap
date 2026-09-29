import { describe, expect, it } from 'vitest'
import { isOpenLink, parseOpenLink } from './open-link'

const files = (...paths: string[]) => (p: string) => paths.includes(p)
const link = (path: string, extra = '') => `foolscap://open?path=${encodeURIComponent(path)}${extra}`

describe('parseOpenLink', () => {
  it('opens an existing markdown file', () => {
    expect(parseOpenLink(link('/Users/me/notes/brief.md'), files('/Users/me/notes/brief.md'))).toEqual({
      ok: true,
      path: '/Users/me/notes/brief.md'
    })
  })

  it('decodes spaces and unicode', () => {
    const path = '/Users/me/My Notes/café plan.markdown'
    expect(parseOpenLink(link(path), files(path))).toEqual({ ok: true, path })
  })

  it('accepts .txt and upper-case extensions', () => {
    expect(parseOpenLink(link('/a/b.TXT'), files('/a/b.TXT'))).toEqual({ ok: true, path: '/a/b.TXT' })
  })

  it('ignores other query parameters', () => {
    expect(parseOpenLink(link('/a/b.md', '&line=4&exec=rm'), files('/a/b.md'))).toEqual({
      ok: true,
      path: '/a/b.md'
    })
  })

  it('normalizes dot segments before the existence check', () => {
    expect(parseOpenLink(link('/a/x/../b.md'), files('/a/b.md'))).toEqual({ ok: true, path: '/a/b.md' })
  })

  it('tolerates a trailing slash after the host', () => {
    expect(parseOpenLink('foolscap://open/?path=%2Fa%2Fb.md', files('/a/b.md')).ok).toBe(true)
  })

  it('rejects a missing file', () => {
    const r = parseOpenLink(link('/a/gone.md'), files())
    expect(r.ok).toBe(false)
  })

  it('rejects other file types even when they exist', () => {
    expect(parseOpenLink(link('/a/pic.png'), files('/a/pic.png')).ok).toBe(false)
    expect(parseOpenLink(link('/a/noext'), files('/a/noext')).ok).toBe(false)
  })

  it('rejects relative paths', () => {
    expect(parseOpenLink(link('notes/b.md'), files('notes/b.md')).ok).toBe(false)
  })

  it('rejects a missing or empty path', () => {
    expect(parseOpenLink('foolscap://open', files()).ok).toBe(false)
    expect(parseOpenLink('foolscap://open?path=', files()).ok).toBe(false)
  })

  it('rejects any host but open', () => {
    expect(parseOpenLink('foolscap://edit?path=%2Fa%2Fb.md', files('/a/b.md')).ok).toBe(false)
    expect(parseOpenLink('foolscap://open/extra?path=%2Fa%2Fb.md', files('/a/b.md')).ok).toBe(false)
    expect(parseOpenLink('foolscap:open?path=%2Fa%2Fb.md', files('/a/b.md')).ok).toBe(false)
  })

  it('rejects other schemes and garbage', () => {
    expect(parseOpenLink('https://open?path=%2Fa%2Fb.md', files('/a/b.md')).ok).toBe(false)
    expect(parseOpenLink('not a url', files()).ok).toBe(false)
  })
})

describe('isOpenLink', () => {
  it('spots the scheme in argv, case-insensitively', () => {
    expect(isOpenLink('foolscap://open?path=x')).toBe(true)
    expect(isOpenLink('FOOLSCAP://open?path=x')).toBe(true)
    expect(isOpenLink('/Users/me/foolscap.md')).toBe(false)
  })
})
