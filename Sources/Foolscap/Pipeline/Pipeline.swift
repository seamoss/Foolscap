import Foundation
import Markdown

/* THE one markdown pipeline (CLAUDE.md, second rule). swift-markdown parses
 * GFM — tables, task lists, strikethrough, autolinks — and HTMLRenderer
 * renders. The editor's attributes, the HTML export, and the PDF (WebKit
 * printing the export) all come from here. */
enum Pipeline {
  static func parse(_ markdown: String) -> Document {
    Document(parsing: markdown, options: [])
  }

  /* The document's HTML body. sourcePositions stamps each block with its
   * source offset (data-pos) — the preview uses it to keep its place and
   * to hand a double-click back to the editor; exports never set it, so
   * their output stays byte-identical. */
  static func html(_ markdown: String, sourcePositions: Bool = false) -> String {
    let extracted = Footnotes.extract(markdown)
    let body = render(extracted.markdown, sourcePositions: sourcePositions, offsets: sourcePositions ? SourceOffsets(extracted.markdown) : nil)
    return Footnotes.resolve(html: body, definitions: extracted.definitions) { render($0, sourcePositions: false, offsets: nil) }
  }

  private static func render(_ markdown: String, sourcePositions: Bool, offsets: SourceOffsets?) -> String {
    var renderer = HTMLRenderer(offsets: offsets)
    return renderer.render(parse(markdown))
  }
}
