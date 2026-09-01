import { dialog, ipcMain, shell } from 'electron'
import { DROPPABLE_FILE, IPC, type AppCommand, type ConflictChoice } from '../shared/types'
import { readTextFile } from './files'
import type { MenuActions } from './menu'
import { setAutosaveEnabled, type WindowSession } from './session'
import { checkNow } from './updater'

export const OPENABLE_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/* Renderer → main channels, routed to the sender's window session — with
 * several windows open, e.sender.id is the only truth about which window is
 * talking, and the docId argument picks the tab. IPC.content and IPC.state
 * are intentionally absent: they are reply channels consumed (sender- and
 * docId-filtered) by TabSession's renderer roundtrips. */
export function registerIpc(
  sessionFor: (webContentsId: number) => WindowSession | null,
  actions: MenuActions,
  detachTab: (source: WindowSession, docId: number, x: number, y: number) => Promise<void>
): void {
  ipcMain.on(IPC.dirty, (e, docId: number, dirty: boolean) =>
    sessionFor(e.sender.id)?.tab(docId)?.setDirty(dirty)
  )
  ipcMain.on(IPC.conflictResolve, (e, docId: number, choice: ConflictChoice) =>
    sessionFor(e.sender.id)?.tab(docId)?.resolveConflict(choice)
  )
  ipcMain.on(IPC.autosave, (e, docId: number) => void sessionFor(e.sender.id)?.tab(docId)?.autosave())
  ipcMain.on(IPC.autosaveEnabled, (_e, on: boolean) => setAutosaveEnabled(on === true))
  ipcMain.handle(IPC.historyList, (e, docId: number) =>
    sessionFor(e.sender.id)?.tab(docId)?.listHistory() ?? []
  )
  ipcMain.handle(IPC.historyRead, (e, docId: number, id: string) =>
    typeof id === 'string' ? (sessionFor(e.sender.id)?.tab(docId)?.readHistory(id) ?? null) : null
  )
  ipcMain.on(IPC.tabActivate, (e, docId: number) => sessionFor(e.sender.id)?.activate(docId))
  ipcMain.on(IPC.tabClose, (e, docId: number) => void sessionFor(e.sender.id)?.closeTab(docId))
  ipcMain.on(IPC.tabReorder, (e, docId: number, toIndex: number) =>
    sessionFor(e.sender.id)?.reorder(docId, toIndex)
  )
  ipcMain.on(IPC.tabDetach, (e, docId: number, x: number, y: number) => {
    const session = sessionFor(e.sender.id)
    if (session && Number.isFinite(x) && Number.isFinite(y)) {
      void detachTab(session, docId, x, y)
    }
  })
  ipcMain.on(IPC.exec, (e, command: AppCommand) => {
    const session = sessionFor(e.sender.id)
    switch (command) {
      case 'window-new':
        return actions.newWindow()
      case 'tab-new':
        return session ? session.newTab() : actions.newTab()
      case 'tab-close':
        return session?.closeActiveTab()
      case 'tab-reopen':
        return actions.reopenClosedTab()
      case 'help-window':
        return actions.help()
      case 'file-open':
        return actions.open()
      case 'file-save':
        return void session?.activeTab?.save()
      case 'file-save-as':
        return void session?.activeTab?.save(true)
      case 'export-html':
        return void session?.activeTab?.exportHtml()
      case 'export-pdf':
        return void session?.activeTab?.exportPdf()
      case 'file-print':
        return void session?.activeTab?.printDoc()
      case 'file-reveal':
        return session?.activeTab?.reveal()
      case 'file-copy-path':
        return session?.activeTab?.copyPath()
      case 'update-restart':
        return actions.updateRestart()
    }
  })
  ipcMain.handle(IPC.pasteImage, (e, bytes: Uint8Array, ext: string, name: unknown) => {
    const tab = sessionFor(e.sender.id)?.activeTab
    if (!tab || !/^[a-z0-9]+$/.test(ext)) return null
    return tab.savePastedImage(bytes, ext, typeof name === 'string' ? name : null)
  })
  ipcMain.on(IPC.openDropped, (e, path: string) => {
    // Same filter the renderer applies to the drop; main must not trust it.
    if (typeof path === 'string' && DROPPABLE_FILE.test(path)) {
      void sessionFor(e.sender.id)?.openPath(path)
    }
  })
  ipcMain.handle(IPC.updateCheck, () => checkNow())
  ipcMain.handle(IPC.loadCustomTheme, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'CSS', extensions: ['css'] }]
    })
    const picked = result.filePaths[0]
    if (result.canceled || !picked) return null
    try {
      return await readTextFile(picked)
    } catch {
      return null
    }
  })
  ipcMain.on(IPC.openExternal, (_e, url: string) => {
    try {
      if (OPENABLE_SCHEMES.has(new URL(url).protocol)) void shell.openExternal(url)
    } catch {
      // not a parseable URL — ignore
    }
  })
}
