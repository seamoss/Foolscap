# Foolscap

A markdown editor. Free, open source, file-first, and unreasonably well-typeset.

[![CI](https://github.com/seamoss/Foolscap/actions/workflows/ci.yml/badge.svg)](https://github.com/seamoss/Foolscap/actions/workflows/ci.yml)

![Editing in Foolscap — syntax marks recede instead of hiding](docs/editing.png)

That's the editor, mid-edit, in the Plate theme. The `##` and `**` haven't
vanished — they've **receded**: still legible, still telling you what the
structure is, ready to breathe back up when your cursor arrives. The table's
pipes are aligned in the file itself, not just on screen.

Foolscap is a single beautiful writing surface for markdown files. The buffer is plain markdown text at all times — live preview is decorations over that text, never a document model — so the file on disk is always exactly what you wrote. What you see in the editor is what HTML and PDF export produce, because one pipeline drives all three:

![The same document, previewed](docs/preview.png)

## What it does

- Files open where you left them; ⇧⌘T reopens a closed tab; drop an image from Finder or paste a URL over a selection and the markdown writes itself
- Live preview of every markdown construct: headings (Fraunces, real optical sizing), emphasis, lists with hanging indents and real bullets, links (Cmd-click to open), Shiki-highlighted code fences, inline images, blockquotes, rules, clickable task-list checkboxes, and tables that render as a real grid and edit in place (click a cell and type; ⌥-click for the pipe source with its normalizing formatter, drag-to-resize columns, and hover column controls)
- Atomic saves — temp file, fsync, rename; a crash can never truncate your manuscript
- External-change watching: clean buffers reload silently, dirty buffers get a choice
- Command palette (⌘K), find & replace, outline panel, typewriter and focus modes, word count
- Seven themes — from the house Ledger and Plate to GitHub, Vercel, and VS Code — plus load-your-own-CSS custom themes ([THEMING.md](THEMING.md))
- Ten writing faces, five serif and five sans; one font per page, and code keeps [Ioskeley Mono](https://github.com/ahatem/IoskeleyMono)
- Paste images from the clipboard into a sibling `assets/` folder
- Tabs and windows — drag a tab out and it becomes a window — with full session restore: `⌘Q` quits silently and the next launch sets the desk back up, unsaved drafts included
- Self-contained HTML export and typeset PDF export with the editor's real fonts

## Out of scope

Deliberately, and permanently for v1 — please don't file issues asking for:

- Vaults, workspaces, or folder-as-database concepts. Files are files.
- Sync, cloud, accounts, telemetry.
- Graph view, backlinks, wiki-links, tags.
- A plugin API. (Themes are not plugins; themes are in.)
- Collaborative editing.
- Mobile.
- AI features. There are forty of those. This one is about writing.
- Diagram rendering (Mermaid et al.). Fences show their source, beautifully — decided and closed.

## Platform

Foolscap is a **macOS app**. The Windows and Linux packaging config exists
and may even work, but nobody here runs it — it is untested and unsupported
for now.

## Install

Grab the DMG from [Releases](https://github.com/seamoss/Foolscap/releases) —
`arm64` for Apple Silicon, plain for Intel. Since **0.6.1**, builds are
signed and notarized: drag to Applications and open like anything else.
Since **0.7.0**, updates take care of themselves: Foolscap downloads new
versions quietly, mentions it once in a toast when one is ready, and
installs on restart — or on whatever quit comes naturally.

(Releases before 0.6.1 were unsigned — if macOS grumbles about an old
download, just grab a current one.)

## Building

```
pnpm install
pnpm dev        # run in development
pnpm test       # vitest
pnpm typecheck
pnpm pack:app   # unsigned local app build (dist/)
pnpm dist       # full installers
```

## License

[MIT](LICENSE)
