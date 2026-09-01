import { isolateHistory } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import {
  Compartment,
  RangeSetBuilder,
  StateField,
  type EditorSelection,
  type EditorState,
  type Extension,
  type Text,
  type TransactionSpec
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type KeyBinding
} from '@codemirror/view'
import type { Tree } from '@lezer/common'
import {
  cellRangesOfLine,
  columnDisplayWidth,
  commitCell,
  formatTable,
  insertRow,
  isDelimiterRow,
  parseTable
} from '../table-model'
import { selectionTouches } from './marks'

/* Table grid: a pipe table renders as a real <table> widget whenever the
 * selection is outside it; the moment the cursor enters — click or keyboard
 * — the widget drops and the mono-aligned source shows. The buffer stays
 * plain markdown throughout: the grid is a costume over the text, built
 * from the same pure table-model the normalizer and preview use.
 *
 * Unlike every other live-preview construct, this one lives in a StateField
 * rather than the ViewPlugins in ./index: CodeMirror refuses block/
 * multi-line replace decorations from plugins ("Block decorations may not
 * be specified via plugins"), because the viewport's geometry depends on
 * them. A field has no viewport, so the table scan is whole-doc — a
 * deliberate deviation from the visibleRanges rule, kept cheap by pruned
 * iteration (only container nodes are descended into) and by recomputing
 * positions only when the document or parse tree changes; selection-only
 * updates just re-run the adjacency filter over the cached ranges. */

export interface TableGridSpec {
  /* Full-line replace range: the table's first line's start to its last
   * line's end — a block widget must own whole lines. */
  from: number
  to: number
  text: string
}

/* Nodes worth descending into looking for tables. Blockquote is
 * deliberately absent: a quoted table's lines carry `> ` prefixes that
 * parseTable would read as cell content, so quoted tables keep their
 * source rendering. */
const CONTAINERS = new Set(['Document', 'BulletList', 'OrderedList', 'ListItem'])

export function collectTables(tree: Tree, doc: Text): TableGridSpec[] {
  const specs: TableGridSpec[] = []
  tree.iterate({
    enter(node) {
      if (node.name === 'Table') {
        const first = doc.lineAt(node.from)
        // Only a table that owns its lines whole can be lifted out: any
        // non-whitespace prefix (a stray bullet, a quote mark the tree
        // didn't attribute to a Blockquote) belongs to an enclosing
        // construct and would corrupt the cell parse.
        if (/^[ \t]*$/.test(doc.sliceString(first.from, node.from))) {
          const from = first.from
          const to = doc.lineAt(node.to).to
          specs.push({ from, to, text: doc.sliceString(from, to) })
        }
        return false
      }
      return CONTAINERS.has(node.name)
    }
  })
  return specs
}

export function collectTableGrids(
  tree: Tree,
  doc: Text,
  selection: EditorSelection
): TableGridSpec[] {
  return collectTables(tree, doc).filter((g) => !selectionTouches(selection, g.from, g.to))
}

/* ---- The widget: a real <table> built from the same pure model the
 * normalizer uses. Read-only in v1 — a click places the caret at the
 * clicked cell's exact source offset, which reveals the source. ---- */

class TableGridWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }

  /* Keyed on text alone, never position: typing above the table maps the
   * decoration without touching this DOM, and the normalizer's reformat on
   * exit costs exactly one rebuild. Position is recovered at click time
   * via posAtDOM. */
  override eq(other: TableGridWidget): boolean {
    return other.text === this.text
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'fs-table-grid'
    wrap.contentEditable = 'false'

    const model = parseTable(this.text)
    const table = document.createElement('table')
    const colgroup = document.createElement('colgroup')
    const widths = model.header.map((_, i) => columnDisplayWidth(model, i))
    const total = widths.reduce((a, b) => a + b, 0) || 1
    for (const w of widths) {
      const col = document.createElement('col')
      col.style.width = `${(w / total) * 100}%`
      colgroup.append(col)
    }
    table.append(colgroup)

    // Rows come from the raw lines, not model.rows: the model trims cell
    // text, and the click math needs each cell to hold the byte-identical
    // source slice.
    const head = document.createElement('thead')
    const body = document.createElement('tbody')
    let lineOffset = 0
    let contentRow = 0
    for (const line of this.text.split('\n')) {
      if (line.trim() !== '' && !isDelimiterRow(line)) {
        const isHeader = contentRow === 0
        const tr = document.createElement('tr')
        cellRangesOfLine(line).forEach((range, column) => {
          if (column >= model.header.length) return
          const cell = document.createElement(isHeader ? 'th' : 'td')
          cell.textContent = line.slice(range.from, range.to)
          cell.dataset['pos'] = String(lineOffset + range.from)
          cell.dataset['end'] = String(lineOffset + range.to)
          cell.dataset['row'] = String(contentRow)
          cell.dataset['col'] = String(column)
          const align = model.align[column]
          if (align) cell.style.textAlign = align
          tr.append(cell)
        })
        ;(isHeader ? head : body).append(tr)
        contentRow++
      }
      lineOffset += line.length + 1
    }
    table.append(head, body)
    wrap.append(table)

    // TaskWidget's pattern: the widget owns its clicks (default ignoreEvent
    // is true). A plain click begins editing the cell in place; ⌥-click is
    // the deliberate hatch to the pipe source, caret on the exact clicked
    // character. During an active edit session the controller's capture
    // handler owns every mousedown, so this listener only ever starts one.
    wrap.addEventListener('mousedown', (event) => {
      // After a capture-phase commit rebuilt the widget, a stale listener
      // can still fire on the detached node with garbage geometry.
      if (!wrap.isConnected) return
      // Inside the cell being edited the browser owns the mouse: caret
      // drags, double-click word select, triple-click select-all. Only a
      // click that STARTS or MOVES an edit is ours to prevent.
      const target = event.target instanceof Node ? event.target : null
      if (target && view.plugin(cellEditorPlugin)?.ownsTarget(target)) return
      event.preventDefault()
      if (event.altKey) {
        const anchor = this.posFor(view, wrap, event)
        view.dispatch({ selection: { anchor }, scrollIntoView: true })
        view.focus()
        return
      }
      view.plugin(cellEditorPlugin)?.beginFromEvent(wrap, event)
    })
    return wrap
  }

  /* The clicked cell's source offset: the widget's current doc position
   * plus the cell's stored table-relative offset, refined to the exact
   * character under the pointer when the browser can resolve one inside
   * the cell's text node. */
  private posFor(view: EditorView, wrap: HTMLElement, event: MouseEvent): number {
    const base = view.posAtDOM(wrap)
    const cell = event.target instanceof Element ? event.target.closest('td, th') : null
    if (!(cell instanceof HTMLElement) || cell.dataset['pos'] === undefined) return base
    let pos = base + Number(cell.dataset['pos'])
    const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY)
    if (caret?.offsetNode?.nodeType === Node.TEXT_NODE && cell.contains(caret.offsetNode)) {
      pos = Math.min(pos + caret.offset, base + Number(cell.dataset['end']))
    }
    return pos
  }
}

/* ---- The StateField. Grid positions recompute only when the document or
 * parse tree changes; a selection-only transaction re-runs just the
 * adjacency filter over the cached ranges, so the every-keystroke cost is
 * a few comparisons. ---- */

interface TableGridState {
  grids: readonly TableGridSpec[]
  deco: DecorationSet
}

function buildDeco(grids: readonly TableGridSpec[], selection: EditorSelection): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const g of grids) {
    if (selectionTouches(selection, g.from, g.to)) continue
    builder.add(
      g.from,
      g.to,
      Decoration.replace({ widget: new TableGridWidget(g.text), block: true })
    )
  }
  return builder.finish()
}

