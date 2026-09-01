import '@fontsource-variable/recursive/full.css'
import '@fontsource-variable/fraunces/full.css'
/* The writing-font roster (see FONTS in ui/modes.ts). */
import '@fontsource-variable/literata'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/source-serif-4/wght-italic.css'
import '@fontsource-variable/lora'
import '@fontsource-variable/lora/wght-italic.css'
import '@fontsource-variable/crimson-pro'
import '@fontsource-variable/crimson-pro/wght-italic.css'
import '@fontsource-variable/bitter'
import '@fontsource-variable/bitter/wght-italic.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/inter/wght-italic.css'
import '@fontsource-variable/source-sans-3'
import '@fontsource-variable/source-sans-3/wght-italic.css'
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource-variable/ibm-plex-sans/wght-italic.css'
import '@fontsource-variable/work-sans'
import '@fontsource-variable/work-sans/wght-italic.css'
import '@fontsource-variable/outfit'
import './styles/fonts-ioskeley.css'
import './styles/tokens.css'
import './styles/themes/ledger.css'
import './styles/themes/plate.css'
import './styles/themes/manuscript.css'
import './styles/themes/github.css'
import './styles/themes/github-dark.css'
import './styles/themes/vercel.css'
import './styles/themes/vscode.css'
import './styles/base.css'
import { openSearchPanel } from '@codemirror/search'
import type { EditorState, StateCommand, TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { renderMarkdown } from '../shared/markdown'
import { NEW_DOC_CURSOR, NEW_DOC_TEMPLATE, type DocPosition, type TabsState } from '../shared/types'
import {
  insertLink,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleStrikethrough
} from './editor/format-commands'
import { beginCellEditAt, finishCellEdit, posOutsideGrid } from './editor/live-preview/table-grid'
import { imageBlockInsertion, imagesInline, insertDroppedImages } from './editor/paste-image'
import { createEditor } from './editor/setup'
import helpMd from './help.md?raw'
import { AutosaveScheduler, autosaveEnabled, setAutosaveEnabled } from './ui/autosave'
import { classifyDrop, droppedImages } from './ui/drop'
import {
  adjustTextSize,
  applyCustomTheme,
  applyFont,
  applyTextSize,
  applyTheme,
  FONTS,
  Modes,
  restoreFont,
  restoreTextSize,
  restoreTheme,
  THEMES
} from './ui/modes'
import { hideConflictBar, showConflictBar, showToast, showUpdateReadyToast } from './ui/notice'
import { Outline } from './ui/outline'
import { Palette, type PaletteCommand } from './ui/palette'
import { Preview } from './ui/preview'
import { Settings } from './ui/settings'
import { TableControls } from './ui/table-controls'
import { TabBar } from './ui/tabs'
import { initTitlebar, setTitlebar, setTitlebarVisible } from './ui/titlebar'
import { Versions } from './ui/versions'

restoreTheme()
restoreFont()
restoreTextSize()
initTitlebar()

const app = document.getElementById('app')
if (!(app instanceof HTMLElement)) {
  throw new Error('renderer: #app mount point missing from index.html')
}

/* ---- The document registry: one buffer per tab ----
 *
 * Main owns tab identity and order; this window holds an EditorState per
 * docId and shows exactly one at a time in the single EditorView. Dirty is
 * a changed-since-load flag, not a diff: set on the first edit, cleared
 * when main confirms a save or pushes a fresh document.
 * editedSinceContentSent guards the save race: a save snapshots the buffer
 * over IPC and writes async; keystrokes landing in that window are in the
 * buffer but not in the file, and doc:saved must not mark them clean. */
interface OpenDoc {
  state: EditorState
  path: string | null
  dir: string | null
  dirty: boolean
  editedSinceContentSent: boolean
  conflictPending: boolean
  scrollTop: number
  /* Top-of-view offset remembered from a past visit, applied on the first
   * display and then cleared; scrollTop takes over for tab switches. */
  restoreTop: number | null
  /* Where the reader was when this tab left the foreground — what a
   * background tab reports when main asks at quit. */
  position: DocPosition | null
}

const docs = new Map<number, OpenDoc>()
let displayedId: number | null = null
let tabsState: TabsState | null = null

const displayedDoc = (): OpenDoc | null => (displayedId === null ? null : (docs.get(displayedId) ?? null))

/* ---- Autosave: the renderer sees every keystroke; main does the writing.
 * Debounced per doc, a backstop for unbroken typing bursts, flushes when a
 * document leaves the foreground. Only file-backed docs qualify — an
 * untitled one has nowhere to go without a dialog mid-thought. ---- */
const autosaveScheduler = new AutosaveScheduler((docId) => {
  const doc = docs.get(docId)
  if (doc && doc.path && doc.dirty && !doc.conflictPending && autosaveEnabled()) {
    window.foolscap.autosave(docId)
  }
})

// Main's close guards mirror the setting; tell it where we stand at launch.
window.foolscap.setAutosaveEnabled(autosaveEnabled())

/* Paste and drop share the assets/ path, and its two ways of failing. */
const IMAGE_NO_DOCUMENT = 'Save the document first — images need a folder to live beside.'
const IMAGE_FAILED = 'That image could not be saved beside the document — check the folder is writable.'

const editor = createEditor(app, {
  onDocChanged: () => {
    const doc = displayedDoc()
    if (!doc || displayedId === null) return
    doc.editedSinceContentSent = true
    if (!doc.dirty) {
      doc.dirty = true
      // The tab strip and title follow main's re-broadcast.
      window.foolscap.setDirty(displayedId, true)
    }
    if (doc.path && !doc.conflictPending && autosaveEnabled()) {
      autosaveScheduler.changed(displayedId)
    }
  },
  onUpdate: (update) => {
    outline.handleUpdate(update)
    modes.handleUpdate(update)
  },
  onNoDocumentForPaste: () => showToast(IMAGE_NO_DOCUMENT),
  onPasteFailed: () => showToast(IMAGE_FAILED)
})
const outline = new Outline(editor.view, (pos) => {
  const anchor = Math.min(pos, editor.view.state.doc.length)
  editor.view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: 'start' })
  })
  // In preview, the visible pane must move too; otherwise focus the editor.
  if (preview.visible) preview.scrollTo(anchor)
  else editor.view.focus()
})
const modes = new Modes(editor.view)
new TableControls(editor.view)

