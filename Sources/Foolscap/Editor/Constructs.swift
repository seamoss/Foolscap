import Foundation
import Markdown

/* What the live preview styles: one parse of the text (the one pipeline),
 * walked into flat records of ranges — the construct, its marks (the
 * delimiters: whatever the node's range covers that its content doesn't),
 * and its content. Pure, so the golden-fixture documents can pin every
 * range in tests. Kinds arrive in the Electron app's construct order. */
struct Construct: Equatable {
  enum Kind: Equatable {
    case heading(level: Int)
    case strong, emphasis, strikethrough, code
    case link(destination: String)
    case image(source: String)
    case listItem(depth: Int, ordered: Bool)
    case taskCheckbox(checked: Bool)
    case blockQuote
    case thematicBreak
    case codeBlock(language: String?, fenced: Bool)
    case table
  }
  let kind: Kind
  /* The whole construct, delimiters included. */
  let range: NSRange
  /* The delimiters, each a range of its own: ghost or soft by adjacency. */
  let marks: [NSRange]
  /* What the delimiters wrap. */
  let content: NSRange
}

func collectConstructs(_ text: String) -> [Construct] {
  let document = Pipeline.parse(text)
  var walker = ConstructWalker(text: text, offsets: SourceOffsets(text))
  walker.visit(document)
  return walker.out
}

private struct ConstructWalker: MarkupWalker {
  let text: String
  let offsets: SourceOffsets
  var out: [Construct] = []
  private var listDepth = 0
  private let ns: NSString

  init(text: String, offsets: SourceOffsets) {
    self.text = text
    self.offsets = offsets
    self.ns = text as NSString
  }

  /* Marks = node range minus the union of its children's ranges: a prefix
   * and a suffix, wherever the grammar puts them. */
  private mutating func record(_ node: Markup, _ kind: Construct.Kind) {
    guard let range = offsets.nsRange(node.range) else { return }
    let children = node.children.compactMap { offsets.nsRange($0.range) }
    let contentStart = children.first?.location ?? NSMaxRange(range)
    let contentEnd = children.last.map(NSMaxRange) ?? NSMaxRange(range)
    var marks: [NSRange] = []
    if contentStart > range.location { marks.append(NSRange(location: range.location, length: contentStart - range.location)) }
    if NSMaxRange(range) > contentEnd { marks.append(NSRange(location: contentEnd, length: NSMaxRange(range) - contentEnd)) }
    out.append(Construct(kind: kind, range: range, marks: marks, content: NSRange(location: contentStart, length: max(0, contentEnd - contentStart))))
  }

  // ---- inlines
  mutating func visitHeading(_ h: Heading) { record(h, .heading(level: h.level)); descendInto(h) }
  mutating func visitStrong(_ s: Strong) { record(s, .strong); descendInto(s) }
  mutating func visitEmphasis(_ e: Emphasis) { record(e, .emphasis); descendInto(e) }
  mutating func visitStrikethrough(_ s: Strikethrough) { record(s, .strikethrough); descendInto(s) }
  mutating func visitLink(_ l: Link) { record(l, .link(destination: l.destination ?? "")); descendInto(l) }
  mutating func visitImage(_ i: Image) { record(i, .image(source: i.source ?? "")); descendInto(i) }
  mutating func visitInlineCode(_ code: InlineCode) {
    // No children: the content is the range minus one backtick run a side.
    guard let range = offsets.nsRange(code.range) else { return }
    let fence = max(1, (range.length - (code.code as NSString).length) / 2)
    let content = NSRange(location: range.location + fence, length: max(0, range.length - 2 * fence))
    out.append(Construct(kind: .code, range: range, marks: [NSRange(location: range.location, length: fence), NSRange(location: NSMaxRange(range) - fence, length: fence)], content: content))
  }

