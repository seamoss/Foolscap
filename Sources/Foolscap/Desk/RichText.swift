import AppKit

/* Copy as Rich Text (⌥⌘C): the rendered document on the pasteboard as
 * RTF and HTML, with the markdown as plain text. RTF is what carries
 * formatting into every macOS destination; built from the pipeline's
 * standalone HTML. */
@MainActor
enum RichText {
  static func copy(markdown: String, title: String) -> Bool {
    let html = ExportHTML.document(markdown: markdown, title: title, mode: .standalone, stylesheet: Stylesheet.export)
    guard let data = html.data(using: .utf8),
          let attributed = try? NSAttributedString(data: data, options: [.documentType: NSAttributedString.DocumentType.html, .characterEncoding: String.Encoding.utf8.rawValue], documentAttributes: nil),
          let rtf = attributed.rtf(from: NSRange(location: 0, length: attributed.length), documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf]) else { return false }
    let pb = NSPasteboard.general
    pb.clearContents()
    pb.setData(rtf, forType: .rtf)
    pb.setString(html, forType: .html)
    pb.setString(markdown, forType: .string)
    return true
  }
}
