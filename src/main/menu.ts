import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuCommand } from '../shared/types'
import type { WindowSession } from './session'

export interface MenuActions {
  /* Session of the focused window — every document menu item targets its
   * active tab. */
  focused(): WindowSession | null
  newWindow(): void
  newTab(): void
  open(): void
  help(): void
  /* Persist every session, then hand the process to the updater. */
  updateRestart(): void
}

function sendCommand(command: MenuCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(IPC.command, command)
}

/* ⌘T is a tab, ⌘N a window — macOS document-app convention, with our own
 * tab strip in the drag region (native tabs fought the frameless titlebar).
 * Recent files: macOS gets the native recentDocuments role, fed by
 * app.addRecentDocument() in the session. A file-backed list for Windows and
 * Linux belongs with their custom window chrome, which isn't built yet. */
export function installMenu(actions: MenuActions): void {
  const isMac = process.platform === 'darwin'

  const fileItems: MenuItemConstructorOptions[] = [
    {
      label: 'New Tab',
      accelerator: 'CmdOrCtrl+T',
      click: () => actions.newTab()
    },
    {
      label: 'New Window',
      accelerator: 'CmdOrCtrl+N',
      click: () => actions.newWindow()
    },
    {
      label: 'Open…',
      accelerator: 'CmdOrCtrl+O',
      click: () => actions.open()
    },
    ...(isMac
      ? ([
          {
            role: 'recentDocuments',
            submenu: [{ role: 'clearRecentDocuments' }]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    { type: 'separator' },
    {
      label: 'Save',
      accelerator: 'CmdOrCtrl+S',
      click: () => void actions.focused()?.activeTab?.save()
    },
    {
      label: 'Save As…',
      accelerator: 'Shift+CmdOrCtrl+S',
      click: () => void actions.focused()?.activeTab?.save(true)
    },
    {
      label: 'Browse Versions…',
      click: () => sendCommand('browse-versions')
    },
    { type: 'separator' },
    {
      label: 'Export',
      submenu: [
        { label: 'As HTML…', click: () => void actions.focused()?.activeTab?.exportHtml() },
        { label: 'As PDF…', click: () => void actions.focused()?.activeTab?.exportPdf() }
      ]
    },
    {
      label: 'Print…',
      accelerator: 'CmdOrCtrl+P',
      click: () => void actions.focused()?.activeTab?.printDoc()
    },
    { type: 'separator' },
    {
      label: 'Close Tab',
      accelerator: 'CmdOrCtrl+W',
      click: () => actions.focused()?.closeActiveTab()
    },
    ...(isMac
      ? ([
          { label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W', role: 'close' }
        ] as MenuItemConstructorOptions[])
      : ([{ role: 'quit' }] as MenuItemConstructorOptions[]))
  ]

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      {
        label: 'Settings…',
        accelerator: 'CmdOrCtrl+,',
        click: () => sendCommand('open-settings')
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    { label: 'File', submenu: fileItems },
    { role: 'editMenu' },
    {
      label: 'Format',
      submenu: [
        { label: 'Bold', accelerator: 'CmdOrCtrl+B', click: () => sendCommand('format-bold') },
        { label: 'Italic', accelerator: 'CmdOrCtrl+I', click: () => sendCommand('format-italic') },
        {
          label: 'Strikethrough',
          accelerator: 'Shift+CmdOrCtrl+X',
          click: () => sendCommand('format-strike')
        },
        {
          label: 'Inline Code',
          accelerator: 'Shift+CmdOrCtrl+C',
          click: () => sendCommand('format-code')
        },
        { type: 'separator' },
        { label: 'Link', accelerator: 'Shift+CmdOrCtrl+K', click: () => sendCommand('format-link') }
      ]
    },
    {
      // Deliberately not the viewMenu role: its Reload items would wipe the
      // buffer without passing the unsaved-changes guard.
      label: 'View',
      submenu: [
        {
          label: 'Toggle Preview',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendCommand('toggle-preview')
        },
        {
          label: 'Toggle Outline',
          accelerator: 'Shift+CmdOrCtrl+O',
          click: () => sendCommand('toggle-outline')
        },
        { label: 'Toggle Typewriter Mode', click: () => sendCommand('toggle-typewriter') },
        { label: 'Toggle Focus Mode', click: () => sendCommand('toggle-focus') },
        { label: 'Toggle Table Grid', click: () => sendCommand('toggle-table-grid') },
        { type: 'separator' },
        { label: 'Larger Text', accelerator: 'CmdOrCtrl+Plus', click: () => sendCommand('text-larger') },
        { label: 'Smaller Text', accelerator: 'CmdOrCtrl+-', click: () => sendCommand('text-smaller') },
        { label: 'Actual Text Size', accelerator: 'CmdOrCtrl+0', click: () => sendCommand('text-reset') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
      ]
    },
    ...(isMac ? ([{ role: 'windowMenu' }] as MenuItemConstructorOptions[]) : []),
    {
      role: 'help',
      submenu: [
        {
          label: 'wtf is this?',
          accelerator: 'CmdOrCtrl+Shift+/',
          click: () => actions.help()
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => sendCommand('check-updates')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
