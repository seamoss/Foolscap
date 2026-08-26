import { resolveImageSrc } from '../editor/live-preview/images'
import {
  columnDisplayWidth,
  formatTable,
  parseTable,
  setColumnWidth,
  tableSourceAt
} from '../editor/table-model'
import { renderMarkdown } from '../../shared/markdown'

/* Index of the stamp best covering pos: the largest one <= pos. DOM order is
 * not source order — remark-rehype hoists footnote definitions to the end of
 * the document while they keep their early source offsets — so a last-match
 * scan would land on the footnote block instead of the requested element. */
export function bestCoveringIndex(positions: readonly number[], pos: number): number {
  let best = -1
  let bestPos = -1
  positions.forEach((at, i) => {
    if (at <= pos && at > bestPos) {
      bestPos = at
      best = i
    }
  })
  return best
}

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}_']/u.test(ch)

/* Exact source offset of a click inside a rendered block. Rendered text and
 * markdown source disagree (mark syntax, link targets, escapes), so instead
 * of arithmetic the clicked word is re-found: expand the click to a word,
 * count which whole-word occurrence of it precedes the click in the rendered
 * text, and locate the same occurrence in the source after the block's
 * data-pos stamp. The search window is bounded so a word this block only has
 * inside syntax (e.g. split by marks: `win**ning**`) fails to a null — the
 * caller falls back to the block start — rather than matching text pages
 * away. */
export function sourceOffsetAt(
  source: string,
  blockPos: number,
  renderedText: string,
  renderedOffset: number
): number | null {
  let start = renderedOffset
  let end = renderedOffset
  while (start > 0 && isWordChar(renderedText[start - 1])) start--
  while (end < renderedText.length && isWordChar(renderedText[end])) end++
  if (start === end) return null
  const word = renderedText.slice(start, end)
  const wholeWordAt = (text: string, i: number): boolean =>
    !isWordChar(text[i - 1]) && !isWordChar(text[i + word.length])

  let skip = 0
  for (let i = renderedText.indexOf(word); i !== -1 && i < start; i = renderedText.indexOf(word, i + 1)) {
    if (wholeWordAt(renderedText, i)) skip++
  }
  const window = source.slice(blockPos, blockPos + renderedText.length * 2 + 500)
  for (let i = window.indexOf(word); i !== -1; i = window.indexOf(word, i + 1)) {
    if (!wholeWordAt(window, i)) continue
    if (skip === 0) return blockPos + i + (renderedOffset - start)
    skip--
  }
  return null
}

/* Caret position under a pointer event, constrained to an element.
 * caretPositionFromPoint is the standard; caretRangeFromPoint the WebKit
 * legacy — Chromium has both, but feature-detect anyway. */
function caretAt(event: MouseEvent, within: Element): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?(x: number, y: number): Range | null
  }
  const pos = doc.caretPositionFromPoint?.(event.clientX, event.clientY)
  if (pos && within.contains(pos.offsetNode)) return { node: pos.offsetNode, offset: pos.offset }
  const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY)
  if (range && within.contains(range.startContainer)) {
    return { node: range.startContainer, offset: range.startOffset }
  }
  return null
}

/* The caret's offset into the holder's rendered text — Range.toString()
 * concatenates the same text nodes textContent does. */
function renderedOffsetOf(holder: Element, caret: { node: Node; offset: number }): number {
  const range = document.createRange()
  range.selectNodeContents(holder)
  range.setEnd(caret.node, caret.offset)
  return range.toString().length
}

/* Viewport top of the text line the caret sits on. A collapsed range's rect
 * is the caret's own line box; some positions (element boundaries) have no
 * rect — callers fall back to the block. */
function caretLineTop(caret: { node: Node; offset: number }): number | null {
  const range = document.createRange()
  range.setStart(caret.node, caret.offset)
  range.setEnd(caret.node, caret.offset)
  const rect = range.getClientRects()[0]
  return rect !== undefined && rect.height > 0 ? rect.top : null
}

/* Index of the span covering (or nearest to) a target line. Ties go to the
 * later span: document order puts children after their parents, so nested
 * elements resolve to the most specific one under the line. */
export function nearestSpanIndex(
  spans: readonly { top: number; bottom: number }[],
  target: number
): number {
  let best = -1
  let bestDist = Infinity
  spans.forEach((span, i) => {
    const dist =
      target < span.top ? span.top - target : target > span.bottom ? target - span.bottom : 0
    if (dist <= bestDist) {
      bestDist = dist
      best = i
    }
  })
  return best
}

/* Preview mode: the document rendered by THE export pipeline — what you
 * preview is exactly what HTML and PDF export produce. Read-only by nature;
 * double-clicking any element drops back into the editor at that element's
 * source position (the data-pos stamps). Links open externally instead of
 * navigating the window.
 *
 * The one interactive exception: table column edges. Tables render with
 * their columns proportioned by the model's display widths, and dragging a
 * boundary between two columns redistributes them — written back to the
 * markdown source through the applyEdit hook (absent for the help pane,
 * which is genuinely read-only). */