/* ---- Preview mode ---- */

const preview = new Preview(
  (pos, screenTop) => exitPreview(pos, screenTop),
  // Table-resize write-back: apply the change to the (hidden) editor doc
  // and hand the preview the updated source to re-render from.
  (from, to, insert) => {
    const doc = editor.view.state.doc
    if (from < 0 || to > doc.length || from > to) return null
    editor.view.dispatch({
      changes: { from, to, insert },
      userEvent: 'input'
    })
    return editor.view.state.doc.toString()
  }
)

/* The render is async, so "previewing" is three states, not two: hidden,
 * entering (render in flight), shown. The generation counter lets exit
 * cancel an in-flight enter — Preview.show unconditionally un-hides when it
 * resolves, and a stale resolution must not overrule the user's toggle. */
let previewGen = 0
let previewEntering = false

async function enterPreview(nearPos?: number): Promise<void> {
  // A cell edit in flight commits now — the captured content must carry
  // it — and its cell, not the parked CM caret, is where the reader was.
  const cellPos = finishCellEdit(editor.view)
  const at = nearPos ?? cellPos ?? editor.view.state.selection.main.head
  const gen = ++previewGen
  previewEntering = true
  try {
    // Render before hiding the editor: while the pipeline works, the user
    // sees their document as text — never blank paper.
    const shown = await preview.show(editor.getContent(), displayedDoc()?.dir ?? null, at)
    if (gen !== previewGen) {
      // Superseded. A newer enter (another tab's file, opened mid-render)
      // resolved this show false and owns the pane — nothing to undo. Only
      // when the pane did show — the user left preview while it rendered —
      // does it go back, and focus with it.
      if (shown) {
        preview.hide()
        editor.view.focus()
      }
      return
    }
    if (!shown) return
    document.documentElement.classList.add('previewing')
  } catch (err) {
    if (gen !== previewGen) return
    // Never strand the user staring at a hidden editor.
    console.error('preview render failed', err)
    exitPreview()
    showToast('Preview failed to render — staying in the editor.')
  } finally {
    if (gen === previewGen) previewEntering = false
  }
}

