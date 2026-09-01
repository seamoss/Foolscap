import { EditorView, type ViewUpdate } from '@codemirror/view'
import { lineNumbersOn, setLineNumbers, syncLineNumbers } from '../editor/line-numbers'
import { setTableGrid, syncTableGrid, tableGridOn } from '../editor/live-preview/table-grid'
import { tokenMs } from './tokens'

/* Writing modes and the theme switch. All toggles, no chrome (§4.4):
 * typewriter and focus are states of the editor, the word count is a corner
 * whisper that only appears on mouse movement, and the theme is one
 * data-theme attribute driving the themes/*.css files. */

export type ThemeName =
  | 'ledger'
  | 'plate'
  | 'manuscript'
  | 'github'
  | 'github-dark'
  | 'vercel'
  | 'vscode'

export interface ThemeChoice {
  id: ThemeName
  label: string
}

/* One CSS file each in styles/themes/ — see THEMING.md for the contract. */
export const THEMES: ThemeChoice[] = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'plate', label: 'Plate' },
  { id: 'manuscript', label: 'Manuscript' },
  { id: 'github', label: 'GitHub' },
  { id: 'github-dark', label: 'GitHub Dark' },
  { id: 'vercel', label: 'Vercel' },
  { id: 'vscode', label: 'VS Code' }
]

const STORE = {
  theme: 'foolscap:theme',
  font: 'foolscap:font',
  textSize: 'foolscap:text-size',
  customThemeCss: 'foolscap:custom-theme-css',
  typewriter: 'foolscap:typewriter',
  focus: 'foolscap:focus',
  wordCount: 'foolscap:word-count'
} as const

/* ---- Text size (plan §4.2: user control from 14 to 22) ---- */

export const TEXT_SIZE = { min: 14, max: 22, default: 17 } as const

export function clampTextSize(px: number): number {
  return Math.max(TEXT_SIZE.min, Math.min(TEXT_SIZE.max, Math.round(px)))
}

export function currentTextSize(): number {
  const saved = Number(localStorage.getItem(STORE.textSize))
  return Number.isFinite(saved) && saved >= TEXT_SIZE.min ? clampTextSize(saved) : TEXT_SIZE.default
}

export function applyTextSize(px: number | null): number {
  if (px === null) {
    document.documentElement.style.removeProperty('--font-size-body')
    localStorage.removeItem(STORE.textSize)
    return TEXT_SIZE.default
  }
  const size = clampTextSize(px)
  document.documentElement.style.setProperty('--font-size-body', `${size}px`)
  localStorage.setItem(STORE.textSize, String(size))
  return size
}

export function adjustTextSize(delta: number): number {
  return applyTextSize(currentTextSize() + delta)
}

export function restoreTextSize(): void {
  const saved = localStorage.getItem(STORE.textSize)
  if (saved !== null) applyTextSize(Number(saved))
}

/* The writing-font roster: ten crisp faces, five serif and five sans, all
 * bundled variable fonts with true italics (Outfit excepted) — plus the
 * Recursive default. Google Sans is proprietary and cannot ship with an MIT
 * app; its entry resolves to a locally installed copy and falls back to
 * Outfit, the nearest open geometric. One font per page, literally: a
 * chosen font carries body AND headings; only the default hands headings
 * back to Fraunces. Code stays mono; exports keep the theme's fonts. */
export interface FontChoice {
  id: string
  label: string
  kind: 'serif' | 'sans'
  stack: string
}

export const FONTS: FontChoice[] = [
  { id: 'literata', label: 'Literata', kind: 'serif', stack: "'Literata Variable', Georgia, serif" },
  { id: 'source-serif', label: 'Source Serif', kind: 'serif', stack: "'Source Serif 4 Variable', Georgia, serif" },
  { id: 'lora', label: 'Lora', kind: 'serif', stack: "'Lora Variable', Georgia, serif" },
  { id: 'crimson-pro', label: 'Crimson Pro', kind: 'serif', stack: "'Crimson Pro Variable', Georgia, serif" },
  { id: 'bitter', label: 'Bitter', kind: 'serif', stack: "'Bitter Variable', Georgia, serif" },
  {
    id: 'google-sans',
    label: 'Google Sans',
    kind: 'sans',
    stack:
      "'Google Sans Flex', 'Google Sans Flex 24pt', 'Google Sans Text', 'Google Sans', 'Product Sans', 'Outfit Variable', system-ui, sans-serif"
  },
  { id: 'inter', label: 'Inter', kind: 'sans', stack: "'Inter Variable', system-ui, sans-serif" },
  { id: 'source-sans', label: 'Source Sans', kind: 'sans', stack: "'Source Sans 3 Variable', system-ui, sans-serif" },
  { id: 'plex-sans', label: 'IBM Plex Sans', kind: 'sans', stack: "'IBM Plex Sans Variable', system-ui, sans-serif" },
  { id: 'work-sans', label: 'Work Sans', kind: 'sans', stack: "'Work Sans Variable', system-ui, sans-serif" }
]

export function applyFont(id: string | null): void {
  const choice = FONTS.find((f) => f.id === id) ?? null
  if (choice) {
    document.documentElement.style.setProperty('--font-body', choice.stack)
    document.documentElement.style.setProperty('--font-heading', choice.stack)
    localStorage.setItem(STORE.font, choice.id)
  } else {
    // Back to the default: the theme's fonts decide again.
    document.documentElement.style.removeProperty('--font-body')
    document.documentElement.style.removeProperty('--font-heading')
    localStorage.removeItem(STORE.font)
  }
}

export function restoreFont(): void {
  const saved = localStorage.getItem(STORE.font)
  if (saved) applyFont(saved)
}

