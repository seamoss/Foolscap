import Foundation
import WebKit

/* foolscap://font/<file> serves the bundled faces; foolscap://doc/<path>
 * serves files relative to the open document (images). Nothing else
 * resolves — the page can't reach the disk. */
final class PageSchemeHandler: NSObject, WKURLSchemeHandler {
  static let scheme = "foolscap"
  nonisolated(unsafe) var documentDirectory: URL?

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    guard let url = task.request.url, let file = Self.resolve(url, fonts: Bundle.main.resourceURL?.appendingPathComponent("Fonts"), document: documentDirectory),
          let data = try? Data(contentsOf: file) else {
      task.didFailWithError(URLError(.fileDoesNotExist))
      return
    }
    let type = Self.mime(for: file.pathExtension)
    task.didReceive(URLResponse(url: url, mimeType: type, expectedContentLength: data.count, textEncodingName: nil))
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}

  /* Pure: which file a page URL means, or nil. Paths can't climb out of
   * their root. */
  static func resolve(_ url: URL, fonts: URL?, document: URL?) -> URL? {
    guard url.scheme == scheme else { return nil }
    let path = url.path.removingPercentEncoding ?? url.path
    let root: URL?
    switch url.host {
    case "font": root = fonts
    case "doc": root = document
    default: return nil
    }
    guard let root else { return nil }
    let target = root.appendingPathComponent(path).standardizedFileURL
    guard target.path.hasPrefix(root.standardizedFileURL.path + "/") else { return nil }
    return target
  }

  static func mime(for ext: String) -> String {
    switch ext.lowercased() {
    case "ttf": return "font/ttf"
    case "otf": return "font/otf"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "gif": return "image/gif"
    case "webp": return "image/webp"
    case "svg": return "image/svg+xml"
    default: return "application/octet-stream"
    }
  }

  /* Rewrite a relative image src to the doc scheme; absolute URLs stay. */
  static func rewriteImageSources(_ html: String) -> String {
    let re = try! NSRegularExpression(pattern: #"<img src="([^"]+)""#)
    let ns = html as NSString
    var out = ""
    var at = 0
    for m in re.matches(in: html, range: NSRange(location: 0, length: ns.length)) {
      let src = ns.substring(with: m.range(at: 1))
      out += ns.substring(with: NSRange(location: at, length: m.range.location - at))
      if src.contains("://") || src.hasPrefix("data:") || src.hasPrefix("/") { out += ns.substring(with: m.range) }
      else { out += "<img src=\"\(scheme)://doc/\(src)\"" }
      at = NSMaxRange(m.range)
    }
    return out + ns.substring(from: at)
  }
}
