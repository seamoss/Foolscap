import AppKit

final class DocumentWindowController: NSWindowController {
  let content = DocumentViewController()
  var editor: EditorViewController { content.editor }

  init(document: MarkdownDocument) {
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: Tokens.Layout.windowWidth, height: Tokens.Layout.windowHeight),
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    window.titlebarAppearsTransparent = true
    window.backgroundColor = Tokens.Palette.paper
    window.appearance = NSAppearance(named: Tokens.theme.isDark ? .darkAqua : .aqua)
    window.minSize = NSSize(width: 480, height: 320)
    window.contentViewController = content
    content.configure { [weak document] in document?.displayName ?? "Untitled" }
    // Native tabs: documents share a window; drag a tab out to split.
    window.tabbingMode = .preferred
    window.tabbingIdentifier = "Foolscap.Document"
    // Assigning a content view controller resizes the window to the view's
    // fitting size — nothing, for a scroll view. Size it back.
    window.setContentSize(NSSize(width: Tokens.Layout.windowWidth, height: Tokens.Layout.windowHeight))
    window.setFrameAutosaveName("Foolscap.Document")
    window.center()
    super.init(window: window)
    // Restoration: NSDocument re-opens the file and we rebuild the window;
    // nothing to encode beyond what the frame autosave keeps.
    window.isRestorable = true
    shouldCascadeWindows = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("not used") }

  /* ⌘T: a new untitled document as a tab of this window. Deliberately not
   * newWindowForTab: — handling that selector makes AppKit draw its "+"
   * button in the tab bar, a system-styled control the app can't restyle. */
  @objc func newTab(_ sender: Any?) {
    guard let doc = try? NSDocumentController.shared.makeUntitledDocument(ofType: "net.daringfireball.markdown") else { return }
    NSDocumentController.shared.addDocument(doc)
    doc.makeWindowControllers()
    if let newWindow = doc.windowControllers.first?.window, let window {
      window.addTabbedWindow(newWindow, ordered: .above)
      newWindow.makeKeyAndOrderFront(nil)
    } else { doc.showWindows() }
  }
}
