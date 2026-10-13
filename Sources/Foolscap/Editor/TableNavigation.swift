import Foundation

/* Tab walks cells, Enter adds a row — in a table's source, as plain edits.
 * Pure: the text view applies what comes back. */
enum TableNavigation {
  private static func table(at selection: NSRange, _ constructs: [Construct]) -> Construct? {
    constructs.first { $0.kind == .table && $0.range.location <= selection.location && NSMaxRange($0.range) >= selection.location }
  }

  static func tab(in text: NSString, selection: NSRange, constructs: [Construct], backward: Bool) -> TextEdit? {
    guard let t = table(at: selection, constructs), let model = TableModel.parse(text.substring(with: t.range)) else { return nil }
    let rows = [model.header] + model.body
    var cells: [NSRange] = []
    for r in rows { for c in r.cells { cells.append(NSRange(location: t.range.location + c.range.location, length: c.range.length)) } }
    guard !cells.isEmpty else { return nil }
    let caret = selection.location
    var i = cells.firstIndex { caret <= NSMaxRange($0) + 1 && caret >= $0.location - 2 } ?? (backward ? 0 : cells.count - 1)
    i += backward ? -1 : 1
    if i < 0 { i = 0 }
    if i >= cells.count {
      // Past the last cell: append an empty row and land in its first cell.
      let n = model.columnCount
      let newRow = "\n| " + (0..<n).map { _ in " " }.joined(separator: " | ") + " |"
      let at = NSMaxRange(t.range) - (text.substring(with: t.range).hasSuffix("\n") ? 1 : 0)
      return TextEdit(range: NSRange(location: at, length: 0), replacement: newRow, selection: NSRange(location: at + 3, length: 0))
    }
    return TextEdit(range: NSRange(location: caret, length: 0), replacement: "", selection: cells[i])
  }

  static func enter(in text: NSString, selection: NSRange, constructs: [Construct]) -> TextEdit? {
    guard let t = table(at: selection, constructs), let model = TableModel.parse(text.substring(with: t.range)) else { return nil }
    let line = text.lineRange(for: NSRange(location: selection.location, length: 0))
    let n = model.columnCount
    let newRow = "| " + (0..<n).map { _ in " " }.joined(separator: " | ") + " |\n"
    let at = min(NSMaxRange(line), text.length)
    let needsNewline = at == text.length || text.character(at: at - 1) != 0x0A
    return TextEdit(range: NSRange(location: at, length: 0), replacement: (needsNewline ? "\n" : "") + newRow, selection: NSRange(location: at + (needsNewline ? 1 : 0) + 2, length: 0))
  }
}
