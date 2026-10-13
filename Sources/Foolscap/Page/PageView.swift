import AppKit
import WebKit

/* The rendered page: a WKWebView over the export pipeline's HTML, offline,
 * fonts and images through the foolscap: scheme. Used by the preview, the
 * help window, and (hidden) the PDF and print paths. */
@MainActor
final class PageView: NSView, WKNavigationDelegate, WKScriptMessageHandler {
  let webView: WKWebView
  private let scheme = PageSchemeHandler()
  private var pendingScroll: Int?
  private var loaded = false
  var onEdit: ((Int) -> Void)?
  var onLoad: (() -> Void)?

  var documentDirectory: URL? {
    get { scheme.documentDirectory }
    set { scheme.documentDirectory = newValue }
  }

  override init(frame: NSRect) {
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(scheme, forURLScheme: PageSchemeHandler.scheme)
    webView = WKWebView(frame: frame, configuration: config)
    super.init(frame: frame)
    config.userContentController.add(self, name: "foolscap")
    webView.navigationDelegate = self
    webView.setValue(false, forKey: "drawsBackground")
    webView.autoresizingMask = [.width, .height]
    webView.setAccessibilityIdentifier("page")
    addSubview(webView)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("not used") }

  func load(html: String, scrollTo pos: Int? = nil) {
    loaded = false
    pendingScroll = pos
    webView.loadHTMLString(PageSchemeHandler.rewriteImageSources(html), baseURL: URL(string: "\(PageSchemeHandler.scheme)://page/"))
  }

  func scroll(to pos: Int) {
    if loaded { webView.evaluateJavaScript("window.scrollToPos(\(pos))") } else { pendingScroll = pos }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    loaded = true
    if let pos = pendingScroll { pendingScroll = nil; webView.evaluateJavaScript("window.scrollToPos(\(pos))") }
    onLoad?()
  }

  /* Links leave for the browser; only the page's own anchors navigate. */
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
    if let url = action.request.url, action.navigationType == .linkActivated, url.scheme != PageSchemeHandler.scheme {
      if ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "edit": onEdit?(body["pos"] as? Int ?? 0)
    case "link":
      if let s = body["href"] as? String, let url = URL(string: s), ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
    default: break
    }
  }
}
