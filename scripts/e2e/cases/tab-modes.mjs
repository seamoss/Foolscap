/* Each tab keeps its own preview-or-editor mode (#45): a tab switched to
 * the editor stays there while the others still preview, and coming back
 * to a preview tab never paints its source first. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'each tab keeps its own preview or editor mode'

export async function run() {
  const files = { 'one.md': '# One\n\ntext\n', 'two.md': '# Two\n\ntext\n', 'three.md': '# Three\n\ntext\n' }
  const app = await launch({ files })
  try {
    await sleep(800)
    const ids = await app.evaluate(`$.tabs().tabs.map(t => t.docId)`)
    expect(ids.length, 'three tabs').toBe(3)
    // Every tab previews on first visit.
    for (const id of ids) {
      await app.evaluate(`window.foolscap.tabActivate(${id})`)
      await app.until(`$.displayed() === ${id}`)
      await sleep(300)
      expect(await app.previewVisible(), `tab ${id} previews`).toBe(true)
    }
    // ⌘E the middle one into the editor, cycle away and back.
    await app.evaluate(`window.foolscap.tabActivate(${ids[1]})`); await app.until(`$.displayed() === ${ids[1]}`); await sleep(200)
    await app.cmd('e'); await sleep(400)
    expect(await app.previewVisible(), 'middle tab now edits').toBe(false)
    await app.evaluate(`window.foolscap.tabActivate(${ids[2]})`); await app.until(`$.displayed() === ${ids[2]}`); await sleep(300)
    expect(await app.previewVisible(), 'third still previews').toBe(true)
    await app.evaluate(`window.foolscap.tabActivate(${ids[1]})`); await app.until(`$.displayed() === ${ids[1]}`); await sleep(300)
    expect(await app.previewVisible(), 'middle tab still edits').toBe(false)
    // No source flash: watch the class across a switch into a preview tab.
    await app.evaluate(`(window.__flash = [], new MutationObserver(() => window.__flash.push(document.documentElement.classList.contains('previewing'))).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }), true)`)
    await app.evaluate(`window.foolscap.tabActivate(${ids[0]})`); await app.until(`$.displayed() === ${ids[0]}`); await sleep(400)
    const trace = await app.evaluate(`window.__flash`)
    expect(trace.includes(false), `previewing never dropped during the switch (${JSON.stringify(trace)})`).toBe(false)
  } finally {
    await app.close()
  }
}
