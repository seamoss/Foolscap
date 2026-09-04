/* The pure table core (Phase 4). Everything that understands pipe-table
 * text lives here: parsing, the normalizing formatter (ULTRAPLAN §7:
 * "round-trip to clean pipe-table markdown, column widths normalized"),
 * and the structural transforms the hover controls and keymaps apply.
 * No CodeMirror, no DOM — plain strings in, plain strings out. */

export type Align = 'left' | 'center' | 'right' | null

export interface TableModel {
  /* Leading indent of the table (first line's), reapplied to every line. */
  indent: string
  header: string[]
  align: Align[]
  /* Per-column minimum width, carried by the delimiter row's cell length.
   * GFM ignores dash count, so a widened column is still a proper pipe
   * table everywhere, and the width lives in the file itself. */
  widths: number[]
  rows: string[][]
}

/* Split a row line into cells on unescaped pipes; outer pipes optional. */
function splitRow(line: string): string[] {
  const trimmed = line.trim()
  const cells: string[] = []
  let current = ''
  let start = 0
  if (trimmed.startsWith('|')) start = 1
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '\\|'
      i++
    } else if (ch === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim() !== '' || !trimmed.endsWith('|')) cells.push(current.trim())
  return cells
}

const DELIMITER_CELL = /^:?-+:?$/

function delimiterAlign(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

/* A delimiter cell records a column width when its dash run is longer than
 * the minimal hand-typed forms (---, :---, ---:, :---:). GFM ignores dash
 * count, so the run is a free channel: our formatter writes the recorded
 * width there, and a hand-padded delimiter matching its column says the
 * same thing. Short runs mean "no opinion" — the content decides. */
function recordedWidth(cell: string): number {
  const dashes = cell.length - (cell.startsWith(':') ? 1 : 0) - (cell.endsWith(':') ? 1 : 0)
  return dashes >= 4 ? cell.length : 0
}

export function isDelimiterRow(line: string): boolean {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((c) => DELIMITER_CELL.test(c))
}

export function parseTable(text: string): TableModel {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  const indent = /^[ \t]*/.exec(lines[0] ?? '')?.[0] ?? ''
  const header = splitRow(lines[0] ?? '')
  const delimiter =
    lines.length > 1 && isDelimiterRow(lines[1] ?? '') ? splitRow(lines[1] ?? '') : null
  const align: Align[] = delimiter ? delimiter.map(delimiterAlign) : header.map(() => null)
  const rows = lines.slice(2).map(splitRow)

  // Column count is fixed by the widest of header/delimiter; rows are
  // padded or truncated to it, GFM-style.
  const columns = Math.max(header.length, align.length)
  const fit = (cells: string[]): string[] =>
    Array.from({ length: columns }, (_, i) => cells[i] ?? '')
  return {
    indent,
    header: fit(header),
    align: Array.from({ length: columns }, (_, i) => align[i] ?? null),
    widths: Array.from({ length: columns }, (_, i) => recordedWidth(delimiter?.[i] ?? '')),
    rows: rows.map(fit)
  }
}

/* Naive display width — CJK and emoji count as 1. Good enough to line up
 * the common case; revisit with a real width table if it ever matters. */
const width = (s: string): number => s.length

function pad(cell: string, target: number, align: Align): string {
  const gap = Math.max(0, target - width(cell))
  if (align === 'right') return ' '.repeat(gap) + cell
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + cell + ' '.repeat(gap - left)
  }
  return cell + ' '.repeat(gap)
}

function delimiterCell(align: Align, target: number): string {
  const dashes = (n: number): string => '-'.repeat(Math.max(1, n))
  if (align === 'center') return `:${dashes(target - 2)}:`
  if (align === 'right') return `${dashes(target - 1)}:`
  if (align === 'left') return `:${dashes(target - 1)}`
  return dashes(target)
}

/* Width formatTable pads column `at` to: its widest content, but never
 * narrower than a recorded width above it — that's what lets a
 * user-widened column survive normalization and a file round-trip. */
export function columnWidth(model: TableModel, at: number): number {
  let max = Math.max(3, model.widths[at] ?? 0, width(model.header[at] ?? ''))
  for (const row of model.rows) max = Math.max(max, width(row[at] ?? ''))
  return max
}

/* Width the column *reads* as: the recorded intent when present — even one
 * narrower than the content, which text padding can't express — else the
 * content width. Preview column ratios come from this. */
export function columnDisplayWidth(model: TableModel, at: number): number {
  const recorded = model.widths[at] ?? 0
  if (recorded > 0) return Math.max(3, recorded)
  return columnWidth(model, at)
}

