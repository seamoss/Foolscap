import type { EditorView } from '@codemirror/view'
import { tableGridCoversPos } from '../editor/live-preview/table-grid'
import { tableAt } from '../editor/table-commands'
import {
  adjustColumnWidth,
  cellRangesOfLine,
  COLUMN_WIDTH_STEP,
  columnWidth,
  cycleAlign,
  deleteColumn,
  formatTable,
  insertColumn,
  parseTable,
  setColumnWidth,
  type TableModel
} from '../editor/table-model'
import { tokenMs, tokenPx } from './tokens'

/* Phase 4 column controls: a quiet chip bar that appears above a table
 * while the pointer is over it, acting on the hovered column. All actions
 * are the pure model transforms — parse, transform, format, replace. */

type Transform = (model: TableModel, column: number) => TableModel

interface DragState {
  tableFrom: number
  column: number
  startX: number
  startWidth: number
  lastWidth: number
  charWidth: number
  onMove: (e: MouseEvent) => void
  onUp: () => void
}

export class TableControls {
  private bar: HTMLElement | null = null
  private hideTimer: number | undefined
  private tableFrom = -1
  private column = 0
  private rafPending = false
  private drag: DragState | null = null

  constructor(private readonly view: EditorView) {
    view.scrollDOM.addEventListener('mousemove', (e) => this.onMove(e))
    view.scrollDOM.addEventListener('mouseleave', () => {
      this.setResizeCursor(false)
      this.scheduleHide()
    })
    view.dom.addEventListener('keydown', () => this.hide())
    // Capture phase so a pipe grab wins over CodeMirror's selection drag.
    view.contentDOM.addEventListener('mousedown', (e) => this.onMouseDown(e), true)
  }

  private onMove(event: MouseEvent): void {
    if (this.drag || this.rafPending) return
    this.rafPending = true
    requestAnimationFrame(() => {
      this.rafPending = false
      this.locate(event.clientX, event.clientY)
    })
  }

