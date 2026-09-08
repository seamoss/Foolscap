import { basename, dirname } from 'node:path'

/* The ancestry a path menu lists: the file, then each folder up to the
 * volume root — what macOS shows for a ⌘-click on a document's title. */
export function pathChain(path: string): string[] {
  const chain = [path]
  for (;;) {
    const last = chain[chain.length - 1] ?? path
    const parent = dirname(last)
    if (parent === last) return chain
    chain.push(parent)
  }
}

/* What the filesystem has to answer for the root's label — injected so
 * the label logic stays testable without one. */
export interface VolumeLookup {
  /* Entries of /Volumes. */
  volumes(): string[]
  /* Where a /Volumes entry really points, or null when it can't say. */
  resolve(entry: string): string | null
}

/* A menu label for one link of the chain: the basename, except the root,
 * which has none — on macOS it reads as the boot volume's name, the
 * /Volumes entry that resolves to '/'. Anything unnameable is its path. */
export function pathLabel(path: string, lookup: VolumeLookup): string {
  const name = basename(path)
  if (name !== '') return name
  if (path === '/') {
    for (const entry of lookup.volumes()) {
      if (lookup.resolve(`/Volumes/${entry}`) === '/') return entry
    }
  }
  return path
}
