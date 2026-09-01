import { EditorView } from '@codemirror/view'
import {
  EditorSelection,
  type EditorState,
  type Extension,
  type TransactionSpec
} from '@codemirror/state'

/* Paste an image from the clipboard: bytes go to main, which writes them
 * into an assets/ folder beside the document and answers with a relative
 * path; the editor gets a plain markdown image link with the cursor parked
 * in the alt text. Main answers null for an unsaved document — there is no
 * "beside" yet — and rejects when the write itself fails. Either way the
 * user has to hear about it: preventDefault has already suppressed the
 * ordinary paste, so a swallowed failure leaves nothing behind at all. */

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

export function extForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null
}

/* Extension for a dropped file: its MIME when the OS knows one, else the
 * name's own, normalized — main validates either way. */
export function extForFile(file: { name: string; type: string }): string | null {
  const byMime = extForMime(file.type)
  if (byMime) return byMime
  const ext = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? null
  return ext === 'jpeg' ? 'jpg' : ext
}

/* changeByRange maps positions across sibling ranges, so with multiple
 * cursors each one gets its own link with the caret in the alt brackets —
 * a fixed selection.main offset would land inside an earlier insertion. */
export function imageInsertion(state: EditorState, relPath: string): TransactionSpec {
  return state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: `![](${relPath})` },
    range: EditorSelection.cursor(range.from + 2)
  }))
}

/* Dropped images in the editor land where the drop cursor pointed, the
 * same inline links a paste makes — several in a row, space-separated.
 * Caret in the first alt text. */
export function imagesInline(
  state: EditorState,
  at: number,
  relPaths: readonly string[]
): TransactionSpec {
  const pos = Math.max(0, Math.min(at, state.doc.length))
  const insert = relPaths.map((p) => `![](${p})`).join(' ')
  return { changes: { from: pos, insert }, selection: { anchor: pos + 2 } }
}

/* Dropped images on the preview page have no cursor to honor, so they
 * become their own paragraph(s) at a block boundary the drop chose —
 * blank lines on both sides, so the pipeline reads each as a block rather
 * than an image glued to a sentence. Caret in the first alt text. */
export function imageBlockInsertion(
  state: EditorState,
  at: number,
  relPaths: readonly string[]
): TransactionSpec {
  const pos = Math.max(0, Math.min(at, state.doc.length))
  const before = state.sliceDoc(Math.max(0, pos - 2), pos)
  const after = state.sliceDoc(pos, Math.min(state.doc.length, pos + 2))
  const prefix = pos === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const suffix =
    pos === state.doc.length
      ? '\n'
      : after.startsWith('\n\n')
        ? ''
        : after.startsWith('\n')
          ? '\n'
          : '\n\n'
  const body = relPaths.map((p) => `![](${p})`).join('\n\n')
  return {
    changes: { from: pos, insert: prefix + body + suffix },
    selection: { anchor: pos + prefix.length + 2 }
  }
}

/* Save every dropped image beside the document, then place the links in
 * one transaction. The first null answer (unsaved document) stops the
 * whole drop before anything is written; a failed write rejects. */
export async function insertDroppedImages(
  view: EditorView,
  files: readonly File[],
  place: (state: EditorState, relPaths: readonly string[]) => TransactionSpec,
  onNoDocument: () => void
): Promise<void> {
  const relPaths: string[] = []
  for (const file of files) {
    const ext = extForFile(file)
    if (!ext) continue
    const bytes = new Uint8Array(await file.arrayBuffer())
    const relPath = await window.foolscap.pasteImage(bytes, ext, file.name)
    if (!relPath) {
      onNoDocument()
      return
    }
    relPaths.push(relPath)
  }
  if (relPaths.length === 0) return
  view.dispatch(place(view.state, relPaths))
  view.focus()
}

export function pasteImage(onNoDocument: () => void, onFailed: () => void): Extension {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const items = event.clipboardData?.items
      if (!items) return false
      const image = Array.from(items).find((item) => extForMime(item.type) !== null)
      const file = image?.getAsFile()
      if (!image || !file) return false
      event.preventDefault()
      void insertPastedImage(view, file, extForMime(image.type) as string, onNoDocument).catch(
        onFailed
      )
      return true
    }
  })
}

export async function insertPastedImage(
  view: EditorView,
  file: File,
  ext: string,
  onNoDocument: () => void
): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const relPath = await window.foolscap.pasteImage(bytes, ext)
  if (!relPath) {
    onNoDocument()
    return
  }
  view.dispatch(imageInsertion(view.state, relPath))
  view.focus()
}
