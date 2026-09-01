/* The typed IPC contract. Main, preload, and renderer all import from here —
 * channel names and payload shapes exist in exactly one place. */

/* 'open' is a user-initiated document arrival (open, restore); 'reload' is
 * the same document refreshed from disk (watcher echo, conflict Reload);
 * 'transfer' is a tab dragged into this window, buffer carried over.
 * Only 'open' may change the editor/preview mode. */
export type LoadReason = 'open' | 'reload' | 'transfer'

export interface DocPayload {
  /* Which tab this document belongs to — main-assigned, app-unique. */
  docId: number
  path: string | null
  /* Directory of the document, main-computed — the renderer has no path
   * module. Used to resolve relative image paths. */
  dir: string | null
  content: string
  /* True when restoring an unsaved buffer from a persisted session — the
   * document arrives already-dirty and opens in edit mode. */
  dirty: boolean
  reason: LoadReason
  /* Serialized CodeMirror undo history (an opaque JSON string) riding along
   * on session restores and tab transfers, so ⌘Z survives both. Absent on
   * plain opens. */
  history?: string | null
}

/* One entry in a document's version history — a full snapshot in userData,
 * recorded around saves (see src/main/history-store.ts). */
export interface HistoryEntry {
  /* Snapshot file name; the token historyRead expects back. */
  id: string
  /* Epoch ms of the snapshot. */
  time: number
  /* Bytes, for the browser's size whisper. */
  size: number
}

/* What a new, untitled document opens as: a heading ready to be titled,
 * cursor after the mark. Deliberately the pristine state, not an edit — an
 * untouched new tab stays clean (no save prompt) and reusable for opening
 * files into. Main creates tabs with it; the renderer places the cursor. */
export const NEW_DOC_TEMPLATE = '# \n\n'
export const NEW_DOC_CURSOR = 2

/* One window's tab strip, as main sees it — main owns tab identity, order,
 * and activation; the renderer renders the bar and sends intents back. */
export interface TabInfo {
  docId: number
  /* Display name: file basename, or Untitled. */
  name: string
  path: string | null
  dirty: boolean
}

export interface TabsState {
  tabs: TabInfo[]
  /* docId of the active tab. */
  active: number
}

export type ConflictChoice = 'reload' | 'keep'

/* File types Foolscap opens via drag-and-drop. One definition for both the
 * renderer's drop filter and main's openDropped validation. */
export const DROPPABLE_FILE = /\.(md|markdown|mdx|txt)$/i

/* Sent after a successful save — Save As changes both. */
export interface SavedPayload {
  docId: number
  path: string | null
  dir: string | null
}

/* Menu-driven commands the renderer executes. */
export type MenuCommand =
  | 'toggle-outline'
  | 'toggle-typewriter'
  | 'toggle-focus'
  | 'toggle-line-numbers'
  | 'toggle-table-grid'
  | 'toggle-palette'
  | 'toggle-preview'
  | 'show-help'
  | 'text-larger'
  | 'text-smaller'
  | 'text-reset'
  | 'open-settings'
  | 'check-updates'
  | 'format-bold'
  | 'format-italic'
  | 'format-strike'
  | 'format-code'
  | 'format-link'
  | 'browse-versions'

/* A new version, downloaded and verified by src/main/updater.ts — ready to
 * install the moment the app restarts. */
export interface UpdatePayload {
  version: string
}

/* What a user-initiated update check found; each maps to one toast. */
export type UpdateCheckOutcome =
  | 'update-en-route'
  | 'up-to-date'
  | 'unreachable'
  | 'dev-build'
  | 'mas-build'

export interface UpdateCheckResult {
  outcome: UpdateCheckOutcome
  /* The version en route — null for every other outcome. */
  version: string | null
}

/* Renderer-initiated commands (command palette) the main process executes. */
export type AppCommand =
  | 'window-new'
  | 'tab-new'
  | 'tab-close'
  | 'tab-reopen'
  | 'help-window'
  | 'file-open'
  | 'file-save'
  | 'file-save-as'
  | 'export-html'
  | 'export-pdf'
  | 'file-print'
  | 'file-reveal'
  | 'file-copy-path'
  | 'update-restart'