interface ColumnResize {
  cols: HTMLTableColElement[]
  left: number
  startX: number
  tablePx: number
  startPct: number[]
  totalChars: number
  from: number
  to: number
  lastDelta: number
  onMove: (e: MouseEvent) => void
  onUp: () => void
}

export class Preview {
  private readonly el: HTMLElement
  visible = false

  private markdown = ''
  private docDir: string | null = null
  private resize: ColumnResize | null = null

  constructor(
    private readonly onEdit: (pos: number, screenTop?: number) => void,
    private readonly applyEdit?: (from: number, to: number, insert: string) => string | null
  ) {
    this.el = document.createElement('div')
    this.el.className = 'preview'
    /* The body scroll is locked (overflow: hidden) and hiding the editor
     * drops focus to <body> — the pane itself must hold focus or Space,
     * arrows, and PageDown scroll nothing. */
    this.el.tabIndex = -1
    this.el.hidden = true
    document.body.append(this.el)

    this.el.addEventListener('dblclick', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const holder = target?.closest<HTMLElement>('[data-pos]')
      if (!holder) {
        this.onEdit(0)
        return
      }
      // The viewport top of what was clicked rides along so the editor can
      // land the cursor's line at the same height — the page holds still
      // under the click. When the click resolves to an exact source offset,
      // that's the clicked line's top; on fallback, the block's.
      const blockPos = Number(holder.dataset['pos'])
      const caret = caretAt(event, holder)
      const refined =
        caret === null
          ? null
          : sourceOffsetAt(
              this.markdown,
              blockPos,
              holder.textContent ?? '',
              renderedOffsetOf(holder, caret)
            )
      if (refined === null || caret === null) {
        this.onEdit(blockPos, holder.getBoundingClientRect().top)
      } else {
        this.onEdit(refined, caretLineTop(caret) ?? holder.getBoundingClientRect().top)
      }
    })

