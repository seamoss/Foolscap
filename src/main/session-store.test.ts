import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearSession,
  loadSession,
  saveSession,
  type SessionEntry,
  type WindowEntry
} from './session-store'

describe('session store', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'foolscap-session-'))
    file = join(dir, 'session.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const entries: SessionEntry[] = [
    { path: '/docs/notes.md', dirty: false, content: null, history: '{"done":[]}' },
    { path: '/docs/draft.md', dirty: true, content: '# edited but unsaved', history: null },
    { path: null, dirty: true, content: 'untitled scratch survives quit', history: null }
  ]

  const windows: WindowEntry[] = [
    { tabs: [entries[0]!, entries[1]!], active: 1 },
    { tabs: [entries[2]!], active: 0 }
  ]

  it('round-trips windows of tabs — clean files, dirty buffers, untitled drafts', async () => {
    await saveSession(file, windows)
    expect(await loadSession(file)).toEqual(windows)
  })

  it('migrates v1 sessions: each entry becomes its own window', async () => {
    await writeFile(file, JSON.stringify({ version: 1, entries }))
    expect(await loadSession(file)).toEqual(entries.map((e) => ({ tabs: [e], active: 0 })))
  })

  it('reads v2 sessions: same shape, no undo history', async () => {
    const v2 = windows.map((w) => ({
      ...w,
      tabs: w.tabs.map(({ history: _history, ...rest }) => rest)
    }))
    await writeFile(file, JSON.stringify({ version: 2, windows: v2 }))
    expect(await loadSession(file)).toEqual(v2)
  })

  it('rejects entries whose history is not a string', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 3,
        windows: [{ tabs: [entries[0], { ...entries[1], history: 42 }], active: 0 }]
      })
    )
    expect(await loadSession(file)).toEqual([{ tabs: [entries[0]], active: 0 }])
  })

  it('missing file loads as null', async () => {
    expect(await loadSession(file)).toBeNull()
  })

  it('garbage and wrong versions load as null', async () => {
    await writeFile(file, 'not json at all')
    expect(await loadSession(file)).toBeNull()
    await writeFile(file, JSON.stringify({ version: 99, windows }))
    expect(await loadSession(file)).toBeNull()
  })

  it('malformed tabs and windows are dropped, not fatal', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 2,
        windows: [
          { tabs: [entries[0], { nonsense: true }, 42], active: 0 },
          { not: 'a window' },
          { tabs: [], active: 0 }
        ]
      })
    )
    expect(await loadSession(file)).toEqual([{ tabs: [entries[0]], active: 0 }])
  })

  it('an empty session loads as null and clear removes the file', async () => {
    await saveSession(file, [])
    expect(await loadSession(file)).toBeNull()
    await clearSession(file)
    await clearSession(file) // idempotent
    expect(await loadSession(file)).toBeNull()
  })
})