export function formatTable(model: TableModel): string {
  const columns = model.header.length
  const widths = Array.from({ length: columns }, (_, i) => columnWidth(model, i))
  const line = (cells: string[]): string =>
    `${model.indent}| ${cells.join(' | ')} |`
  const headerLine = line(
    model.header.map((c, i) => pad(c, widths[i] ?? 3, model.align[i] ?? null))
  )
  // The delimiter carries the recorded width verbatim — shorter than the
  // padded cells when a column was narrowed below its content.
  const delimiterLine = line(
    model.align.map((a, i) => {
      const recorded = model.widths[i] ?? 0
      return delimiterCell(a, recorded > 0 ? recorded : (widths[i] ?? 3))
    })
  )
  const rowLines = model.rows.map((row) =>
    line(row.map((c, i) => pad(c, widths[i] ?? 3, model.align[i] ?? null)))
  )
  return [headerLine, delimiterLine, ...rowLines].join('\n')
}

/* Normalized form of table text; identity for already-clean tables. */
export function normalizeTable(text: string): string {
  return formatTable(parseTable(text))
}

/* ---- cell geometry (for navigation) ----
 * Text-based rather than tree-based: the lezer grammar emits no TableCell
 * node for empty cells, and freshly inserted rows are all empty. */

export interface CellRange {
  from: number
  to: number
}

/* Content ranges of each cell in one row line, relative to line start.
 * Empty cells yield a collapsed range at their natural content position. */
export function cellRangesOfLine(line: string): CellRange[] {
  const ranges: CellRange[] = []
  let i = 0
  if (line.trimStart().startsWith('|')) i = line.indexOf('|') + 1
  let segStart = i
  const closeSegment = (segEnd: number): void => {
    const seg = line.slice(segStart, segEnd)
    const leading = seg.length - seg.trimStart().length
    const trailing = seg.length - seg.trimEnd().length
    if (seg.trim() === '') {
      const at = segStart + Math.min(1, seg.length)
      ranges.push({ from: at, to: at })
    } else {
      ranges.push({ from: segStart + leading, to: segEnd - trailing })
    }
  }
  for (; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      i++
    } else if (line[i] === '|') {
      closeSegment(i)
      segStart = i + 1
    }
  }
  const tail = line.slice(segStart)
  if (tail.trim() !== '') closeSegment(line.length)
  return ranges
}

/* All navigable cell ranges of a table, relative to the table text start,
 * in document order, skipping the delimiter row. */
export function tableCellRanges(text: string): CellRange[] {
  const ranges: CellRange[] = []
  let offset = 0
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (!(index === 1 && isDelimiterRow(line)) && line.trim() !== '') {
      for (const range of cellRangesOfLine(line)) {
        ranges.push({ from: offset + range.from, to: offset + range.to })
      }
    }
    offset += line.length + 1
  })
  return ranges
}

/* ---- transforms ---- */

export function insertColumn(model: TableModel, at: number): TableModel {
  const clamp = Math.max(0, Math.min(at, model.header.length))
  const splice = <T>(arr: T[], value: T): T[] => [
    ...arr.slice(0, clamp),
    value,
    ...arr.slice(clamp)
  ]
  return {
    ...model,
    header: splice(model.header, ''),
    align: splice(model.align, null),
    widths: splice(model.widths, 0),
    rows: model.rows.map((row) => splice(row, ''))
  }
}

export function deleteColumn(model: TableModel, at: number): TableModel {
  if (model.header.length <= 1) return model
  const remove = <T>(arr: T[]): T[] => arr.filter((_, i) => i !== at)
  return {
    ...model,
    header: remove(model.header),
    align: remove(model.align),
    widths: remove(model.widths),
    rows: model.rows.map(remove)
  }
}

export const COLUMN_WIDTH_STEP = 2

/* Set the column's recorded width outright. Below 6 the intent can't
 * survive the delimiter encoding (a short dash run reads as a hand-typed
 * minimal delimiter), so it clears instead — the content decides again. */
export function setColumnWidth(model: TableModel, at: number, target: number): TableModel {
  if (at < 0 || at >= model.header.length) return model
  const rounded = Math.round(target)
  const clamped = rounded >= 6 ? rounded : 0
  return {
    ...model,
    widths: Array.from({ length: model.header.length }, (_, i) =>
      i === at ? clamped : (model.widths[i] ?? 0)
    )
  }
}

/* Set the column's recorded width relative to its current display width. */
export function adjustColumnWidth(model: TableModel, at: number, delta: number): TableModel {
  if (at < 0 || at >= model.header.length) return model
  return setColumnWidth(model, at, columnDisplayWidth(model, at) + delta)
}

