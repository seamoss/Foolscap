import Foundation

enum Stylesheet {
  /* Resources/export.css, read once. */
  nonisolated(unsafe) private static var cached: String?
  static var export: String {
    if let cached { return cached }
    let text = Bundle.main.url(forResource: "export", withExtension: "css").flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
    cached = text
    return text
  }
}
