import {
  defaultKeymap,
  history,
  historyField,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  type ViewUpdate
} from '@codemirror/view'
import { createFindPanel } from '../ui/find'
import { docDirFacet, livePreview } from './live-preview/index'
import { tableGridExtension } from './live-preview/table-grid'
import { pasteImage } from './paste-image'
import { tableKeymap, tableNormalizer } from './table-commands'
import { foolscapTheme } from './theme'

export interface EditorHandle {
  view: EditorView
  getContent(): string
  /* Replace the whole document (open, new, external reload). Builds a fresh
   * state so undo history cannot cross file boundaries. Keeps the cursor
   * offset, clamped, so a silent external reload doesn't teleport the caret. */
  replace(content: string, docDir: string | null): void
  /* A standalone state for a background tab — same extensions, own undo
   * history. Swapped in with view.setState when its tab activates. An
   * optional serialized undo history (from a persisted session or a
   * transferred tab) is revived into the state; garbage falls back to a
   * fresh history rather than blocking the document. */
  makeState(content: string, anchor: number, docDir: string | null, history?: string | null): EditorState
  /* Save As moves the document without reloading it; relative image paths
   * must re-anchor without destroying undo history. */
  setDocDir(docDir: string | null): void
  /* The state's undo history as an opaque JSON string for the session store
   * and tab transfers; null when serialization fails or is oversized. */
  serializeHistory(state: EditorState): string | null
}

export interface EditorHooks {
  onDocChanged(): void
  onUpdate(update: ViewUpdate): void
  onNoDocumentForPaste(): void
  onPasteFailed(): void
}

/* What a new document opens as: a heading ready to be titled, cursor after
 * the mark, one paragraph below. Deliberately the pristine state, not an
 * edit — an untouched new window stays clean (no save prompt) and reusable
 * for opening files into. */
const NEW_DOC_TEMPLATE = '# \n\n'
const NEW_DOC_CURSOR = 2

/* An undo stack that outgrows this is not worth persisting — the session
 * file must stay a quick read at launch. */
const HISTORY_JSON_CAP = 2_000_000

/* The field key EditorState.toJSON/fromJSON serialize the undo stack under. */
const stateFields = { history: historyField }

export function createEditor(parent: HTMLElement, hooks: EditorHooks): EditorHandle {
  const docDir = new Compartment()
  const extensionsFor = (dir: string | null): Extension[] => [
    docDir.of(docDirFacet.of(dir)),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage }),
    /* Before the main keymap: the grid's ArrowUp/Down entry bindings must
     * outrank defaultKeymap's cursor motion (they yield by returning false
     * when no grid is adjacent). */
    tableGridExtension(),
    search({ top: true, createPanel: createFindPanel }),
    /* Tables own Tab first; indentWithTab catches the rest — without it
     * Tab falls through to the browser's focus-move and the caret leaves
     * the document. */
    keymap.of([...tableKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) hooks.onDocChanged()
      hooks.onUpdate(update)
    }),
    livePreview(),
    tableNormalizer(),
    pasteImage(hooks.onNoDocumentForPaste, hooks.onPasteFailed),
    foolscapTheme()
  ]

  const makeState = (
    doc: string,
    anchor = 0,
    dir: string | null = null,
    historyJson: string | null = null
  ): EditorState => {
    const at = Math.min(anchor, doc.length)
    if (historyJson) {
      // A stale or corrupt payload must never block opening the document.
      try {
        return EditorState.fromJSON(
          {
            doc,
            selection: { main: 0, ranges: [{ anchor: at, head: at }] },
            history: JSON.parse(historyJson) as unknown
          },
          { extensions: extensionsFor(dir) },
          stateFields
        )
      } catch {
        // fall through to a fresh history
      }
    }
    return EditorState.create({
      doc,
      selection: { anchor: at },
      extensions: extensionsFor(dir)
    })
  }

  const view = new EditorView({ state: makeState(NEW_DOC_TEMPLATE, NEW_DOC_CURSOR), parent })

  return {
    view,
    getContent: () => view.state.doc.toString(),
    replace: (content, dir) => {
      const anchor = view.state.selection.main.head
      view.setState(makeState(content, anchor, dir))
    },
    makeState: (content, anchor, dir, history) => makeState(content, anchor, dir, history ?? null),
    setDocDir: (dir) => {
      view.dispatch({ effects: docDir.reconfigure(docDirFacet.of(dir)) })
    },
    serializeHistory: (state) => {
      try {
        const json = (state.toJSON(stateFields) as Record<string, unknown>)['history']
        const text = JSON.stringify(json)
        return typeof text === 'string' && text.length <= HISTORY_JSON_CAP ? text : null
      } catch {
        return null
      }
    }
  }
}
