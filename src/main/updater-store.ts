import { app } from 'electron'
import type { UpdateChannel } from './update-channel'

/* The Mac App Store edition's channel: none. The Store notifies users of
 * pending updates and installs them; App Review rejects apps that add
 * their own checks on top. No background check, no manual check (every
 * entry point — Help menu, Settings, palette — is compiled out with the
 * edition), no network, and no electron-updater in the bundle. The one
 * update-adjacent thing left is the "Foolscap updated to X" line after
 * the Store has already done the updating (src/main/index.ts). */
export const updates: UpdateChannel = {
  start: () => undefined,
  checkNow: () => Promise.resolve({ outcome: 'store-edition', version: null }),
  // Unreachable — nothing announces, so nothing asks to restart — but a
  // quit is the honest fallback if it ever were.
  installAndRestart: () => app.quit()
}
