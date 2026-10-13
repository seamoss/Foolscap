# Foolscap (native)

A markdown editor for macOS. Free, open source, file-first, focused on
typography and feel. This is the Swift/AppKit port of the Electron app at
github.com/seamoss/Foolscap; that one keeps shipping until this one reaches
parity. Same constitution, in native terms.

## The one inviolable rule

The text storage holds plain markdown text at all times. Live preview is
implemented ONLY as attributes layered over that text — presentation
attributes on the `NSTextStorage` and rendering attributes on the
`NSTextLayoutManager`. The document writes `textStorage.string` and nothing
else. Nothing ever edits the string to achieve a look.

There is no document model. There is no serializer. There is no round-trip.

If a task seems to require converting the buffer to a structured model, the
task is wrong. Stop and ask.

## The second rule

`Sources/Foolscap/Pipeline/` is the ONE markdown pipeline: swift-markdown
parses, and one `HTMLRenderer` renders. Editor attributes, HTML export, and
PDF export (WebKit printing the same HTML) all come from that one parse.
Never add a second parser, not even temporarily, not even "just for export."

## Non-goals — do not implement, do not suggest

Vaults, sync, accounts, telemetry, graph view, backlinks, wiki-links, tags,
plugin API, collaboration, mobile, AI features, diagram rendering (Mermaid).

Themes are not plugins. Themes are in scope.

## Design tokens

Every color, size, and duration comes from `Sources/Foolscap/Theme/Tokens.swift`.
Never hardcode a color literal, a point size, or a duration in a view. If a
token is missing, add it to Tokens first.

## Conventions

- Swift 6 language mode, strict concurrency. No force unwraps without a
  comment. No `try!` outside tests.
- AppKit for the editor (`NSTextView` with TextKit 2). SwiftUI only for
  sheets that are not the editor.
- No new package dependency without asking. swift-markdown is the one.
- Let `NSDocument` do its job: autosave, versions, Open Recent, the proxy
  icon, session restore, file coordination. Do not reimplement what it has.
- Every save goes through `NSDocument` (which writes safely); never
  `Data.write` a document from anywhere else.
- Cursor-adjacency logic lives in ONE pure function in
  `Sources/Foolscap/Editor/Marks.swift`. Never inline it elsewhere.
- Source ranges come from swift-markdown as line/column; the ONE conversion
  to `NSRange` lives in `Sources/Foolscap/Pipeline/SourceOffsets.swift`.

## Working style

- Work one Phase at a time. Phases are in PLAN.md. Do not start the next
  phase until the current phase's acceptance criteria pass.
- Build one markdown construct at a time, in the listed order, with tests,
  before moving to the next.
- Every change ships with the test that would have caught its regression,
  at the layer docs/adr/0001-testing.md assigns from the diff's file list:
  a unit test (XCTest) for a pure module (bug fixes: written first,
  failing before the fix); a golden fixture for the pipeline; a UI test
  (XCUITest, `Tests/FoolscapUITests`) for anything in `Document/`,
  `Editor/EditorViewController.swift`, or the app delegate. Decide the layer
  before writing the change. Nothing is done until `make test` (unit +
  golden) and — when the diff touches that list — `make uitest` have run
  and passed in this session.
- Version every addition (semver, pre-1.0): user-facing features bump
  minor, fixes bump patch, in MARKETING_VERSION in project.yml, with an
  annotated tag vX.Y.Z in the same commit.
- Commit messages never include Claude/session links.
- The golden-file fixture suite must stay green. Regenerate only with
  `UPDATE_GOLDENS=1 make test`, and explain the diff in the commit.

## Commands

make project   # xcodegen → Foolscap.xcodeproj (never committed)
make build     # Debug build to build/
make run       # build and launch
make test      # unit + golden fixtures
make uitest    # XCUITest smoke suite
