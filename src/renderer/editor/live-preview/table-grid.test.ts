import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState, Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { commitCell } from '../table-model'
import {
  cellAtOffset,
  collectTableGrids,
  entryGrid,
  posOutsideGrid,
  tableGridCoversPos,
  tableGridField
} from './table-grid'

const TABLE = '| a | b |\n| --- | --- |\n| 1 | 2 |'

type Range = number | [number, number]

function grids(doc: string, ranges: Range[]) {
  const selection = EditorSelection.create(
    ranges.map((r) =>
      typeof r === 'number' ? EditorSelection.cursor(r) : EditorSelection.range(r[0], r[1])
    )
  )
  return collectTableGrids(markdownLanguage.parser.parse(doc), Text.of(doc.split('\n')), selection)
}

describe('collectTableGrids — grid specs for tables the selection is outside', () => {
  const doc = `# Title\n\n${TABLE}\n\nafter`
  const from = doc.indexOf('|')
  const to = from + TABLE.length

  it('emits a full-line spec with the exact source text when the cursor is elsewhere', () => {
    expect(grids(doc, [0])).toEqual([{ from, to, text: TABLE }])
    expect(grids(doc, [doc.length])).toEqual([{ from, to, text: TABLE }])
  })

  it('emits nothing when the cursor is in the header, delimiter, or a body cell', () => {
    expect(grids(doc, [from + 2])).toEqual([])
    expect(grids(doc, [doc.indexOf('---')])).toEqual([])
    expect(grids(doc, [doc.indexOf('| 1') + 2])).toEqual([])
  })

  it('boundaries are inclusive: at from or to reveals; one position outside stays a grid', () => {
    expect(grids(doc, [from])).toEqual([])
    expect(grids(doc, [to])).toEqual([])
    expect(grids(doc, [from - 1])).toEqual([{ from, to, text: TABLE }])
    expect(grids(doc, [to + 1])).toEqual([{ from, to, text: TABLE }])
  })

  it('a non-empty selection overlapping one edge reveals the source', () => {
    expect(grids(doc, [[0, from + 3]])).toEqual([])
    expect(grids(doc, [[to - 2, doc.length]])).toEqual([])
  })

  it('multi-cursor: a table with a cursor inside reveals; the other stays a grid', () => {
    const two = `${TABLE}\n\npara\n\n${TABLE}`
    const second = two.lastIndexOf('| a')
    const result = grids(two, [2, two.indexOf('para')])
    expect(result).toEqual([{ from: second, to: two.length, text: TABLE }])
  })

  it('an indented table specs from its line start with the indent in the text', () => {
    const indented = TABLE.split('\n')
      .map((l) => `  ${l}`)
      .join('\n')
    const d = `para\n\n${indented}\n`
    const result = grids(d, [0])
    expect(result).toEqual([{ from: 6, to: 6 + indented.length, text: indented }])
  })

  it('a blockquoted table never grids — its lines carry the quote prefix', () => {
    const quoted = TABLE.split('\n')
      .map((l) => `> ${l}`)
      .join('\n')
    expect(grids(`${quoted}\n\npara`, [0])).toEqual([])
  })

  it('a table ending the document without a trailing newline reaches doc.length', () => {
    const d = `para\n\n${TABLE}`
    expect(grids(d, [0])).toEqual([{ from: 6, to: d.length, text: TABLE }])
  })
})

describe('tableGridField — the decoration flips with the selection', () => {
  const doc = `para\n\n${TABLE}`
  const makeState = (anchor: number) =>
    EditorState.create({
      doc,
      selection: { anchor },
      extensions: [markdown({ base: markdownLanguage }), tableGridField]
    })

  const decoCount = (state: EditorState) => {
    let n = 0
    state.field(tableGridField).deco.between(0, state.doc.length, () => {
      n++
    })
    return n
  }

  it('replaces the table when the selection is outside it', () => {
    expect(decoCount(makeState(0))).toBe(1)
  })

  it('drops the replace when the selection is inside', () => {
    expect(decoCount(makeState(doc.indexOf('---')))).toBe(0)
  })

  it('a selection-only dispatch flips it both ways', () => {
    const inside = makeState(0).update({ selection: { anchor: doc.indexOf('---') } }).state
    expect(decoCount(inside)).toBe(0)
    const outside = inside.update({ selection: { anchor: 0 } }).state
    expect(decoCount(outside)).toBe(1)
  })

  it('tableGridCoversPos: true across the replaced range, false outside or revealed', () => {
    const from = doc.indexOf('|')
    const outside = makeState(0)
    expect(tableGridCoversPos(outside, from)).toBe(true)
    expect(tableGridCoversPos(outside, doc.length)).toBe(true)
    expect(tableGridCoversPos(outside, 0)).toBe(false)
    const inside = makeState(doc.indexOf('---'))
    expect(tableGridCoversPos(inside, from)).toBe(false)
  })

  it('tableGridCoversPos: false when the field is absent (toggle off)', () => {
    const bare = EditorState.create({ doc })
    expect(tableGridCoversPos(bare, 0)).toBe(false)
  })

  it('a commit-shaped change keeps the grid up (selection never touched it)', () => {
    const from = doc.indexOf('|')
    const outside = makeState(0)
    const next = commitCell(TABLE, 2, 0, 'plum')
    expect(next).not.toBeNull()
    const committed = outside.update({
      changes: { from, to: doc.length, insert: next ?? '' },
      userEvent: 'input'
    }).state
    expect(decoCount(committed)).toBe(1)
    expect(tableGridCoversPos(committed, from)).toBe(true)
    expect(committed.sliceDoc(from)).toBe(next)
  })
})

