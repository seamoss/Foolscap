import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assetName, atomicWriteFile, tempName, timestampName } from './files'

describe('tempName', () => {
  it('never repeats for the same target', () => {
    const names = new Set(Array.from({ length: 500 }, () => tempName('/docs/notes.md')))
    expect(names.size).toBe(500)
  })

  it('stays hidden, stays beside the target, and keeps the .tmp suffix', () => {
    const name = tempName('/docs/notes.md')
    expect(name.startsWith('.notes.md.foolscap-')).toBe(true)
    expect(name.endsWith('.tmp')).toBe(true)
    expect(name).not.toContain('/')
  })
})

describe('assetName', () => {
  const now = new Date(2026, 6, 28, 9, 5, 3)

  it('keeps a dropped file\'s name with the verified extension', () => {
    expect(assetName('Screenshot 2026-07-28.PNG', 'png', now)).toBe('Screenshot-2026-07-28.png')
    expect(assetName('photo.jpeg', 'jpg', now)).toBe('photo.jpg')
  })

  it('folds accents, strips traversal and hidden-file prefixes, caps the length', () => {
    expect(assetName('Café au lait.png', 'png', now)).toBe('Cafe-au-lait.png')
    expect(assetName('../../.secret.png', 'png', now)).toBe('secret.png')
    expect(assetName('x'.repeat(100) + '.png', 'png', now)).toBe('x'.repeat(64) + '.png')
  })

  it('falls back to the timestamp when nothing usable is offered', () => {
    expect(assetName(null, 'png', now)).toBe('pasted-20260728-090503.png')
    expect(assetName('....png', 'png', now)).toBe('pasted-20260728-090503.png')
    expect(assetName('日本語.png', 'png', now)).toBe('pasted-20260728-090503.png')
  })
})

describe('timestampName', () => {
  it('formats a sortable pasted-asset name', () => {
    expect(timestampName('pasted', 'png', new Date(2026, 6, 28, 9, 5, 3))).toBe(
      'pasted-20260728-090503.png'
    )
  })
})

describe('atomicWriteFile', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'foolscap-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes new files', async () => {
    const target = join(dir, 'doc.md')
    await atomicWriteFile(target, '# hello\n')
    expect(await readFile(target, 'utf8')).toBe('# hello\n')
  })

  it('replaces existing content completely', async () => {
    const target = join(dir, 'doc.md')
    await writeFile(target, 'a much longer original manuscript body\n')
    await atomicWriteFile(target, 'short\n')
    expect(await readFile(target, 'utf8')).toBe('short\n')
  })

  it('leaves no temp file behind on success', async () => {
    const target = join(dir, 'doc.md')
    await atomicWriteFile(target, 'content\n')
    expect(await readdir(dir)).toEqual(['doc.md'])
  })

  it('throws and leaves nothing behind when the temp file cannot be created', async () => {
    // Nonexistent parent directory: open() fails before anything is written.
    await expect(atomicWriteFile(join(dir, 'missing', 'doc.md'), 'x')).rejects.toThrow()
    expect(await readdir(dir)).toEqual([])
  })

  it('cleans up the temp file when the final rename fails', async () => {
    // A directory at the target path lets the temp write succeed but makes
    // the rename over it fail — the catch path after a successful open.
    const target = join(dir, 'doc.md')
    await mkdir(target)
    await expect(atomicWriteFile(target, 'x')).rejects.toThrow()
    expect(await readdir(dir)).toEqual(['doc.md'])
    expect(await readdir(target)).toEqual([])
  })

  it('preserves exact bytes including trailing whitespace and unicode', async () => {
    const target = join(dir, 'doc.md')
    const content = '# Tîtle — “quotes”\n\ntrailing spaces  \n\tand a tab\n\n'
    await atomicWriteFile(target, content)
    expect(await readFile(target, 'utf8')).toBe(content)
  })
})