    this.el.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const link = target?.closest<HTMLAnchorElement>('a[href]')
      if (!link) return
      event.preventDefault()
      const href = link.getAttribute('href') ?? ''
      if (href.startsWith('#')) {
        // In-document link (GFM footnotes): navigate inside this pane.
        // link.href would resolve against the page URL — file:// (rejected
        // by main's scheme allowlist) or, in dev, the dev server's http URL
        // (which would open the dev server in the user's browser). Scoped to
        // this.el because help and preview panes share one document.
        const id = decodeURIComponent(href.slice(1))
        this.el.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })
        return
      }
      window.foolscap.openExternal(link.href)
    })

    if (this.applyEdit) {
      this.el.addEventListener('mousemove', (event) => {
        if (this.resize) return
        this.el.style.cursor = this.boundaryUnder(event) ? 'col-resize' : ''
      })
      this.el.addEventListener('mousedown', (event) => this.startResize(event))
    }
  }

  async show(markdown: string, docDir: string | null, nearPos: number): Promise<void> {
    this.markdown = markdown
    this.docDir = docDir
    await this.render()
    this.el.hidden = false
    this.visible = true
    this.focus()
    // Land near where the cursor was in the editor.
    if (nearPos > 0) this.scrollTo(nearPos, 'center')
    else this.el.scrollTop = 0
  }

  private async render(): Promise<void> {
    const html = await renderMarkdown(this.markdown, { sourcePositions: true })
    this.el.innerHTML = `<main class="preview-doc">${html}</main>`
    // The pipeline escapes raw HTML, so this is our own output only.
    for (const img of this.el.querySelectorAll('img')) {
      const src = img.getAttribute('src')
      const resolved = src ? resolveImageSrc(src, this.docDir) : null
      if (resolved) img.src = resolved
      else img.removeAttribute('src')
    }
    this.sizeTables()
  }

  /* Scroll the rendered pane to the element covering a source position —
   * outline jumps while previewing land here. */
  scrollTo(pos: number, block: ScrollLogicalPosition = 'start'): void {
    const candidates = [...this.el.querySelectorAll<HTMLElement>('[data-pos]')]
    const stamps = candidates.map((c) => Number(c.dataset['pos']))
    const best = candidates[bestCoveringIndex(stamps, pos)]
    best?.scrollIntoView({ block })
  }

  focus(): void {
    this.el.focus({ preventScroll: true })
  }

  hide(): void {
    this.el.hidden = true
    this.visible = false
  }

  /* Source position and viewport top of the content at the pane's center,
   * so leaving preview (⌘E, Escape) lands the editor where the reader was —
   * same block, same height on screen — not wherever the editor last sat.
   * Read before hide(): a hidden pane has no geometry. */
  visibleAnchor(): { pos: number; top: number } | null {
    const center = this.el.getBoundingClientRect().top + this.el.clientHeight / 2
    const candidates = [...this.el.querySelectorAll<HTMLElement>('[data-pos]')]
    const rects = candidates.map((c) => c.getBoundingClientRect())
    const best = nearestSpanIndex(
      rects.map((r) => ({ top: r.top, bottom: r.bottom })),
      center
    )
    const el = candidates[best]
    const rect = rects[best]
    if (!el || !rect) return null
    return { pos: Number(el.dataset['pos']), top: rect.top }
  }

  /* ---- table columns: proportioned by the model, draggable at edges ---- */

  /* Fixed-layout every table with a colgroup whose percentages mirror the
   * source model's display widths, so a column resized in either mode
   * renders at its recorded proportion here. */
  private sizeTables(): void {
    for (const table of this.el.querySelectorAll<HTMLTableElement>('table[data-pos]')) {
      const source = tableSourceAt(this.markdown, Number(table.dataset['pos']))
      if (!source) continue
      const model = parseTable(source.text)
      const weights = model.header.map((_, i) => columnDisplayWidth(model, i))
      const total = weights.reduce((a, b) => a + b, 0)
      if (weights.length === 0 || total <= 0) continue
      const colgroup = document.createElement('colgroup')
      for (const weight of weights) {
        const col = document.createElement('col')
        col.style.width = `${((weight / total) * 100).toFixed(3)}%`
        colgroup.append(col)
      }
      table.prepend(colgroup)
      table.style.tableLayout = 'fixed'
      table.style.width = '100%'
    }
  }

  /* The column boundary under the pointer: within a few px of the edge
   * between two cells. The table's outer edges are not boundaries. */
  private boundaryUnder(event: MouseEvent): { table: HTMLTableElement; left: number } | null {
    const target = event.target instanceof Element ? event.target : null
    const cell = target?.closest<HTMLTableCellElement>('td, th')
    const table = cell?.closest('table')
    if (!cell || !table || table.dataset['pos'] === undefined) return null
    const row = cell.parentElement
    if (!(row instanceof HTMLTableRowElement)) return null
    const rect = cell.getBoundingClientRect()
    if (cell.cellIndex < row.cells.length - 1 && rect.right - event.clientX <= 5) {
      return { table, left: cell.cellIndex }
    }
    if (cell.cellIndex > 0 && event.clientX - rect.left <= 5) {
      return { table, left: cell.cellIndex - 1 }
    }
    return null
  }

  private startResize(event: MouseEvent): void {
    if (event.button !== 0 || this.resize || !this.applyEdit) return
    const boundary = this.boundaryUnder(event)
    if (!boundary) return
    const from = Number(boundary.table.dataset['pos'])
    const source = tableSourceAt(this.markdown, from)
    const cols = [...boundary.table.querySelectorAll<HTMLTableColElement>('col')]
    if (!source || cols.length === 0) return
    const model = parseTable(source.text)
    if (cols.length !== model.header.length || boundary.left >= model.header.length - 1) return
    event.preventDefault()
    const weights = model.header.map((_, i) => columnDisplayWidth(model, i))
    const total = weights.reduce((a, b) => a + b, 0)
    if (total <= 0) return
    const onMove = (e: MouseEvent): void => this.moveResize(e)
    const onUp = (): void => void this.endResize()
    this.resize = {
      cols,
      left: boundary.left,
      startX: event.clientX,
      tablePx: Math.max(1, boundary.table.getBoundingClientRect().width),
      startPct: weights.map((w) => (w / total) * 100),
      totalChars: total,
      from,
      to: source.to,
      lastDelta: 0,
      onMove,
      onUp
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
  }

  /* Width moves between the two neighbors; the table's own width holds. */
  private moveResize(e: MouseEvent): void {
    const resize = this.resize
    if (!resize) return
    const raw = ((e.clientX - resize.startX) / resize.tablePx) * 100
    const min = (6 / resize.totalChars) * 100
    const leftPct = resize.startPct[resize.left] ?? 0
    const rightPct = resize.startPct[resize.left + 1] ?? 0
    const delta = Math.max(min - leftPct, Math.min(rightPct - min, raw))
    resize.lastDelta = delta
    const colLeft = resize.cols[resize.left]
    const colRight = resize.cols[resize.left + 1]
    if (colLeft) colLeft.style.width = `${(leftPct + delta).toFixed(3)}%`
    if (colRight) colRight.style.width = `${(rightPct - delta).toFixed(3)}%`
  }

  private async endResize(): Promise<void> {
    const resize = this.resize
    if (!resize) return
    this.resize = null
    window.removeEventListener('mousemove', resize.onMove)
    window.removeEventListener('mouseup', resize.onUp)
    document.body.style.cursor = ''
    if (resize.lastDelta === 0 || !this.applyEdit) return
    const leftPct = (resize.startPct[resize.left] ?? 0) + resize.lastDelta
    const rightPct = (resize.startPct[resize.left + 1] ?? 0) - resize.lastDelta
    const source = tableSourceAt(this.markdown, resize.from)
    if (!source) return
    let model = parseTable(source.text)
    model = setColumnWidth(model, resize.left, (leftPct / 100) * resize.totalChars)
    model = setColumnWidth(model, resize.left + 1, (rightPct / 100) * resize.totalChars)
    const next = formatTable(model)
    if (next === source.text) return
    const updated = this.applyEdit(resize.from, resize.to, next)
    if (updated === null) return
    // Re-render: the table's new source length shifts every later data-pos.
    this.markdown = updated
    const scroll = this.el.scrollTop
    await this.render()
    this.el.scrollTop = scroll
  }
}