  private locate(x: number, y: number): void {
    const pos = this.view.posAtCoords({ x, y })
    const table = pos === null ? null : tableAt(this.view.state, pos)
    if (!table || pos === null) {
      this.setResizeCursor(false)
      this.scheduleHide()
      return
    }
    // A grid-rendered table has no text lines under the pointer — the
    // coordinate math below would resolve garbage. The grid owns itself.
    if (tableGridCoversPos(this.view.state, pos)) {
      this.setResizeCursor(false)
      this.scheduleHide()
      return
    }
    this.setResizeCursor(this.boundaryAt(x, y) !== null)
    const line = this.view.state.doc.lineAt(pos)
    const cells = cellRangesOfLine(line.text)
    let column = cells.length - 1
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      if (cell && pos - line.from <= cell.to) {
        column = i
        break
      }
    }
    this.tableFrom = table.from
    this.column = Math.max(0, column)
    this.show()
  }

  private show(): void {
    window.clearTimeout(this.hideTimer)
    if (!this.bar) {
      this.bar = this.build()
      document.body.append(this.bar)
    }
    const coords = this.view.coordsAtPos(this.tableFrom)
    if (!coords) return
    this.bar.style.left = `${Math.max(tokenPx('--edge-inset'), coords.left)}px`
    this.bar.style.top = `${coords.top - this.bar.offsetHeight - tokenPx('--table-bar-gap')}px`
    const label = this.bar.querySelector('.table-controls-col')
    if (label) label.textContent = `col ${this.column + 1}`
  }

  private scheduleHide(): void {
    window.clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => this.hide(), tokenMs('--dur-table-bar-hide'))
  }

  private hide(): void {
    this.bar?.remove()
    this.bar = null
  }

  private build(): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'table-controls'
    bar.addEventListener('mouseenter', () => window.clearTimeout(this.hideTimer))
    bar.addEventListener('mouseleave', () => this.scheduleHide())

    const label = document.createElement('span')
    label.className = 'table-controls-col'
    bar.append(label)

    const button = (text: string, title: string, transform: Transform, keepOpen = false): void => {
      const el = document.createElement('button')
      el.type = 'button'
      el.textContent = text
      el.title = title
      el.setAttribute('aria-label', title)
      el.addEventListener('click', () => this.apply(transform, keepOpen))
      bar.append(el)
    }

    button('+‹', 'Insert column before', (m, c) => insertColumn(m, c))
    button('+›', 'Insert column after', (m, c) => insertColumn(m, c + 1))
    button('⇄', 'Cycle column alignment', (m, c) => cycleAlign(m, c))
    // Width nudges repeat, so the bar stays put instead of hiding per click.
    button('⇤', 'Narrow column', (m, c) => adjustColumnWidth(m, c, -COLUMN_WIDTH_STEP), true)
    button('⇥', 'Widen column', (m, c) => adjustColumnWidth(m, c, COLUMN_WIDTH_STEP), true)
    button('×', 'Delete column', (m, c) => deleteColumn(m, c))
    return bar
  }

  private apply(transform: Transform, keepOpen = false): void {
    const table = tableAt(this.view.state, this.tableFrom)
    if (!table || table.from !== this.tableFrom) {
      this.hide()
      return
    }
    const text = this.view.state.sliceDoc(table.from, table.to)
    const next = formatTable(transform(parseTable(text), this.column))
    this.view.dispatch({
      changes: { from: table.from, to: table.to, insert: next },
      userEvent: 'input'
    })
    if (keepOpen) this.show()
    else this.hide()
  }

  /* ---- drag-to-resize: every pipe is the grab handle for the column on
   * its left. Hovering one shows col-resize; dragging rewrites the table
   * with the column's recorded width following the pointer. ---- */

  private setResizeCursor(on: boolean): void {
    this.view.contentDOM.style.cursor = on ? 'col-resize' : ''
  }

  /* The pipe glyph under the pointer, resolved to the column whose right
   * edge it is. Null over anything that isn't a draggable pipe: cell text,
   * the table's leading pipe, escaped pipes, or x past the glyph itself. */
  private boundaryAt(
    x: number,
    y: number
  ): { tableFrom: number; column: number; charWidth: number } | null {
    const pos = this.view.posAtCoords({ x, y })
    if (pos === null) return null
    const table = tableAt(this.view.state, pos)
    if (!table) return null
    if (tableGridCoversPos(this.view.state, pos)) return null
    const line = this.view.state.doc.lineAt(pos)
    const offset = pos - line.from
    // posAtCoords snaps to the nearest side of the glyph, so the pipe is
    // the character just before or just after the resolved position.
    const at =
      line.text[offset] === '|' && line.text[offset - 1] !== '\\'
        ? offset
        : line.text[offset - 1] === '|' && line.text[offset - 2] !== '\\'
          ? offset - 1
          : -1
    if (at < 0) return null
    const left = this.view.coordsAtPos(line.from + at)
    const right = this.view.coordsAtPos(line.from + at + 1)
    if (!left || !right || x < left.left - 3 || x > right.left + 3) return null
    let pipeIndex = 0
    for (let i = 0; i < at; i++) {
      if (line.text[i] === '|' && line.text[i - 1] !== '\\') pipeIndex++
    }
    if (pipeIndex === 0) return null // the leading pipe has no column on its left
    return {
      tableFrom: table.from,
      column: pipeIndex - 1,
      charWidth: Math.max(1, right.left - left.left)
    }
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0 || this.drag) return
    const boundary = this.boundaryAt(event.clientX, event.clientY)
    if (!boundary) return
    // Ours now: no caret move, no CodeMirror selection drag.
    event.preventDefault()
    event.stopPropagation()
    this.hide()
    const table = tableAt(this.view.state, boundary.tableFrom)
    if (!table) return
    const model = parseTable(this.view.state.sliceDoc(table.from, table.to))
    const start = columnWidth(model, boundary.column)
    const onMove = (e: MouseEvent): void => this.onDragMove(e)
    const onUp = (): void => this.endDrag()
    this.drag = {
      tableFrom: boundary.tableFrom,
      column: boundary.column,
      startX: event.clientX,
      startWidth: start,
      lastWidth: start,
      charWidth: boundary.charWidth,
      onMove,
      onUp
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    // The pointer leaves the pipe while dragging; keep the cursor steady.
    document.body.style.cursor = 'col-resize'
  }

  private onDragMove(e: MouseEvent): void {
    const drag = this.drag
    if (!drag) return
    const target = Math.max(
      3,
      drag.startWidth + Math.round((e.clientX - drag.startX) / drag.charWidth)
    )
    if (target === drag.lastWidth) return
    const table = tableAt(this.view.state, drag.tableFrom)
    if (!table || table.from !== drag.tableFrom) {
      this.endDrag()
      return
    }
    drag.lastWidth = target
    const text = this.view.state.sliceDoc(table.from, table.to)
    const next = formatTable(setColumnWidth(parseTable(text), drag.column, target))
    if (next !== text) {
      this.view.dispatch({
        changes: { from: table.from, to: table.to, insert: next },
        userEvent: 'input'
      })
    }
  }

  private endDrag(): void {
    const drag = this.drag
    if (!drag) return
    window.removeEventListener('mousemove', drag.onMove)
    window.removeEventListener('mouseup', drag.onUp)
    document.body.style.cursor = ''
    this.drag = null
  }
}
