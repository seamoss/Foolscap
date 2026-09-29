import { extname, isAbsolute, resolve } from 'node:path'

/* foolscap://open?path=<URL-encoded absolute path> — how other apps and web
 * pages hand Foolscap a document. The link carries a path and nothing else:
 * any other query parameter is ignored, and the file must already exist.
 * Once accepted, the path travels the same road as a Finder double-click. */

export const LINK_SCHEME = 'foolscap'

const OPENABLE = new Set(['.md', '.markdown', '.txt'])

export type LinkResult = { ok: true; path: string } | { ok: false; error: string }

/* Relayed argv (Windows/Linux second-instance, first launch) carries the link
 * as a plain argument somewhere among Chromium's flags. */
export function isOpenLink(arg: string): boolean {
  return arg.toLowerCase().startsWith(`${LINK_SCHEME}:`)
}

/* Validate a link. `isFile` is injected so tests stay hermetic; it must
 * answer false for anything missing or unreadable. */
export function parseOpenLink(raw: string, isFile: (path: string) => boolean): LinkResult {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: 'Couldn’t read that Foolscap link.' }
  }
  if (url.protocol !== `${LINK_SCHEME}:` || url.host !== 'open' || !['', '/'].includes(url.pathname)) {
    return { ok: false, error: 'Foolscap links can only open files: foolscap://open?path=…' }
  }
  // searchParams has already percent-decoded the value.
  const param = url.searchParams.get('path')
  if (!param) return { ok: false, error: 'That Foolscap link has no file path.' }
  if (!isAbsolute(param)) return { ok: false, error: `Foolscap links need an absolute path: ${param}` }
  // Collapse ./ and ../ so the already-open check compares like with like.
  const path = resolve(param)
  if (!OPENABLE.has(extname(path).toLowerCase())) {
    return { ok: false, error: 'Foolscap links open .md, .markdown, and .txt files only.' }
  }
  if (!isFile(path)) return { ok: false, error: `No file at ${path}` }
  return { ok: true, path }
}
