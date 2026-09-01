import { describe, expect, it } from 'vitest'
import { classifyDrop, droppedImages } from './drop'

describe('classifyDrop', () => {
  it('passes a text drop to CodeMirror', () => {
    expect(classifyDrop([])).toBe('pass')
  })

  it('opens markdown files', () => {
    for (const name of ['note.md', 'a.markdown', 'a.mdx', 'a.txt', 'UPPER.MD']) {
      expect(classifyDrop([name])).toBe('open')
    }
  })

  it('places images', () => {
    for (const name of ['photo.png', 'a.jpg', 'a.JPEG', 'a.gif', 'a.webp']) {
      expect(classifyDrop([name])).toBe('image')
    }
  })

  it('rejects anything else instead of letting it be inserted as text', () => {
    for (const name of ['archive.zip', 'noext', 'a.md.zip', 'a.png.zip', 'a.svg']) {
      expect(classifyDrop([name])).toBe('reject')
    }
  })

  it('judges a multi-file drop by the first file', () => {
    expect(classifyDrop(['note.md', 'photo.png'])).toBe('open')
    expect(classifyDrop(['photo.png', 'note.md'])).toBe('image')
    expect(classifyDrop(['archive.zip', 'note.md'])).toBe('reject')
  })
})

describe('droppedImages', () => {
  it('keeps only the images of a mixed drop, in order', () => {
    const files = [{ name: 'a.png' }, { name: 'note.md' }, { name: 'b.webp' }, { name: 'x.zip' }]
    expect(droppedImages(files).map((f) => f.name)).toEqual(['a.png', 'b.webp'])
  })
})
