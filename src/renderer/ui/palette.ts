/* Command palette (Cmd+K). Everything reachable through it — the plan's
 * answer to having no toolbar. A quiet centered card: input, filtered list,
 * arrows + Enter, Escape to dismiss. */

export interface PaletteCommand {
  id: string
  title: string
  /* Shown right-aligned, e.g. the keyboard shortcut. */
  hint?: string
  run(): void
}

/* Subsequence match with a small ranking: prefix beats word-start beats
 * scattered. Returns null when the query doesn't match at all. */
export function scoreMatch(query: string, title: string): number | null {
  const q = query.toLowerCase()
  const t = title.toLowerCase()
  if (q === '') return 0
  if (t.startsWith(q)) return 3
  if (t.includes(` ${q}`)) return 2
  let ti = 0
  for (const ch of q) {
    ti = t.indexOf(ch, ti)
    if (ti === -1) return null
    ti++
  }
  return 1
}

export class Palette {
  private overlay: HTMLElement | null = null
  private input: HTMLInputElement | null = null
  private listEl: HTMLElement | null = null
  private filtered: PaletteCommand[] = []
  private selected = 0

  constructor(
    private readonly commands: () => PaletteCommand[],
    private readonly onClose: () => void
  ) {}

  get visible(): boolean {
    return this.overlay !== null
  }

  toggle(): void {
    if (this.overlay) {
      this.close()
    } else {
      this.open()
    }
  }

  close(): void {
    this.overlay?.remove()
    this.overlay = null
    this.input = null
    this.listEl = null
    this.onClose()
  }

  private open(): void {
    this.overlay = document.createElement('div')
    this.overlay.className = 'palette-overlay'
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close()
    })

    const card = document.createElement('div')
    card.className = 'palette'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-label', 'Command palette')

    this.input = document.createElement('input')
    this.input.className = 'palette-input'
    this.input.type = 'text'
    this.input.placeholder = 'Type a command…'
    this.input.setAttribute('aria-label', 'Search commands')
    this.input.addEventListener('input', () => this.filter())
    this.input.addEventListener('keydown', (e) => this.onKey(e))

    this.listEl = document.createElement('div')
    this.listEl.className = 'palette-list'
    this.listEl.setAttribute('role', 'listbox')

    card.append(this.input, this.listEl)
    this.overlay.append(card)
    document.body.append(this.overlay)
    this.filter()
    this.input.focus()
  }

  private filter(): void {
    const query = this.input?.value ?? ''
    this.filtered = this.commands()
      .map((cmd) => ({ cmd, score: scoreMatch(query, cmd.title) }))
      .filter((entry): entry is { cmd: PaletteCommand; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.cmd)
    this.selected = 0
    this.renderList()
  }

  private renderList(): void {
    if (!this.listEl) return
    this.listEl.replaceChildren()
    if (this.filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'palette-empty'
      empty.textContent = 'No matching commands'
      this.listEl.append(empty)
      return
    }
    this.filtered.forEach((cmd, i) => {
      const item = document.createElement('div')
      item.className = `palette-item${i === this.selected ? ' selected' : ''}`
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', String(i === this.selected))
      const title = document.createElement('span')
      title.textContent = cmd.title
      item.append(title)
      if (cmd.hint) {
        const hint = document.createElement('span')
        hint.className = 'palette-hint'
        hint.textContent = cmd.hint
        item.append(hint)
      }
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.runSelected(i)
      })
      this.listEl?.append(item)
      // The list scrolls; the highlight must not walk off-screen.
      if (i === this.selected) item.scrollIntoView({ block: 'nearest' })
    })
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      this.close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const count = this.filtered.length
      if (count > 0) {
        this.selected = (this.selected + delta + count) % count
        this.renderList()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      this.runSelected(this.selected)
    }
  }

  private runSelected(index: number): void {
    const cmd = this.filtered[index]
    if (!cmd) return
    this.close()
    cmd.run()
  }
}
