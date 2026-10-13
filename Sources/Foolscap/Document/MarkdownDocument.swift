import AppKit

/* One markdown file. NSDocument supplies autosave-in-place, the Versions
 * browser, Open Recent, the title-bar proxy icon and path menu, window
 * restoration, and coordinated reads when another app edits the file.
 * This class adds only what a text file needs: bytes in, bytes out, and
 * nothing in between — the one promise. */
final class MarkdownDocument: NSDocument {
  /* The text before a window exists (just read) or after one is gone. While
   * the editor is up, the text storage is the truth and this mirrors it on
   * save. */
  /* What a new, untitled document opens as: a heading ready to be
   * titled, caret after the mark. The pristine state, not an edit — an
   * untouched new document stays clean. */
  static let newTemplate = "# \n\n"
  static let newCaret = 2

  private(set) var text: String = ""
  private weak var editor: EditorViewController?

  override init() {
    super.init()
    text = Self.newTemplate
  }

  // nonisolated: NSDocument reads these from its saving queue, and under
  // strict concurrency a main-actor override traps there (Phase 0 crash).
  override nonisolated class var autosavesInPlace: Bool { true }
  override nonisolated class var preservesVersions: Bool { true }

  override func makeWindowControllers() {
    let controller = DocumentWindowController(document: self)
    addWindowController(controller)
    editor = controller.editor
    content = controller.content
    controller.content.documentDirectory = fileURL?.deletingLastPathComponent()
    controller.editor.load(text)
    if let path = fileURL?.path, let p = Positions.shared.recall(path) { controller.editor.restore(p) }
    else if fileURL == nil, text == Self.newTemplate { controller.editor.textView.setSelectedRange(NSRange(location: Self.newCaret, length: 0)) }
  }

  override func close() {
    if let path = fileURL?.path {
      if let editor { Positions.shared.remember(path, editor.position) }
      ClosedDocuments.shared.push(path)
    }
    super.close()
  }

  /* Another app changed the file: a clean document reloads silently; a
   * dirty one keeps its buffer (NSDocument will say so at save time). */
  override func presentedItemDidChange() {
    super.presentedItemDidChange()
    Task { @MainActor [weak self] in
      guard let self, let url = fileURL, !isDocumentEdited else { return }
      let position = editor?.position
      try? revert(toContentsOf: url, ofType: fileType ?? "net.daringfireball.markdown")
      if let position { editor?.restore(position) }
    }
  }

  @objc func copyAsRichText(_ sender: Any?) {
    if !RichText.copy(markdown: currentText, title: displayName) { NSSound.beep() }
  }

  @objc func revealInFinder(_ sender: Any?) {
    if let url = fileURL { NSWorkspace.shared.activateFileViewerSelecting([url]) } else { NSSound.beep() }
  }

  @objc func copyPath(_ sender: Any?) {
    guard let url = fileURL else { NSSound.beep(); return }
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(url.path, forType: .string)
  }

  private weak var content: DocumentViewController?

  /* Save As moves the document; relative images re-anchor. */
  override var fileURL: URL? {
    didSet {
      // NSDocument may set this off the main queue during a save; the view
      // side updates on main.
      let dir = fileURL?.deletingLastPathComponent()
      Task { @MainActor [weak self] in self?.content?.documentDirectory = dir }
    }
  }

  // ---- the page: export, PDF, print — all the one pipeline's HTML

  private var currentText: String { editor?.string ?? text }

  @objc func exportHTML(_ sender: Any?) {
    let panel = NSSavePanel()
    panel.allowedContentTypes = [.html]
    panel.nameFieldStringValue = displayName.replacingOccurrences(of: ".md", with: "") + ".html"
    panel.directoryURL = fileURL?.deletingLastPathComponent()
    guard let window = windowControllers.first?.window else { return }
    panel.beginSheetModal(for: window) { [weak self] response in
      guard response == .OK, let url = panel.url, let self else { return }
      let html = ExportHTML.document(markdown: self.currentText, title: self.displayName, mode: .standalone, stylesheet: Stylesheet.export)
      do { try html.write(to: url, atomically: true, encoding: .utf8) } catch { NSApp.presentError(error) }
    }
  }

  @objc func exportPDF(_ sender: Any?) {
    let panel = NSSavePanel()
    panel.allowedContentTypes = [.pdf]
    panel.nameFieldStringValue = displayName.replacingOccurrences(of: ".md", with: "") + ".pdf"
    panel.directoryURL = fileURL?.deletingLastPathComponent()
    guard let window = windowControllers.first?.window else { return }
    panel.beginSheetModal(for: window) { [weak self] response in
      guard response == .OK, let url = panel.url, let self else { return }
      PagePrinter.pdf(markdown: self.currentText, title: self.displayName, documentDirectory: self.fileURL?.deletingLastPathComponent(), to: url) { error in
        if let error { NSApp.presentError(error) }
      }
    }
  }

  override func printDocument(_ sender: Any?) {
    PagePrinter.print(markdown: currentText, title: displayName, documentDirectory: fileURL?.deletingLastPathComponent(), printInfo: printInfo, window: windowControllers.first?.window)
  }

  override func read(from data: Data, ofType typeName: String) throws {
    guard let decoded = String(data: data, encoding: .utf8) else {
      throw CocoaError(.fileReadInapplicableStringEncoding)
    }
    text = decoded
    editor?.load(text)
  }

  override func data(ofType typeName: String) throws -> Data {
    if let editor { text = editor.string }
    // Every character of a Swift String is valid UTF-8; this cannot fail.
    return Data(text.utf8)
  }
}
