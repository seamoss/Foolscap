import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

/* Two editions from one tree, one version number. FOOLSCAP_EDITION picks
 * the update channel at build time:
 *   direct (default) — DMG/zip on GitHub Releases; self-updates through
 *                      electron-updater (src/main/updater-direct.ts).
 *   store            — Mac App Store; no update checks of any kind
 *                      (src/main/updater-store.ts), and the updater
 *                      library is never imported. scripts/dist-store.cjs
 *                      builds this one and refuses to package a bundle
 *                      that still carries the library or its feed file. */
const edition = process.env['FOOLSCAP_EDITION'] === 'store' ? 'store' : 'direct'
const define = { __FOOLSCAP_EDITION__: JSON.stringify(edition) }

export default defineConfig({
  main: {
    define,
    resolve: {
      alias: {
        '#updater': resolve(`src/main/updater-${edition}.ts`)
      }
    }
  },
  preload: { define },
  renderer: {}
})
