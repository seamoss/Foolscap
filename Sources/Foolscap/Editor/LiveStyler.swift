import AppKit

/* Live preview: every keystroke re-parses the whole document through the
 * one pipeline (Constructs.swift) and re-applies attributes to the whole
 * storage; selection-only changes re-colour marks without re-parsing.
 * Phase 2 narrows this to the visible range once documents grow.
 *
 * Fonts, colours, paragraph styles, and backgrounds go on the
 * NSTextStorage as presentation attributes. The string is never touched:
 * these edits run outside the text view's undo path, so they neither
 * register as edits nor dirty the document. */
@MainActor
final class LiveStyler {
  private unowned let textView: NSTextView
  private(set) var constructs: [Construct] = []
  /* Grid layouts per table range, measured on restyle; a table the caret
   * is inside is "revealed" and shows source instead. */
  private var tableLayouts: [NSRange: [NSRange: TableRowLayout]] = [:]
  private var revealedTables: Set<NSRange> = []
  /* The desk observes: outline, word count. */
  var onRestyle: ((NSString, [Construct]) -> Void)?
  /* Focus mode: everything but the caret's paragraph dims, through
   * rendering attributes (no layout change). */
  var focusMode = false { didSet { if focusMode != oldValue { applyFocus(selection: textView.selectedRange()) } } }
  /* Pictures by source path, loaded once; dropped when the document moves. */
  private var images: [String: NSImage] = [:]
  var baseURL: URL? { didSet { if baseURL != oldValue { images.removeAll() } } }

  init(textView: NSTextView) { self.textView = textView }

  func restyle(selection: NSRange) {
    guard let storage = textView.textStorage else { return }
    constructs = collectConstructs(storage.string)
    storage.beginEditing()
    storage.setAttributes(Tokens.Typography.bodyAttributes, range: NSRange(location: 0, length: storage.length))
    // Blocks first, inlines over them: a bold word inside a quote keeps
    // the quote's fill and its own weight.
    for c in constructs where c.kind.isBlock { apply(c, to: storage) }
    for c in constructs where !c.kind.isBlock { apply(c, to: storage) }
    for c in constructs { colorMarks(c, selection: selection, in: storage) }
    storage.endEditing()
    measureTables(storage.string as NSString)
    revealedTables = Set(constructs.filter { $0.kind == .table && selectionTouches(selection, $0.range) }.map(\.range))
    applyFocus(selection: selection)
    onRestyle?(storage.string as NSString, constructs)
  }

  private func applyFocus(selection: NSRange) {
    guard let tlm = textView.textLayoutManager, let cs = textView.textContentStorage else { return }
    tlm.removeRenderingAttribute(.foregroundColor, for: tlm.documentRange)
    guard focusMode, let storage = textView.textStorage else { return }
    let ns = storage.string as NSString
    let para = ns.paragraphRange(for: NSRange(location: min(selection.location, ns.length), length: 0))
    let dim = Tokens.Palette.ink.withAlphaComponent(0.3)
    func range(_ r: NSRange) -> NSTextRange? {
      guard r.length > 0, let s = cs.location(cs.documentRange.location, offsetBy: r.location), let e = cs.location(s, offsetBy: r.length) else { return nil }
      return NSTextRange(location: s, end: e)
    }
    if let before = range(NSRange(location: 0, length: para.location)) { tlm.setRenderingAttributes([.foregroundColor: dim], for: before) }
    if let after = range(NSRange(location: NSMaxRange(para), length: ns.length - NSMaxRange(para))) { tlm.setRenderingAttributes([.foregroundColor: dim], for: after) }
  }

  /* The caret left a table: tidy its pipes, as one undoable edit — in the
   * file itself, so it's tidy everywhere. Returns the edit for the view. */
  func normalizerEdit(leaving tables: Set<NSRange>) -> TextEdit? {
    guard let storage = textView.textStorage else { return nil }
    let ns = storage.string as NSString
    for r in tables where NSMaxRange(r) <= ns.length {
      let source = ns.substring(with: r)
      let trailing = source.hasSuffix("\n") ? "\n" : ""
      guard let model = TableModel.parse(source) else { continue }
      let tidy = model.formatted() + trailing
      if tidy != source { return TextEdit(range: r, replacement: tidy, selection: textView.selectedRange()) }
    }
    return nil
  }

