/* Files reopen where you left them (0.14.0): the position is recorded on
 * blur and on quit, and an ⇧⌘T reopen lands the preview on it. Also
 * covers reopen-closed-tab itself. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, launch, longDocument, sleep } from '../lib.mjs'

export const name = 'a file reopens where you left it, and ⇧⌘T brings back a closed tab'

export async function run() {
  const app = await launch({ files: { 'doc.md': longDocument(150) } })
  try {
    await sleep(800)
    await app.cmd('e'); await sleep(400)
    const head = await app.evaluate(`(view.dispatch({ selection: { anchor: view.state.doc.line(200).from }, scrollIntoView: true }), view.state.selection.main.head)`)
    await sleep(300)
    await app.evaluate(`window.dispatchEvent(new Event('blur'))`)
    await sleep(1800)
    const stored = JSON.parse(await readFile(join(app.userData, 'positions.json'), 'utf8'))[app.paths['doc.md']]
    expect(stored?.head, 'position written on blur').toBe(head)
    // Close the tab (a new one takes its place), reopen it: preview, scrolled.
    const id = await app.evaluate(`$.tabs().tabs[0].docId`)
    await app.evaluate(`window.foolscap.exec('tab-new')`); await sleep(800)
    await app.evaluate(`window.foolscap.tabClose(${id})`); await sleep(600)
    expect(await app.evaluate(`$.tabs().tabs.some(t => t.path)`), 'file tab closed').toBe(false)
    await app.evaluate(`window.foolscap.exec('tab-reopen')`)
    await app.until(`$.tabs().tabs.some(t => t.path && t.path.endsWith('doc.md'))`, { label: 'reopened tab' })
    await sleep(1200)
    expect(await app.previewVisible(), 'reopened in preview').toBe(true)
    expect(await app.evaluate(`document.querySelector('.preview').scrollTop`), 'scrolled to the remembered place').toBeGreaterThan(0)
  } finally {
    await app.close()
  }
}
