/* Document title in the drag strip — hiddenInset gives us no native title
 * text, so the strip carries the name: centered, quiet, with an accent dot
 * while there are unsaved changes (fullscreen hides the traffic-light dot,
 * so the strip is the one place dirty state is always visible). */

let title: HTMLElement | null = null

/* ⌘-click on the name asks for the path menu — the file and the folders
 * above it, each opening in Finder — the one thing a native title would
 * have offered that hiddenInset takes away. */
export function initTitlebar(onPathMenu: () => void): void {
  const strip = document.getElementById('titlebar')
  if (!strip) return
  title = document.createElement('span')
  title.className = 'titlebar-title'
  title.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !e.metaKey) return
    e.preventDefault()
    onPathMenu()
  })
  strip.append(title)
}

/* With two or more tabs the strip belongs to the tab bar; the centered
 * title text stands down. */
export function setTitlebarVisible(visible: boolean): void {
  if (title) title.hidden = !visible
}

export function setTitlebar(path: string | null, dirty: boolean): void {
  if (!title) return
  const name = path ? (path.split(/[\\/]/).pop() ?? 'Untitled') : 'Untitled'
  title.replaceChildren()
  if (dirty) {
    const dot = document.createElement('span')
    dot.className = 'titlebar-dirty'
    dot.textContent = '•'
    title.append(dot)
  }
  title.append(name)
}