  private func measureTables(_ ns: NSString) {
    tableLayouts.removeAll()
    let font = Tokens.Typography.regular
    let pad = Tokens.Layout.cellPadding * 2
    for c in constructs where c.kind == .table {
      guard let model = TableModel.parse(ns.substring(with: c.range)) else { continue }
      // A column is never narrower than its longest word, or 3em.
      let em = Tokens.Typography.bodySize
      var widths = [CGFloat](repeating: 3 * em, count: model.columnCount)
      var floors = [CGFloat](repeating: 3 * em, count: model.columnCount)
      var total: CGFloat = 0
      for row in model.rows {
        for (i, cell) in row.cells.enumerated() where i < widths.count {
          let lines = TableModel.displayLines(cell.text)
          let widest = lines.map { ($0 as NSString).size(withAttributes: [.font: font]).width }.max() ?? 0
          widths[i] = max(widths[i], widest + pad)
          floors[i] = max(floors[i], (TableModel.longestWord(cell.text) as NSString).size(withAttributes: [.font: font]).width + pad)
        }
      }
      total = widths.reduce(0, +)
      _ = total
      widths = zip(widths, floors).map { max($0, $1) }
      var rows: [NSRange: TableRowLayout] = [:]
      let all = [model.header, model.delimiter] + model.body
      for (k, row) in all.enumerated() {
        let role: TableRowLayout.Role = k == 0 ? .header : k == 1 ? .delimiter : .body
        let abs = NSRange(location: c.range.location + row.range.location, length: row.range.length)
        rows[abs] = TableRowLayout(role: role, cells: row.cells.map { TableModel.displayLines($0.text).joined(separator: "\n") }, columnWidths: widths, alignments: model.alignments, isFirst: k == 0, isLast: k == all.count - 1)
      }
      tableLayouts[c.range] = rows
    }
  }

  private func tableRow(for paragraph: NSRange) -> TableRowLayout? {
    for (table, rows) in tableLayouts where !revealedTables.contains(table) {
      // Paragraph ranges include the newline; row ranges don't.
      if let hit = rows.first(where: { $0.key.location == paragraph.location }) { return hit.value }
    }
    return nil
  }

  /* The block costume for a paragraph, and its picture if any. */
  func decoration(forParagraph paragraph: NSRange) -> (BlockDecoration, NSImage?)? {
    guard let storage = textView.textStorage,
          let d = blockDecoration(forParagraph: paragraph, in: storage.string as NSString, constructs: constructs, tables: { [self] in tableRow(for: $0) }) else { return nil }
    if case .image(let source) = d { return (d, image(for: source)) }
    return (d, nil)
  }

  private func image(for source: String) -> NSImage? {
    if let cached = images[source] { return cached }
    guard let baseURL, !source.hasPrefix("http://"), !source.hasPrefix("https://") else { return nil }
    let url = URL(fileURLWithPath: source, relativeTo: baseURL)
    guard let img = NSImage(contentsOf: url) else { return nil }
    images[source] = img
    return img
  }

  func selectionChanged(to selection: NSRange) {
    guard let storage = textView.textStorage else { return }
    storage.beginEditing()
    for c in constructs { colorMarks(c, selection: selection, in: storage) }
    storage.endEditing()
    // A table the caret enters shows source; one it leaves becomes a grid.
    let now = Set(constructs.filter { $0.kind == .table && selectionTouches(selection, $0.range) }.map(\.range))
    let changed = now.symmetricDifference(revealedTables)
    let left = revealedTables.subtracting(now)
    revealedTables = now
    applyFocus(selection: selection)
    if !left.isEmpty, let edit = normalizerEdit(leaving: left), let tv = textView as? FoolscapTextView {
      DispatchQueue.main.async { tv.apply(edit) }
      return
    }
    if !changed.isEmpty, let tlm = textView.textLayoutManager, let cs = textView.textContentStorage {
      for r in changed {
        if let start = cs.location(cs.documentRange.location, offsetBy: r.location), let end = cs.location(start, offsetBy: r.length), let tr = NSTextRange(location: start, end: end) {
          tlm.invalidateLayout(for: tr)
        }
      }
      textView.needsDisplay = true
    }
  }