describe('entryGrid — the table a vertical motion should step into', () => {
  const doc = `before\n\n${TABLE}\n\nafter`
  const makeState = (anchor: number | { anchor: number; head: number }) =>
    EditorState.create({
      doc,
      selection: typeof anchor === 'number' ? { anchor } : anchor,
      extensions: [markdown({ base: markdownLanguage }), tableGridField]
    })
  const blankAbove = doc.indexOf('\n\n|') + 1
  const blankBelow = doc.indexOf('|\n\nafter') + 2

  it('finds the grid below from the blank line above, and vice versa', () => {
    expect(entryGrid(makeState(blankAbove), 1)?.text).toBe(TABLE)
    expect(entryGrid(makeState(blankBelow), -1)?.text).toBe(TABLE)
  })

  it('null when no grid is adjacent in that direction', () => {
    expect(entryGrid(makeState(0), 1)).toBeNull()
    expect(entryGrid(makeState(blankAbove), -1)).toBeNull()
    expect(entryGrid(makeState(doc.length), 1)).toBeNull()
  })

  it('null for a non-empty selection (default motion extends and reveals)', () => {
    expect(entryGrid(makeState({ anchor: 0, head: blankAbove }), 1)).toBeNull()
  })
})

describe('cellAtOffset — source offset to grid cell + character index', () => {
  // TABLE lines: '| a | b |' (0-8), '| --- | --- |' (9-21), '| 1 | 2 |' (22-30)

  it('maps a header character precisely', () => {
    expect(cellAtOffset(TABLE, 2)).toEqual({ row: 0, col: 0, index: 0 })
    expect(cellAtOffset(TABLE, 6)).toEqual({ row: 0, col: 1, index: 0 })
  })

  it('maps a body character with its in-cell index', () => {
    const two = TABLE.indexOf('2 |')
    expect(cellAtOffset(TABLE, two + 1)).toEqual({ row: 1, col: 1, index: 1 })
  })

  it('a delimiter-row offset clamps to the header', () => {
    expect(cellAtOffset(TABLE, TABLE.indexOf('---'))).toEqual({ row: 0, col: 0, index: 0 })
  })

  it('an offset in pipe padding clamps into the adjacent cell', () => {
    expect(cellAtOffset(TABLE, 0)).toEqual({ row: 0, col: 0, index: 0 })
    expect(cellAtOffset(TABLE, TABLE.length)).toEqual({ row: 1, col: 1, index: 1 })
  })
})

describe('posOutsideGrid — a caret landing that never reveals the source', () => {
  const doc = `para\n\n${TABLE}`
  const from = doc.indexOf('|')
  const state = EditorState.create({
    doc,
    selection: { anchor: 0 },
    extensions: [markdown({ base: markdownLanguage }), tableGridField]
  })

  it('a position inside the grid moves to just before it', () => {
    expect(posOutsideGrid(state, from + 4)).toBe(from - 1)
    expect(posOutsideGrid(state, doc.length)).toBe(from - 1)
  })

  it('positions outside pass through', () => {
    expect(posOutsideGrid(state, 0)).toBe(0)
    expect(posOutsideGrid(state, from - 1)).toBe(from - 1)
  })

  it('a table opening the document parks the caret after it instead', () => {
    const opens = EditorState.create({
      doc: `${TABLE}\n\npara`,
      selection: { anchor: TABLE.length + 2 },
      extensions: [markdown({ base: markdownLanguage }), tableGridField]
    })
    expect(posOutsideGrid(opens, 4)).toBe(TABLE.length + 1)
  })
})