function exitPreview(pos?: number, screenTop?: number): void {
  previewGen++
  previewEntering = false
  document.documentElement.classList.remove('previewing')
  // No explicit target (⌘E, Escape): land where the reader was scrolled,
  // measured while the pane still has geometry.
  const target =
    pos !== undefined
      ? { pos, top: screenTop }
      : preview.visible
        ? (preview.visibleAnchor() ?? undefined)
        : undefined
  preview.hide()
  if (target) {
    const anchor = Math.min(target.pos, editor.view.state.doc.length)
    // The page holds still: the anchor's line lands at the viewport height
    // the element had in the preview. Clamped so the cursor stays on screen
    // when a block taller than the viewport starts above the fold. Without
    // a captured height (dblclick outside any stamped element) fall back to
    // centering.
    const effects =
      target.top !== undefined
        ? EditorView.scrollIntoView(anchor, {
            y: 'start',
            yMargin: Math.max(0, target.top - editor.view.scrollDOM.getBoundingClientRect().top)
          })
        : EditorView.scrollIntoView(anchor, { y: 'center' })
    // A double-click that lands inside a grid-rendered table opens THAT
    // cell for editing instead of dropping the caret into pipe source —
    // and the cell then holds focus, so don't steal it back. A plain ⌘E
    // exit that merely lands near a table parks the caret just outside.
    if (pos !== undefined && beginCellEditAt(editor.view, anchor, effects, target.top)) return
    editor.view.dispatch({
      selection: { anchor: posOutsideGrid(editor.view.state, anchor) },
      effects
    })
  }
  editor.view.focus()
}

function togglePreview(): void {
  if (preview.visible || previewEntering) exitPreview()
  else void enterPreview()
}

/* ---- Where you were: the caret and the line at the top of the view, as
 * offsets — or, while previewing, the block at the pane's center. Main
 * keeps it per file and hands it back on the next open. ---- */

function whereabouts(): DocPosition | null {
  if (preview.visible) {
    const anchor = preview.visibleAnchor()
    return anchor ? { head: anchor.pos, top: anchor.pos } : null
  }
  const view = editor.view
  const y = view.scrollDOM.getBoundingClientRect().top - view.documentTop
  return {
    head: view.state.selection.main.head,
    top: view.lineBlockAtHeight(Math.max(0, y)).from
  }
}

/* Called at the moments the displayed document might stop being looked
 * at; untitled drafts have no file to remember against. */
function rememberWhereabouts(): void {
  const doc = displayedDoc()
  if (!doc || displayedId === null) return
  const position = whereabouts()
  if (!position) return
  doc.position = position
  if (doc.path) window.foolscap.rememberPosition(displayedId, position)
}

/* ---- Help: a markdown document rendered by the same preview machinery it
 * explains. Overlays whatever you're doing; leaves the buffer untouched.
 * Constructed after `preview` so it stacks above it. ---- */

const helpPreview = new Preview(() => helpPreview.hide())

function toggleHelp(): void {
  if (helpPreview.visible) {
    helpPreview.hide()
    // Help can overlay the preview pane; scrolling must return to it.
    if (preview.visible) preview.focus()
    else editor.view.focus()
  } else {
    void helpPreview.show(helpMd, null, 0).catch(() => showToast('Help failed to render.'))
  }
}

/* Find is a CodeMirror panel, so it can only exist in the editor: reaching
 * it from preview means leaving preview. Help overlays both; close it too. */
function openFind(): void {
  if (helpPreview.visible) toggleHelp()
  if (preview.visible || previewEntering) exitPreview()
  openSearchPanel(editor.view)
}

function loadCustomTheme(): void {
  void window.foolscap.loadCustomTheme().then((css) => {
    if (css === null) return
    if (applyCustomTheme(css)) {
      showToast('Custom theme applied — define your palette under :root[data-theme=\'custom\'].')
    } else {
      showToast('Custom theme applied, but too large to save — it won’t survive a relaunch.')
    }
  })
}

/* A check the user asked for by name deserves an answer in every case —
 * the background updater stays silent, this path never does. */