  private func apply(_ c: Construct, to storage: NSTextStorage) {
    let T = Tokens.Typography.self
    let P = Tokens.Palette.self
    switch c.kind {
    case .heading(let level):
      storage.addAttributes(T.headingAttributes(level), range: c.range)
    case .strong:
      let italic = constructs.contains { $0.kind == .emphasis && NSIntersectionRange($0.content, c.content).length == c.content.length }
      storage.addAttributes([.font: italic ? T.boldItalic : T.bold], range: c.content)
    case .emphasis:
      let bold = constructs.contains { $0.kind == .strong && NSIntersectionRange($0.content, c.content).length == c.content.length }
      storage.addAttributes([.font: bold ? T.boldItalic : T.italic], range: c.content)
    case .strikethrough:
      storage.addAttributes([.strikethroughStyle: NSUnderlineStyle.single.rawValue, .strikethroughColor: P.inkSoft], range: c.content)
    case .code:
      storage.addAttributes([.font: T.mono, .backgroundColor: P.paperSunk], range: c.content)
    case .link(let destination):
      storage.addAttributes([.foregroundColor: P.accent, .link: destination], range: c.content)
    case .image:
      storage.addAttributes([.foregroundColor: P.accent], range: c.content)
    case .listItem(let depth, _):
      // A hanging indent: the marker sits in the gutter the wrapped lines
      // clear. Measured on the body font so "12. " and "- " both line up.
      let indent = T.listIndent * CGFloat(depth)
      let marker = c.marks.first.map { (storage.string as NSString).substring(with: $0) } ?? ""
      let markerWidth = (marker as NSString).size(withAttributes: [.font: T.regular]).width
      let p = (storage.attribute(.paragraphStyle, at: c.range.location, effectiveRange: nil) as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle ?? NSMutableParagraphStyle()
      p.firstLineHeadIndent = indent
      p.headIndent = indent + markerWidth
      p.paragraphSpacing = T.bodySize * T.listItemSpace
      storage.addAttribute(.paragraphStyle, value: p, range: c.range)
    case .taskCheckbox(let checked):
      storage.addAttributes([.foregroundColor: checked ? P.accent : P.inkSoft, .font: T.mono], range: c.range)
    case .blockQuote:
      // One fill, not one per line: no paragraph spacing inside the block.
      let p = NSMutableParagraphStyle()
      p.lineHeightMultiple = T.leadingBody
      p.paragraphSpacing = 0
      storage.addAttributes([.foregroundColor: P.inkSoft, .paragraphStyle: p], range: c.range)
    case .thematicBreak:
      storage.addAttributes([.foregroundColor: P.inkGhost, .strikethroughStyle: NSUnderlineStyle.single.rawValue, .strikethroughColor: P.rule], range: c.range)
    case .table:
      // Source mode: mono so the pipes line up; the grid costume comes
      // from the layout fragment when the caret is elsewhere.
      let p = NSMutableParagraphStyle()
      p.lineHeightMultiple = T.leadingCode
      storage.addAttributes([.font: T.mono, .paragraphStyle: p], range: c.range)
    case .codeBlock(let language, _):
      let p = NSMutableParagraphStyle()
      p.lineHeightMultiple = T.leadingCode
      storage.addAttributes([.font: T.mono, .paragraphStyle: p], range: c.range)
      if let language, let spec = Languages.spec(for: language), c.content.length > 0 {
        let code = (storage.string as NSString).substring(with: c.content)
        for t in Highlighter.tokenize(code, language: spec) {
          let r = NSRange(location: c.content.location + t.range.location, length: t.range.length)
          storage.addAttribute(.foregroundColor, value: P.syntax(t.kind), range: r)
          if t.kind == .comment { storage.addAttribute(.font, value: T.monoItalic, range: r) }
        }
      }
    }
  }

  private func colorMarks(_ c: Construct, selection: NSRange, in storage: NSTextStorage) {
    let revealed = selectionTouches(selection, c.range)
    let color: NSColor
    switch c.kind {
    case .taskCheckbox: return // the box is its own colour, always
    case .listItem, .blockQuote: color = revealed ? Tokens.Palette.inkSoft : Tokens.Palette.inkGhost
    case .codeBlock: color = revealed ? Tokens.Palette.inkSoft : Tokens.Palette.inkGhost
    default: color = revealed ? Tokens.Palette.inkSoft : Tokens.Palette.inkGhost
    }
    for m in c.marks where NSMaxRange(m) <= storage.length {
      storage.addAttribute(.foregroundColor, value: color, range: m)
    }
  }
}

extension Construct.Kind {
  var isBlock: Bool {
    switch self {
    case .heading, .listItem, .blockQuote, .thematicBreak, .codeBlock, .table: return true
    default: return false
    }
  }
}
