import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type AppCommand,
  type ConflictChoice,
  type DocPayload,
  type FoolscapApi,
  type MenuCommand,
  type SavedPayload,
  type TabsState,
  type UpdatePayload
} from '../shared/types'

const api: FoolscapApi = {
  platform: process.platform,
  setDirty: (docId, dirty) => ipcRenderer.send(IPC.dirty, docId, dirty),
  sendContent: (docId, content) => ipcRenderer.send(IPC.content, docId, content),
  sendState: (docId, content, history) => ipcRenderer.send(IPC.state, docId, content, history),
  autosave: (docId) => ipcRenderer.send(IPC.autosave, docId),
  setAutosaveEnabled: (on) => ipcRenderer.send(IPC.autosaveEnabled, on),
  historyList: (docId) => ipcRenderer.invoke(IPC.historyList, docId),
  historyRead: (docId, id) => ipcRenderer.invoke(IPC.historyRead, docId, id),
  resolveConflict: (docId, choice: ConflictChoice) =>
    ipcRenderer.send(IPC.conflictResolve, docId, choice),
  openExternal: (url) => ipcRenderer.send(IPC.openExternal, url),
  exec: (command: AppCommand) => ipcRenderer.send(IPC.exec, command),
  pasteImage: (bytes: Uint8Array, ext: string, name?: string | null): Promise<string | null> =>
    ipcRenderer.invoke(IPC.pasteImage, bytes, ext, name ?? null),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  openDropped: (path: string) => ipcRenderer.send(IPC.openDropped, path),
  loadCustomTheme: (): Promise<string | null> => ipcRenderer.invoke(IPC.loadCustomTheme),
  tabActivate: (docId) => ipcRenderer.send(IPC.tabActivate, docId),
  tabClose: (docId) => ipcRenderer.send(IPC.tabClose, docId),
  tabReorder: (docId, toIndex) => ipcRenderer.send(IPC.tabReorder, docId, toIndex),
  tabDetach: (docId, screenX, screenY) => ipcRenderer.send(IPC.tabDetach, docId, screenX, screenY),
  onLoad: (cb) => ipcRenderer.on(IPC.load, (_e, doc: DocPayload) => cb(doc)),
  onTabs: (cb) => ipcRenderer.on(IPC.tabsState, (_e, state: TabsState) => cb(state)),
  onCommand: (cb) => ipcRenderer.on(IPC.command, (_e, command: MenuCommand) => cb(command)),
  onSaved: (cb) => ipcRenderer.on(IPC.saved, (_e, saved: SavedPayload) => cb(saved)),
  onRequestContent: (cb) => ipcRenderer.on(IPC.requestContent, (_e, docId: number) => cb(docId)),
  onRequestState: (cb) => ipcRenderer.on(IPC.requestState, (_e, docId: number) => cb(docId)),
  onAutosaveFailed: (cb) => ipcRenderer.on(IPC.autosaveFailed, (_e, docId: number) => cb(docId)),
  onConflict: (cb) => ipcRenderer.on(IPC.conflict, (_e, docId: number) => cb(docId)),
  onUpdateReady: (cb) => ipcRenderer.on(IPC.updateReady, (_e, update: UpdatePayload) => cb(update)),
  onUpdatedTo: (cb) => ipcRenderer.on(IPC.updatedTo, (_e, version: string) => cb(version)),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck)
}

contextBridge.exposeInMainWorld('foolscap', api)
