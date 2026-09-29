# Foolscap

A markdown editor. Free, open source, file-first, focused on typography and feel.

## The one inviolable rule

The CodeMirror document is plain markdown text at all times. Live preview is
implemented ONLY as CM6 Decorations and Widgets layered over that text.

There is no document model. There is no serializer. There is no round-trip.

If a task seems to require converting the buffer to a structured model, the task
is wrong. Stop and ask.

## The second rule

`src/shared/markdown.ts` is the ONE markdown pipeline. Editor decorations, HTML
export, and PDF export all import it. Never add a second parser, not even
temporarily, not even "just for export."

## Non-goals — do not implement, do not suggest

Vaults, sync, accounts, telemetry, graph view, backlinks, wiki-links, tags,
plugin API, collaboration, mobile, AI features, diagram rendering (Mermaid).

Themes are not plugins. Themes are in scope.

## Design tokens

Every color, size, and duration comes from `src/renderer/styles/tokens.css`.
Never hardcode a hex value, a px font-size, or a transition duration in a
component. If a token is missing, add it to tokens.css first.

## Conventions

- TypeScript strict. No `any`. No non-null assertions without a comment.
- No new runtime dependency without asking.
- Build decorations from `view.visibleRanges` only, via `RangeSetBuilder`.
  The one exception is block-level replace decorations (the table grid),
  which CodeMirror refuses from view plugins: those live in a StateField
  and scan the whole document, and say so in a comment.
- Every save is atomic: temp file in the same directory, fsync, rename.
- Cursor-adjacency logic lives in ONE pure function in
  `src/renderer/editor/live-preview/marks.ts`. Never inline it elsewhere.

## Working style

- Work one Phase at a time. Phases are in ULTRAPLAN.md. Do not start the next
  phase until the current phase's acceptance criteria pass.
- Within Phase 2, build one markdown construct at a time, in the listed order,
  with tests, before moving to the next.
- Every change ships with the test that would have caught its regression,
  at the layer docs/adr/0001-testing.md assigns from the diff's file list:
  a unit test for a pure module (bug fixes: written first, failing before
  the fix); a golden fixture for `src/shared/markdown.ts`; an end-to-end
  case in `scripts/e2e/cases` for `src/renderer/main.ts`,
  `src/renderer/ui/preview.ts`, `src/main/session.ts`, `src/main/index.ts`,
  `src/main/ipc.ts`, or any IPC channel change. Decide the layer before
  writing the change. Nothing is done until `pnpm typecheck`, `pnpm test`,
  and — when the diff touches that list — `pnpm build && pnpm e2e` have
  run and passed in this session. Coverage floors in vitest.config.ts are
  a ratchet: raise them with coverage, never lower them.
- Version every addition (semver, pre-1.0): user-facing features bump minor,
  fixes bump patch. Bump package.json and annotated-tag vX.Y.Z in the same
  commit as the change.
- Publishing a version: `git push && git push origin vX.Y.Z`, then
  `gh release create vX.Y.Z dist/*.dmg`. The latest GitHub Release IS the
  update-notifier feed — the tag is the version; there is no feed file to
  edit, ever.
- Two editions, one version number. The tag push builds the direct edition
  (self-updating). The Mac App Store edition is `pnpm dist:store`, which
  sets FOOLSCAP_EDITION=store, packages, and refuses to produce a bundle
  carrying electron-updater, app-update.yml, or any node_modules — App
  Review rejects apps with their own update checks, so the Store edition
  has none, and no UI for one. Resubmitting the same version to the Store
  needs a higher build number: `FOOLSCAP_STORE_SUBMISSION=2 pnpm dist:store`.
  The Store edition is `-mas` everywhere Apple allows: the app shows its
  version as `0.16.0-mas`, the pkg is `Foolscap-0.16.0-mas-universal.pkg`,
  and dist:store tags the submission `v0.16.0-mas.N` (push it too). The
  bundle's own version string stays plain `0.16.0` — Apple accepts only
  digits and dots there.
- Commit messages never include Claude/session links.
- The golden-file fixture suite must stay green. If a change breaks byte-identical
  round-trip, the change is wrong.

## Commands

pnpm dev         # run in development
pnpm build       # production build
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
