/* Double-clicking the preview drops into the editor without moving the
 * page: the clicked line stays at its height and the caret lands on the
 * clicked character. Code blocks used to lose their position stamp to the
 * highlighter, so a double-click in one opened the editor at the top of
 * the document; a double-click off every block (the margin) did too. */
import { expect, launch, longDocument, sleep } from '../lib.mjs'

export const name = 'double-clicking the preview, even a code block or the margin, holds the page still'

const PROMPT = 'Create two empty folders in this project: drafts and published. Then list every file in the sources folder and summarize each one in one sentence.'

export async function run() {
  const doc = [
    longDocument(60),
    'Paste this to set up the folders:', '',
    '```', PROMPT, '```', '',
    longDocument(60).replace('# A Long Document', '## More')
  ].join('\n')
  const app = await launch({ files: { 'doc.md': doc } })
  try {
    await sleep(800)
    expect(await app.previewVisible(), 'opens in preview').toBe(true)

    // A word inside the code block, mid-screen.
    const word = await app.evaluate(`(() => {
      const pre = [...document.querySelector('.preview').querySelectorAll('pre')].find(p => p.textContent.includes('drafts'))
      pre.scrollIntoView({ block: 'center' })
      const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode()) && !node.data.includes('drafts')) {}
      const range = document.createRange()
      const at = node.data.indexOf('drafts')
      range.setStart(node, at + 2); range.setEnd(node, at + 3)
      const r = range.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top }
    })()`)
    await app.click(word.x, word.y, { clicks: 2 })
    await app.until(`document.querySelector('.preview').hidden`, { label: 'left preview' })
    await sleep(400)
    const landed = await app.evaluate(`({ head: view.state.selection.main.head, scroll: view.scrollDOM.scrollTop, top: view.coordsAtPos(view.state.selection.main.head).top })`)
    const drafts = doc.indexOf('drafts')
    expect(landed.scroll, 'the editor is not at the top of the document').toBeGreaterThan(0)
    expect(landed.head, 'caret on the clicked character of "drafts"').toBeCloseTo(drafts + 2, 1)
    expect(landed.top, 'the clicked line holds its height on screen').toBeCloseTo(word.top, 12)

    // Back to preview; double-click the empty margin beside a paragraph.
    await app.cmd('e')
    await app.until(`!document.querySelector('.preview').hidden`, { label: 'back in preview' })
    await sleep(400)
    const margin = await app.evaluate(`(() => {
      const pane = document.querySelector('.preview')
      pane.scrollTop = pane.scrollHeight / 3
      const doc = pane.querySelector('.preview-doc').getBoundingClientRect()
      const p = [...pane.querySelectorAll('p[data-pos]')].find(el => el.getBoundingClientRect().top > pane.clientHeight / 2)
      const r = p.getBoundingClientRect()
      return { x: Math.max(4, doc.left / 2), y: r.top + 4, top: r.top, pos: Number(p.dataset.pos) }
    })()`)
    await sleep(200)
    await app.click(margin.x, margin.y, { clicks: 2 })
    await app.until(`document.querySelector('.preview').hidden`, { label: 'left preview from the margin' })
    await sleep(400)
    const fromMargin = await app.evaluate(`({ head: view.state.selection.main.head, scroll: view.scrollDOM.scrollTop, top: view.coordsAtPos(view.state.selection.main.head).top })`)
    expect(fromMargin.scroll, 'margin double-click: not at the top').toBeGreaterThan(0)
    expect(fromMargin.head, 'caret at the paragraph beside the click').toBe(margin.pos)
    expect(fromMargin.top, 'that paragraph holds its height on screen').toBeCloseTo(margin.top, 12)
  } finally {
    await app.close()
  }
}
