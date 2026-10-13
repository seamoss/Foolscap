import AppKit

/* The app is document-based: NSDocumentController owns opening, saving,
 * recents, and restoration. This delegate only builds the menu bar (no
 * nib) and honours the one test hook. */
@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  static func main() {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
  }

  func applicationWillFinishLaunching(_ notification: Notification) {
    Fonts.register()
    NSApp.mainMenu = MainMenu.build()
  }

  @objc func showSettings(_ sender: Any?) {
    SettingsWindowController.shared.show()
  }

  // Not `showHelp:` — NSApplication owns that selector, sits earlier in the
  // responder chain, and answers with "Help isn't available".
  @objc func showManual(_ sender: Any?) {
    HelpWindowController.shared.show()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.activate()
    /* UI tests (and nothing else) hand a path in through the environment:
     * XCUITest can't deliver an open-file Apple event, and argv isn't how
     * document apps receive files. */
    if let path = ProcessInfo.processInfo.environment["FOOLSCAP_OPEN"], !path.isEmpty {
      NSDocumentController.shared.openDocument(withContentsOf: URL(fileURLWithPath: path), display: true) { _, _, error in
        if let error { NSApp.presentError(error) }
      }
    }
  }

  func applicationShouldOpenUntitledFile(_ sender: NSApplication) -> Bool {
    ProcessInfo.processInfo.environment["FOOLSCAP_OPEN"] == nil
  }

  /* foolscap://open?path=… from other apps and web pages. */
  func application(_ application: NSApplication, open urls: [URL]) {
    for url in urls {
      if let path = OpenLink.path(from: url) {
        NSDocumentController.shared.openDocument(withContentsOf: URL(fileURLWithPath: path), display: true) { _, _, error in if let error { NSApp.presentError(error) } }
      } else {
        Toast.show("That link doesn't point at a markdown file Foolscap can open.", in: NSApp.keyWindow)
      }
    }
  }

  @objc func reopenClosedDocument(_ sender: Any?) {
    guard let path = ClosedDocuments.shared.pop(exists: { FileManager.default.fileExists(atPath: $0) }) else { NSSound.beep(); return }
    NSDocumentController.shared.openDocument(withContentsOf: URL(fileURLWithPath: path), display: true) { _, _, error in if let error { NSApp.presentError(error) } }
  }

  @objc func togglePalette(_ sender: Any?) { PaletteController.shared.toggle() }
  @objc func textLarger(_ sender: Any?) { AppSettings.shared.textSize += 1 }
  @objc func textSmaller(_ sender: Any?) { AppSettings.shared.textSize -= 1 }
  @objc func textReset(_ sender: Any?) { AppSettings.shared.textSize = AppSettings.defaultSize }
}
