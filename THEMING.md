# Theming Foolscap

A theme is one CSS file. It sets custom properties on `:root[data-theme='<name>']` — nothing else. Everything the editor, the outline, the palette, and the exports draw comes from these properties.

Foolscap ships seven themes, in `src/renderer/styles/themes/`:

| Theme | File | Character |
|---|---|---|
| **Ledger** | `ledger.css` | Default light. Cool bone paper, green-black ink, verdigris accent. |
| **Plate** | `plate.css` | Dark. Cool off-black, ink at 85% contrast, brightened verdigris. |
| **Manuscript** | `manuscript.css` | High-contrast serif. Warm white, near-black ink, rubric-red accent, Fraunces body. |
| **GitHub** | `github.css` | Primer light. White paper, slate ink, the blue. |
| **GitHub Dark** | `github-dark.css` | Primer dark dimmed. |
| **Vercel** | `vercel.css` | Geist. True black, high-contrast grays, 0070f3. |
| **VS Code** | `vscode.css` | Dark+. The eternal #1e1e1e. |

With no theme chosen ("Auto"), Ledger and Plate follow the system light/dark preference. Choose any theme by name from the command palette (`Cmd+K` → "Theme: …"); the choice persists.

## The contract

### Palette — required

Every theme must define all seven. Nothing else in the app hardcodes a color.

| Property | Role |
|---|---|
| `--paper` | The page. Window and document background. |
| `--paper-sunk` | Recessed fills: code fences, inline code pills, blockquotes. |
| `--ink` | Body text. |
| `--ink-soft` | Metadata, captions, revealed syntax marks, list markers. |
| `--ink-ghost` | Receded syntax marks, the gutter glyph, whispers like the word count. |
| `--rule` | Hairlines: panels, tables, horizontal rules. |
| `--accent` | Links, active states, the caret, focus rings, selection tint. |

Derived values (`--selection`, the Shiki code-token colors `--shiki-*`) are computed from these in `tokens.css` — a theme gets consistent selection and syntax-highlight colors for free, and may override any `--shiki-*` variable for finer control.

### Type — optional

A theme may also override the type tokens (see `tokens.css` for the full list): `--font-body`, `--vf-body` (variable-font axes), `--weight-body`, `--font-heading`, and so on. Manuscript is the example: it swaps the body to Fraunces with `SOFT 0, WONK 0` and nudges weight to 420.

Sizes, spacing, motion, and structural tokens (`--measure`, `--leading-body`, `--dur-mark`, …) belong to the app, not the theme. Override at your own risk.

## Exports and print

Exported HTML embeds Ledger and Plate and follows the reader's system scheme. Print — including PDF export — always renders Ledger on true white: paper is paper.

## Custom themes

Bring your own: **⌘, → Theme → Load Custom…** (or `⌘K` → *Theme: Load Custom…*) and pick a CSS file. The contract is the same seven properties, under the `custom` name:

```css
:root[data-theme='custom'] {
  --paper: #101014;
  --paper-sunk: #17171c;
  --ink: #e8e6e3;
  --ink-soft: #8f8d8a;
  --ink-ghost: #4d4b49;
  --rule: #2a2a2f;
  --accent: #d08770;
}
```

Type overrides (`--font-body`, `--vf-body`, …) work here too, exactly as in Manuscript. The file's contents persist with your settings; picking any built-in theme switches away, and loading again re-reads the file.
