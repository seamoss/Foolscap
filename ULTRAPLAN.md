# Foolscap: Build Plan

A markdown editor in the spirit of Typora. Free, open source, file-first, and unreasonably well-typeset.

> **Status (September 2026):** every phase below has shipped — signed, notarized, self-updating releases since 0.6.1/0.7.0, tabs, autosave with version history, the table grid. This document is kept as the design record: the thesis, the non-goals, and the rules in CLAUDE.md are still the constitution; the phase checklists are history.

> **Working name.** `Foolscap` is a paper size and a writer's word. Swap it if you have better, but pick the name before Phase 0 so it's baked into the bundle ID, the repo, and the signing cert. Renaming after code signing is genuinely annoying.

---

## 1. Thesis

Three things are true about the market right now:

1. Typora is the best-feeling markdown editor and it is paid and closed.
2. MarkText, the main free alternative, stalled upstream for ~3 years and has fragmented into competing community forks.
3. Obsidian owns "knowledge base." Nobody owns "beautiful single-file writing surface."

So the wedge is **taste, not features**. Foolscap will lose a feature race against Obsidian and should not enter one. It wins by being the best-looking, best-feeling place to write a markdown file, and by never, ever corrupting that file.

**North star:** a writer opens a `.md`, writes for two hours, and never thinks about the app once.

---

## 2. Non-goals

Claude Code will try to be helpful and add these. Do not let it.

- No vaults, workspaces, or folder-as-database concepts. Files are files.
- No sync, no cloud, no accounts, no telemetry.
- No graph view, backlinks, tags, or wiki-links.
- No plugin API in v1. (Themes are not plugins. Themes ship in v1.)
- No collaborative editing.
- No mobile.
- No AI features. There are forty of those. This one is about writing.

If a feature is not in Section 7's milestone list, it is out of scope for v1.

---

## 3. Locked technical decisions

These are decided. Do not relitigate them mid-build.

| Concern | Decision | Why |
|---|---|---|
| Shell | `Electron` | `webContents.printToPDF()` is the single best PDF export path available. Bundle size is irrelevant for a desktop writing app. |
| Editor core | `CodeMirror 6` | Text buffer stays the source of truth. |
| Markdown parser | `unified` / `remark` (`remark-parse`, `remark-gfm`) | One AST for editing decorations, HTML export, and PDF. |
| Syntax highlighting in fences | `Shiki` | Uses real TextMate grammars, matches VS Code output, themeable from the same tokens. |
| UI framework | None, or `Preact` if you must | The UI is a window, a command palette, and a settings sheet. React is overkill. |
| Bundler | `Vite` + `electron-vite` | |
| Language | TypeScript, strict | |
| Package manager | `pnpm` | |
| License | MIT | MarkText's fork history is an argument for permissiveness, not against it. |

### 3.1 The one decision that matters most

**The CodeMirror document is plain markdown text at all times.** Live preview is implemented purely as CodeMirror `Decoration`s and `WidgetType`s layered over that text.

There is no document model, no serializer, no round-trip.

This is not a style preference. Reviewers' two standing complaints about MarkText are that the on-screen rendering diverges from the exported HTML and PDF, and that text becomes awkward to edit once the live editor has converted it. Both are structural consequences of a ProseMirror-style document model. A text-buffer architecture makes the entire class of "your editor mangled my file" bug impossible, and that bug is the one that permanently destroys trust in a markdown editor.

**Corollary, equally binding:** the same `remark` pipeline that drives the editor decorations must drive HTML export and PDF export. Not a second parser. Not `markdown-it` "just for export." One pipeline. What you see is definitionally what you get.

---

## 4. Design direction

The default theme. Everything here is a CSS custom property so users can replace all of it with one stylesheet.

### 4.1 Palette

Deliberately not warm cream, not terracotta, not acid-on-black. The reference is a **draughtsman's ledger**: cool bone paper, green-black ink, one oxidized-copper accent.

**Light (`Ledger`)**

```
--paper       #EFF1EE   cool bone, faint green cast
--paper-sunk  #E5E8E4   code fences, blockquote fills
--ink         #1A1D1B   body text, green-black
--ink-soft    #5A625C   metadata, captions
--ink-ghost   #9BA39C   receded syntax marks
--rule        #D6DAD5   hairlines, table borders
--accent      #2F7A6B   verdigris. links, active states, focus rings
```

**Dark (`Plate`)**

```
--paper       #14171A   cool off-black, never #000
--paper-sunk  #1C2024
--ink         #DDE3E0   85% contrast, never pure white
--ink-soft    #8A928D
--ink-ghost   #4E5652
--rule        #2A2F2C
--accent      #6FBFA8
```