  // ---- blocks
  mutating func visitUnorderedList(_ l: UnorderedList) { listDepth += 1; descendInto(l); listDepth -= 1 }
  mutating func visitOrderedList(_ l: OrderedList) { listDepth += 1; descendInto(l); listDepth -= 1 }
  mutating func visitListItem(_ item: ListItem) {
    if let range = offsets.nsRange(item.range) {
      let firstChild = item.children.compactMap { offsets.nsRange($0.range) }.first
      // The marker runs from the item's start to its first block's start
      // ("- ", "12. "); an empty item is all marker.
      let markerEnd = firstChild?.location ?? NSMaxRange(range)
      var marker = NSRange(location: range.location, length: markerEnd - range.location)
      let ordered = item.parent is OrderedList
      // A task box sits inside the marker span: "- [x] " — split it out.
      if let box = item.checkbox, marker.length >= 4 {
        let markerText = ns.substring(with: marker)
        if let r = markerText.range(of: #"\[[ xX]\]"#, options: .regularExpression) {
          let boxRange = NSRange(r, in: markerText)
          let abs = NSRange(location: marker.location + boxRange.location, length: boxRange.length)
          marker = NSRange(location: marker.location, length: boxRange.location)
          out.append(Construct(kind: .listItem(depth: listDepth, ordered: ordered), range: range, marks: [marker], content: NSRange(location: NSMaxRange(abs), length: NSMaxRange(range) - NSMaxRange(abs))))
          out.append(Construct(kind: .taskCheckbox(checked: box == .checked), range: abs, marks: [], content: abs))
          descendInto(item)
          return
        }
      }
      out.append(Construct(kind: .listItem(depth: listDepth, ordered: ordered), range: range, marks: [marker], content: NSRange(location: markerEnd, length: NSMaxRange(range) - markerEnd)))
    }
    descendInto(item)
  }
  mutating func visitBlockQuote(_ q: BlockQuote) {
    if let range = offsets.nsRange(q.range) {
      // One mark per line: the leading ">" and the space after it.
      var marks: [NSRange] = []
      let ns = self.ns
      ns.enumerateSubstrings(in: range, options: [.byLines, .substringNotRequired]) { _, lineRange, _, _ in
        let line = ns.substring(with: lineRange)
        if let r = line.range(of: #"^[ \t]*>[ \t]?"#, options: .regularExpression) {
          let m = NSRange(r, in: line)
          marks.append(NSRange(location: lineRange.location + m.location, length: m.length))
        }
      }
      out.append(Construct(kind: .blockQuote, range: range, marks: marks, content: range))
    }
    descendInto(q)
  }
  mutating func visitTable(_ t: Table) {
    // Whole lines, so the grid costume can own every row paragraph.
    guard let range = offsets.nsRange(t.range) else { return }
    let first = ns.lineRange(for: NSRange(location: range.location, length: 0))
    let end = NSMaxRange(range)
    let lastLine = ns.lineRange(for: NSRange(location: max(range.location, end - 1), length: 0))
    let whole = NSRange(location: first.location, length: max(end, min(NSMaxRange(lastLine), ns.length)) - first.location)
    // Marks: every pipe in the table, so source mode recedes them.
    var marks: [NSRange] = []
    let text = ns.substring(with: whole)
    var escaped = false
    var i = 0
    for u in text.utf16 {
      if escaped { escaped = false } else if u == 0x5C { escaped = true } else if u == 0x7C { marks.append(NSRange(location: whole.location + i, length: 1)) }
      i += 1
    }
    out.append(Construct(kind: .table, range: whole, marks: marks, content: whole))
    // No descent: a table's inline constructs render inside the grid, not
    // as attributes over source that the grid hides.
  }

  mutating func visitThematicBreak(_ b: ThematicBreak) {
    guard let range = offsets.nsRange(b.range) else { return }
    out.append(Construct(kind: .thematicBreak, range: range, marks: [range], content: range))
  }
  mutating func visitCodeBlock(_ c: CodeBlock) {
    guard let range = offsets.nsRange(c.range) else { return }
    let head = ns.substring(with: range)
    let fenced = head.hasPrefix("```") || head.hasPrefix("~~~")
    var marks: [NSRange] = []
    var content = range
    if fenced {
      // First line (fence + info string) and last line (closing fence).
      let first = ns.lineRange(for: NSRange(location: range.location, length: 0))
      let lastStart = NSMaxRange(range) > first.location ? ns.lineRange(for: NSRange(location: NSMaxRange(range) - 1, length: 0)) : first
      marks.append(NSRange(location: first.location, length: min(first.length, NSMaxRange(range) - first.location)))
      if lastStart.location > first.location { marks.append(NSRange(location: lastStart.location, length: NSMaxRange(range) - lastStart.location)) }
      let start = NSMaxRange(first)
      content = NSRange(location: start, length: max(0, lastStart.location - start))
    }
    out.append(Construct(kind: .codeBlock(language: c.language, fenced: fenced), range: range, marks: marks, content: content))
  }
}