export function countWords(text: string): number {
  const tokens = text.match(/\S+/g)
  if (!tokens) return 0
  // Count tokens containing at least one letter or digit, so bare syntax
  // marks (#, >, -, ```) don't inflate the number.
  let count = 0
  for (const token of tokens) {
    if (/[\p{L}\p{N}]/u.test(token)) count++
  }
  return count
}

export function applyTheme(theme: ThemeName | null): void {
  document.getElementById('custom-theme')?.remove()
  if (theme) {
    document.documentElement.dataset['theme'] = theme
    localStorage.setItem(STORE.theme, theme)
  } else {
    delete document.documentElement.dataset['theme']
    localStorage.removeItem(STORE.theme)
  }
}

export function restoreTheme(): void {
  const saved = localStorage.getItem(STORE.theme)
  if (saved === 'custom') {
    const css = localStorage.getItem(STORE.customThemeCss)
    if (css) injectCustomThemeCss(css)
    return
  }
  if (saved !== null && THEMES.some((t) => t.id === saved)) {
    document.documentElement.dataset['theme'] = saved
  }
}

/* ---- Custom theme: one user CSS file defining the palette under
 * :root[data-theme='custom'] — see THEMING.md ---- */

const CUSTOM_STYLE_ID = 'custom-theme'

function injectCustomThemeCss(css: string): void {
  document.getElementById(CUSTOM_STYLE_ID)?.remove()
  const style = document.createElement('style')
  style.id = CUSTOM_STYLE_ID
  style.textContent = css
  document.head.append(style)
  document.documentElement.dataset['theme'] = 'custom'
}

/* Applies to the DOM unconditionally; returns whether the theme could also
 * be persisted. localStorage.setItem throws QuotaExceededError past ~5 MB,
 * and an oversized theme file must not take down the caller with it. */
export function applyCustomTheme(css: string): boolean {
  injectCustomThemeCss(css)
  try {
    localStorage.setItem(STORE.customThemeCss, css)
    localStorage.setItem(STORE.theme, 'custom')
    return true
  } catch {
    return false
  }
}

/* ---- Current-state readers for the settings sheet ---- */

export function currentTheme(): string | null {
  return document.documentElement.dataset['theme'] ?? null
}

export function currentFont(): string | null {
  return localStorage.getItem(STORE.font)
}

export class Modes {
  typewriter = localStorage.getItem(STORE.typewriter) === '1'
  focus = localStorage.getItem(STORE.focus) === '1'
  wordCount = localStorage.getItem(STORE.wordCount) !== '0' // on by default

  private countEl: HTMLElement
  private fadeTimer: number | undefined
  private recountTimer: number | undefined

  constructor(private readonly view: EditorView) {
    document.documentElement.classList.toggle('focus-mode', this.focus)

    this.countEl = document.createElement('div')
    this.countEl.className = 'wordcount'
    this.countEl.setAttribute('aria-hidden', 'true')
    document.body.append(this.countEl)
    this.recount()

    window.addEventListener('mousemove', () => this.peek())
  }

  toggleTypewriter(): void {
    this.typewriter = !this.typewriter
    localStorage.setItem(STORE.typewriter, this.typewriter ? '1' : '0')
    if (this.typewriter) this.center()
  }

  toggleFocus(): void {
    this.focus = !this.focus
    localStorage.setItem(STORE.focus, this.focus ? '1' : '0')
    document.documentElement.classList.toggle('focus-mode', this.focus)
  }

  toggleWordCount(): void {
    this.wordCount = !this.wordCount
    localStorage.setItem(STORE.wordCount, this.wordCount ? '1' : '0')
    if (!this.wordCount) this.countEl.classList.remove('visible')
  }

  /* Persistence lives with the compartment in editor/line-numbers.ts, so
   * this is a getter, not a field like the toggles above — one source of
   * truth instead of a copy to keep in step. */
  get lineNumbers(): boolean {
    return lineNumbersOn()
  }

  toggleLineNumbers(): void {
    setLineNumbers(this.view, !lineNumbersOn())
  }

  /* Same shape: the compartment in editor/live-preview/table-grid.ts owns
   * the persisted choice. */
  get tableGrid(): boolean {
    return tableGridOn()
  }

  toggleTableGrid(): void {
    setTableGrid(this.view, !tableGridOn())
  }

  handleUpdate(update: ViewUpdate): void {
    if (!update.docChanged) return
    if (this.typewriter) {
      // Dispatching inside an update is illegal; defer a tick.
      queueMicrotask(() => this.center())
    }
    window.clearTimeout(this.recountTimer)
    this.recountTimer = window.setTimeout(() => this.recount(), 300)
  }

  refresh(): void {
    this.recount()
    // Tab switches swap whole states in with setState; one built before the
    // user toggled line numbers or the table grid carries the stale choice.
    syncLineNumbers(this.view)
    syncTableGrid(this.view)
  }

  private center(): void {
    this.view.dispatch({
      effects: EditorView.scrollIntoView(this.view.state.selection.main.head, { y: 'center' })
    })
  }

  private recount(): void {
    const words = countWords(this.view.state.doc.toString())
    this.countEl.textContent = `${words} ${words === 1 ? 'word' : 'words'}`
  }

  /* §4.4: fades in on mouse move, out after 2s. */
  private peek(): void {
    if (!this.wordCount) return
    this.countEl.classList.add('visible')
    window.clearTimeout(this.fadeTimer)
    this.fadeTimer = window.setTimeout(
      () => this.countEl.classList.remove('visible'),
      tokenMs('--dur-wordcount-peek')
    )
  }
}
