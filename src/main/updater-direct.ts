import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateCheckOutcome, UpdateCheckResult, UpdatePayload } from '../shared/types'
import type { UpdateChannel } from './update-channel'

/* The direct-download edition's channel: hot updates over the GitHub
 * Releases feed (ULTRAPLAN §7, unlocked by code signing — Squirrel.Mac
 * verifies the running app and the downloaded update against each other's
 * signatures, so this only works signed). The App Store edition never
 * imports this module (see electron.vite.config.ts and updater-store.ts).
 *
 * The manner is Foolscap's: everything happens quietly in the background,
 * and the user hears exactly one thing — a toast when a new version is
 * downloaded, verified, and READY. Restart now, or ignore it and the
 * update applies on whatever quit comes naturally (autoInstallOnAppQuit).
 * Every failure is silent; an updater is the least important thing this
 * app runs. Dev builds: inert. */

const FOUR_HOURS = 4 * 60 * 60 * 1000

function start(announce: (update: UpdatePayload) => boolean): void {
  // Belt and braces: a sandboxed (Store) process must never self-update
  // even if this module somehow reached one.
  if (!app.isPackaged || process.mas) return
  autoUpdater.logger = null
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  /* Re-checks (the 4-hour interval, manual checks) re-emit update-downloaded
   * for an update already sitting in the cache — announce each version once.
   * But only a toast that reached a window counts as announced: a ready
   * notice with no window to land in must retry on the next check, not be
   * swallowed forever. (The old checker learned this the same way — #5.) */
  let announced: string | null = null
  autoUpdater.on('update-downloaded', (event) => {
    if (event.version === announced) return
    if (announce({ version: event.version })) announced = event.version
  })
  autoUpdater.on('error', () => {
    // offline, rate-limited, feed missing — all fine, all silent
  })
  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
  // Well past startup: the check must never compete with first paint.
  setTimeout(check, 5000)
  // Long-lived sessions (⌘Q is rare here by design) still hear about
  // releases eventually.
  setInterval(check, FOUR_HOURS)
}

/* A check the user asked for by name (Help menu, Settings, palette) — the
 * one context where silence is wrong. Resolves to something toastable in
 * every case, including a re-check while an update is already en route
 * (update-available fires again; the ready toast follows as usual). */
function checkNow(): Promise<UpdateCheckResult> {
  if (!app.isPackaged || process.mas) return Promise.resolve({ outcome: 'dev-build', version: null })
  return new Promise((resolve) => {
    const done = (outcome: UpdateCheckOutcome, version: string | null = null): void => {
      autoUpdater.off('update-available', onAvailable)
      autoUpdater.off('update-not-available', onLatest)
      autoUpdater.off('error', onError)
      resolve({ outcome, version })
    }
    const onAvailable = (info: { version: string }): void => done('update-en-route', info.version)
    const onLatest = (): void => done('up-to-date')
    const onError = (): void => done('unreachable')
    autoUpdater.on('update-available', onAvailable)
    autoUpdater.on('update-not-available', onLatest)
    autoUpdater.on('error', onError)
    void autoUpdater.checkForUpdates().catch(() => done('unreachable'))
  })
}

export const updates: UpdateChannel = {
  start,
  checkNow,
  /* The restart half of the toast. Callers persist the session first —
   * an update must never cost anyone an unsaved draft. */
  installAndRestart: () => autoUpdater.quitAndInstall()
}
