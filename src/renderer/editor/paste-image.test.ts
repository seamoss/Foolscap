import { EditorSelection, EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extForFile,
  extForMime,
  imageBlockInsertion,
  imageInsertion,
  imagesInline,
  insertDroppedImages,
  insertPastedImage
} from './paste-image'

describe('extForMime', () => {
  it('maps known image mimes and rejects the rest', () => {
    expect(extForMime('image/png')).toBe('png')
    expect(extForMime('image/jpeg')).toBe('jpg')
    expect(extForMime('text/plain')).toBeNull()
  })
})

describe('extForFile', () => {
  it('prefers the MIME, falls back to the name, normalizes jpeg', () => {
    expect(extForFile({ name: 'x.bin', type: 'image/png' })).toBe('png')
    expect(extForFile({ name: 'x.JPEG', type: '' })).toBe('jpg')
    expect(extForFile({ name: 'x.webp', type: 'application/octet-stream' })).toBe('webp')
    expect(extForFile({ name: 'noext', type: '' })).toBeNull()
  })
})

describe('imagesInline', () => {
  it('inserts at the drop position with the caret in the first alt', () => {
    const state = EditorState.create({ doc: 'before after', selection: { anchor: 0 } })
    const next = state.update(imagesInline(state, 7, ['assets/a.png', 'assets/b.png'])).state
    expect(next.doc.toString()).toBe('before ![](assets/a.png) ![](assets/b.png)after')
    expect(next.selection.main.head).toBe(9)
  })

  it('clamps a position past the end', () => {
    const state = EditorState.create({ doc: 'ab' })
    expect(state.update(imagesInline(state, 99, ['x.png'])).state.doc.toString()).toBe('ab![](x.png)')
  })
})

describe('imageBlockInsertion', () => {
  const run = (doc: string, at: number, paths = ['a.png']): { doc: string; head: number } => {
    const state = EditorState.create({ doc })
    const next = state.update(imageBlockInsertion(state, at, paths)).state
    return { doc: next.doc.toString(), head: next.selection.main.head }
  }

  it('fills an empty document', () => {
    expect(run('', 0)).toEqual({ doc: '![](a.png)\n', head: 2 })
  })

  it('sits between paragraphs without adding blank lines it does not need', () => {
    expect(run('one\n\ntwo\n', 5).doc).toBe('one\n\n![](a.png)\n\ntwo\n')
  })

  it('opens the blank lines a block needs when dropped at a line start', () => {
    expect(run('one\ntwo', 4).doc).toBe('one\n\n![](a.png)\n\ntwo')
  })

  it('starts a new paragraph when the position is mid-line', () => {
    expect(run('one two', 3).doc).toBe('one\n\n![](a.png)\n\n two')
  })

  it('appends at the end, closing with a single newline', () => {
    expect(run('one', 3).doc).toBe('one\n\n![](a.png)\n')
    expect(run('one\n', 4).doc).toBe('one\n\n![](a.png)\n')
    expect(run('one\n\n', 5).doc).toBe('one\n\n![](a.png)\n')
  })

  it('separates several images into their own paragraphs, caret in the first', () => {
    expect(run('one\n\ntwo', 5, ['a.png', 'b.png'])).toEqual({
      doc: 'one\n\n![](a.png)\n\n![](b.png)\n\ntwo',
      head: 7
    })
  })
})

