import { describe, expect, it } from 'vitest'
import { pathChain, pathLabel, type VolumeLookup } from './path-chain'

describe('pathChain — the file and every folder up to the volume', () => {
  it('walks to the root and stops there', () => {
    expect(pathChain('/Users/b/Code/x.md')).toEqual([
      '/Users/b/Code/x.md',
      '/Users/b/Code',
      '/Users/b',
      '/Users',
      '/'
    ])
  })

  it('a file at the root is two links', () => {
    expect(pathChain('/x.md')).toEqual(['/x.md', '/'])
  })
})

describe('pathLabel — a menu label for each link', () => {
  const lookup: VolumeLookup = {
    volumes: () => ['Backup', 'Macintosh HD'],
    resolve: (entry) =>
      entry === '/Volumes/Macintosh HD' ? '/' : entry === '/Volumes/Backup' ? '/Volumes/Backup' : null
  }

  it('is the basename for files and folders', () => {
    expect(pathLabel('/Users/b/Code/x.md', lookup)).toBe('x.md')
    expect(pathLabel('/Users', lookup)).toBe('Users')
  })

  it('the root reads as the boot volume', () => {
    expect(pathLabel('/', lookup)).toBe('Macintosh HD')
  })

  it('falls back to the path when no volume resolves to it', () => {
    expect(pathLabel('/', { volumes: () => [], resolve: () => null })).toBe('/')
  })
})
