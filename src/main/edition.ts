import { app } from 'electron'

/* Which update channel this build carries — baked in by
 * electron.vite.config.ts from FOOLSCAP_EDITION. One tree, one tag, one
 * marketing version: the edition is the only thing that differs between
 * the DMG on GitHub and the app on the Mac App Store.
 *
 * The convention for telling them apart: the Store edition is "-mas".
 * Apple allows only digits and dots in a bundle's version string, so the
 * suffix lives everywhere else — the version the app shows of itself
 * (About, the updated-to toast), the pkg name, and the per-submission tag
 * v0.16.0-mas.1 that scripts/dist-store.cjs creates. */
export type Edition = 'direct' | 'store'

export const EDITION: Edition = __FOOLSCAP_EDITION__

export const EDITION_LABEL: Record<Edition, string> = {
  direct: 'Direct download',
  store: 'App Store'
}

/* "0.16.0" for the direct edition, "0.16.0-mas" for the Store's. */
export function displayVersion(): string {
  return EDITION === 'store' ? `${app.getVersion()}-mas` : app.getVersion()
}
