# ADR 0001: Every change ships with the test that would have caught it

**Status:** accepted, 2026-09-29
**Applies to:** every commit and pull request, human or agent

## Context

Between 0.13.0 and 0.19.0 the unit suite grew from 272 to 370 tests and
stayed green the whole way. In the same stretch, five regressions shipped
or nearly shipped:

| Regression | Where it lived | Caught by |
|---|---|---|
| Two files opened at once could leave a blank window | renderer `main.ts` + `preview.ts` | a hand-driven end-to-end probe |
| Every autosave rebuilt every image widget | renderer `main.ts` | the same probe, by accident |
| A silent reload pinned the view to the top | renderer `main.ts` | the same probe |
| Tab switches dumped every tab into the editor | renderer `main.ts` | a contributor, weeks later (#45) |
| A file opened on a cold launch landed as a background tab | main `session.ts` | a contributor, weeks later (#46) |

None of these were in a pure function. All of them were in the two files
the unit suite cannot reach: the renderer's `main.ts` (900 lines, the
document registry and every mode transition) and the main process's
`session.ts` (1,000 lines, tabs, saves, watchers, restore). The measured
baseline makes the shape of the gap plain:

| | Lines covered | Note |
|---|---|---|
| Whole tree | **24.5%** | 370 tests across 31 files |
| `src/shared` (the pipeline) | high | plus the golden-fixture suite |
| `src/renderer/editor/live-preview` | high | one construct, one test file |
| `src/main/*` | **0%** | every module |
| `src/renderer/main.ts` | **0%** | |

The unit tests are good at what they test. The regressions came from
what they structurally can't: the seams between the renderer, the main
process, the file system, and the user's own input events. Until now the
only thing exercising those seams was a throwaway script in one person's
scratch directory, which is the same as nothing.

## Decision

A change is not done until it carries the test that would have caught its
own regression, at the layer where that regression would live. There are
three layers. Which one a change needs is decided by what it touches, not
by taste.

### 1. Unit tests (`pnpm test`, vitest)

Required for any change to a pure module, and for any bug fix in one. A
pure module is one that takes values and returns values: the table model,
the position store, the link guard, the cursor-adjacency function, the
palette's matcher. If a file has a sibling `*.test.ts`, changes to it
extend that file. If it doesn't and it's pure, the change adds one.

The rule for a bug fix is stricter: the test is written first, fails
against the old code, and passes against the fix. A fix without a failing
test is a guess.

### 2. Golden fixtures (`fixtures/`, `UPDATE_GOLDENS=1 pnpm test`)

Required for any change to `src/shared/markdown.ts`, the one pipeline.
The goldens are byte-exact HTML for `fixtures/*.md`. A change that alters
them must say why in the commit, and the diff of the golden is part of
the review. A new markdown construct adds a fixture line. This is the
second rule in CLAUDE.md made testable.

### 3. End-to-end cases (`pnpm e2e`, `scripts/e2e/`)

Required for any change that touches these files, because they are where
the regressions live and the unit suite cannot see into them:

- `src/renderer/main.ts`
- `src/renderer/ui/preview.ts`
- `src/main/session.ts`
- `src/main/index.ts`
- `src/main/ipc.ts`
- anything that adds or changes an IPC channel in `src/shared/types.ts`

A case launches the built app in an isolated profile, drives it through
trusted keyboard and mouse events over the DevTools protocol, and reads
back what a user would see. Each case is a regression written down:
`scripts/e2e/cases/open-two-files.mjs` is the blank-window bug,
`tab-modes.mjs` is #45, `silent-reload.mjs` is the pinned-scroll bug. A
change to one of the files above adds a case, or extends one, that fails
without the change. The runner takes about thirty seconds for the whole
suite; a case that needs more than ten is doing too much.

The app exposes a read-only bridge to the suite (`window.__foolscap`)
only when launched from source with `FOOLSCAP_E2E=1`. A packaged build
never has it. The suite never reaches into internals to *act*; it acts
through the preload bridge and real input, and uses the test bridge to
*observe*.

### The floor

`pnpm test:coverage` enforces per-metric floors set to the baseline above
(`vitest.config.ts`). CI fails a change that drops below them. Raising
coverage raises the floor in the same change. The floor never comes down.

### For agents

CLAUDE.md carries the operative version of this rule. An agent working in
this repository decides the layer from the file list of its own diff,
before writing the change, and does not report a task complete until the
layer's suite has run and passed in this session. "The tests pass" means
the tests at the right layer, including `pnpm e2e` when the diff touches
a file in the list above.

## Consequences

- Pull requests carry a "Tests" section naming the layer and the case
  (`.github/PULL_REQUEST_TEMPLATE.md`). A PR that touches the end-to-end
  file list without an end-to-end case is sent back, however good the
  change.
- CI runs three jobs: typecheck plus unit tests with the coverage floor,
  the build, and the end-to-end suite on a macOS runner. All three are
  required.
- The end-to-end suite is in the repository, not in anyone's scratch
  directory, and grows with every regression. Its cases are the
  regression log.
- The baseline is honest about being low. The number that matters is the
  one that goes up.
