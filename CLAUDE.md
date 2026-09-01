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
- Run `pnpm test` and `pnpm typecheck` before declaring anything done.
- Version every addition (semver, pre-1.0): user-facing features bump minor,
  fixes bump patch. Bump package.json and annotated-tag vX.Y.Z in the same
  commit as the change.
- Publishing a version: `git push && git push origin vX.Y.Z`, then
  `gh release create vX.Y.Z dist/*.dmg`. The latest GitHub Release IS the
  update-notifier feed — the tag is the version; there is no feed file to
  edit, ever.
- Commit messages never include Claude/session links.
- The golden-file fixture suite must stay green. If a change breaks byte-identical
  round-trip, the change is wrong.

## Commands

pnpm dev         # run in development
pnpm build       # production build
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
