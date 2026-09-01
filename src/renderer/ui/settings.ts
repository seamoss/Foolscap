import {
  adjustTextSize,
  applyFont,
  applyTextSize,
  applyTheme,
  currentFont,
  currentTextSize,
  currentTheme,
  FONTS,
  THEMES,
  type Modes
} from './modes'

/* Settings sheet (⌘,) — a quiet card over the document. Every control is a
 * thin veneer over the same functions the palette calls; this is the
 * browsable view, the palette is the fast one. */

interface SettingsHooks {
  modes: Modes
  loadCustomTheme(): void
  checkForUpdates(): void
  autosaveOn(): boolean
  toggleAutosave(): void
}

export class Settings {
  private overlay: HTMLElement | null = null

  constructor(private readonly hooks: SettingsHooks) {}

  get visible(): boolean {
    return this.overlay !== null
  }

  toggle(): void {
    if (this.overlay) this.close()
    else this.open()
  }

  close(): void {
    this.overlay?.remove()
    this.overlay = null
  }

  private open(): void {
    this.overlay = document.createElement('div')
    this.overlay.className = 'palette-overlay'
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close()
    })
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        this.close()
      }
    })
    this.render()
    document.body.append(this.overlay)
    this.overlay.querySelector<HTMLElement>('button')?.focus()
  }

  private render(): void {
    if (!this.overlay) return
    const card = document.createElement('div')
    card.className = 'settings'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-label', 'Settings')

    card.append(
      this.themeSection(),
      this.fontSection(),
      this.sizeSection(),
      this.modesSection(),
      this.savingSection(),
      this.updatesSection()
    )

    this.overlay.replaceChildren(card)
  }

  private section(title: string): { wrap: HTMLElement; row: HTMLElement } {
    const wrap = document.createElement('div')
    wrap.className = 'settings-section'
    const heading = document.createElement('div')
    heading.className = 'settings-title'
    heading.textContent = title
    const row = document.createElement('div')
    row.className = 'settings-row'
    wrap.append(heading, row)
    return { wrap, row }
  }

  private chip(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'settings-chip'
    el.textContent = label
    el.setAttribute('aria-pressed', String(active))
    el.addEventListener('click', () => {
      onClick()
      this.render()
    })
    return el
  }

  private themeSection(): HTMLElement {
    const { wrap, row } = this.section('Theme')
    const active = currentTheme()
    row.append(this.chip('Auto', active === null, () => applyTheme(null)))
    for (const theme of THEMES) {
      row.append(this.chip(theme.label, active === theme.id, () => applyTheme(theme.id)))
    }
    row.append(
      this.chip(active === 'custom' ? 'Custom ✓' : 'Load Custom…', active === 'custom', () =>
        this.hooks.loadCustomTheme()
      )
    )
    return wrap
  }

  private fontSection(): HTMLElement {
    const { wrap, row } = this.section('Font')
    const active = currentFont()
    row.append(this.chip('Recursive', active === null, () => applyFont(null)))
    for (const font of FONTS) {
      row.append(this.chip(font.label, active === font.id, () => applyFont(font.id)))
    }
    return wrap
  }

  private sizeSection(): HTMLElement {
    const { wrap, row } = this.section('Text size')
    const value = document.createElement('span')
    value.className = 'settings-value'
    value.textContent = `${currentTextSize()}px`
    row.append(
      this.chip('−', false, () => adjustTextSize(-1)),
      value,
      this.chip('+', false, () => adjustTextSize(1)),
      this.chip('Reset', false, () => applyTextSize(null))
    )
    return wrap
  }

  private modesSection(): HTMLElement {
    const { wrap, row } = this.section('Writing')
    const { modes } = this.hooks
    row.append(
      this.chip('Typewriter', modes.typewriter, () => modes.toggleTypewriter()),
      this.chip('Focus', modes.focus, () => modes.toggleFocus()),
      this.chip('Word count', modes.wordCount, () => modes.toggleWordCount()),
      this.chip('Line numbers', modes.lineNumbers, () => modes.toggleLineNumbers()),
      this.chip('Table grid', modes.tableGrid, () => modes.toggleTableGrid())
    )
    return wrap
  }

  private savingSection(): HTMLElement {
    const { wrap, row } = this.section('Saving')
    row.append(this.chip('Autosave', this.hooks.autosaveOn(), () => this.hooks.toggleAutosave()))
    return wrap
  }

  private updatesSection(): HTMLElement {
    const { wrap, row } = this.section('Updates')
    row.append(
      this.chip('Check for updates now', false, () => {
        this.close()
        this.hooks.checkForUpdates()
      })
    )
    return wrap
  }
}
