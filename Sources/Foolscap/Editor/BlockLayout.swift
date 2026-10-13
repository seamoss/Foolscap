import AppKit

/* What a paragraph's layout fragment draws beyond its glyphs — the costume
 * for blocks, decided per paragraph from the construct list. Pure, so the
 * fixtures can pin it. TextKit 2 lays out one fragment per paragraph and
 * asks the editor (NSTextLayoutManagerDelegate) which class to use; the
 * answer comes from here. */
enum BlockDecoration: Equatable {
  /* A sunk fill across the measure: quotes and code blocks. */
  case fill
  /* A hairline across the measure, the source text receded above it. */
  case rule
  /* An image drawn beneath its source line, from a path relative to the
   * document. */
  case image(source: String)
  /* One row of a table drawn as a grid: this paragraph's cells, the
   * column layout shared by the whole table, and which row it is. */
  case tableRow(TableRowLayout)
}

/* Everything a row fragment needs to draw itself, measured once per table
 * by the styler. Column widths are in points. */
struct TableRowLayout: Equatable {
  enum Role: Equatable { case header, delimiter, body }
  let role: Role
  /* Cell text with <br> already turned into line breaks. */
  let cells: [String]
  let columnWidths: [CGFloat]
  let alignments: [TableModel.Alignment?]
  let isFirst: Bool
  let isLast: Bool
}

func blockDecoration(forParagraph paragraph: NSRange, in text: NSString, constructs: [Construct], tables: (NSRange) -> TableRowLayout? = { _ in nil }) -> BlockDecoration? {
  let trimmed = text.substring(with: paragraph).trimmingCharacters(in: .whitespacesAndNewlines)
  for c in constructs where NSIntersectionRange(c.range, paragraph).length > 0 || (c.range.length == 0 && paragraph.contains(c.range.location)) {
    switch c.kind {
    case .table:
      // Revealed (caret inside) tables answer nil here: plain source.
      if let row = tables(paragraph) { return .tableRow(row) }
      return nil
    case .blockQuote, .codeBlock: return .fill
    case .thematicBreak: return .rule
    case .image(let source):
      // Only a paragraph that is nothing but the image gets a picture;
      // an inline image in prose keeps its receded markup.
      if text.substring(with: c.range) == trimmed { return .image(source: source) }
    default: continue
    }
  }
  return nil
}

/* Toggle the task box at an offset: the one edit the costume makes, and
 * it goes through the text view as a real, undoable insertion. */
func checkboxToggle(at offset: Int, constructs: [Construct]) -> (range: NSRange, replacement: String)? {
  guard let box = constructs.first(where: { if case .taskCheckbox = $0.kind { return $0.range.contains(offset) || NSMaxRange($0.range) == offset } else { return false } }),
        case .taskCheckbox(let checked) = box.kind else { return nil }
  return (box.range, checked ? "[ ]" : "[x]")
}
