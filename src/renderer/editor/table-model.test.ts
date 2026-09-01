import { describe, expect, it } from 'vitest'
import {
  adjustColumnWidth,
  cellRangesOfLine,
  commitCell,
  escapeCellText,
  setCell,
  columnDisplayWidth,
  columnWidth,
  setColumnWidth,
  tableSourceAt,
  cycleAlign,
  deleteColumn,
  formatTable,
  insertColumn,
  insertRow,
  isDelimiterRow,
  normalizeTable,
  parseTable,
  tableCellRanges
} from './table-model'

const MESSY = `| Name | Qty | Price |
|---|:--:|--:|
| apple | 3 | 1.20 |
| pear      | 12 | 0.85 |`

/* Minimal delimiters (three dashes or fewer) carry no width intent, so a
 * messy hand-typed table still tightens to its content. */
const CLEAN = `| Name  | Qty | Price |
| ----- | :-: | ----: |
| apple |  3  |  1.20 |
| pear  | 12  |  0.85 |`

describe('parseTable', () => {
  it('reads header, alignment, and rows', () => {
    const m = parseTable(MESSY)
    expect(m.header).toEqual(['Name', 'Qty', 'Price'])
    expect(m.align).toEqual([null, 'center', 'right'])
    expect(m.rows).toEqual([
      ['apple', '3', '1.20'],
      ['pear', '12', '0.85']
    ])
  })

  it('handles missing outer pipes', () => {
    const m = parseTable('a | b\n--- | ---\n1 | 2')
    expect(m.header).toEqual(['a', 'b'])
    expect(m.rows).toEqual([['1', '2']])
  })

  it('keeps escaped pipes inside cells', () => {
    const m = parseTable('| a \\| b | c |\n| --- | --- |\n| x | y |')
    expect(m.header).toEqual(['a \\| b', 'c'])
  })

  it('pads short rows and truncates long ones to the column count', () => {
    const m = parseTable('| a | b |\n| --- | --- |\n| 1 |\n| 1 | 2 | 3 |')
    expect(m.rows).toEqual([
      ['1', ''],
      ['1', '2']
    ])
  })

  it('preserves leading indent', () => {
    const m = parseTable('  | a |\n  | --- |\n  | 1 |')
    expect(m.indent).toBe('  ')
  })

  it('treats minimal delimiters as carrying no width intent', () => {
    expect(parseTable(MESSY).widths).toEqual([0, 0, 0])
  })

  it('reads long dash runs as recorded column widths', () => {
    expect(parseTable('| a | b |\n| -------- | :------: |\n| x | y |').widths).toEqual([8, 8])
  })
})

describe('isDelimiterRow', () => {
  it('accepts the common variants', () => {
    expect(isDelimiterRow('| --- | :-: |')).toBe(true)
    expect(isDelimiterRow('---|---')).toBe(true)
    expect(isDelimiterRow('| a | b |')).toBe(false)
  })
})

describe('formatTable / normalizeTable', () => {
  it('normalizes a messy table to aligned columns', () => {
    expect(normalizeTable(MESSY)).toBe(CLEAN)
  })

  it('is idempotent', () => {
    const once = normalizeTable(MESSY)
    expect(normalizeTable(once)).toBe(once)
  })

  it('re-applies indent to every line', () => {
    const out = normalizeTable('  | a | b |\n  | --- | --- |\n  | 1 | 2 |')
    for (const line of out.split('\n')) expect(line.startsWith('  |')).toBe(true)
  })

  it('right-aligned columns pad on the left', () => {
    const out = normalizeTable('| n |\n| ---: |\n| 7 |\n| 1234 |')
    expect(out).toContain('|    7 |')
  })

  it('keeps a delimiter wider than its content (a widened column)', () => {
    const wide = '| a        | b   |\n| -------- | --- |\n| x        | y   |'
    expect(normalizeTable(wide)).toBe(wide)
  })
})