function checkUpdatesNow(): void {
  showToast('Checking for updates…')
  void window.foolscap.checkForUpdates().then(({ outcome, version }) => {
    if (outcome === 'update-en-route') {
      showToast(`New version ${version} available! Downloading — a toast will land when it’s ready.`)
    } else if (outcome === 'up-to-date') {
      showToast('Foolscap is up to date.')
    } else if (outcome === 'dev-build') {
      showToast('Running from source — updates arrive by git, not by toast.')
    } else if (outcome === 'mas-build') {
      showToast('This copy updates through the App Store.')
    } else {
      showToast('Couldn’t reach the update feed — try again later.')
    }
  })
}

const settings = new Settings({
  modes,
  loadCustomTheme,
  checkForUpdates: checkUpdatesNow,
  autosaveOn: () => autosaveEnabled(),
  toggleAutosave: () => {
    const on = !autosaveEnabled()
    setAutosaveEnabled(on)
    if (!on) autosaveScheduler.cancelAll()
    showToast(on ? 'Autosave on — saved documents write themselves.' : 'Autosave off — ⌘S is back in charge.')
  }
})

const versions = new Versions({
  currentDocId: () => displayedId,
  // Through a normal transaction, never the disk: ⌘Z undoes a restore, and
  // the usual save path (autosave included) carries it to the file.
  restore: (content) => {
    if (helpPreview.visible) toggleHelp()
    if (preview.visible || previewEntering) exitPreview()
    const state = editor.view.state
    editor.view.dispatch({
      changes: { from: 0, to: state.doc.length, insert: content },
      selection: { anchor: Math.min(state.selection.main.head, content.length) },
      userEvent: 'input'
    })
    editor.view.focus()
  },
  toast: showToast
})

/* Menu accelerators arrive here even while an overlay is up; formatting only
 * makes sense against a visible buffer with a caret in it. */
function formatInEditor(command: StateCommand): void {
  if (preview.visible || previewEntering || helpPreview.visible) return
  editor.view.focus()
  command(editor.view)
}

window.foolscap.onCommand((command) => {
  if (command === 'toggle-outline') outline.toggle()
  else if (command === 'toggle-typewriter') modes.toggleTypewriter()
  else if (command === 'toggle-focus') modes.toggleFocus()
  else if (command === 'toggle-line-numbers') modes.toggleLineNumbers()
  else if (command === 'toggle-table-grid') modes.toggleTableGrid()
  else if (command === 'toggle-palette') palette.toggle()
  else if (command === 'toggle-preview') togglePreview()
  else if (command === 'show-help') toggleHelp()
  else if (command === 'text-larger') adjustTextSize(1)
  else if (command === 'text-smaller') adjustTextSize(-1)
  else if (command === 'text-reset') applyTextSize(null)
  else if (command === 'open-settings') settings.toggle()
  else if (command === 'check-updates') checkUpdatesNow()
  else if (command === 'format-bold') formatInEditor(toggleBold)
  else if (command === 'format-italic') formatInEditor(toggleItalic)
  else if (command === 'format-strike') formatInEditor(toggleStrikethrough)
  else if (command === 'format-code') formatInEditor(toggleInlineCode)
  else if (command === 'format-link') formatInEditor(insertLink)
  else if (command === 'browse-versions') void versions.open()
})

const mod = window.foolscap.platform === 'darwin' ? '⌘' : 'Ctrl+'
const revealLabel = window.foolscap.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Folder'

/* Commands that need a file behind the document: an untitled draft gets
 * told, not silently ignored. */
function withPath(run: (path: string) => void): void {
  const path = displayedDoc()?.path
  if (path) run(path)
  else showToast('Save the document first — an untitled draft has no file yet.')
}

