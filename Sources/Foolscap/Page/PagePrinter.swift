import AppKit
import WebKit

/* PDF and paper: the print-mode document (Ledger on white, bundled fonts)
 * in an offscreen page, printed through AppKit's print operation — real
 * pagination, page setup honoured. The page view is kept alive until the
 * operation finishes. */
@MainActor
enum PagePrinter {
  /* A web view prints only from inside a window, so the print page lives
   * in one: off every screen, fully transparent, never key, released when
   * the operation ends. */
  private static var live: [(window: NSWindow, page: PageView)] = []

  private static func render(markdown: String, title: String, documentDirectory: URL?, then: @escaping (PageView) -> Void) {
    let frame = NSRect(x: -20000, y: -20000, width: 816, height: 1056)
    let page = PageView(frame: NSRect(origin: .zero, size: frame.size))
    page.documentDirectory = documentDirectory
    let window = NSWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
    window.isExcludedFromWindowsMenu = true
    window.alphaValue = 0
    window.isReleasedWhenClosed = false
    window.contentView = page
    window.orderBack(nil)
    live.append((window, page))
    page.onLoad = { [weak page] in
      guard let page else { return }
      // One more turn for fonts and images to settle after load.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { then(page) }
    }
    page.load(html: ExportHTML.document(markdown: markdown, title: title, mode: .print, stylesheet: Stylesheet.export))
  }

  private static func release(_ page: PageView) {
    for entry in live where entry.page === page { entry.window.orderOut(nil); entry.window.contentView = nil }
    live.removeAll { $0.page === page }
  }

  /* WebKit's print operation must go through runModal — run() never
   * returns (the run loop has to keep serving the web process). The
   * delegate carries the completion and is kept alive by `live`. */
  private final class Finish: NSObject, @unchecked Sendable {
    let page: PageView
    let completion: @MainActor (Bool) -> Void
    init(page: PageView, completion: @escaping @MainActor (Bool) -> Void) { self.page = page; self.completion = completion }
    // AppKit calls this on its print thread, not main (crash-report fact).
    @objc nonisolated func didRun(_ op: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
      DispatchQueue.main.async { [self] in
        MainActor.assumeIsolated {
          PagePrinter.release(page)
          completion(success)
        }
      }
    }
  }
  private static var finishes: [Finish] = []

  private static func run(_ op: NSPrintOperation, in window: NSWindow, page: PageView, completion: @escaping (Bool) -> Void) {
    let finish = Finish(page: page) { ok in
      completion(ok)
      finishes.removeAll { $0.page === page }
    }
    finishes.append(finish)
    op.runModal(for: window, delegate: finish, didRun: #selector(Finish.didRun(_:success:contextInfo:)), contextInfo: nil)
  }

  private static func window(for page: PageView) -> NSWindow? { live.first { $0.page === page }?.window }

  static func pdf(markdown: String, title: String, documentDirectory: URL?, to url: URL, completion: @escaping (Error?) -> Void) {
    render(markdown: markdown, title: title, documentDirectory: documentDirectory) { page in
      let info = NSPrintInfo.shared.copy() as! NSPrintInfo
      info.jobDisposition = .save
      info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = url
      info.horizontalPagination = .fit
      info.verticalPagination = .automatic
      let op = page.webView.printOperation(with: info)
      op.showsPrintPanel = false
      op.showsProgressPanel = false
      op.view?.frame = NSRect(x: 0, y: 0, width: 816, height: 1056)
      guard let window = window(for: page) else { completion(CocoaError(.fileWriteUnknown)); return }
      run(op, in: window, page: page) { ok in completion(ok ? nil : CocoaError(.fileWriteUnknown)) }
    }
  }

  /* Print…: the panel is a sheet on the document window; the page itself
   * stays in its hidden window. */
  static func print(markdown: String, title: String, documentDirectory: URL?, printInfo: NSPrintInfo, window docWindow: NSWindow?) {
    render(markdown: markdown, title: title, documentDirectory: documentDirectory) { page in
      let info = printInfo.copy() as! NSPrintInfo
      info.horizontalPagination = .fit
      info.verticalPagination = .automatic
      let op = page.webView.printOperation(with: info)
      op.view?.frame = NSRect(x: 0, y: 0, width: 816, height: 1056)
      op.jobTitle = title
      guard let host = docWindow ?? window(for: page) else { release(page); return }
      run(op, in: host, page: page) { _ in }
    }
  }
}
