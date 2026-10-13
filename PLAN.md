# Foolscap native: port plan

The Electron app (github.com/seamoss/Foolscap, 0.19.x) is the spec. Each
phase lands behind tests per docs/adr/0001-testing.md; the Electron app
keeps shipping until Phase 5 reaches parity, then the Store listing moves
to this build under the same bundle id.

## Phase 0 — the skeleton proves the signature

A document-based AppKit app that opens a `.md` as plain text in a TextKit 2
`NSTextView`, and shows the first receding marks: headings, bold, italic,
inline code. One pipeline (`swift-markdown` → `HTMLRenderer`) with the
golden fixtures carried over. Tests at all three layers from the first
commit.

Acceptance: open fixtures/constructs.md; marks recede when the caret leaves
a construct and breathe back when it arrives; typing never changes anything
but the text; ⌘S writes the exact bytes; `make test` and `make uitest` pass.

## Phase 1 — the page (done)

Fonts bundled as variable TTFs (Recursive, Fraunces and its italic,
Ioskeley Mono Regular and Italic — AppKit does not load woff2), the token
system and the seven themes value for value from the Electron app,
Settings (⌘,) with theme, face, and text size. Decision: the writing-face
roster is the house face plus faces every Mac ships with (New York,
Charter, Georgia, Palatino, Iowan, SF, Helvetica Neue, Avenir Next,
Seravek, Gill Sans) rather than ten bundled Google faces — the app stays
near 10 MB. Custom CSS themes have no native equivalent; a key-value
theme file is Phase 4's.

## Phase 2 — every construct (done, two items deferred)

In the Electron order: lists, blockquotes, rules, links, images, code
fences, tables, task lists — every one as attributes over the text, and
for blocks a TextKit 2 layout fragment that draws the costume (fills,
hairlines, pictures, grids) without touching the string. Fence
highlighting is a zero-dependency scanner (Highlighter.swift) with
languages as data, built only when a fence names them; the export wraps
the same tokens. Tables draw as a grid when the caret is elsewhere and
show mono source when it enters — the Electron app's first version; in-
place cell editing is Phase 4. Deferred: footnotes (swift-markdown has
no syntax for them; a pre-pass is Phase 3 with export) and ⌘-click to
open links (Phase 3, with the preview).

## Phase 3 — preview, export, print (done)

The rendered page (WKWebView over the pipeline's HTML, offline, fonts and
images through a foolscap: scheme), HTML export, paginated PDF and print
through WebKit's print operation from a hidden window, the help
document, footnotes via a pre/post-pass, ⌘-click links.

## Phase 4 — the desk

Tabs and windows (NSWindow tabbing is free), outline, palette, find,
typewriter and focus modes, word count, positions, recents (NSDocument
gives Open Recent; the palette lists it).

## Phase 5 — shipping

Sparkle for the direct edition; the Store edition with none; signing,
notarization, CI; the Store listing moves over.

## Status, 2026-10-13

Phases 0–4 closed; docs/AUDIT.md lists what is in and what is not against
the Electron app. Version 1.0.0. Phase 5 began with `scripts/release.sh`:
Release config signs with Developer ID under the hardened runtime,
notarizes through the `foolscap-notary` keychain profile, and staples the
DMG. Sparkle and the Store edition remain.