const paletteCommands = (): PaletteCommand[] => [
  { id: 'new-tab', title: 'New Tab', hint: `${mod}T`, run: () => window.foolscap.exec('tab-new') },
  { id: 'close-tab', title: 'Close Tab', hint: `${mod}W`, run: () => window.foolscap.exec('tab-close') },
  { id: 'reopen-tab', title: 'Reopen Closed Tab', hint: `⇧${mod}T`, run: () => window.foolscap.exec('tab-reopen') },
  { id: 'new-window', title: 'New Window', hint: `${mod}N`, run: () => window.foolscap.exec('window-new') },
  { id: 'open', title: 'Open…', hint: `${mod}O`, run: () => window.foolscap.exec('file-open') },
  { id: 'save', title: 'Save', hint: `${mod}S`, run: () => window.foolscap.exec('file-save') },
  { id: 'save-as', title: 'Save As…', run: () => window.foolscap.exec('file-save-as') },
  { id: 'versions', title: 'Browse Versions…', run: () => void versions.open() },
  { id: 'reveal', title: revealLabel, run: () => withPath(() => window.foolscap.exec('file-reveal')) },
  {
    id: 'copy-path',
    title: 'Copy Path',
    run: () =>
      withPath(() => {
        window.foolscap.exec('file-copy-path')
        showToast('Path copied.')
      })
  },
  {
    id: 'find',
    title: 'Find & Replace',
    hint: `${mod}F`,
    run: () => {
      if (preview.visible || previewEntering) exitPreview()
      openSearchPanel(editor.view)
    }
  },
  { id: 'preview', title: 'Toggle Preview', hint: `${mod}E`, run: () => togglePreview() },
  { id: 'format-bold', title: 'Format: Bold', hint: `${mod}B`, run: () => formatInEditor(toggleBold) },
  { id: 'format-italic', title: 'Format: Italic', hint: `${mod}I`, run: () => formatInEditor(toggleItalic) },
  { id: 'format-strike', title: 'Format: Strikethrough', hint: `⇧${mod}X`, run: () => formatInEditor(toggleStrikethrough) },
  { id: 'format-code', title: 'Format: Inline Code', hint: `⇧${mod}C`, run: () => formatInEditor(toggleInlineCode) },
  { id: 'format-link', title: 'Format: Link', hint: `⇧${mod}K`, run: () => formatInEditor(insertLink) },
  { id: 'help', title: 'wtf is this? (Help)', hint: `⇧${mod}/`, run: () => window.foolscap.exec('help-window') },
  { id: 'outline', title: 'Toggle Outline', hint: `⇧${mod}O`, run: () => outline.toggle() },
  { id: 'export-html', title: 'Export as HTML…', run: () => window.foolscap.exec('export-html') },
  { id: 'export-pdf', title: 'Export as PDF…', run: () => window.foolscap.exec('export-pdf') },
  { id: 'typewriter', title: 'Toggle Typewriter Mode', run: () => modes.toggleTypewriter() },
  { id: 'focus', title: 'Toggle Focus Mode', run: () => modes.toggleFocus() },
  { id: 'wordcount', title: 'Toggle Word Count', run: () => modes.toggleWordCount() },
  { id: 'line-numbers', title: 'Toggle Line Numbers', run: () => modes.toggleLineNumbers() },
  { id: 'table-grid', title: 'Toggle Table Grid', run: () => modes.toggleTableGrid() },
  { id: 'settings', title: 'Settings…', hint: `${mod},`, run: () => settings.toggle() },
  { id: 'check-updates', title: 'Check for Updates…', run: () => checkUpdatesNow() },
  { id: 'print', title: 'Print…', hint: `${mod}P`, run: () => window.foolscap.exec('file-print') },
  { id: 'text-larger', title: 'Text Size: Larger', hint: `${mod}+`, run: () => void adjustTextSize(1) },
  { id: 'text-smaller', title: 'Text Size: Smaller', hint: `${mod}−`, run: () => void adjustTextSize(-1) },
  { id: 'text-reset', title: 'Text Size: Reset', hint: `${mod}0`, run: () => void applyTextSize(null) },
  { id: 'theme-custom', title: 'Theme: Load Custom…', run: () => loadCustomTheme() },
  { id: 'font-default', title: 'Font: Recursive (Default)', run: () => applyFont(null) },
  ...FONTS.map((font) => ({
    id: `font-${font.id}`,
    title: `Font: ${font.label}`,
    hint: font.kind,
    run: () => applyFont(font.id)
  })),
  { id: 'theme-auto', title: 'Theme: Auto (System)', run: () => applyTheme(null) },
  ...THEMES.map((theme) => ({
    id: `theme-${theme.id}`,
    title: `Theme: ${theme.label}`,
    run: () => applyTheme(theme.id)
  }))
]

