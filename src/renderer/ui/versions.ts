import type { HistoryEntry } from '../../shared/types'

/* Version browser (File ▸ Browse Versions…, palette): the document's
 * snapshot history as a list of times, the chosen snapshot readable beside
 * it, one Restore button. Restore replaces the buffer through a normal
 * editor transaction — never the disk — so ⌘Z undoes it and the usual save
 * path carries it to the file. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatVersionTime(time: number, now: number): string {
  const d = new Date(time)
  const ref = new Date(now)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, ref)) return `Today at ${hm}`
  const yesterday = new Date(now)
  yesterday.setDate(ref.getDate() - 1)
  if (sameDay(d, yesterday)) return `Yesterday at ${hm}`
  const md = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  if (d.getFullYear() === ref.getFullYear()) return `${md} at ${hm}`
  return `${md}, ${d.getFullYear()} at ${hm}`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

interface VersionsHooks {
  currentDocId(): number | null
  restore(content: string): void
  toast(message: string): void
}

export class Versions {
  private overlay: HTMLElement | null = null
  private docId: number | null = null
  private selectedContent: string | null = null
  private selectedLabel = ''
  private opening = false

  constructor(private readonly hooks: VersionsHooks) {}

  get visible(): boolean {
    return this.overlay !== null
  }

  async open(): Promise<void> {
    if (this.overlay || this.opening) return
    const docId = this.hooks.currentDocId()
    if (docId === null) return
    this.opening = true
    let entries: HistoryEntry[]
    try {
      entries = await window.foolscap.historyList(docId)
    } finally {
      this.opening = false
    }
    if (this.overlay) return
    if (entries.length === 0) {
      this.hooks.toast('No versions yet — Foolscap records them as a saved document is edited.')
      return
    }
    this.docId = docId
    this.build(entries)
  }

  toggle(): void {
    if (this.overlay) this.close()
    else void this.open()
  }

  close(): void {
    this.overlay?.remove()
    this.overlay = null
    this.docId = null
    this.selectedContent = null
    this.selectedLabel = ''
  }

  private build(entries: HistoryEntry[]): void {
    const overlay = document.createElement('div')
    overlay.className = 'palette-overlay'
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.close()
    })
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        this.close()
      }
    })

    const card = document.createElement('div')
    card.className = 'versions'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-label', 'Versions')

    const head = document.createElement('div')
    head.className = 'versions-head'
    head.textContent = `Versions — ${entries.length === 1 ? '1 snapshot' : `${entries.length} snapshots`}`

    const main = document.createElement('div')
    main.className = 'versions-main'
    const list = document.createElement('div')
    list.className = 'versions-list'
    const body = document.createElement('div')
    body.className = 'versions-body'
    const content = document.createElement('pre')
    content.className = 'versions-content'
    body.append(content)

    const foot = document.createElement('div')
    foot.className = 'versions-foot'
    const hint = document.createElement('span')
    hint.className = 'versions-hint'
    hint.textContent = 'Restoring replaces the document — ⌘Z undoes it.'
    const restore = document.createElement('button')
    restore.type = 'button'
    restore.className = 'settings-chip'
    restore.textContent = 'Restore This Version'
    restore.disabled = true
    restore.addEventListener('click', () => this.restoreSelected())
    foot.append(hint, restore)

    const now = Date.now()
    const items: HTMLButtonElement[] = []
    for (const entry of entries) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'versions-item'
      const label = formatVersionTime(entry.time, now)
      const when = document.createElement('span')
      when.textContent = label
      const size = document.createElement('span')
      size.className = 'versions-size'
      size.textContent = formatSize(entry.size)
      item.append(when, size)
      item.addEventListener('click', () => {
        for (const other of items) other.classList.toggle('selected', other === item)
        void this.show(entry, label, content, restore)
      })
      items.push(item)
      list.append(item)
    }

    main.append(list, body)
    card.append(head, main, foot)
    overlay.append(card)
    this.overlay = overlay
    document.body.append(overlay)
    // Newest first, newest shown: the version you want is almost always the
    // most recent one that predates the mistake.
    items[0]?.click()
    items[0]?.focus()
  }

  private async show(
    entry: HistoryEntry,
    label: string,
    content: HTMLElement,
    restore: HTMLButtonElement
  ): Promise<void> {
    const docId = this.docId
    if (docId === null) return
    this.selectedContent = null
    this.selectedLabel = label
    restore.disabled = true
    const text = await window.foolscap.historyRead(docId, entry.id)
    if (this.docId !== docId || this.selectedLabel !== label) return // stale click
    if (text === null) {
      content.textContent = 'This version could not be read.'
      return
    }
    content.textContent = text
    this.selectedContent = text
    restore.disabled = false
  }

  private restoreSelected(): void {
    const text = this.selectedContent
    const label = this.selectedLabel
    if (text === null) return
    if (this.hooks.currentDocId() !== this.docId) {
      // The active tab changed under the overlay; restoring would hit the
      // wrong buffer.
      this.close()
      return
    }
    this.close()
    this.hooks.restore(text)
    this.hooks.toast(`Restored the version from ${label}. ⌘Z undoes it.`)
  }
}