/* The consecutive pipe-carrying lines starting at `from` — a rendered
 * table's source text, recovered from its data-pos stamp. Null unless at
 * least a header and delimiter line are present. */
export function tableSourceAt(
  markdown: string,
  from: number
): { text: string; to: number } | null {
  let at = from
  let end = from
  let count = 0
  while (at < markdown.length) {
    const nl = markdown.indexOf('\n', at)
    const lineEnd = nl === -1 ? markdown.length : nl
    const line = markdown.slice(at, lineEnd)
    if (line.trim() === '' || !line.includes('|')) break
    count++
    end = lineEnd
    if (nl === -1) break
    at = nl + 1
  }
  return count >= 2 ? { text: markdown.slice(from, end), to: end } : null
}

const ALIGN_CYCLE: Align[] = [null, 'left', 'center', 'right']

export function cycleAlign(model: TableModel, at: number): TableModel {
  const current = model.align[at] ?? null
  const next = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(current) + 1) % ALIGN_CYCLE.length] ?? null
  return { ...model, align: model.align.map((a, i) => (i === at ? next : a)) }
}

/* Insert an empty row after body-row index `after` (-1 = right under the
 * header). */
export function insertRow(model: TableModel, after: number): TableModel {
  const empty = model.header.map(() => '')
  const at = Math.max(0, Math.min(after + 1, model.rows.length))
  return {
    ...model,
    rows: [...model.rows.slice(0, at), empty, ...model.rows.slice(at)]
  }
}

/* ---- In-place cell editing (table grid): the pure commit pipeline ---- */

/* Replace one cell's content. Row indexing matches the grid widget's DOM:
 * row 0 is the header, row n >= 1 is body row n - 1 (the delimiter is not
 * a row). Out-of-range coordinates return the model unchanged. */
export function setCell(model: TableModel, row: number, col: number, text: string): TableModel {
  if (col < 0 || col >= model.header.length) return model
  if (row === 0) {
    return { ...model, header: model.header.map((c, i) => (i === col ? text : c)) }
  }
  const body = row - 1
  if (body < 0 || body >= model.rows.length) return model
  return {
    ...model,
    rows: model.rows.map((r, i) => (i === body ? r.map((c, j) => (j === col ? text : c)) : r))
  }
}

/* ---- Line breaks inside a cell ----
 * A pipe table has no way to break a line inside a cell — a newline ends
 * the row — so the convention, GitHub's included, is a literal <br>. The
 * grid shows one as a real break and Shift-Enter types one; the file
 * keeps plain pipes with a <br> in the cell, readable anywhere. */

const BR_TAG = /<br\s*\/?>/gi

export type CellSegment = { kind: 'text'; text: string } | { kind: 'break'; source: string }

/* Split cell source on <br> tags (<br>, <br/>, <br />, any case), keeping
 * each tag's exact spelling so a rendered cell reads back byte-identical.
 * Empty text runs are dropped; the segments concatenate to the source. */
export function cellSegments(text: string): CellSegment[] {
  const segments: CellSegment[] = []
  let last = 0
  for (const match of text.matchAll(BR_TAG)) {
    const at = match.index ?? 0
    if (at > last) segments.push({ kind: 'text', text: text.slice(last, at) })
    segments.push({ kind: 'break', source: match[0] })
    last = at + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })
  return segments
}

/* Raw cell-DOM text -> committable content: newlines (Shift-Enter types
 * one; a paste can carry them) become <br>, the one line break a cell can
 * hold, with the spaces around each stripped; edges trim; and bare pipes
 * escape so a typed | edits the cell instead of splitting it. An existing
 * \| passes through untouched — the same already-escaped reading splitRow
 * applies, which also means a cell ending in a literal backslash followed
 * by a typed pipe reads as one escaped pipe; that ambiguity is GFM's own. */
export function escapeCellText(raw: string): string {
  const flat = raw
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/[ \t]*\n[ \t]*/g, '<br>')
  let out = ''
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]
    if (ch === '\\' && flat[i + 1] === '|') {
      out += '\\|'
      i++
    } else if (ch === '|') {
      out += '\\|'
    } else {
      out += ch
    }
  }
  return out
}

/* The whole commit pipeline for one edited cell: parse, sanitize, set,
 * reformat. Null when the result is byte-identical to the input — a no-op
 * commit costs the caller nothing (no transaction, no widget rebuild). */
export function commitCell(text: string, row: number, col: number, raw: string): string | null {
  const next = formatTable(setCell(parseTable(text), row, col, escapeCellText(raw)))
  return next === text ? null : next
}
