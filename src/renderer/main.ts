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
import type { EditorState, StateCommand } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { renderMarkdown } from '../shared/markdown'
import { NEW_DOC_CURSOR, NEW_DOC_TEMPLATE, type TabsState } from '../shared/types'
import {
  insertLink,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleStrikethrough
} from './editor/format-commands'
import { createEditor } from './editor/setup'
import helpMd from './help.md?raw'
import { classifyDrop } from './ui/drop'
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
}

const docs = new Map<number, OpenDoc>()
let displayedId: number | null = null
let tabsState: TabsState | null = null

const displayedDoc = (): OpenDoc | null => (displayedId === null ? null : (docs.get(displayedId) ?? null))

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
  },
  onUpdate: (update) => {
    outline.handleUpdate(update)
    modes.handleUpdate(update)
  },
  onNoDocumentForPaste: () => showToast('Save the document first — pasted images need a folder to live beside.'),
  onPasteFailed: () => showToast('That image could not be saved beside the document — check the folder is writable.')
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
  (pos) => exitPreview(pos),
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
  const at = nearPos ?? editor.view.state.selection.main.head
  const gen = ++previewGen
  previewEntering = true
  try {
    // Render before hiding the editor: while the pipeline works, the user
    // sees their document as text — never blank paper.
    await preview.show(editor.getContent(), displayedDoc()?.dir ?? null, at)
    if (gen !== previewGen) {
      // The stale show stole focus; hand it back to wherever the user went.
      preview.hide()
      editor.view.focus()
      return
    }
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

function exitPreview(pos?: number): void {
  previewGen++
  previewEntering = false
  document.documentElement.classList.remove('previewing')
  // No explicit target (⌘E, Escape): land where the reader was scrolled,
  // measured while the pane still has geometry.
  const at = pos ?? (preview.visible ? preview.visiblePos() : undefined)
  preview.hide()
  if (at !== undefined) {
    const anchor = Math.min(at, editor.view.state.doc.length)
    editor.view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' })
    })
  }
  editor.view.focus()
}

function togglePreview(): void {
  if (preview.visible || previewEntering) exitPreview()
  else void enterPreview()
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

const settings = new Settings({ modes, loadCustomTheme, checkForUpdates: checkUpdatesNow })

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
})

const mod = window.foolscap.platform === 'darwin' ? '⌘' : 'Ctrl+'

const paletteCommands = (): PaletteCommand[] => [
  { id: 'new-tab', title: 'New Tab', hint: `${mod}T`, run: () => window.foolscap.exec('tab-new') },
  { id: 'close-tab', title: 'Close Tab', hint: `${mod}W`, run: () => window.foolscap.exec('tab-close') },
  { id: 'new-window', title: 'New Window', hint: `${mod}N`, run: () => window.foolscap.exec('window-new') },
  { id: 'open', title: 'Open…', hint: `${mod}O`, run: () => window.foolscap.exec('file-open') },
  { id: 'save', title: 'Save', hint: `${mod}S`, run: () => window.foolscap.exec('file-save') },
  { id: 'save-as', title: 'Save As…', run: () => window.foolscap.exec('file-save-as') },
  { id: 'find', title: 'Find & Replace', hint: `${mod}F`, run: () => openFind() },
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

/* Drag a markdown file onto the window to open it here — with the same
 * unsaved-changes guard as any other open. Capture phase: CodeMirror's drop
 * handler preventDefaults but never stops propagation, so without this it
 * inserts the file's text and we open it too. */
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
      showToast('Foolscap opens markdown files (.md, .markdown, .mdx, .txt).')
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
  // Leave preview first: its exit dispatch must land in the old buffer.
  if (preview.visible || previewEntering) exitPreview()
  const prev = displayedDoc()
  if (prev) {
    prev.state = editor.view.state
    prev.scrollTop = editor.view.scrollDOM.scrollTop
  }
  displayedId = docId
  editor.view.setState(doc.state)
  // Scroll geometry settles a frame after setState.
  const scrollTop = doc.scrollTop
  requestAnimationFrame(() => {
    editor.view.scrollDOM.scrollTop = scrollTop
  })
  if (doc.conflictPending) conflictBarFor(docId)
  else hideConflictBar()
  outline.refresh()
  modes.refresh()
  editor.view.focus()
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
    if (!alive.has(id)) docs.delete(id)
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
  const anchor =
    doc.reason === 'reload' && doc.docId === displayedId
      ? editor.view.state.selection.main.head
      : doc.path === null && doc.content === NEW_DOC_TEMPLATE
        ? NEW_DOC_CURSOR
        : 0
  const state = editor.makeState(doc.content, anchor, doc.dir)
  docs.set(doc.docId, {
    state,
    path: doc.path,
    dir: doc.dir,
    dirty: doc.dirty,
    editedSinceContentSent: false,
    conflictPending: false,
    scrollTop: 0
  })
  if (doc.docId === displayedId) {
    // A reload of the visible document replaces the buffer in place.
    hideConflictBar()
    editor.view.setState(state)
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
    void enterPreview(0)
  } else {
    exitPreview()
  }
})

window.foolscap.onSaved((saved) => {
  const doc = docs.get(saved.docId)
  if (!doc) return
  doc.path = saved.path
  doc.dir = saved.dir
  if (saved.docId === displayedId) editor.setDocDir(saved.dir)
  if (doc.editedSinceContentSent) {
    // Edits landed after the save's snapshot: the file is already stale.
    // Stay dirty — and tell main so, since its session cleared its own flag
    // when the write finished.
    doc.dirty = true
    window.foolscap.setDirty(saved.docId, true)
  } else {
    doc.dirty = false
  }
})

window.foolscap.onRequestContent((docId) => {
  const doc = docs.get(docId)
  const content =
    docId === displayedId ? editor.getContent() : (doc?.state.doc.toString() ?? '')
  window.foolscap.sendContent(docId, content)
  if (doc) doc.editedSinceContentSent = false
})

window.foolscap.onConflict((docId) => {
  const doc = docs.get(docId)
  if (doc) doc.conflictPending = true
  if (docId === displayedId) conflictBarFor(docId)
})

window.foolscap.onUpdateReady(({ version }) =>
  showUpdateReadyToast(version, () => window.foolscap.exec('update-restart'))
)

window.foolscap.onUpdatedTo((version) => showToast(`Foolscap updated to ${version}.`))

editor.view.focus()

// Warm the markdown pipeline (processor + highlighter creation) now, so the
// first preview or help render pays only for rendering. Concurrent callers
// share the cached promise, so an immediate open-to-preview never races it.
void renderMarkdown('')
