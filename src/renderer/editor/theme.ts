import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

/* Every value here is a reference into styles/tokens.css. The CM theme is a
 * binding layer, not a place for numbers. */

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--paper)',
    color: 'var(--ink)',
    fontSize: 'var(--font-size-body)'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-body)',
    fontVariationSettings: 'var(--vf-body)',
    fontWeight: 'var(--weight-body)',
    lineHeight: 'var(--leading-body)',
    justifyContent: 'center'
  },
  '.cm-content': {
    maxWidth: 'calc(var(--measure-app) + var(--gutter-width))',
    width: '100%',
    flexGrow: '0',
    padding: '4rem 0 40vh 0',
    paddingLeft: 'var(--gutter-width)',
    caretColor: 'var(--accent)'
  },
  '.cm-line': {
    padding: '0',
    position: 'relative'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--accent)',
    borderLeftWidth: 'var(--cursor-width)'
  },
  /* drawSelection puts its layer behind the content (inline z-index -2),
   * where opaque line fills — fences, quotes — swallow it. Lift it above the
   * content (the !important is required to beat the inline style; cursor
   * layer sits at ~150) and let the translucent --selection tokens do the
   * rest. */
  '.cm-selectionLayer': {
    zIndex: '1 !important',
    // Above the content, the layer must never eat clicks — CM's base styles
    // don't set this because layers normally sit behind the text.
    pointerEvents: 'none'
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--selection)'
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--selection-blur)'
  },

  /* ---- Find & replace: panel chrome is .find-panel in base.css ---- */
  '.cm-panels': {
    backgroundColor: 'var(--paper)',
    color: 'var(--ink)',
    borderBottom: '1px solid var(--rule)'
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)',
    outline: '1px solid var(--rule)'
  },
  '.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 36%, transparent)'
  },

  /* ---- Live preview: marks recede, they don't vanish (§4.3) ---- */
  '.fs-mark': {
    color: 'var(--ink-ghost)',
    fontWeight: 'var(--weight-mark-ghost)',
    transition:
      'color var(--dur-mark) var(--ease-mark), font-weight var(--dur-mark) var(--ease-mark)'
  },
  '.fs-active .fs-mark': {
    color: 'var(--ink-soft)',
    fontWeight: 'var(--weight-body)'
  },

  '.fs-code': {
    background: 'var(--paper-sunk)',
    borderRadius: 'var(--radius-inline)',
    padding: '0 0.15em'
  },

  /* ---- Headings: Fraunces, opsz doing the display-cut work (§4.2) ---- */
  '.fs-heading': {
    fontFamily: 'var(--font-heading)',
    fontWeight: 'var(--weight-heading)'
  },
  '.fs-h1': {
    fontVariationSettings: 'var(--vf-heading-display)',
    fontSize: 'var(--font-size-h1)',
    lineHeight: 'var(--leading-h1)',
    paddingTop: 'var(--space-heading)'
  },
  '.fs-h2': {
    fontVariationSettings: 'var(--vf-heading-display)',
    fontSize: 'var(--font-size-h2)',
    lineHeight: 'var(--leading-heading)',
    paddingTop: 'var(--space-heading)'
  },
  '.fs-h3': {
    fontVariationSettings: 'var(--vf-heading-text)',
    fontSize: 'var(--font-size-h3)',
    lineHeight: 'var(--leading-heading)',
    paddingTop: 'var(--space-heading)'
  },
  '.fs-h4, .fs-h5, .fs-h6': {
    fontVariationSettings: 'var(--vf-heading-text)',
    letterSpacing: 'var(--tracking-heading-minor)'
  },

  /* ---- Tables: mono so normalized padding is true column alignment ---- */
  '.fs-table': {
    fontFamily: 'var(--font-code)',
    fontVariationSettings: 'var(--vf-code)',
    fontWeight: 'var(--weight-code)',
    fontSize: 'var(--font-size-code)'
  },
  '.fs-table-header': {
    fontWeight: 'var(--weight-ui)'
  },

  /* ---- Table grid: the block widget shown while the selection is outside
   * a table. Mirrors the preview pane's table (base.css .preview-doc).
   * Padding, never margin: vertical margins on a block widget corrupt
   * CodeMirror's height measurement. ---- */
  '.fs-table-grid': {
    padding: 'var(--space-paragraph) 0',
    cursor: 'text'
  },
  '.fs-table-grid table': {
    borderCollapse: 'collapse',
    width: '100%',
    tableLayout: 'fixed'
  },
  '.fs-table-grid th, .fs-table-grid td': {
    border: '1px solid var(--rule)',
    padding: 'var(--pad-table-cell)',
    textAlign: 'left',
    overflowWrap: 'break-word'
  },
  '.fs-table-grid th': {
    fontWeight: 'var(--weight-ui)',
    background: 'var(--paper-sunk)'
  },
  /* The cell being edited in place: an inset ring (outline-offset pulls it
   * inward) so focusing a cell never shifts layout. */
  '.fs-table-grid .fs-editing-cell': {
    outline: 'var(--table-edit-ring) solid var(--accent)',
    outlineOffset: 'calc(-1 * var(--table-edit-ring))',
    caretColor: 'var(--accent)'
  },

  /* ---- Blockquotes: sunk paper fill ---- */
  '.fs-quote': {
    background: 'var(--paper-sunk)',
    padding: '0 var(--pad-block)'
  },

  /* ---- Lists: quiet markers, real bullets off the active line ---- */
  '.fs-list-mark': {
    color: 'var(--ink-soft)'
  },
  '.fs-bullet': {
    color: 'var(--ink-soft)'
  },

  /* ---- Links: text stays live, URL machinery recedes ---- */
  '.fs-url': {
    overflowWrap: 'anywhere'
  },

  /* ---- Code fences: sunk fill, mono, Shiki colors via tokens ---- */
  '.fs-fence': {
    background: 'var(--paper-sunk)',
    fontFamily: 'var(--font-code)',
    fontVariationSettings: 'var(--vf-code)',
    fontWeight: 'var(--weight-code)',
    fontSize: 'var(--font-size-code)',
    padding: '0 var(--pad-block)'
  },
  '.fs-code-info': {
    color: 'var(--ink-soft)'
  },

  /* ---- Images: inline widget with a labeled broken state ---- */
  '.fs-image img': {
    display: 'block',
    maxWidth: '100%',
    maxHeight: 'var(--image-max-height)',
    borderRadius: 'var(--radius-ui)',
    margin: '0.4em 0'
  },
  '.fs-image-broken': {
    display: 'inline-block',
    color: 'var(--ink-ghost)',
    border: '1px dashed var(--rule)',
    borderRadius: 'var(--radius-ui)',
    padding: '0.2em 0.6em',
    fontSize: 'var(--font-size-ui)',
    fontVariationSettings: 'var(--vf-ui)'
  },

  '.fs-task input': {
    accentColor: 'var(--accent)',
    width: '0.95em',
    height: '0.95em',
    verticalAlign: '-0.12em',
    margin: '0',
    cursor: 'pointer'
  },

  '.fs-nod img': {
    display: 'inline-block',
    height: '1.05em',
    width: 'auto',
    verticalAlign: '-0.15em'
  },

  /* ---- Horizontal rules: an actual hairline off the active line ---- */
  '.fs-hr': {
    display: 'inline-block',
    width: '100%',
    verticalAlign: 'middle',
    borderTop: '1px solid var(--rule)'
  },

  /* ---- Gutter glyph: current block's type at its first baseline (§4.3) ----
   * right: 100% anchors the glyph's right edge just left of the text column
   * regardless of the line's font size; inheriting the line's font is what
   * keeps the glyph on the block's first baseline. */
  '.cm-line[data-fs-glyph]::before': {
    content: 'attr(data-fs-glyph)',
    position: 'absolute',
    right: '100%',
    marginRight: '0.35ch',
    color: 'var(--ink-ghost)',
    fontWeight: 'var(--weight-mark-ghost)'
  }
})

/* Content-level highlighting only. Mark tokens are owned by the live-preview
 * decorations (.fs-mark); the processingInstruction rule remains as the
 * fallback for constructs whose live preview isn't built yet (lists, links). */
const markdownHighlight = HighlightStyle.define([
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'var(--weight-strong)' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  {
    tag: tags.monospace,
    fontFamily: 'var(--font-code)',
    fontVariationSettings: 'var(--vf-code)',
    fontWeight: 'var(--weight-code)'
  },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--ink-soft)' },
  { tag: tags.quote, color: 'var(--ink-soft)' },
  { tag: tags.processingInstruction, color: 'var(--ink-ghost)' },
  { tag: tags.contentSeparator, color: 'var(--ink-ghost)' }
])

export function foolscapTheme(): Extension {
  return [editorTheme, syntaxHighlighting(markdownHighlight)]
}
