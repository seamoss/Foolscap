/* Regression: two files opened at once, the larger first — the slower
 * render finished last, overwrote the pane, and its stale entry then hid
 * everything, leaving a blank window (fixed in 0.14.0). */
import { expect, launch, longDocument, sleep } from '../lib.mjs'

export const name = 'opening two files at once shows the second, never a blank window'

export async function run() {
  const app = await launch({ files: { 'big.md': longDocument(2000), 'small.md': '# Small\n\nA short one.\n' } })
  try {
    await sleep(1500)
    expect(await app.previewVisible(), 'preview visible').toBe(true)
    expect(await app.evaluate(`document.documentElement.classList.contains('previewing')`), 'previewing class').toBe(true)
    expect(await app.evaluate(`document.querySelector('.preview:not([hidden]) h1')?.textContent`), 'the file on screen').toBe('Small')
    expect(await app.evaluate(`$.tabs().tabs.length`), 'tabs').toBe(2)
  } finally {
    await app.close()
  }
}
