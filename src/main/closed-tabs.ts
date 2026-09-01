/* Recently closed file-backed tabs, app-wide, for ⇧⌘T. Paths only: a
 * draft discarded with "Don't Save" was discarded on purpose, and a saved
 * file's disk copy is the whole tab. In memory only — a quit restores the
 * session instead, and a launch starts with nothing to reopen. */
export class ClosedTabs {
  private paths: string[] = []

  constructor(private readonly cap = 20) {}

  get size(): number {
    return this.paths.length
  }

  /* Most recent last; closing a path again moves it to the front of the
   * line rather than listing it twice. */
  push(path: string): void {
    this.paths = this.paths.filter((p) => p !== path)
    this.paths.push(path)
    if (this.paths.length > this.cap) this.paths.shift()
  }

  /* The most recently closed path that still exists; ones that vanished in
   * the meantime are dropped on the way past. Null when nothing is left. */
  pop(exists: (path: string) => boolean): string | null {
    for (let path = this.paths.pop(); path !== undefined; path = this.paths.pop()) {
      if (exists(path)) return path
    }
    return null
  }
}

export const closedTabs = new ClosedTabs()