### 4.2 Type

One variable family carries three roles, with the axes doing the differentiation. This is the idea; don't dilute it by adding a fourth font.

- **`Recursive`** (variable, OFL) for body, UI, and code.
  - Body: `MONO 0`, `CASL 0.4`, weight 400. Proportional with a slight casual warmth.
  - UI chrome: `MONO 0`, `CASL 0`, weight 500, size down.
  - Code and fences: `MONO 1`, `CASL 0`, weight 400.
- **`Fraunces`** (variable, OFL) for headings only. Use `opsz` so `h1` is genuinely a display cut rather than scaled-up body. `SOFT 20`, `WONK 1` at `h1`/`h2`, dial to `WONK 0` below.

Metrics:

- Measure `68ch`, hard cap. Not a pixel width.
- Body `1.7` line-height, `17px` base with a user size control from 14 to 22.
- Headings: `h1` `2.6rem` / `1.15`, `h2` `1.9rem`, `h3` `1.4rem`, then body-size with weight and letterspacing only.
- Paragraph spacing `0.9em`, not a blank line's worth. Tighter than the browser default reads more like a manuscript.

### 4.3 Signature: marks recede, they don't vanish

Most Typora clones hide syntax marks completely when the cursor leaves the line, and pop them back on entry. It feels cheap and it costs you your sense of the document's structure.

Foolscap instead **recedes** them:

