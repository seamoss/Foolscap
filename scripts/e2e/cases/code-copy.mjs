/* Preview code blocks carry a copy button, always shown, and wrap long
 * lines; the text never runs under the button. A click copies the block's
 * code exactly (the clipboard is stubbed: an e2e run must not clobber the
 * developer's own), and a double-click on the button stays in preview. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'preview code blocks wrap and carry a copy button that never covers the text'

const PROMPT = 'Create two empty folders in this project: drafts and published. Then list every file in the sources folder and summarize each one in one sentence.'
const TWO_LINES = 'if x:\n    return "y"'

export async function run() {
  const doc = ['# Copy', '', 'Paste this:', '', '```', PROMPT, '```', '', '```py', TWO_LINES, '```', ''].join('\n')
  const app = await launch({ files: { 'doc.md': doc } })
  try {
    await sleep(800)
    expect(await app.previewVisible(), 'opens in preview').toBe(true)
    const layout = await app.evaluate(`[...document.querySelector('.preview').querySelectorAll('.code-block')].map(block => {
      const pre = block.querySelector('pre')
      const button = block.querySelector('button.code-copy')
      const b = button.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(pre.querySelector('code'))
      const textRight = Math.max(...[...range.getClientRects()].map(r => r.right))
      return { hasButton: !!button, visible: b.width > 0 && getComputedStyle(button).visibility !== 'hidden',
        wraps: pre.scrollWidth <= pre.clientWidth, lines: Math.round(pre.querySelector('code').getBoundingClientRect().height / parseFloat(getComputedStyle(pre).lineHeight)),
        textRight, buttonLeft: b.left, codeText: pre.textContent }
    })`)
    expect(layout.length, 'both code blocks wrapped with a button').toBe(2)
    for (const [i, block] of layout.entries()) {
      expect(block.hasButton && block.visible, `block ${i}: button shown without hovering`).toBe(true)
      expect(block.wraps, `block ${i}: no horizontal scroll`).toBe(true)
      expect(block.textRight <= block.buttonLeft, `block ${i}: text (right edge ${block.textRight}) stays left of the button (${block.buttonLeft})`).toBe(true)
    }
    expect(layout[0].lines, 'the long prompt wraps onto several lines').toBeGreaterThan(1)
    expect(layout[0].codeText, 'the button adds no text to the block').toBe(PROMPT)

    // Stub the clipboard, then click each button.
    await app.evaluate(`(window.__copied = [], Object.defineProperty(navigator.clipboard, 'writeText', { value: async (t) => { window.__copied.push(t) } }), true)`)
    const centers = await app.evaluate(`[...document.querySelectorAll('.preview button.code-copy')].map(b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })`)
    await app.click(centers[0].x, centers[0].y)
    await app.until(`document.querySelector('.preview button.code-copy').classList.contains('copied')`, { label: 'check shown' })
    await app.click(centers[1].x, centers[1].y)
    await sleep(200)
    expect(JSON.stringify(await app.evaluate(`window.__copied`)), 'copied each block verbatim').toBe(JSON.stringify([PROMPT, TWO_LINES]))
    expect(await app.evaluate(`document.activeElement === document.querySelector('.preview')`), 'focus stays on the pane').toBe(true)

    // A double-click on the button copies; it does not leave preview.
    await app.click(centers[0].x, centers[0].y, { clicks: 2 })
    await sleep(400)
    expect(await app.previewVisible(), 'still in preview after double-clicking the button').toBe(true)
    // The check reverts on its own.
    await app.until(`!document.querySelector('.preview button.code-copy').classList.contains('copied')`, { label: 'check reverts', timeout: 4000 })
  } finally {
    await app.close()
  }
}
