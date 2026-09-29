<!-- Bugs: the smallest markdown file that reproduces it, and the fix.
     Features: see CONTRIBUTING.md — they're closed, with affection. -->

## What

## Tests

<!-- docs/adr/0001-testing.md decides the layer from your diff:
     - pure module changed  → unit test in the sibling *.test.ts (bug fix: written first, failed before the fix)
     - src/shared/markdown.ts → golden fixture, and the golden diff explained here
     - src/renderer/main.ts, ui/preview.ts, src/main/session.ts, index.ts, ipc.ts, or an IPC channel
                             → an end-to-end case in scripts/e2e/cases that fails without this change -->

- Layer:
- Case / test added or extended:
- `pnpm typecheck && pnpm test` green; `pnpm e2e` green if the layer is end-to-end
