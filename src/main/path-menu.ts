import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { readdirSync, realpathSync } from 'node:fs'
import { pathChain, pathLabel, type VolumeLookup } from './path-chain'

/* ⌘-click on a document's name — the title strip or its tab — shows the
 * path menu macOS gives every document window: the file, then each folder
 * up to the volume, each with its Finder icon. The window does carry a
 * represented file, so AppKit would draw a proxy icon and this very menu —
 * in the title bar hiddenInset hides. The strip's name stands in for the
 * title, so the menu has to be ours. Choosing the file reveals it in its
 * folder; choosing a folder opens it. */

const volumes: VolumeLookup = {
  volumes: () => {
    try {
      return readdirSync('/Volumes')
    } catch {
      return []
    }
  },
  resolve: (entry) => {
    try {
      return realpathSync(entry)
    } catch {
      return null
    }
  }
}

export async function showPathMenu(window: BrowserWindow, path: string): Promise<void> {
  const chain = pathChain(path)
  // Finder's own icons, small (16px) as menus want them; a link whose icon
  // can't be read gets none rather than no menu.
  const icons = await Promise.all(
    chain.map((p) => app.getFileIcon(p, { size: 'small' }).catch(() => null))
  )
  if (window.isDestroyed()) return
  const template: MenuItemConstructorOptions[] = chain.map((p, i) => {
    const icon = icons[i]
    return {
      label: pathLabel(p, volumes),
      ...(icon ? { icon } : {}),
      click: (): void => {
        if (i === 0) shell.showItemInFolder(p)
        else void shell.openPath(p)
      }
    }
  })
  Menu.buildFromTemplate(template).popup({ window })
}
