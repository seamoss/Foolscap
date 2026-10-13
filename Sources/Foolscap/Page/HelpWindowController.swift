import AppKit

/* Help: the manual, a markdown document rendered by the same page that
 * renders everything else. Its own window; the editor is never touched. */
@MainActor
final class HelpWindowController: NSWindowController {
  static let shared = HelpWindowController()
  private let page = PageView(frame: NSRect(x: 0, y: 0, width: 820, height: 760))

  private init() {
    let window = NSWindow(contentRect: page.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
    window.title = "wtf is this?"
    window.contentView = page
    window.setFrameAutosaveName("Foolscap.Help")
    window.isReleasedWhenClosed = false
    window.center()
    super.init(window: window)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("not used") }

  func show() {
    let md = Bundle.main.url(forResource: "help", withExtension: "md").flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? "# Help\n\nThe manual is missing from this build."
    window?.appearance = NSAppearance(named: Tokens.theme.isDark ? .darkAqua : .aqua)
    window?.backgroundColor = Tokens.Palette.paper
    page.load(html: ExportHTML.document(markdown: md, title: "wtf is this?", mode: .inApp(theme: Tokens.theme, sourcePositions: false), stylesheet: Stylesheet.export))
    showWindow(nil)
    window?.makeKeyAndOrderFront(nil)
  }
}
