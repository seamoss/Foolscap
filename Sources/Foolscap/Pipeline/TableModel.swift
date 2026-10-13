import Foundation

/* A pipe table as rows of cells with their source ranges — pure, over the
 * table's text, for the grid costume (and, later, the normalizer). Rows
 * are lines; cells split on unescaped pipes; the second line is the
 * delimiter row that carries alignment. */
struct TableModel: Equatable {
  enum Alignment: Equatable { case left, center, right }
  struct Cell: Equatable {
    /* Trimmed content and its range within the table text. */
    let text: String
    let range: NSRange
  }
  struct Row: Equatable {
    let cells: [Cell]
    /* The line's range within the table text. */
    let range: NSRange
  }
  let header: Row
  let delimiter: Row
  let body: [Row]
  let alignments: [Alignment?]

  var columnCount: Int { header.cells.count }
  var rows: [Row] { [header] + body }

  /* The normalizer: pipes aligned into columns, each as wide as its
   * longest cell (display width), the delimiter row carrying alignment.
   * Idempotent; a tidy table formats to itself. */
  func formatted() -> String {
    let n = columnCount
    func cells(_ r: Row) -> [String] { (0..<n).map { $0 < r.cells.count ? r.cells[$0].text : "" } }
    let all = ([header] + body).map(cells)
    var widths = [Int](repeating: 3, count: n)
    for r in all { for (i, c) in r.enumerated() { widths[i] = max(widths[i], Self.displayWidth(c)) } }
    func pad(_ s: String, _ w: Int, _ a: Alignment?) -> String {
      let gap = w - Self.displayWidth(s)
      switch a {
      case .right: return String(repeating: " ", count: gap) + s
      case .center: return String(repeating: " ", count: gap / 2) + s + String(repeating: " ", count: gap - gap / 2)
      default: return s + String(repeating: " ", count: gap)
      }
    }
    var lines: [String] = []
    lines.append("| " + cells(header).enumerated().map { pad($0.element, widths[$0.offset], alignments[safe: $0.offset] ?? nil) }.joined(separator: " | ") + " |")
    lines.append("| " + (0..<n).map { i -> String in
      let a = alignments[safe: i] ?? nil
      let dashes = String(repeating: "-", count: max(1, widths[i] - (a == nil ? 0 : a == .center ? 2 : 1)))
      switch a { case .left: return ":" + dashes; case .right: return dashes + ":"; case .center: return ":" + dashes + ":"; default: return dashes }
    }.joined(separator: " | ") + " |")
    for r in body { lines.append("| " + cells(r).enumerated().map { pad($0.element, widths[$0.offset], alignments[safe: $0.offset] ?? nil) }.joined(separator: " | ") + " |") }
    return lines.joined(separator: "\n")
  }

  /* Columns of a cell as the eye sees them: wide East Asian glyphs count
   * two, combining marks nothing. */
  static func displayWidth(_ s: String) -> Int {
    var w = 0
    for scalar in s.unicodeScalars {
      if scalar.properties.generalCategory == .nonspacingMark { continue }
      w += (scalar.value >= 0x1100 && (scalar.value <= 0x115F || (0x2E80...0xA4CF).contains(scalar.value) || (0xAC00...0xD7A3).contains(scalar.value) || (0xF900...0xFAFF).contains(scalar.value) || (0xFE30...0xFE4F).contains(scalar.value) || (0xFF00...0xFF60).contains(scalar.value) || (0xFFE0...0xFFE6).contains(scalar.value) || (0x1F300...0x1FAFF).contains(scalar.value))) ? 2 : 1
    }
    return w
  }

  /* The cell's text as the grid shows it: a literal <br> is a line break. */
  static func displayLines(_ cell: String) -> [String] {
    cell.replacingOccurrences(of: #"<br\s*/?>"#, with: "\n", options: [.regularExpression, .caseInsensitive]).components(separatedBy: "\n")
  }

  /* The widest single word of a cell — the column's floor. */
  static func longestWord(_ cell: String) -> String {
    displayLines(cell).flatMap { $0.split(separator: " ") }.map(String.init).max { displayWidth($0) < displayWidth($1) } ?? ""
  }

  static func parse(_ text: String) -> TableModel? {
    let ns = text as NSString
    var lines: [NSRange] = []
    ns.enumerateSubstrings(in: NSRange(location: 0, length: ns.length), options: [.byLines, .substringNotRequired]) { _, r, _, _ in lines.append(r) }
    guard lines.count >= 2 else { return nil }
    let rows = lines.map { Row(cells: splitCells(ns, line: $0), range: $0) }
    let delimiter = rows[1]
    let alignments: [Alignment?] = delimiter.cells.map { cell in
      let t = cell.text
      let left = t.hasPrefix(":"), right = t.hasSuffix(":")
      if left && right { return .center }
      if right { return .right }
      if left { return .left }
      return nil
    }
    return TableModel(header: rows[0], delimiter: delimiter, body: Array(rows.dropFirst(2)), alignments: alignments)
  }

  /* Cells between pipes; a leading or trailing pipe is a border, not an
   * empty cell; "\|" stays inside a cell. */
  static func splitCells(_ ns: NSString, line: NSRange) -> [Cell] {
    let s = ns.substring(with: line)
    var cells: [Cell] = []
    var start = 0
    var i = 0
    let chars = Array(s.utf16)
    func close(_ end: Int) {
      let raw = String(utf16CodeUnits: Array(chars[start..<end]), count: end - start)
      let trimmed = raw.trimmingCharacters(in: .whitespaces)
      let lead = raw.prefix { $0 == " " || $0 == "\t" }.utf16.count
      cells.append(Cell(text: trimmed, range: NSRange(location: line.location + start + lead, length: trimmed.utf16.count)))
    }
    while i < chars.count {
      if chars[i] == 0x5C, i + 1 < chars.count { i += 2; continue } // backslash escape
      if chars[i] == 0x7C { // |
        if i == start, cells.isEmpty, s.prefix(i).allSatisfy({ $0 == " " }) { start = i + 1; i += 1; continue } // leading border
        close(i); start = i + 1
      }
      i += 1
    }
    let tail = String(utf16CodeUnits: Array(chars[start..<chars.count]), count: chars.count - start)
    if !tail.trimmingCharacters(in: .whitespaces).isEmpty || cells.isEmpty { close(chars.count) }
    return cells
  }
}

extension Array {
  subscript(safe i: Int) -> Element? { i >= 0 && i < count ? self[i] : nil }
}
