import type { UpdateCheckResult, UpdatePayload } from '../shared/types'

/* The one seam between editions, decided at build time in
 * electron.vite.config.ts ('#updater'). The direct-download edition
 * self-updates over GitHub Releases; the Mac App Store edition does
 * nothing here at all — App Review's words: "You should not provide
 * additional update checks or updates through the app." — and the Store
 * build ships without the updater library (scripts/dist-store.cjs). */
export interface UpdateChannel {
  /* Background checks, started once at launch. `announce` delivers the
   * toast and returns false when no window could show it — the channel
   * then retries on a later check rather than swallowing the news. */
  start(announce: (update: UpdatePayload) => boolean): void
  /* A check the user asked for by name: always resolves to a toastable
   * outcome, never rejects. */
  checkNow(): Promise<UpdateCheckResult>
  /* Quit into the downloaded update. The caller has persisted the session. */
  installAndRestart(): void
}
