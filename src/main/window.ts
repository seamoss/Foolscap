import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { attachContextMenu } from './context-menu'
import { OPENABLE_SCHEMES } from './ipc'
import { restoreWindowBounds, trackWindowBounds } from './window-state'

/* No webContents may open child windows or navigate away — ever. The click
 * handler in preview covers left-clicks only; a middle-click's auxclick
 * would otherwise reach Chromium's default new-window disposition, and the
 * child window Electron creates inherits the opener's webPreferences —
 * preload included — handing window.foolscap to an arbitrary page. Safe
 * link targets go to the system browser instead; everything else is dropped.
 * will-navigate ignores main-process loadFile/loadURL, so denying it (bar
 * dev-server HMR reloads) cannot break the app's own loads. */
export function installContentsGuards(): void {
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      try {
        if (OPENABLE_SCHEMES.has(new URL(url).protocol)) void shell.openExternal(url)
      } catch {
        // not a parseable URL — drop it
      }
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      const dev = process.env['ELECTRON_RENDERER_URL']
      if (dev && url.startsWith(dev)) return
      event.preventDefault()
    })
  })
}

// Mirrors --paper in src/renderer/styles/tokens.css. The main process cannot
// read CSS custom properties, and the window needs a background before the
// renderer paints or the first frame flashes white.
const PAPER_LIGHT = '#EFF1EE'
const PAPER_DARK = '#14171A'

export function createWindow(): BrowserWindow {
  const bounds = { ...restoreWindowBounds() }
  // Additional windows cascade instead of stacking exactly on the first.
  const others = BrowserWindow.getAllWindows().length
  if (others > 0 && bounds.x !== undefined && bounds.y !== undefined) {
    bounds.x += 28 * others
    bounds.y += 28 * others
  }

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 480,
    minHeight: 320,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? PAPER_DARK : PAPER_LIGHT,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Dev-only: FOOLSCAP_E2E=1 makes the renderer publish its test bridge
      // (window.__foolscap, see renderer main.ts) for scripts/e2e. The flag
      // rides in as a process argument because a sandboxed preload can read
      // argv but not the environment. Packaged builds never set it.
      additionalArguments: process.env['FOOLSCAP_E2E'] === '1' && !app.isPackaged ? ['--foolscap-e2e'] : []
    }
  })

  win.once('ready-to-show', () => win.show())
  trackWindowBounds(win)
  attachContextMenu(win)

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[foolscap] did-fail-load ${code} ${desc} ${url}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[foolscap] render-process-gone: ${details.reason}`)
  })

  // Dev-only verification hook: FOOLSCAP_CAPTURE=<path>.png writes a PNG of
  // the rendered window ~3s after launch and again on each SIGUSR2, with a
  // sequence suffix. Used to eyeball acceptance criteria from the CLI; inert
  // unless the env var is set.
  const shot = process.env['FOOLSCAP_CAPTURE']
  if (shot) {
    // The capture hook doubles as a renderer-console tap — visual
    // verification without it is guesswork.
    win.webContents.on('console-message', (_e, _level, message) => {
      console.log(`[renderer] ${message}`)
    })
    let seq = 0
    const wcId = win.webContents.id
    const capture = (): void => {
      if (win.isDestroyed()) return
      // Window id keeps multi-window captures from clobbering each other.
      const target = shot.replace(/\.png$/, `-w${wcId}-${seq++}.png`)
      void win.webContents.capturePage().then(async (img) => {
        const { writeFile } = await import('node:fs/promises')
        await writeFile(target, img.toPNG())
      })
    }
    setTimeout(capture, 3000)
    process.on('SIGUSR2', capture)
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
