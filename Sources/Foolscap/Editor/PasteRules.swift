import Foundation

/* What a paste or drop becomes, decided purely. */
enum PasteRules {
  private static let linkSchemes: Set<String> = ["http", "https", "mailto"]

  /* The trimmed URL when the pasted text is exactly one, else nil. */
  static func pastedURL(_ text: String) -> String? {
    let url = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !url.isEmpty, url.rangeOfCharacter(from: .whitespacesAndNewlines) == nil, let u = URL(string: url), linkSchemes.contains(u.scheme ?? "") else { return nil }
    return url
  }

  /* A URL pasted over selected words links them; otherwise paste is paste. */
  static func linkPaste(text: NSString, selection: NSRange, pasted: String) -> TextEdit? {
    guard selection.length > 0, let url = pastedURL(pasted) else { return nil }
    let label = text.substring(with: selection)
    guard !label.contains("\n"), !label.contains("["), !label.contains("]") else { return nil }
    let replacement = "[\(label)](\(url))"
    return TextEdit(range: selection, replacement: replacement, selection: NSRange(location: selection.location + replacement.utf16.count, length: 0))
  }

  static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "webp"]
  static let markdownExtensions: Set<String> = ["md", "markdown", "mdx", "txt"]

  /* A dropped file keeps its name, made safe for a link and the disk. */
  static func assetName(preferred: String?, ext: String, now: Date = Date()) -> String {
    let stem = (preferred ?? "")
      .replacingOccurrences(of: #"\.[^.]*$"#, with: "", options: .regularExpression)
      .folding(options: .diacriticInsensitive, locale: nil)
      .replacingOccurrences(of: #"[^A-Za-z0-9._-]+"#, with: "-", options: .regularExpression)
      .replacingOccurrences(of: #"^[-.]+|[-.]+$"#, with: "", options: .regularExpression)
      .prefix(64)
    if !stem.isEmpty { return "\(stem).\(ext)" }
    let f = DateFormatter(); f.dateFormat = "yyyyMMdd-HHmmss"
    return "pasted-\(f.string(from: now)).\(ext)"
  }

  /* Links for images placed at a point: inline. */
  static func imageLinks(_ relPaths: [String]) -> String { relPaths.map { "![](\($0))" }.joined(separator: " ") }
}