export const tableGridField = StateField.define<TableGridState>({
  create(state) {
    const grids = collectTables(syntaxTree(state), state.doc)
    return { grids, deco: buildDeco(grids, state.selection) }
  },
  update(value, tr) {
    if (tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
      const grids = collectTables(syntaxTree(tr.state), tr.state.doc)
      return { grids, deco: buildDeco(grids, tr.state.selection) }
    }
    if (tr.selection) return { grids: value.grids, deco: buildDeco(value.grids, tr.state.selection) }
    return value
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
})

/* True when the position sits inside a table that is currently rendered as
 * a grid widget. False when the toggle is off (the field is absent) and
 * when the table is revealed — which makes it the one guard the hover
 * controls need: they keep working over source, and go quiet over the
 * grid, whose replaced range breaks their coordinate math. */
export function tableGridCoversPos(state: EditorState, pos: number): boolean {
  const grid = state.field(tableGridField, false)
  if (!grid) return false
  let hit = false
  grid.deco.between(pos, pos, () => {
    hit = true
    return false
  })
  return hit
}

/* ---- In-place cell editing: commit-on-move, spreadsheet-style.
 *
 * Typing edits only the cell's DOM (ignoreEvent keeps CodeMirror's
 * handlers and MutationObserver entirely out of the widget); the document
 * updates in ONE transaction when the edit ends — Tab/Shift-Tab and Enter
 * move on and keep editing, click-away and window blur stop, Escape
 * cancels. The commit dispatch never carries a selection, so the CM
 * cursor stays outside the table and the grid never drops. Dispatch
 * builds widget DOM synchronously, which is what lets a continuation
 * re-acquire the rebuilt table and focus the next cell in the same
 * event. ---- */

type CaretTarget = { x: number; y: number } | { index: number } | 'start' | 'end' | 'all'

interface EditSession {
  wrap: HTMLElement
  cell: HTMLElement
  row: number
  col: number
  /* The table text at session start — a commit whose live doc no longer
   * matches it is stale (external reload, tab switch) and is dropped. */
  tableText: string
  original: string
  teardown: () => void
}

/* The cell's text as typed: plaintext-only contenteditable still lets a
 * paste carry newlines, as text or as <br>. escapeCellText flattens both
 * once they're serialized uniformly. */
function cellDomText(cell: HTMLElement): string {
  let out = ''
  cell.childNodes.forEach((node) => {
    out += node.nodeName === 'BR' ? '\n' : (node.textContent ?? '')
  })
  return out
}

/* Source offset of a cell's content start within table text — the ⌥-click
 * hatch needs it when the click arrives mid-session and the widget it hit
 * has been rebuilt by the commit. */
function cellSourceOffset(text: string, row: number, col: number): number {
  let lineOffset = 0
  let contentRow = 0
  for (const line of text.split('\n')) {
    if (line.trim() !== '' && !isDelimiterRow(line)) {
      if (contentRow === row) {
        return lineOffset + (cellRangesOfLine(line)[col]?.from ?? 0)
      }
      contentRow++
    }
    lineOffset += line.length + 1
  }
  return 0
}

class CellEditor {
  private session: EditSession | null = null
  private committing = false
  private holdCell: HTMLElement | null = null
  private holdTop = 0
  private holdUntil = 0

  constructor(private readonly view: EditorView) {}

  /* Pin an element to a viewport height through the mode-switch turbulence.
   * Runs inside CodeMirror's own measure cycle and re-asserts every cycle
   * until it expires: the editor keeps correcting its height estimates for
   * a while after scrolling into a far-off region, and each correction
   * shifts the viewport — wall-clock timers lose that race. A wheel from
   * the user ends the hold immediately; the page is theirs. */
  pinTo(cell: HTMLElement, top: number): void {
    this.holdCell = cell
    this.holdTop = top
    this.holdUntil = Date.now() + 800
    this.view.scrollDOM.addEventListener('wheel', () => (this.holdUntil = 0), {
      once: true,
      passive: true
    })
    this.assertHold()
  }

  private assertHold(): void {
    if (!this.holdCell) return
    this.view.requestMeasure({
      key: this,
      read: (): number | null => {
        if (!this.holdCell?.isConnected || Date.now() > this.holdUntil) return null
        return this.holdCell.getBoundingClientRect().top - this.holdTop
      },
      write: (delta: number | null): void => {
        if (delta === null) {
          this.holdCell = null
          return
        }
        if (Math.abs(delta) > 1) this.view.scrollDOM.scrollTop += delta
        this.assertHold()
      }
    })
  }

  destroy(): void {
    // Toggle-off or setState is tearing the whole extension down; the DOM
    // is going away and a commit could no longer be verified — the normal
    // paths (capture mousedown, focusout, window blur) have already
    // committed anything a user gesture ended.
    this.cancel()
  }

  /* True when the node sits inside the cell being edited — those clicks
   * belong to the browser's native selection handling, not to us. */
  ownsTarget(target: Node): boolean {
    return this.session !== null && this.session.cell.contains(target)
  }

  /* Commit any in-progress edit and hand back the cell's document
   * position — the anchor a mode switch should keep in view. The CM
   * selection never follows a cell edit, so without this the caller
   * would anchor on wherever the caret was parked before editing began. */
  finish(): number | null {
    const s = this.session
    if (!s) return null
    const { row, col } = s
    const committed = this.commit(false)
    if (!committed) return null
    return committed.from + cellSourceOffset(committed.text, row, col)
  }

  beginFromEvent(wrap: HTMLElement, event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest('td, th') : null
    if (!(target instanceof HTMLElement) || target.dataset['row'] === undefined) return
    this.beginEdit(wrap, target, { x: event.clientX, y: event.clientY })
  }

  beginEdit(wrap: HTMLElement, cell: HTMLElement, caret: CaretTarget): void {
    if (this.session) {
      // Defensive: every real path commits before starting a new session.
      this.commit(false)
      if (!wrap.isConnected || !cell.isConnected) return
    }
    const row = Number(cell.dataset['row'])
    const col = Number(cell.dataset['col'])
    const from = this.view.posAtDOM(wrap)
    const grid = this.view.state.field(tableGridField, false)?.grids.find((g) => g.from === from)
    if (!grid || Number.isNaN(row) || Number.isNaN(col)) return

    cell.setAttribute('contenteditable', 'plaintext-only')
    cell.setAttribute('spellcheck', 'false')
    wrap.classList.add('fs-editing')
    cell.classList.add('fs-editing-cell')

    const onKeydown = (e: KeyboardEvent): void => this.onKeydown(e)
    // Height changes while typing are invisible to CM until it measures.
    const onInput = (): void => this.view.requestMeasure()
    const onFocusout = (): void => {
      if (!this.committing) this.commit(false)
    }
    const onDocMousedown = (e: MouseEvent): void => this.onDocMousedown(e)
    // Element blur doesn't fire on app switch; the window-level one keeps
    // the autosave flush on blur seeing committed text.
    const onWindowBlur = (): void => {
      this.commit(false)
    }
    cell.addEventListener('keydown', onKeydown)
    cell.addEventListener('input', onInput)
    cell.addEventListener('focusout', onFocusout)
    document.addEventListener('mousedown', onDocMousedown, true)
    window.addEventListener('blur', onWindowBlur)

    this.session = {
      wrap,
      cell,
      row,
      col,
      tableText: grid.text,
      original: cell.textContent ?? '',
      teardown: () => {
        cell.removeEventListener('keydown', onKeydown)
        cell.removeEventListener('input', onInput)
        cell.removeEventListener('focusout', onFocusout)
        document.removeEventListener('mousedown', onDocMousedown, true)
        window.removeEventListener('blur', onWindowBlur)
      }
    }
    cell.focus()
    this.placeCaret(cell, caret)
  }

  private onKeydown(e: KeyboardEvent): void {
    const s = this.session
    if (!s) return
    if (e.key === 'Escape') {
      e.preventDefault()
      s.cell.textContent = s.original
      this.cancel()
      this.view.focus()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      this.continueEdit(e.shiftKey ? -1 : 1, 'cell')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      this.continueEdit(1, 'row')
    }
  }

  /* Commit, then begin editing the neighboring cell — appending an empty
   * row (in the same transaction) when the move runs off the table's end. */
  private continueEdit(dir: 1 | -1, unit: 'cell' | 'row'): void {
    const s = this.session
    if (!s) return
    const model = parseTable(s.tableText)
    const cols = model.header.length
    const rowCount = model.rows.length + 1 // + header
    let { row, col } = s
    let appendRow = false
    if (unit === 'cell') {
      const idx = row * cols + col + dir
      if (idx < 0) {
        this.commit(false)
        return
      }
      row = Math.floor(idx / cols)
      col = idx % cols
    } else {
      row += dir
      col = s.col
    }
    if (row >= rowCount) {
      appendRow = true
      row = rowCount
      if (unit === 'cell') col = 0
    }
    const committed = this.commit(appendRow)
    if (!committed) return
    this.resumeAt(committed.from, row, col, 'all')
  }

  /* Ends the session, writing the cell back when it changed. Returns the
   * table's post-commit position and text, or null when the session was
   * stale (the doc changed underneath — drop the edit, never guess). */
  private commit(appendRow: boolean): { from: number; text: string } | null {
    const s = this.session
    if (!s) return null
    this.committing = true
    try {
      if (!s.wrap.isConnected) {
        // posAtDOM on a detached node returns garbage — nothing to verify
        // against, so the uncommitted text is dropped.
        this.cancel()
        return null
      }
      const from = this.view.posAtDOM(s.wrap)
      const grid = this.view.state
        .field(tableGridField, false)
        ?.grids.find((g) => g.from === from && g.text === s.tableText)
      if (!grid) {
        this.cancel()
        return null
      }
      const afterCell = commitCell(grid.text, s.row, s.col, cellDomText(s.cell)) ?? grid.text
      const next = appendRow
        ? formatTable(insertRow(parseTable(afterCell), parseTable(afterCell).rows.length - 1))
        : afterCell
      if (next !== grid.text) {
        this.view.dispatch({
          changes: { from: grid.from, to: grid.to, insert: next },
          userEvent: 'input',
          // Each cell edit is its own undo step, even through a rapid
          // Tab-Tab-Tab burst of commits.
          annotations: isolateHistory.of('full')
        })
      }
      this.cancel()
      return { from: grid.from, text: next }
    } finally {
      this.committing = false
    }
  }

  /* Find the (possibly rebuilt) widget for a table and begin editing one
   * of its cells. Dispatch builds DOM synchronously, so right after a
   * commit the new wrapper is already queryable. */
  private resumeAt(from: number, row: number, col: number, caret: CaretTarget): void {
    for (const wrap of this.view.contentDOM.querySelectorAll<HTMLElement>('.fs-table-grid')) {
      if (this.view.posAtDOM(wrap) !== from) continue
      const cell = wrap.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)
      if (cell) this.beginEdit(wrap, cell, caret)
      return
    }
  }

  /* While a session is active this capture listener owns every mousedown:
   * the active cell keeps its native caret and word-select, another grid
   * cell becomes a single-gesture commit-and-continue, and anything else
   * commits and falls through to CodeMirror's own click handling (which
   * re-measures, so post-rebuild geometry is fresh). */
  private onDocMousedown(e: MouseEvent): void {
    const s = this.session
    if (!s || e.button !== 0) return
    const target = e.target instanceof Element ? e.target : null
    if (target && s.cell.contains(target)) return
    const cell = target?.closest('td, th')
    const wrap = cell?.closest('.fs-table-grid')
    if (
      cell instanceof HTMLElement &&
      wrap instanceof HTMLElement &&
      cell.dataset['row'] !== undefined
    ) {
      e.preventDefault()
      e.stopPropagation()
      const row = Number(cell.dataset['row'])
      const col = Number(cell.dataset['col'])
      const point = { x: e.clientX, y: e.clientY }
      const alt = e.altKey
      const committed = this.commit(false)
      // The clicked table is either untouched by the commit (still
      // connected) or is the committed one, rebuilt at the same position.
      let from: number
      if (wrap.isConnected) from = this.view.posAtDOM(wrap)
      else if (committed) from = committed.from
      else return
      if (alt) {
        const grid = this.view.state.field(tableGridField, false)?.grids.find((g) => g.from === from)
        if (grid) {
          this.view.dispatch({
            selection: { anchor: grid.from + cellSourceOffset(grid.text, row, col) },
            scrollIntoView: true
          })
          this.view.focus()
        }
        return
      }
      this.resumeAt(from, row, col, point)
      return
    }
    this.commit(false)
  }

  /* Tear the session down without touching the document. */
  private cancel(): void {
    const s = this.session
    if (!s) return
    s.teardown()
    s.cell.removeAttribute('contenteditable')
    s.cell.removeAttribute('spellcheck')
    s.cell.classList.remove('fs-editing-cell')
    s.wrap.classList.remove('fs-editing')
    this.session = null
  }

  private placeCaret(cell: HTMLElement, caret: CaretTarget): void {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    if (typeof caret === 'object' && 'x' in caret) {
      const hit = document.caretPositionFromPoint?.(caret.x, caret.y)
      if (hit?.offsetNode && cell.contains(hit.offsetNode) && hit.offsetNode.nodeType === Node.TEXT_NODE) {
        range.setStart(hit.offsetNode, hit.offset)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
      caret = 'end'
    }
    const textNode = cell.firstChild
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      range.selectNodeContents(cell)
      range.collapse(true)
    } else if (caret === 'all') {
      range.selectNodeContents(cell)
    } else {
      const len = textNode.textContent?.length ?? 0
      const at = typeof caret === 'object' ? Math.min(caret.index, len) : caret === 'start' ? 0 : len
      range.setStart(textNode, Math.max(0, at))
      range.collapse(true)
    }
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

const cellEditorPlugin = ViewPlugin.fromClass(CellEditor)

/* ---- Keyboard entry. CodeMirror's vertical cursor motion deliberately
 * skips block widgets, so without help ArrowDown from the line above a
 * grid lands below the whole table. These bindings catch exactly that case
 * and begin editing the nearest cell in place — no dispatch, the CM
 * selection never moves, the grid never flashes. Horizontal motion needs
 * no help: landing on the range boundary already counts as touching and
 * reveals the source. ---- */

/* The grid a vertical cursor motion should step into: the table directly
 * below (dir 1) or above (dir -1) the cursor's line, and only while it is
 * actually rendered as a widget. Multi-cursor and non-empty selections
 * return null so default motion runs — extending a selection across the
 * range touches it and reveals source. */
export function entryGrid(state: EditorState, dir: 1 | -1): TableGridSpec | null {
  const field = state.field(tableGridField, false)
  if (!field) return null
  const sel = state.selection
  if (sel.ranges.length !== 1 || !sel.main.empty) return null
  const line = state.doc.lineAt(sel.main.head)
  const grid =
    dir === 1
      ? field.grids.find((g) => g.from === line.to + 1)
      : field.grids.find((g) => g.to === line.from - 1)
  if (!grid || !tableGridCoversPos(state, grid.from)) return null
  return grid
}

function enterGrid(view: EditorView, dir: 1 | -1): boolean {
  const grid = entryGrid(view.state, dir)
  if (!grid) return false
  const editor = view.plugin(cellEditorPlugin)
  if (!editor) return false
  for (const wrap of view.contentDOM.querySelectorAll<HTMLElement>('.fs-table-grid')) {
    if (view.posAtDOM(wrap) !== grid.from) continue
    const rows = wrap.querySelectorAll('tr')
    const tr = dir === 1 ? rows[0] : rows[rows.length - 1]
    const cell = tr?.querySelector<HTMLElement>('[data-col="0"]')
    if (!cell) return false
    editor.beginEdit(wrap, cell, 'start')
    return true
  }
  // The adjacent table's widget isn't rendered (far outside the viewport's
  // draw range) — fall through to default motion rather than guess.
  return false
}

const gridKeys: KeyBinding[] = [
  { key: 'ArrowDown', run: (view) => enterGrid(view, 1) },
  { key: 'ArrowUp', run: (view) => enterGrid(view, -1) }
]

/* ---- Source-position bridges: gestures that arrive with a doc offset
 * (the preview pane's double-click above all) and must not strand the
 * reader in raw pipe source. ---- */

/* The grid cell covering an offset into table text, with the character
 * index inside that cell's content — the inverse of cellSourceOffset.
 * Offsets on the delimiter row or in pipe padding clamp to the nearest
 * cell; pure for tests. */
export function cellAtOffset(
  text: string,
  offset: number
): { row: number; col: number; index: number } {
  let lineOffset = 0
  let contentRow = 0
  let before = { row: 0, col: 0, index: 0 }
  for (const line of text.split('\n')) {
    const end = lineOffset + line.length
    if (line.trim() !== '' && !isDelimiterRow(line)) {
      if (offset >= lineOffset && offset <= end) {
        const at = offset - lineOffset
        const ranges = cellRangesOfLine(line)
        let col = Math.max(0, ranges.length - 1)
        for (let i = 0; i < ranges.length; i++) {
          const r = ranges[i]
          if (r && at <= r.to) {
            col = i
            break
          }
        }
        const r = ranges[col]
        const index = r ? Math.max(0, Math.min(at - r.from, r.to - r.from)) : 0
        return { row: contentRow, col, index }
      }
      if (end < offset) before = { row: contentRow, col: 0, index: 0 }
      contentRow++
    }
    lineOffset = end + 1
  }
  return before
}

/* Commit any in-progress cell edit and return the edited cell's document
 * position, or null when nothing was being edited. Mode switches (⌘E into
 * preview) call this first, so the captured content carries the pending
 * edit and the new view can anchor where the writer actually was. */
export function finishCellEdit(view: EditorView): number | null {
  return view.plugin(cellEditorPlugin)?.finish() ?? null
}

/* Begin editing the cell that covers a source position. False when the
 * position isn't inside a grid-rendered table — the caller keeps its
 * normal selection path. Optional effects (the caller's page-hold
 * scroll) dispatch first; when that scroll brings the widget in from far
 * away, its DOM only exists after the measure pass, so the edit retries
 * there. */
export function beginCellEditAt(
  view: EditorView,
  pos: number,
  effects?: TransactionSpec['effects'],
  holdTop?: number
): boolean {
  const field = view.state.field(tableGridField, false)
  const grid = field?.grids.find((g) => g.from <= pos && g.to >= pos)
  if (!grid || !tableGridCoversPos(view.state, pos)) return false
  const editor = view.plugin(cellEditorPlugin)
  if (!editor) return false
  if (effects) view.dispatch({ effects })
  const target = cellAtOffset(grid.text, pos - grid.from)
  const begin = (): boolean => {
    for (const wrap of view.contentDOM.querySelectorAll<HTMLElement>('.fs-table-grid')) {
      if (view.posAtDOM(wrap) !== grid.from) continue
      const cell = wrap.querySelector<HTMLElement>(
        `[data-row="${target.row}"][data-col="${target.col}"]`
      )
      if (cell) {
        editor.beginEdit(wrap, cell, { index: target.index })
        if (holdTop !== undefined) editor.pinTo(cell, holdTop)
      }
      return true
    }
    return false
  }
  if (!begin()) {
    view.requestMeasure({
      read: () => {
        begin()
      }
    })
  }
  return true
}

/* A selection position guaranteed outside any grid-rendered table: just
 * before it, or just after when the table opens the document. For exits
 * that merely land NEAR a table — ⌘E out of preview — parking the caret
 * inside would drop the grid into raw source the reader never asked
 * for. */
export function posOutsideGrid(state: EditorState, pos: number): number {
  const grid = state
    .field(tableGridField, false)
    ?.grids.find((g) => g.from <= pos && g.to >= pos)
  if (!grid || !tableGridCoversPos(state, pos)) return pos
  return grid.from > 0 ? grid.from - 1 : Math.min(grid.to + 1, state.doc.length)
}

/* ---- Toggle: a compartment holding the whole extension, persisted in
 * localStorage. On by default — the grid is the point of the feature; the
 * toggle is the escape hatch. ---- */

const STORE_KEY = 'foolscap:table-grid'
const compartment = new Compartment()

// Off is the empty array, which sync() relies on to read a state's choice.
const contentFor = (on: boolean): Extension =>
  on ? [tableGridField, keymap.of(gridKeys), cellEditorPlugin] : []

export function tableGridOn(): boolean {
  return localStorage.getItem(STORE_KEY) !== '0' // on by default
}

export function tableGridExtension(): Extension {
  return compartment.of(contentFor(tableGridOn()))
}

export function setTableGrid(view: EditorView, on: boolean): void {
  localStorage.setItem(STORE_KEY, on ? '1' : '0')
  view.dispatch({ effects: compartment.reconfigure(contentFor(on)) })
}

export function syncTableGrid(view: EditorView): void {
  const on = tableGridOn()
  const current = compartment.get(view.state)
  const currentlyOn = !(Array.isArray(current) && current.length === 0)
  if (currentlyOn !== on) view.dispatch({ effects: compartment.reconfigure(contentFor(on)) })
}
