import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { linkPaste, pastedUrl } from './paste-link'

const apply = (state: EditorState, text: string): { doc: string; head: number } | null => {
  const spec = linkPaste(state, text)
  if (!spec) return null
  const next = state.update(spec).state
  return { doc: next.doc.toString(), head: next.selection.main.head }
}

describe('pastedUrl', () => {
  it('accepts a lone http, https, or mailto address, trimmed', () => {
    expect(pastedUrl('https://example.com/a?b=c')).toBe('https://example.com/a?b=c')
    expect(pastedUrl('  http://example.com \n')).toBe('http://example.com')
    expect(pastedUrl('mailto:hi@example.com')).toBe('mailto:hi@example.com')
  })

  it('rejects prose, multiple words, other schemes, and schemeless hosts', () => {
    for (const text of [
      'see https://example.com',
      'https://a.com https://b.com',
      'file:///etc/hosts',
      'javascript:alert(1)',
      'example.com',
      'www.example.com',
      ''
    ]) {
      expect(pastedUrl(text)).toBeNull()
    }
  })
})

describe('linkPaste', () => {
  it('wraps the selection as the label and parks the caret after the link', () => {
    const state = EditorState.create({ doc: 'read the docs now', selection: { anchor: 5, head: 13 } })
    expect(apply(state, 'https://example.com')).toEqual({
      doc: 'read [the docs](https://example.com) now',
      head: 36
    })
  })

  it('is an ordinary paste with nothing selected', () => {
    const state = EditorState.create({ doc: 'read', selection: { anchor: 4 } })
    expect(apply(state, 'https://example.com')).toBeNull()
  })

  it('is an ordinary paste when the clipboard is not a lone URL', () => {
    const state = EditorState.create({ doc: 'read the docs', selection: { anchor: 5, head: 13 } })
    expect(apply(state, 'the new docs')).toBeNull()
  })

  it('leaves multi-line and bracketed selections to the ordinary paste', () => {
    const multi = EditorState.create({ doc: 'one\ntwo', selection: { anchor: 0, head: 7 } })
    expect(apply(multi, 'https://example.com')).toBeNull()
    const bracketed = EditorState.create({ doc: 'see [x] here', selection: { anchor: 4, head: 7 } })
    expect(apply(bracketed, 'https://example.com')).toBeNull()
  })

  it('links every selected range, and drops the bare URL at a lone caret', () => {
    const state = EditorState.create({
      doc: 'alpha beta gamma',
      extensions: EditorState.allowMultipleSelections.of(true),
      selection: EditorSelection.create([EditorSelection.range(0, 5), EditorSelection.cursor(10)])
    })
    expect(apply(state, 'https://x.io')?.doc).toBe('[alpha](https://x.io) betahttps://x.io gamma')
  })
})
