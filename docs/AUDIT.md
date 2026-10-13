# Feature audit: native against the Electron app

As of 2026-10-13, against seamoss/Foolscap main (0.19.1) and its two open
contributor PRs. "Native" is this repository at 1.0.0.

## Present in both

| Feature | Native note |
|---|---|
| Plain text always; live preview as a costume | NSTextStorage attributes + TextKit 2 layout fragments; the string is never touched |
| Marks recede and breathe back | one pure adjacency function, as before |
| Headings, emphasis, strikethrough, inline code, links, images, lists, task boxes, quotes, rules, fences | all attributes; blocks draw fills, hairlines, pictures as fragments |
| Fence highlighting | zero-dependency scanner, 19 languages built on first use; editor and export share tokens |
| Tables as a grid, source when the caret enters; column floor (longest word, 3em); Shift-Enter `<br>` | grid is a row fragment; `<br>` breaks lines in the grid and passes through to HTML |
| Table Tab/Enter navigation and the normalizer on leaving | plain-text edits, undoable |
| Task boxes toggle on click | a real edit through the text view |
| ⌘B/⌘I/⇧⌘X/⇧⌘C/⇧⌘K | decided from the parse, with the empty-pair trick |
| Paste URL over selection → link; paste/drop images into assets/; drop .md to open | |
| ⌘-click links; links from the page open in the browser | |
| Preview (⌘E), opens at the caret, double-click returns to the block | WKWebView, offline, scheme-served fonts and images |
| HTML export (standalone, light/dark by system) | |
| PDF export and Print, paginated, Ledger on white, real fonts | WebKit print operation from a hidden window |
| Footnotes in export | pre/post-pass around the one parser |
| Pretty wrapping, hyphenation, balanced headings on the page | export.css |
| Seven themes, Auto by system | hex for hex |
| Text size 14–22 (⌘+/⌘−/⌘0) | |
| Typewriter, focus, word count | focus via rendering attributes |
| Outline (⇧⌘O) | collapsible sidebar |
| Command palette (⌘K) with recents, themes, faces | |
| Find & replace | NSTextView's find bar |
| Tabs, drag a tab out to split, ⌘T, ⇧⌘T reopen closed | native window tabbing |
| Autosave, versions, Open Recent, proxy icon, path menu, restoration of windows | NSDocument; Browse All Versions… is the Versions browser |
| External change: clean document reloads silently | presentedItemDidChange |
| Files reopen where you left them | positions store |
| Copy as Rich Text (⌥⌘C) | RTF + HTML + markdown on the pasteboard |
| Reveal in Finder, Copy Path | |
| `foolscap://open?path=…` | |
| Help document rendered by the same page | |
| Signed and notarized | release.sh; Developer ID, hardened runtime |

## Missing in native

| Feature | Status |
|---|---|
| Line numbers (optional) | not built; needs an NSRulerView over TextKit 2 |
| In-place table cell editing (click a cell and type) | the grid flips to source on entry, as the Electron app's first version did |
| Custom CSS themes (Load Custom…) | no native equivalent for a CSS file; a key-value theme file is the plan |
| Conflict bar when a dirty document changes on disk | NSDocument warns at save instead |
| Undo history surviving quit | NSDocument restoration keeps windows, not undo stacks |
| Self-update (direct edition) and the no-update Store edition | Phase 5: Sparkle; Store build |
| Update check in Help/Settings | with the above |
| Ten bundled writing faces | by decision: the house face plus faces every Mac ships with, keeping the app ~10 MB |
| Copy button on preview code blocks; long lines wrap (PR #48, open) | not merged in Electron either |
| Double-clicking a code block in preview keeps the place (PR #47, open) | double-click lands on the block; the exact-line refinement is not ported |
| Drag-to-resize table columns in preview and editor | not built |
| Paste-image toast wording, first-run help on first launch | first-run help not built |

## Different on purpose

- Tabs are native window tabs rather than a custom strip: the title bar
  keeps its proxy icon and path menu, and drag-out comes free.
- No ⌘Q-silent-quit machinery: macOS's own window restoration brings the
  desk back; unsaved untitled drafts are NSDocument's autosaved untitled
  documents.
- Bundle size: 10 MB with every font in, against 112 MB for the Electron DMG.
