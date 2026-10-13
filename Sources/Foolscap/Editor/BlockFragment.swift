import AppKit

/* A TextKit 2 layout fragment that draws a block's costume around its
 * glyphs. The text storage holds plain markdown throughout; the fill, the
 * hairline, and the picture exist only here, at layout time. */
/* Token values resolved on the main actor when the fragment is made;
 * drawing then needs nothing isolated. */
struct BlockStyle: @unchecked Sendable {
  let fill: CGColor
  let rule: CGColor
  let fillBleed: CGFloat
  let imageGap: CGFloat
  let cellPadding: CGFloat
  /* The grid's text: body font and ink, as attributes. */
  let cellAttributes: [NSAttributedString.Key: Any]
  let headerAttributes: [NSAttributedString.Key: Any]

  @MainActor static var current: BlockStyle {
    let p = NSMutableParagraphStyle(); p.lineBreakMode = .byTruncatingTail
    return BlockStyle(fill: Tokens.Palette.paperSunk.cgColor, rule: Tokens.Palette.rule.cgColor, fillBleed: Tokens.Layout.fillBleed, imageGap: Tokens.Layout.imageGap, cellPadding: Tokens.Layout.cellPadding,
                      cellAttributes: [.font: Tokens.Typography.regular, .foregroundColor: Tokens.Palette.ink, .paragraphStyle: p],
                      headerAttributes: [.font: Tokens.Typography.body(weight: 500), .foregroundColor: Tokens.Palette.ink, .paragraphStyle: p])
  }
}

final class BlockFragment: NSTextLayoutFragment {
  let decoration: BlockDecoration
  let image: NSImage?
  private let measure: CGFloat
  private let style: BlockStyle

  init(textElement: NSTextElement, range: NSTextRange?, decoration: BlockDecoration, image: NSImage?, measure: CGFloat, style: BlockStyle) {
    self.decoration = decoration
    self.image = image
    self.measure = measure
    self.style = style
    super.init(textElement: textElement, range: range)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("not used") }

  /* The picture's drawn size: the measure wide at most, aspect kept. */
  private var imageSize: CGSize {
    guard let image, image.size.width > 0 else { return .zero }
    let scale = min(1, measure / image.size.width)
    return CGSize(width: image.size.width * scale, height: image.size.height * scale)
  }

  private var imageGap: CGFloat { style.imageGap }

  /* Taller than the text when an image hangs beneath it: the next
   * paragraph lays out below the picture. */
  override var layoutFragmentFrame: CGRect {
    var frame = super.layoutFragmentFrame
    if image != nil { frame.size.height += imageSize.height + imageGap * 2 }
    // The delimiter row of a grid is a hairline, not a line of text.
    if case .tableRow(let row) = decoration {
      if row.role == .delimiter { frame.size.height = style.cellPadding / 2 }
      else {
        let lines = row.cells.map { $0.components(separatedBy: "\n").count }.max() ?? 1
        if lines > 1 { frame.size.height = super.layoutFragmentFrame.height * CGFloat(lines) }
      }
    }
    return frame
  }

  override var renderingSurfaceBounds: CGRect {
    var bounds = super.renderingSurfaceBounds
    if image != nil { bounds.size.height += imageSize.height + imageGap * 2 }
    // Fills and rules reach the measure's full width.
    bounds.size.width = max(bounds.size.width, measure)
    return bounds
  }

  override func draw(at point: CGPoint, in context: CGContext) {
    let textHeight = super.layoutFragmentFrame.height
    switch decoration {
    case .fill:
      context.saveGState()
      let rect = CGRect(x: point.x - style.fillBleed, y: point.y, width: measure + style.fillBleed * 2, height: textHeight)
      context.setFillColor(style.fill)
      context.fill(rect)
      context.restoreGState()
      super.draw(at: point, in: context)
    case .rule:
      super.draw(at: point, in: context)
      context.saveGState()
      context.setStrokeColor(style.rule)
      context.setLineWidth(1)
      let y = point.y + textHeight / 2
      context.move(to: CGPoint(x: point.x, y: y))
      context.addLine(to: CGPoint(x: point.x + measure, y: y))
      context.strokePath()
      context.restoreGState()
    case .tableRow(let row):
      // The row's source is not drawn; the cells are. The delimiter row
      // draws as the header's underline, a half-height spacer.
      let height = layoutFragmentFrame.height
      let total = row.columnWidths.reduce(0, +)
      let scale = total > measure ? measure / total : 1
      var x = point.x
      if row.role == .header {
        context.setFillColor(style.fill)
        context.fill(CGRect(x: point.x, y: point.y, width: min(total * scale, measure), height: height))
      }
      context.setStrokeColor(style.rule)
      context.setLineWidth(1)
      if row.role == .delimiter {
        let y = point.y + layoutFragmentFrame.height - 0.5
        context.move(to: CGPoint(x: point.x, y: y)); context.addLine(to: CGPoint(x: point.x + min(total * scale, measure), y: y)); context.strokePath()
        return
      }
      NSGraphicsContext.saveGraphicsState()
      NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
      for (i, width) in row.columnWidths.enumerated() {
        let w = width * scale
        let text = i < row.cells.count ? row.cells[i] : ""
        let attrs = row.role == .header ? style.headerAttributes : style.cellAttributes
        let size = (text as NSString).size(withAttributes: attrs)
        var tx = x + style.cellPadding
        if i < row.alignments.count, let a = row.alignments[i] {
          if a == .center { tx = x + (w - size.width) / 2 } else if a == .right { tx = x + w - style.cellPadding - size.width }
        }
        (text as NSString).draw(in: CGRect(x: tx, y: point.y + (height - size.height) / 2, width: max(0, w - style.cellPadding * 2), height: size.height), withAttributes: attrs)
        // Hairline between columns.
        if i > 0 { context.move(to: CGPoint(x: x + 0.5, y: point.y)); context.addLine(to: CGPoint(x: x + 0.5, y: point.y + height)); context.strokePath() }
        x += w
      }
      NSGraphicsContext.restoreGraphicsState()
      // Row bottom hairline; the table's outer frame at first and last.
      let right = point.x + min(total * scale, measure)
      context.move(to: CGPoint(x: point.x, y: point.y + height - 0.5)); context.addLine(to: CGPoint(x: right, y: point.y + height - 0.5)); context.strokePath()
      if row.isFirst { context.move(to: CGPoint(x: point.x, y: point.y + 0.5)); context.addLine(to: CGPoint(x: right, y: point.y + 0.5)); context.strokePath() }
      context.move(to: CGPoint(x: point.x + 0.5, y: point.y)); context.addLine(to: CGPoint(x: point.x + 0.5, y: point.y + height)); context.strokePath()
      context.move(to: CGPoint(x: right - 0.5, y: point.y)); context.addLine(to: CGPoint(x: right - 0.5, y: point.y + height)); context.strokePath()
    case .image:
      super.draw(at: point, in: context)
      guard let image else { return }
      let size = imageSize
      let rect = CGRect(x: point.x, y: point.y + textHeight + imageGap, width: size.width, height: size.height)
      context.saveGState()
      // CGContext is y-up; the fragment draws y-down (flipped view).
      context.translateBy(x: 0, y: rect.maxY)
      context.scaleBy(x: 1, y: -1)
      if let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) {
        context.draw(cg, in: CGRect(x: rect.minX, y: 0, width: rect.width, height: rect.height))
      }
      context.restoreGState()
    }
  }
}