describe('insertDroppedImages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const file = (name: string): File =>
    ({ name, type: '', arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as File

  it('saves every image with its name and places them in one transaction', async () => {
    const pasteImage = vi.fn(async (_b: Uint8Array, _ext: string, name: string) => `assets/${name}`)
    vi.stubGlobal('window', { foolscap: { pasteImage } })
    const dispatch = vi.fn()
    const view = { dispatch, focus: vi.fn(), state: EditorState.create({ doc: '' }) } as unknown as EditorView
    const place = vi.fn(() => ({}))
    await insertDroppedImages(view, [file('a.png'), file('b.JPG')], place, vi.fn())
    expect(pasteImage.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['png', 'a.png'],
      ['jpg', 'b.JPG']
    ])
    expect(place).toHaveBeenCalledWith(view.state, ['assets/a.png', 'assets/b.JPG'])
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('stops at the first unsaved-document answer, writing nothing more', async () => {
    const pasteImage = vi.fn(async () => null)
    vi.stubGlobal('window', { foolscap: { pasteImage } })
    const dispatch = vi.fn()
    const view = { dispatch, focus: vi.fn(), state: EditorState.create({ doc: '' }) } as unknown as EditorView
    const onNoDocument = vi.fn()
    await insertDroppedImages(view, [file('a.png'), file('b.png')], () => ({}), onNoDocument)
    expect(pasteImage).toHaveBeenCalledOnce()
    expect(onNoDocument).toHaveBeenCalledOnce()
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('imageInsertion', () => {
  it('inserts the link and parks the caret in the alt brackets', () => {
    const state = EditorState.create({ doc: 'before after', selection: { anchor: 7 } })
    const next = state.update(imageInsertion(state, 'assets/a.png')).state
    expect(next.doc.toString()).toBe('before ![](assets/a.png)after')
    expect(next.selection.main.head).toBe(9)
  })

  it('replaces a non-empty selection', () => {
    const state = EditorState.create({
      doc: 'before after',
      selection: EditorSelection.create([EditorSelection.range(7, 12)])
    })
    const next = state.update(imageInsertion(state, 'assets/a.png')).state
    expect(next.doc.toString()).toBe('before ![](assets/a.png)')
  })

  it('multi-cursor: every cursor gets a link with its own caret in the alt brackets', () => {
    const state = EditorState.create({
      doc: 'ab cd',
      selection: EditorSelection.create(
        [EditorSelection.cursor(0), EditorSelection.cursor(3)],
        1 // main is the later cursor, as after clicking with alt held
      ),
      extensions: EditorState.allowMultipleSelections.of(true)
    })
    const next = state.update(imageInsertion(state, 'x.png')).state
    expect(next.doc.toString()).toBe('![](x.png)ab ![](x.png)cd')
    expect(next.selection.ranges.map((r) => r.head)).toEqual([2, 15])
  })
})

describe('insertPastedImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubView = (): { view: EditorView; dispatch: ReturnType<typeof vi.fn> } => {
    const dispatch = vi.fn()
    const view = {
      dispatch,
      focus: vi.fn(),
      state: EditorState.create({ doc: '' })
    } as unknown as EditorView
    return { view, dispatch }
  }

  const stubFile = (): File => ({ arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as File

  const stubBridge = (pasteImage: () => Promise<string | null>): void => {
    vi.stubGlobal('window', { foolscap: { pasteImage } })
  }

  it('inserts the link main answers with', async () => {
    stubBridge(async () => 'assets/a.png')
    const { view, dispatch } = stubView()
    await insertPastedImage(view, stubFile(), 'png', vi.fn())
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('reports the unsaved document instead of inserting', async () => {
    stubBridge(async () => null)
    const { view, dispatch } = stubView()
    const onNoDocument = vi.fn()
    await insertPastedImage(view, stubFile(), 'png', onNoDocument)
    expect(onNoDocument).toHaveBeenCalledOnce()
    expect(dispatch).not.toHaveBeenCalled()
  })

  /* The write failing is the silent case: the paste handler has already
   * called preventDefault, so the rejection has to escape for it to catch. */
  it('rejects when the save fails, leaving the document untouched', async () => {
    stubBridge(async () => {
      throw new Error('EACCES')
    })
    const { view, dispatch } = stubView()
    const onNoDocument = vi.fn()
    await expect(insertPastedImage(view, stubFile(), 'png', onNoDocument)).rejects.toThrow('EACCES')
    expect(onNoDocument).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