describe('adjustColumnWidth', () => {
  const model = parseTable(CLEAN)

  it('widens by growing the delimiter row, survives normalize', () => {
    const widened = formatTable(adjustColumnWidth(model, 0, 4))
    // Name is 5 wide from content; +4 lands at 9.
    expect(widened.split('\n')[1]).toBe('| --------- | :-: | ----: |')
    expect(normalizeTable(widened)).toBe(widened)
  })

  it('narrowing below the content width lands on the content width', () => {
    const widened = adjustColumnWidth(model, 0, 6)
    const back = adjustColumnWidth(widened, 0, -20)
    expect(columnWidth(back, 0)).toBe(5)
    expect(formatTable(back)).toBe(CLEAN)
  })

  it('ignores out-of-range columns', () => {
    expect(adjustColumnWidth(model, 7, 2)).toBe(model)
  })
})

describe('setColumnWidth', () => {
  const model = parseTable(CLEAN)

  it('sets the recorded width outright', () => {
    expect(columnWidth(setColumnWidth(model, 0, 12), 0)).toBe(12)
  })

  it('targets below the content width land on the content width', () => {
    const m = setColumnWidth(model, 0, 1)
    expect(columnWidth(m, 0)).toBe(5)
    expect(formatTable(m)).toBe(CLEAN)
  })

  it('ignores out-of-range columns', () => {
    expect(setColumnWidth(model, 7, 12)).toBe(model)
  })

  it('records widths narrower than the content in the delimiter row', () => {
    const wide = parseTable('| header cell one | b |\n| --------------- | --- |\n| x | y |')
    const out = formatTable(setColumnWidth(wide, 0, 8))
    // Text cells can't shrink below their content; the delimiter can.
    expect(out.split('\n')[0]).toBe('| header cell one | b   |')
    expect(out.split('\n')[1]).toBe('| -------- | --- |')
    expect(columnDisplayWidth(parseTable(out), 0)).toBe(8)
    expect(normalizeTable(out)).toBe(out)
  })
})

describe('tableSourceAt', () => {
  const doc = '# Title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter'

  it('recovers the table text from its start offset', () => {
    const from = doc.indexOf('| a')
    const source = tableSourceAt(doc, from)
    expect(source?.text).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(source ? doc.slice(from, source.to) : '').toBe(source?.text)
  })

  it('returns null off a table', () => {
    expect(tableSourceAt(doc, 0)).toBeNull()
  })
})

describe('cell geometry', () => {
  it('cell content ranges within a table, delimiter row skipped', () => {
    const text = '| ab | c |\n| --- | --- |\n| 1 | 23 |'
    const cells = tableCellRanges(text)
    const slice = (r: { from: number; to: number }): string => text.slice(r.from, r.to)
    expect(cells.map(slice)).toEqual(['ab', 'c', '1', '23'])
  })

  it('empty cells yield collapsed ranges at their content position', () => {
    const text = '| a |   |\n| --- | --- |\n|  | b |'
    const cells = tableCellRanges(text)
    expect(cells).toHaveLength(4)
    expect(cells[1]?.from).toBe(cells[1]?.to)
    expect(cells[2]?.from).toBe(cells[2]?.to)
  })

  it('escaped pipes do not split cells', () => {
    const line = '| a \\| b | c |'
    const cells = cellRangesOfLine(line)
    expect(cells.map((r) => line.slice(r.from, r.to))).toEqual(['a \\| b', 'c'])
  })
})

describe('transforms', () => {
  const model = parseTable(CLEAN)

  it('insertColumn adds an empty column everywhere', () => {
    const m = insertColumn(model, 1)
    expect(m.header).toEqual(['Name', '', 'Qty', 'Price'])
    expect(m.align).toEqual([null, null, 'center', 'right'])
    expect(m.rows[0]).toEqual(['apple', '', '3', '1.20'])
  })

  it('deleteColumn removes a column but never the last one', () => {
    const m = deleteColumn(model, 0)
    expect(m.header).toEqual(['Qty', 'Price'])
    expect(deleteColumn(deleteColumn(m, 0), 0).header).toEqual(['Price'])
  })

  it('cycleAlign walks none → left → center → right → none', () => {
    let m = model
    const seen = []
    for (let i = 0; i < 4; i++) {
      m = cycleAlign(m, 0)
      seen.push(m.align[0])
    }
    expect(seen).toEqual(['left', 'center', 'right', null])
  })

  it('insertRow adds an empty row after the given body index', () => {
    const m = insertRow(model, 0)
    expect(m.rows).toEqual([
      ['apple', '3', '1.20'],
      ['', '', ''],
      ['pear', '12', '0.85']
    ])
    expect(insertRow(model, -1).rows[0]).toEqual(['', '', ''])
  })
})

