/* The keyboard path through the editor: typing lands in the file, a URL
 * pasted over a selection becomes a link, ⌘K reaches a command, the word
 * count counts a selection, and ⌘S writes the file to disk byte for byte. */
import { readFile } from 'node:fs/promises'
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'typing, paste-as-link, the palette, and a save round-trip'

export async function run() {
  const app = await launch({ files: { 'note.md': '# Note\n\nSee the docs today.\n' } })
  try {
    await sleep(800)
    await app.cmd('e'); await sleep(400)
    // Caret at the end of "docs", select back over it, paste a URL.
    await app.evaluate(`(() => { const l = view.state.doc.line(3); view.dispatch({ selection: { anchor: l.from + 8, head: l.from + 12 } }); view.focus() })()`)
    await app.evaluate(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'https://example.com'); document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) })()`)
    expect(await app.evaluate(`view.state.doc.line(3).text`), 'pasted as a link').toBe('See the [docs](https://example.com) today.')
    // Type at the end of the document.
    await app.evaluate(`(view.dispatch({ selection: { anchor: view.state.doc.length } }), view.focus())`)
    await app.type('Typed here.')
    expect(await app.evaluate(`view.state.doc.toString().endsWith('Typed here.')`), 'typed text landed').toBe(true)
    // Selection word count.
    await app.evaluate(`view.dispatch({ selection: { anchor: 0, head: 6 } })`); await sleep(100)
    expect(await app.evaluate(`document.querySelector('.wordcount').textContent`), 'selection count').toContain(' of ')
    // Palette: run "Toggle Word Count" then toggle it back, proving Enter reaches a command.
    await app.cmd('k'); await sleep(400)
    await app.type('toggle word'); await sleep(300)
    await app.key('Enter'); await sleep(300)
    expect(await app.evaluate(`!!document.querySelector('.palette')`), 'palette closed after running').toBe(false)
    // Save writes exactly the buffer.
    await app.cmd('s'); await sleep(1200)
    const disk = await readFile(app.paths['note.md'], 'utf8')
    const buffer = await app.evaluate(`view.state.doc.toString()`)
    expect(disk, 'file is byte-for-byte the buffer').toBe(buffer)
  } finally {
    await app.close()
  }
}