- Marks (`**`, `_`, `#`, `` ` ``, `>`) drop to `--ink-ghost` and shed weight, they do not go to `opacity: 0`.
- The transition is `140ms cubic-bezier(0.4, 0, 0.2, 1)` on `color` and `font-weight`, both directions. Never instant.
- On the active line, marks come up to `--ink-soft`. Still quieter than the text.

Second half of the signature: a **hairline left gutter** at the edge of the measure, showing the current block's type glyph (`#`, `>`, `•`, `1.`, `~`) in `--ink-ghost`, aligned to the first baseline of the block. It is functional, it tells you what you're inside of, and it costs one column of margin.

This is the one place to spend boldness. Everything else stays disciplined and quiet.

### 4.4 Chrome

The document is the entire interface.

- Frameless window. macOS `titleBarStyle: 'hiddenInset'`. Windows and Linux get a custom 32px drag region with minimal controls.
- No toolbar. No sidebar. No status bar by default. An optional word count in the bottom corner that fades in on mouse move and out after 2s.
- Everything reachable through a command palette on `Cmd/Ctrl+K`.
- Typewriter mode and focus mode are toggles, not chrome.

### 4.5 Quality floor

Not negotiable, not announced: visible keyboard focus rings using `--accent`, full keyboard operability, `prefers-reduced-motion` respected (mark transitions become instant, nothing else changes), and `prefers-color-scheme` honored on first launch.

---

## 5. Repository layout

```
foolscap/
├─ CLAUDE.md                     # see Section 9
├─ package.json
├─ electron.vite.config.ts
├─ src/
│  ├─ main/                      # Electron main process
│  │  ├─ index.ts                # app lifecycle, single-instance lock
│  │  ├─ window.ts               # BrowserWindow factory, frameless config
│  │  ├─ menu.ts                 # native menu + accelerators
│  │  ├─ cli.ts                  # argv parsing, `open-file` event queue
│  │  ├─ files.ts                # read/write/watch, atomic saves
│  │  ├─ export/
│  │  │  ├─ html.ts
│  │  │  └─ pdf.ts               # hidden BrowserWindow + printToPDF
│  │  └─ ipc.ts                  # typed channel definitions
│  ├─ preload/
│  │  └─ index.ts                # contextBridge surface, no nodeIntegration
│  ├─ renderer/
│  │  ├─ index.html
│  │  ├─ main.ts
│  │  ├─ editor/
│  │  │  ├─ setup.ts             # CM6 EditorState/View assembly
│  │  │  ├─ live-preview/        # THE CORE. one file per construct.
│  │  │  │  ├─ index.ts          # ViewPlugin, decoration set builder
│  │  │  │  ├─ marks.ts          # recede/reveal for inline marks
│  │  │  │  ├─ headings.ts
│  │  │  │  ├─ code-fence.ts     # Shiki-backed
│  │  │  │  ├─ images.ts         # inline widget
│  │  │  │  ├─ links.ts
│  │  │  │  ├─ lists.ts
│  │  │  │  └─ gutter.ts         # block-type glyph
│  │  │  ├─ keymap.ts
│  │  │  └─ theme.ts             # CM6 theme bound to CSS custom props
│  │  ├─ ui/
│  │  │  ├─ palette.ts           # Cmd+K
│  │  │  ├─ outline.ts
│  │  │  ├─ find.ts
│  │  │  └─ settings.ts
│  │  └─ styles/
│  │     ├─ tokens.css           # every value from Section 4
│  │     ├─ base.css
│  │     └─ themes/
│  │        ├─ ledger.css
│  │        ├─ plate.css
│  │        └─ manuscript.css    # third theme, high-contrast serif
│  └─ shared/
│     ├─ markdown.ts             # THE one remark pipeline
│     └─ types.ts
├─ build/                        # icons, entitlements.plist, installer assets
└─ .github/workflows/
   ├─ ci.yml
   └─ release.yml
```

The `shared/markdown.ts` placement is deliberate. Main process (export) and renderer (editing) import the identical module. Making that physically shared is what enforces Section 3.1.

---

## 6. Hard parts, flagged early

Read this before starting. These are where the time actually goes.

**Decoration performance.** A naive `ViewPlugin` that rebuilds the whole decoration set on every keystroke will feel laggy past ~2000 lines. Build decorations only for `view.visibleRanges`, and use `RangeSetBuilder`. Test against a 5000-line file from day one, not at the end.

**Cursor-adjacency logic.** "Is the cursor on this construct" is subtler than it sounds. Nested emphasis, a link whose text contains bold, a cursor sitting exactly on a boundary, a multi-cursor selection. Write this as one pure, unit-tested predicate in `marks.ts` that everything else calls. Do not scatter the logic.

**macOS file opening.** The `open-file` event fires *before* `app.on('ready')` when the app launches by double-click. Queue those paths and drain the queue once the window exists. Also needs `CFBundleDocumentTypes` in the plist for `.md`, `.markdown`, `.mdx`. The plain `foolscap file.md` CLI case is easy; this one is not.

**Atomic saves.** Write to a temp file in the same directory, `fsync`, then rename. A crash mid-write must never truncate someone's manuscript. This is a five-line function and it is the most important five lines in the app.

**External file changes.** Decide the policy now: watch with `chokidar`, and if the file changes on disk while the buffer is clean, reload silently; if dirty, show a non-modal bar offering reload or keep. Do not silently overwrite either way.

**PDF page breaks.** `printToPDF` gives you nothing until you write `@media print` CSS. You need `break-inside: avoid` on code fences, tables, and images, `orphans`/`widows` on paragraphs, and `break-after: avoid` on headings. Budget a full session. Header/footer/page-number support in `printToPDF` is limited; use `displayHeaderFooter` with an HTML template and accept the constraints.

**Tables.** Typora's table editing UI is a large share of both its value and its cost. Phase 4 has it behind a deliberate gate. It is the most defensible thing to cut if you're running out of steam, and it is the loudest thing users will ask for. Decide with open eyes.

---

## 7. Milestones

Each phase ends at something runnable. Do not start the next phase until the acceptance criteria pass.

### Phase 0 — Skeleton (target: 1 evening)

- `electron-vite` + TypeScript strict + `pnpm` scaffold.
- Frameless `BrowserWindow`, single-instance lock.
- CM6 mounted with `@codemirror/lang-markdown`, plain highlighting, no live preview.
- `tokens.css` with every value from Section 4. Fonts loaded and rendering.

**Accept when:** `pnpm dev` opens a frameless window containing an editable markdown buffer in Recursive at the correct measure.

### Phase 1 — Files (target: 1 evening)

- Open, save, save-as, new. Atomic save per Section 6.
- CLI arg opening. macOS `open-file` queue and `CFBundleDocumentTypes`.
- Dirty state in the title bar. Close and quit guards.
- Recent files in the native menu.
- `chokidar` external-change policy.

**Accept when:** `foolscap ~/notes/thing.md` from a terminal opens it, edits save atomically, double-clicking a `.md` in Finder opens it in a running instance, and quitting dirty prompts.

### Phase 2 — Live preview (target: 2 to 3 weeks of evenings)

The real work. Build one construct at a time, in this order, each with tests:

1. Inline marks: bold, italic, strikethrough, inline code. Recede/reveal per Section 4.3.
2. Headings: `opsz`-scaled Fraunces, `#` marks receding.
3. Blockquotes and the gutter glyph.
4. Lists, ordered and unordered, with hanging indents and real bullets.
5. Links: recede the URL, keep the text live, `Cmd`-click to open.
6. Code fences via Shiki, theme-bound.
7. Images as inline widgets, with a broken-path fallback state.
8. Horizontal rules, footnotes.

**Accept when:** typing a document of every construct above feels continuous, no flicker, no layout jump, and a 5000-line file scrolls at 60fps.

### Phase 3 — Shippable app (target: 1 week of evenings)

- Command palette (`Cmd+K`).
- Find and replace, regex optional.
- Outline panel, toggleable, off by default.
- Export: markdown passthrough, HTML (self-contained, styles inlined), PDF with print CSS.
- Paste image from clipboard into a sibling `assets/` folder with a relative link.
- Three themes: `Ledger`, `Plate`, `Manuscript`. Theme = one CSS file. Document the custom-property contract in `THEMING.md`.
- Typewriter mode, focus mode, word count.

**Accept when:** exported PDF is visually indistinguishable from the editor, and a stranger could write a blog post in it without opening the docs.

### Phase 4 — Tables (gated)

Only start this if Phases 0 to 3 are genuinely done and polished.

- Live-preview table rendering with aligned columns.
- Tab and Shift-Tab cell navigation, Enter for a new row.
- Column insert/delete/align controls appearing on cell hover.
- Round-trip to clean pipe-table markdown, column widths normalized.

### Phase 5 — Release engineering (target: 1 week, mostly waiting)

- macOS: hardened runtime, entitlements, `codesign`, `notarytool` submission and staple. Requires an Apple Developer account at $99/yr. Without this, users see "app is damaged, move to Trash."
- Windows: Azure Trusted Signing is the affordable path. Unsigned installers get SmartScreen-flagged and your download conversion dies.
- Linux: AppImage, deb, rpm.
- `electron-updater` against GitHub Releases.
- `.github/workflows/release.yml` matrix: macOS arm64 + x64, Windows x64, Linux x64.
- README with an explicit **Out of scope** section. Write it before launch, not after the first thirty issues.

---

## 8. Testing

- **Unit (`vitest`):** the cursor-adjacency predicate, the remark pipeline, atomic save, path resolution for images.
- **Golden files:** a `fixtures/` directory of markdown documents. Assert that parse → render → serialize is byte-identical to input. This is the guard on Section 3.1 and it is the most valuable test suite in the project.
- **E2E (`Playwright` for Electron):** open, edit, save, export PDF, reopen. Smoke only.
- **Perf:** a committed 5000-line fixture with a benchmark asserting decoration rebuild stays under 16ms.

---

## 9. `CLAUDE.md` for the repo

Drop this in the repo root before your first Claude Code session. It's what keeps a long build from drifting.

```markdown
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
plugin API, collaboration, mobile, AI features.

Themes are not plugins. Themes are in scope.

## Design tokens

Every color, size, and duration comes from `src/renderer/styles/tokens.css`.
Never hardcode a hex value, a px font-size, or a transition duration in a
component. If a token is missing, add it to tokens.css first.

## Conventions

- TypeScript strict. No `any`. No non-null assertions without a comment.
- No new runtime dependency without asking.
- Build decorations from `view.visibleRanges` only, via `RangeSetBuilder`.
- Every save is atomic: temp file in the same directory, fsync, rename.
- Cursor-adjacency logic lives in ONE pure function in
  `src/renderer/editor/live-preview/marks.ts`. Never inline it elsewhere.

## Working style

- Work one Phase at a time. Phases are in BUILD-PLAN.md. Do not start the next
  phase until the current phase's acceptance criteria pass.
- Within Phase 2, build one markdown construct at a time, in the listed order,
  with tests, before moving to the next.
- Run `pnpm test` and `pnpm typecheck` before declaring anything done.
- The golden-file fixture suite must stay green. If a change breaks byte-identical
  round-trip, the change is wrong.

## Commands

pnpm dev         # run in development
pnpm build       # production build
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint
```

---

## 10. Timeline

| Phase | Effort |
|---|---|
| 0. Skeleton | 1 evening |
| 1. Files | 1 evening |
| 2. Live preview | 2 to 3 weeks of evenings |
| 3. Shippable app | 1 week of evenings |
| 4. Tables (gated) | 1 to 2 weeks of evenings |
| 5. Release engineering | 1 week, mostly waiting on notarization |

**Usable daily by you:** end of Phase 2, roughly three weeks.
**Public v1 you'd put your name on:** end of Phase 5, roughly three months of evenings.

The gap between those two is not features. It is polish, cross-platform behavior, code signing, and the long tail of edge cases. That gap is exactly where most "I'll build my own editor" projects die, which is why Phase 5 is in the plan as real work rather than an afterthought.

---

## 11. First move

Open Claude Code in an empty directory and give it: this file, a `CLAUDE.md` built from Section 9, and the instruction *"Execute Phase 0. Stop at the acceptance criteria and show me the window."*

Do not let it run ahead into Phase 1.