describe('setCell — one cell, grid-DOM row indexing (0 = header)', () => {
  const model = parseTable(CLEAN)

  it('replaces a header cell at row 0', () => {
    expect(setCell(model, 0, 1, 'Count').header).toEqual(['Name', 'Count', 'Price'])
  })

  it('replaces first and last body cells', () => {
    expect(setCell(model, 1, 0, 'plum').rows[0]).toEqual(['plum', '3', '1.20'])
    expect(setCell(model, 2, 2, '0.99').rows[1]).toEqual(['pear', '12', '0.99'])
  })

  it('empty to text and text to empty', () => {
    expect(setCell(model, 1, 1, '').rows[0]).toEqual(['apple', '', '1.20'])
    expect(setCell(setCell(model, 1, 1, ''), 1, 1, '5').rows[0]).toEqual(['apple', '5', '1.20'])
  })

  it('out-of-range row or column is identity', () => {
    expect(setCell(model, 3, 0, 'x')).toEqual(model)
    expect(setCell(model, -1, 0, 'x')).toEqual(model)
    expect(setCell(model, 0, 3, 'x')).toEqual(model)
    expect(setCell(model, 0, -1, 'x')).toEqual(model)
  })

  it('does not mutate its input', () => {
    setCell(model, 1, 0, 'plum')
    expect(model.rows[0]).toEqual(['apple', '3', '1.20'])
  })
})

describe('escapeCellText — raw cell DOM text to committable content', () => {
  it('identity on plain text and on already-escaped pipes', () => {
    expect(escapeCellText('hello world')).toBe('hello world')
    expect(escapeCellText('a \\| b')).toBe('a \\| b')
  })

  it('escapes a bare pipe so it edits the cell instead of splitting it', () => {
    expect(escapeCellText('a | b')).toBe('a \\| b')
  })

  it('flattens newlines to single spaces and trims', () => {
    expect(escapeCellText('  line one\nline two  ')).toBe('line one line two')
    expect(escapeCellText('a\r\n\r\nb')).toBe('a b')
  })

  it('a trailing backslash before a typed pipe reads as one escaped pipe (GFM ambiguity)', () => {
    expect(escapeCellText('path\\|col')).toBe('path\\|col')
  })
})

describe('commitCell — the whole pure commit pipeline', () => {
  it('one changed cell yields a fully normalized table', () => {
    const next = commitCell(MESSY, 2, 0, 'plum')
    expect(next).toBe(normalizeTable(MESSY).replace('pear ', 'plum '))
  })

  it('null when the raw text matches the cell (no-op commit)', () => {
    expect(commitCell(CLEAN, 1, 0, 'apple')).toBeNull()
    expect(commitCell(CLEAN, 1, 0, '  apple  ')).toBeNull()
  })

  it('a widened column survives a commit', () => {
    const widened = formatTable(setColumnWidth(parseTable(CLEAN), 0, 12))
    const next = commitCell(widened, 1, 0, 'fig')
    expect(next).not.toBeNull()
    expect(columnDisplayWidth(parseTable(next ?? ''), 0)).toBe(12)
  })

  it('a typed pipe round-trips as the same single cell', () => {
    const next = commitCell(CLEAN, 1, 0, 'a | b')
    expect(parseTable(next ?? '').rows[0]?.[0]).toBe('a \\| b')
    expect(parseTable(next ?? '').rows[0]).toHaveLength(3)
  })

  it('Enter on the last row: commit plus insertRow composes cleanly', () => {
    const committed = commitCell(CLEAN, 2, 1, '20')
    const withRow = formatTable(insertRow(parseTable(committed ?? ''), 1))
    const m = parseTable(withRow)
    expect(m.rows).toEqual([
      ['apple', '3', '1.20'],
      ['pear', '20', '0.85'],
      ['', '', '']
    ])
  })
})
