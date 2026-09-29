/* Runs every case in scripts/e2e/cases against the built app (pnpm build
 * first). Each case exports `name` and `run()`; a throw is a failure. Exit
 * code is the number of failures. `pnpm e2e -- <substring>` runs a subset. */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT } from './lib.mjs'

const filter = process.argv.slice(2).find((a) => a !== '--') ?? ''
const dir = join(ROOT, 'scripts/e2e/cases')
const files = (await readdir(dir)).filter((f) => f.endsWith('.mjs') && f.includes(filter)).sort()
if (files.length === 0) { console.error(`e2e: no cases match "${filter}"`); process.exit(2) }
const { existsSync } = await import('node:fs')
if (!existsSync(join(ROOT, 'out/main/index.js'))) { console.error('e2e: no build in out/ — run pnpm build first'); process.exit(2) }

let failed = 0
const t0 = Date.now()
for (const file of files) {
  const mod = await import(join(dir, file))
  const started = Date.now()
  const timer = setTimeout(() => { console.error(`  ✗ ${mod.name}: timed out after 90s`); process.exit(1) }, 90_000)
  try {
    await mod.run()
    console.log(`  ✓ ${mod.name} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  } catch (err) {
    failed++
    console.log(`  ✗ ${mod.name}\n      ${String(err.stack ?? err).split('\n').slice(0, 3).join('\n      ')}`)
  } finally {
    clearTimeout(timer)
  }
}
console.log(`\ne2e: ${files.length - failed}/${files.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
process.exit(failed)