const palette = new Palette(paletteCommands, () => editor.view.focus())

/* Dropped images: in the editor they land where the drop cursor pointed,
 * the same inline link a paste makes. The preview page has no cursor, so
 * there the image becomes its own paragraph above the block it was
 * dropped on (the end of the document when dropped past everything), and
 * the editor opens there to name it. The files write first; the links
 * land in one transaction. */
async function dropImages(files: File[], x: number, y: number): Promise<void> {
  if (helpPreview.visible) toggleHelp()
  let place: (state: EditorState, relPaths: readonly string[]) => TransactionSpec
  if (preview.visible || previewEntering) {
    const block = document.elementFromPoint(x, y)?.closest<HTMLElement>('.preview-doc > [data-pos]')
    const at = block ? Number(block.dataset['pos']) : editor.view.state.doc.length
    exitPreview()
    place = (state, relPaths) => imageBlockInsertion(state, at, relPaths)
  } else {
    const at = editor.view.posAtCoords({ x, y }) ?? editor.view.state.selection.main.head
    place = (state, relPaths) => imagesInline(state, at, relPaths)
  }
  try {
    await insertDroppedImages(editor.view, files, place, () => showToast(IMAGE_NO_DOCUMENT))
  } catch {
    showToast(IMAGE_FAILED)
  }
}

/* Drag a markdown file onto the window to open it here — with the same
 * unsaved-changes guard as any other open — or images to place them.
 * Capture phase: CodeMirror's drop handler preventDefaults but never stops
 * propagation, so without this it inserts the file's text and we open it
 * too. */
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener(
  'drop',
  (e) => {
    const files = e.dataTransfer?.files
    const verdict = classifyDrop(files ? Array.from(files, (f) => f.name) : [])
    if (verdict === 'pass') return
    e.preventDefault()
    e.stopPropagation()
    if (verdict === 'reject') {
      showToast('Drop markdown (.md, .markdown, .mdx, .txt) to open it, or images (.png, .jpg, .gif, .webp) to place them.')
      return
    }
    if (verdict === 'image') {
      void dropImages(droppedImages(files ? Array.from(files) : []), e.clientX, e.clientY)
      return
    }
    const file = files?.[0]
    if (!file) return
    const path = window.foolscap.pathForFile(file)
    if (path) window.foolscap.openDropped(path)
  },
  true
)

/* First-ever run: open with the manual. Once, ever. */
if (!localStorage.getItem('foolscap:first-run-done')) {
  localStorage.setItem('foolscap:first-run-done', '1')
  toggleHelp()
}

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    palette.toggle()
  } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
    // Redundant with the menu accelerator — whichever fires first wins,
    // the other never sees the event.
    e.preventDefault()
    outline.toggle()
  } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
    // Redundant with the menu accelerator — whichever fires first wins.
    e.preventDefault()
    window.foolscap.exec('tab-new')
  } else if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'Tab') {
    // ⌃Tab / ⌃⇧Tab cycle through the strip, wrapping.
    e.preventDefault()
    const state = tabsState
    if (state && state.tabs.length > 1) {
      const at = state.tabs.findIndex((t) => t.docId === state.active)
      const step = e.shiftKey ? state.tabs.length - 1 : 1
      const next = state.tabs[(at + step) % state.tabs.length]
      if (next) window.foolscap.tabActivate(next.docId)
    }
  } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    if (helpPreview.visible) toggleHelp()
    else togglePreview()
  } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
    // Redundant with CodeMirror's Mod-f while the editor has focus — this
    // catches ⌘F everywhere else (preview, help, outline).
    e.preventDefault()
    openFind()
  } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === ',') {
    e.preventDefault()
    settings.toggle()
  } else if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    adjustTextSize(1)
  } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
    e.preventDefault()
    adjustTextSize(-1)
  } else if (e.key === 'Escape' && settings.visible) {
    e.preventDefault()
    settings.close()
  } else if (e.key === 'Escape' && versions.visible) {
    e.preventDefault()
    versions.close()
  } else if (e.key === 'Escape' && helpPreview.visible) {
    e.preventDefault()
    toggleHelp()
  } else if (e.key === 'Escape' && (preview.visible || previewEntering)) {
    e.preventDefault()
    exitPreview()
  }
})

