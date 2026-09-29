/* The direct edition offers an update check in three places; the Store
 * edition (built with FOOLSCAP_EDITION=store) offers none — App Review's
 * rule. This case only checks the build that's in out/: the direct one
 * unless the runner was told otherwise. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'the update check is present in the direct edition and absent in the Store edition'

export async function run() {
  const app = await launch({ files: { 'a.md': '# A\n' } })
  try {
    await sleep(600)
    const edition = await app.evaluate(`window.foolscap.edition`)
    await app.cmd('k'); await sleep(400)
    const inPalette = await app.evaluate(`[...document.querySelectorAll('.palette-item')].some(e => e.textContent.includes('Check for Updates'))`)
    await app.key('Escape'); await sleep(200)
    await app.cmd(','); await sleep(400)
    const inSettings = await app.evaluate(`[...document.querySelectorAll('.settings-title')].some(e => e.textContent === 'Updates')`)
    await app.key('Escape')
    const expected = edition === 'direct'
    expect(inPalette, `palette entry for edition ${edition}`).toBe(expected)
    expect(inSettings, `settings section for edition ${edition}`).toBe(expected)
  } finally {
    await app.close()
  }
}