export const IPC = {
  // renderer → main
  dirty: 'doc:dirty',
  content: 'doc:content',
  state: 'doc:state',
  autosave: 'doc:autosave',
  autosaveEnabled: 'app:autosave-enabled',
  historyList: 'history:list',
  historyRead: 'history:read',
  conflictResolve: 'doc:conflict-resolve',
  openExternal: 'link:open-external',
  exec: 'app:exec',
  pasteImage: 'image:paste',
  openDropped: 'file:open-dropped',
  loadCustomTheme: 'theme:load-custom',
  tabActivate: 'tabs:activate',
  tabClose: 'tabs:close',
  tabReorder: 'tabs:reorder',
  tabDetach: 'tabs:detach',
  // main → renderer
  command: 'menu:command',
  load: 'doc:load',
  saved: 'doc:saved',
  requestContent: 'doc:request-content',
  requestState: 'doc:request-state',
  autosaveFailed: 'doc:autosave-failed',
  conflict: 'doc:conflict',
  tabsState: 'tabs:state',
  updateReady: 'app:update-ready',
  updateCheck: 'app:update-check',
  updatedTo: 'app:updated-to'
} as const

/* The contextBridge surface. Implemented in src/preload/index.ts, consumed as
 * `window.foolscap` in the renderer. Document channels carry the docId of
 * the tab they concern; tab intents go to the sender window's session. */
export interface FoolscapApi {
  readonly platform: string
  setDirty(docId: number, dirty: boolean): void
  sendContent(docId: number, content: string): void
  /* Reply to requestState: the buffer plus its serialized undo history
   * (null when serialization failed or was oversized). */
  sendState(docId: number, content: string, history: string | null): void
  /* A quiet save of a file-backed dirty buffer — the debounced edge of
   * autosave. Main ignores it when there's nothing safe to do. */
  autosave(docId: number): void
  /* Mirror of the renderer-owned autosave setting, so main's close guards
   * know a dirty file-backed tab can be flushed instead of prompted. */
  setAutosaveEnabled(on: boolean): void
  /* Version history of the tab's document; empty for untitled tabs. */
  historyList(docId: number): Promise<HistoryEntry[]>
  historyRead(docId: number, id: string): Promise<string | null>
  resolveConflict(docId: number, choice: ConflictChoice): void
  openExternal(url: string): void
  exec(command: AppCommand): void
  /* Returns the relative markdown path, or null for an unsaved document. */
  pasteImage(bytes: Uint8Array, ext: string): Promise<string | null>
  /* Absolute path of a dropped File (webUtils; File.path is long gone). */
  pathForFile(file: File): string
  openDropped(path: string): void
  /* Pick and read a custom theme css file; null if cancelled. */
  loadCustomTheme(): Promise<string | null>
  /* Tab intents — the renderer's bar clicks and drags. */
  tabActivate(docId: number): void
  tabClose(docId: number): void
  tabReorder(docId: number, toIndex: number): void
  /* Drag-out: detach the tab into its own window at screen coordinates. */
  tabDetach(docId: number, screenX: number, screenY: number): void
  onLoad(cb: (doc: DocPayload) => void): void
  onTabs(cb: (state: TabsState) => void): void
  onCommand(cb: (command: MenuCommand) => void): void
  onSaved(cb: (saved: SavedPayload) => void): void
  onRequestContent(cb: (docId: number) => void): void
  onRequestState(cb: (docId: number) => void): void
  /* An autosave write failed — one toast per streak of failures. */
  onAutosaveFailed(cb: (docId: number) => void): void
  onConflict(cb: (docId: number) => void): void
  onUpdateReady(cb: (update: UpdatePayload) => void): void
  /* First launch after an update installed — the victory-lap toast. */
  onUpdatedTo(cb: (version: string) => void): void
  /* User-initiated check; resolves to a toastable outcome, never rejects. */
  checkForUpdates(): Promise<UpdateCheckResult>
}
