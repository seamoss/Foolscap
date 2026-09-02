/* Which update channel this build carries — baked in by
 * electron.vite.config.ts from FOOLSCAP_EDITION. One version number, one
 * tag, one tree: the edition is the only thing that differs between the
 * DMG on GitHub and the app on the Mac App Store, and the About panel says
 * which one this is. */
export type Edition = 'direct' | 'store'

export const EDITION: Edition = __FOOLSCAP_EDITION__

export const EDITION_LABEL: Record<Edition, string> = {
  direct: 'Direct download',
  store: 'App Store'
}
