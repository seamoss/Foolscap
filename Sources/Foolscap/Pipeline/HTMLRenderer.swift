import Foundation
import Markdown

/* Markup → HTML, the way remark-rehype does it, minus the stuff we never
 * wanted: raw HTML in the source is escaped, never passed through. Output
 * is deterministic — the golden fixtures depend on it byte for byte. */
struct HTMLRenderer: MarkupWalker {
  private var out = ""
  private var listDepth = 0
  /* When present, block elements get data-pos="<utf16 offset>". */
  private let offsets: SourceOffsets?

  init(offsets: SourceOffsets? = nil) { self.offsets = offsets }

  mutating func render(_ document: Document) -> String {
    out = ""
    visit(document)
    return out
  }

  private func pos(_ node: Markup) -> String {
    guard let offsets, let r = offsets.nsRange(node.range) else { return "" }
    return " data-pos=\"\(r.location)\""
  }

  private mutating func wrap(_ tag: String, _ attrs: String = "", _ node: Markup, block: Bool = false) {
    out += "<\(tag)\(attrs)\(pos(node))>"
    if block { out += "\n" }
    descendInto(node)
    out += "</\(tag)>\n"
  }

  static func escape(_ s: String) -> String {
    var r = ""
    r.reserveCapacity(s.utf8.count)
    for ch in s {
      switch ch {
      case "&": r += "&amp;"
      case "<": r += "&lt;"
      case ">": r += "&gt;"
      case "\"": r += "&quot;"
      default: r.append(ch)
      }
    }
    return r
  }

  // ---- blocks
  mutating func visitHeading(_ h: Heading) { wrap("h\(h.level)", "", h) }
  mutating func visitParagraph(_ p: Paragraph) {
    // A paragraph inside a tight list item renders bare, like GFM.
    if let item = p.parent as? ListItem, isTight(item) { descendInto(p) } else { wrap("p", "", p) }
  }
  mutating func visitBlockQuote(_ q: BlockQuote) { wrap("blockquote", "", q, block: true) }
  mutating func visitThematicBreak(_ b: ThematicBreak) { out += "<hr\(pos(b))>\n" }
  mutating func visitCodeBlock(_ c: CodeBlock) {
    let lang = c.language.map { " class=\"language-\(Self.escape($0))\"" } ?? ""
    out += "<pre\(pos(c))><code\(lang)>\(Self.highlighted(c.code, language: c.language))</code></pre>\n"
  }

  /* The fence's code with each token wrapped — the same tokens the editor
   * colours, from the same scanner. Unknown languages escape plainly. */
  static func highlighted(_ code: String, language: String?) -> String {
    guard let language, let spec = Languages.spec(for: language) else { return escape(code) }
    let ns = code as NSString
    var html = ""
    var at = 0
    for t in Highlighter.tokenize(code, language: spec) {
      if t.range.location > at { html += escape(ns.substring(with: NSRange(location: at, length: t.range.location - at))) }
      html += "<span class=\"tok-\(t.kind.rawValue)\">\(escape(ns.substring(with: t.range)))</span>"
      at = NSMaxRange(t.range)
    }
    if at < ns.length { html += escape(ns.substring(from: at)) }
    return html
  }
  mutating func visitHTMLBlock(_ h: HTMLBlock) { out += "<p>\(Self.escape(h.rawHTML))</p>\n" }
  mutating func visitUnorderedList(_ l: UnorderedList) { listDepth += 1; wrap("ul", "", l, block: true); listDepth -= 1 }
  mutating func visitOrderedList(_ l: OrderedList) {
    let start = l.startIndex == 1 ? "" : " start=\"\(l.startIndex)\""
    listDepth += 1; wrap("ol", start, l, block: true); listDepth -= 1
  }
  mutating func visitListItem(_ item: ListItem) {
    out += "<li\(pos(item))>"
    if let box = item.checkbox { out += "<input type=\"checkbox\" disabled\(box == .checked ? " checked" : "")> " }
    descendInto(item)
    out += "</li>\n"
  }
  mutating func visitTable(_ t: Table) { wrap("table", "", t, block: true) }
  mutating func visitTableHead(_ h: Table.Head) {
    out += "<thead>\n<tr>\n"
    for (i, cell) in h.cells.enumerated() { renderCell(cell, "th", align(h.parent as? Table, i)) }
    out += "</tr>\n</thead>\n"
  }
  mutating func visitTableBody(_ b: Table.Body) { wrap("tbody", "", b, block: true) }
  mutating func visitTableRow(_ r: Table.Row) {
    out += "<tr>\n"
    for (i, cell) in r.cells.enumerated() { renderCell(cell, "td", align(r.parent?.parent as? Table, i)) }
    out += "</tr>\n"
  }
  private func align(_ table: Table?, _ column: Int) -> String {
    guard let table, column < table.columnAlignments.count, let a = table.columnAlignments[column] else { return "" }
    switch a { case .left: return " align=\"left\""; case .center: return " align=\"center\""; case .right: return " align=\"right\"" }
  }
  private mutating func renderCell(_ cell: Table.Cell, _ tag: String, _ attrs: String) {
    out += "<\(tag)\(attrs)>"
    descendInto(cell)
    out += "</\(tag)>\n"
  }
  private func isTight(_ item: ListItem) -> Bool {
    // GFM: a list is loose when blank lines separate its items or their
    // blocks. swift-markdown doesn't expose that bit, so: a list is tight
    // unless some item holds more than one paragraph-like block (a nested
    // list under a single paragraph keeps a list tight).
    guard let list = item.parent else { return true }
    return list.children.allSatisfy { sibling in
      sibling.children.filter { !($0 is UnorderedList || $0 is OrderedList) }.count <= 1
    }
  }

  // ---- inlines
  mutating func visitText(_ t: Text) { out += Self.escape(t.string) }
  mutating func visitEmphasis(_ e: Emphasis) { out += "<em>"; descendInto(e); out += "</em>" }
  mutating func visitStrong(_ s: Strong) { out += "<strong>"; descendInto(s); out += "</strong>" }
  mutating func visitStrikethrough(_ s: Strikethrough) { out += "<del>"; descendInto(s); out += "</del>" }
  mutating func visitInlineCode(_ c: InlineCode) { out += "<code>\(Self.escape(c.code))</code>" }
  /* Raw HTML is escaped — except a literal <br>, the only line break a
   * pipe table can hold, which GitHub reads the same way. */
  mutating func visitInlineHTML(_ h: InlineHTML) {
    if h.rawHTML.range(of: #"^<br\s*/?>$"#, options: [.regularExpression, .caseInsensitive]) != nil { out += "<br>" } else { out += Self.escape(h.rawHTML) }
  }
  mutating func visitSoftBreak(_ b: SoftBreak) { out += "\n" }
  mutating func visitLineBreak(_ b: LineBreak) { out += "<br>\n" }
  mutating func visitLink(_ l: Link) {
    out += "<a href=\"\(Self.escape(l.destination ?? ""))\">"
    descendInto(l)
    out += "</a>"
  }
  mutating func visitImage(_ i: Image) {
    let alt = i.children.compactMap { ($0 as? Text)?.string }.joined()
    let title = i.title.map { " title=\"\(Self.escape($0))\"" } ?? ""
    out += "<img src=\"\(Self.escape(i.source ?? ""))\" alt=\"\(Self.escape(alt))\"\(title)>"
  }
}
