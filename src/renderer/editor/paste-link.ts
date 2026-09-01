import { EditorSelection, type EditorState, type Extension, type TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/* Paste a URL over selected text and the selection becomes a link: the
 * clipboard's http(s) or mailto address goes in the parens, the selected
 * words stay as the label, the caret lands after. Nothing is selected, or
 * the clipboard holds anything but a lone URL, and paste is paste. */

const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/* The trimmed URL when the pasted text is exactly one, else null. */
export function pastedUrl(text: string): string | null {
  const url = text.trim()
  if (url === '' || /\s/.test(url)) return null
  try {
    return LINK_SCHEMES.has(new URL(url).protocol) ? url : null
  } catch {
    return null
  }
}

/* A label that would not survive the brackets — multi-line, or already
 * carrying link syntax — falls back to an ordinary paste. */
function linkable(label: string): boolean {
  return label.length > 0 && !/[\n[\]]/.test(label)
}

export function linkPaste(state: EditorState, text: string): TransactionSpec | null {
  const url = pastedUrl(text)
  if (url === null) return null
  const ranges = state.selection.ranges
  if (!ranges.some((r) => !r.empty)) return null
  if (!ranges.every((r) => r.empty || linkable(state.sliceDoc(r.from, r.to)))) return null
  return state.changeByRange((range) => {
    if (range.empty) {
      // Multi-cursor with one bare caret: that caret just gets the URL.
      return {
        changes: { from: range.from, insert: url },
        range: EditorSelection.cursor(range.from + url.length)
      }
    }
    const insert = `[${state.sliceDoc(range.from, range.to)}](${url})`
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length)
    }
  })
}

export function pasteLink(): Extension {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const text = event.clipboardData?.getData('text/plain')
      if (!text) return false
      const spec = linkPaste(view.state, text)
      if (!spec) return false
      event.preventDefault()
      view.dispatch(view.state.update(spec, { scrollIntoView: true, userEvent: 'input.paste' }))
      return true
    }
  })
}
