/* A clean buffer reloads silently when the file changes on disk — and
 * keeps its scroll and caret while doing so (regression fixed in 0.14.0,
 * where the reload pinned the view to the top). */
import { writeFile } from 'node:fs/promises'
import { expect, launch, longDocument, sleep } from '../lib.mjs'

export const name = 'an external edit reloads a clean buffer without moving the view'

export async function run() {
  const app = await launch({ files: { 'doc.md': longDocument(150) } })
  try {
    await sleep(800)
    await app.cmd('e'); await sleep(400)
    await app.evaluate(`view.dispatch({ selection: { anchor: view.state.doc.line(180).from }, scrollIntoView: true })`)
    await sleep(400)
    const before = await app.evaluate(`({ top: view.scrollDOM.scrollTop, head: view.state.selection.main.head, len: view.state.doc.length })`)
    expect(before.top, 'scrolled down').toBeGreaterThan(100)
    const next = longDocument(150) + '\nAppended from outside.\n'
    await writeFile(app.paths['doc.md'], next)
    await app.until(`view.state.doc.toString().includes('Appended from outside.')`, { timeout: 10000, label: 'silent reload' })
    await sleep(400)
    const after = await app.evaluate(`({ top: view.scrollDOM.scrollTop, head: view.state.selection.main.head, len: view.state.doc.length })`)
    expect(after.len, 'buffer is the new file').toBe(next.length)
    expect(after.head, 'caret kept').toBe(before.head)
    // Under one line of drift: CodeMirror re-measures the new content's line
    // heights after the restore, and the estimate can settle by a few pixels.
    expect(after.top, 'scroll kept').toBeCloseTo(before.top, 40)
    expect(await app.evaluate(`!!document.querySelector('[role=alertdialog]')`), 'no conflict bar for a clean buffer').toBe(false)
  } finally {
    await app.close()
  }
}
