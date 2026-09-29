import { describe, expect, it } from 'vitest'
import { pathsFromArgv, type ArgvFilter } from './cli'

const filter = (dirs: string[]): ArgvFilter => ({
  appPath: '/proj',
  isDirectory: (p) => dirs.includes(p)
})

describe('pathsFromArgv', () => {
  it('extracts a file path in dev shape (electron, appDir, file)', () => {
    expect(pathsFromArgv(['/bin/electron', '.', 'notes.md'], '/proj', filter(['/proj']))).toEqual([
      '/proj/notes.md'
    ])
  })

  it('extracts a file path in packaged shape (exe, file)', () => {
    expect(pathsFromArgv(['/Applications/Foolscap', 'notes.md'], '/home/u', filter([]))).toEqual([
      '/home/u/notes.md'
    ])
  })

  it('survives chromium flags injected between binary and app dir (relayed argv)', () => {
    expect(
      pathsFromArgv(
        ['/bin/electron', '--allow-file-access-from-files', '--enable-avfoundation', '.', '/tmp/second.md'],
        '/proj',
        filter(['/proj', '/tmp'])
      )
    ).toEqual(['/tmp/second.md'])
  })

  it('returns empty when launched bare', () => {
    expect(pathsFromArgv(['/bin/electron', '.'], '/proj', filter(['/proj']))).toEqual([])
    expect(pathsFromArgv(['/Applications/Foolscap'], '/home/u', filter([]))).toEqual([])
  })

  it('drops directory arguments but keeps nonexistent files (new-file case)', () => {
    expect(
      pathsFromArgv(['/bin/electron', '.', 'some-dir', 'brand-new.md'], '/proj', filter(['/proj', '/proj/some-dir']))
    ).toEqual(['/proj/brand-new.md'])
  })

  it('keeps absolute paths absolute and resolves relative against the given cwd', () => {
    expect(
      pathsFromArgv(['/bin/electron', '.', '/abs/doc.md', 'rel/doc.md'], '/proj', filter(['/proj']))
    ).toEqual(['/abs/doc.md', '/proj/rel/doc.md'])
  })

  it('leaves foolscap:// links out (Windows/Linux relay them as argv)', () => {
    expect(
      pathsFromArgv(['C:\\Foolscap.exe', 'foolscap://open?path=%2Fa%2Fb.md'], '/home/u', filter([]))
    ).toEqual([])
  })
})