/* ---- Tab display: swap the visible buffer ---- */

const conflictBarFor = (docId: number): void => {
  showConflictBar((choice) => {
    window.foolscap.resolveConflict(docId, choice)
    const doc = docs.get(docId)
    if (doc) doc.conflictPending = false
    editor.view.focus()
  })
}

function display(docId: number): void {
  const doc = docs.get(docId)
  if (!doc || docId === displayedId) return
  // Where the outgoing document was — read while the preview, if up, still
  // has geometry.
  rememberWhereabouts()
  // The outgoing document's pending autosave fires now, not mid-way through
  // reading the next tab.
  if (displayedId !== null) autosaveScheduler.flush(displayedId)
  // Leave preview first: its exit dispatch must land in the old buffer.
  if (preview.visible || previewEntering) exitPreview()
  const prev = displayedDoc()
  if (prev) {
    prev.state = editor.view.state
    prev.scrollTop = editor.view.scrollDOM.scrollTop
  }
  displayedId = docId
  editor.view.setState(doc.state)
  restoreView(doc)
  if (doc.conflictPending) conflictBarFor(docId)
  else hideConflictBar()
  outline.refresh()
  modes.refresh()
  editor.view.focus()
}

/* A first display lands the remembered top line at the top of the view;
 * a return from another tab restores the exact pixel. */
function restoreView(doc: OpenDoc): void {
  if (doc.restoreTop !== null) {
    const top = Math.min(doc.restoreTop, doc.state.doc.length)
    doc.restoreTop = null
    editor.view.dispatch({ effects: EditorView.scrollIntoView(top, { y: 'start' }) })
    return
  }
  // Scroll geometry settles a frame after setState.
  const scrollTop = doc.scrollTop
  requestAnimationFrame(() => {
    editor.view.scrollDOM.scrollTop = scrollTop
  })
}

/* The strip in the titlebar; hidden when the window has a single tab. */
const titlebarStrip = document.getElementById('titlebar')
const tabBar = titlebarStrip
  ? new TabBar(titlebarStrip, {
      onActivate: (docId) => window.foolscap.tabActivate(docId),
      onClose: (docId) => window.foolscap.tabClose(docId),
      onReorder: (docId, toIndex) => window.foolscap.tabReorder(docId, toIndex),
      onDetach: (docId, x, y) => window.foolscap.tabDetach(docId, x, y),
      onNewTab: () => window.foolscap.exec('tab-new')
    })
  : null

window.foolscap.onTabs((state) => {
  tabsState = state
  tabBar?.update(state)
  // Tabs main no longer lists are gone for good — drop their buffers.
  const alive = new Set(state.tabs.map((t) => t.docId))
  for (const id of [...docs.keys()]) {
    if (!alive.has(id)) {
      // A closed tab's last position, read while its buffer is still up.
      if (id === displayedId) rememberWhereabouts()
      autosaveScheduler.cancel(id)
      docs.delete(id)
    }
  }
  if (displayedId !== null && !alive.has(displayedId)) displayedId = null
  // Single tab: the quiet centered title. Multiple: the strip takes over.
  const single = state.tabs.length <= 1
  setTitlebarVisible(single)
  if (single) {
    const tab = state.tabs[0]
    setTitlebar(tab?.path ?? null, tab?.dirty ?? false)
  }
  if (state.active !== displayedId && docs.has(state.active)) display(state.active)
})

