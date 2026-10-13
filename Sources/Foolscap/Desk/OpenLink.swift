import Foundation

/* foolscap://open?path=<URL-encoded absolute path>: other apps and web
 * pages open a document. Only host "open", only the path parameter, only
 * an absolute path to an existing markdown file. */
enum OpenLink {
  static func path(from url: URL, exists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }) -> String? {
    guard url.scheme == "foolscap", url.host == "open",
          let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let raw = comps.queryItems?.first(where: { $0.name == "path" })?.value, raw.hasPrefix("/") else { return nil }
    let path = (raw as NSString).standardizingPath
    guard PasteRules.markdownExtensions.contains((path as NSString).pathExtension.lowercased()), exists(path) else { return nil }
    return path
  }
}