window.foolscap.onLoad((doc) => {
  // Where the reader left this file last time; main only sends it on opens.
  const remembered = doc.position ?? null
  const anchor =
    doc.reason === 'reload' && doc.docId === displayedId
      ? editor.view.state.selection.main.head
      : remembered
        ? remembered.head
        : doc.path === null && doc.content === NEW_DOC_TEMPLATE
          ? NEW_DOC_CURSOR
          : 0
  const state = editor.makeState(doc.content, anchor, doc.dir, doc.history ?? null)
  const opened: OpenDoc = {
    state,
    path: doc.path,
    dir: doc.dir,
    dirty: doc.dirty,
    editedSinceContentSent: false,
    conflictPending: false,
    scrollTop: 0,
    restoreTop: remembered?.top ?? null,
    position: remembered
  }
  docs.set(doc.docId, opened)
  if (doc.docId === displayedId) {
    // A reload of the visible document replaces the buffer in place and
    // leaves the scroll alone; a file opening into the untitled tab already
    // showing lands where it was last left.
    hideConflictBar()
    editor.view.setState(state)
    if (opened.restoreTop !== null) restoreView(opened)
    outline.refresh()
    modes.refresh()
  } else if (displayedId === null || tabsState?.active === doc.docId) {
    display(doc.docId)
  }
  if (doc.docId !== displayedId) return
  // Existing clean documents open in preview; new, empty, or restored-dirty
  // ones go straight to the editor. Double-click (or ⌘E / Escape) edits.
  // Reloads (disk watcher, conflict Reload) never change the mode: staying
  // in the editor is the point, and a visible preview just re-renders.
  // Transfers (a tab dragged into this window) keep the editor.
  if (doc.reason === 'reload') {
    if (preview.visible) void enterPreview(0)
  } else if (doc.reason === 'transfer') {
    exitPreview()
  } else if (!doc.dirty && doc.path && doc.content.trim() !== '') {
    void enterPreview(remembered ? Math.min(remembered.head, doc.content.length) : 0)
  } else {
    exitPreview()
  }
})

window.foolscap.onSaved((saved) => {
  const doc = docs.get(saved.docId)
  if (!doc) return
  // Only Save As moves the document; a plain save must not reconfigure the
  // folder facet, which rebuilds every image widget for nothing.
  const moved = doc.dir !== saved.dir
  doc.path = saved.path
  doc.dir = saved.dir
  if (moved && saved.docId === displayedId) editor.setDocDir(saved.dir)
  if (doc.editedSinceContentSent) {
    // Edits landed after the save's snapshot: the file is already stale.
    // Stay dirty — and tell main so, since its session cleared its own flag
    // when the write finished.
    doc.dirty = true
    window.foolscap.setDirty(saved.docId, true)
  } else {
    doc.dirty = false
    // A pending debounce would just re-save the same bytes.
    autosaveScheduler.cancel(saved.docId)
  }
})

window.foolscap.onRequestContent((docId) => {
  const doc = docs.get(docId)
  const content =
    docId === displayedId ? editor.getContent() : (doc?.state.doc.toString() ?? '')
  window.foolscap.sendContent(docId, content)
  if (doc) doc.editedSinceContentSent = false
})

/* Quit persistence and tab transfers want the undo history too. */
window.foolscap.onRequestState((docId) => {
  const doc = docs.get(docId)
  const state = docId === displayedId ? editor.view.state : doc?.state
  window.foolscap.sendState(
    docId,
    state?.doc.toString() ?? '',
    state ? editor.serializeHistory(state) : null,
    docId === displayedId ? whereabouts() : (doc?.position ?? null)
  )
  if (doc) doc.editedSinceContentSent = false
})

window.foolscap.onAutosaveFailed(() =>
  showToast('Autosave couldn’t write the file — your changes are safe here. Check the folder, or ⌘S.')
)

window.foolscap.onConflict((docId) => {
  const doc = docs.get(docId)
  if (doc) doc.conflictPending = true
  // Never autosave over an unresolved external change.
  autosaveScheduler.cancel(docId)
  if (docId === displayedId) conflictBarFor(docId)
})

window.foolscap.onUpdateReady(({ version }) =>
  showUpdateReadyToast(version, () => window.foolscap.exec('update-restart'))
)

window.foolscap.onUpdatedTo((version) => showToast(`Foolscap updated to ${version}.`))

/* Leaving the app (or the window) is a save point: whatever the debounce
 * was still waiting on writes now — and where the reader was is noted. */
window.addEventListener('blur', () => {
  autosaveScheduler.flushAll()
  rememberWhereabouts()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    autosaveScheduler.flushAll()
    rememberWhereabouts()
  }
})
window.addEventListener('pagehide', () => rememberWhereabouts())

editor.view.focus()

// Warm the markdown pipeline (processor + highlighter creation) now, so the
// first preview or help render pays only for rendering. Concurrent callers
// share the cached promise, so an immediate open-to-preview never races it.
void renderMarkdown('')
