import AppKit
import UniformTypeIdentifiers

/* The text view, with the pieces of input handling the costume needs. Every
 * edit here goes through insertText so it is undoable and dirties the
 * document; nothing changes the string any other way. */
final class FoolscapTextView: NSTextView {
  weak var styler: LiveStyler?
  var onToast: ((String) -> Void)?

  private var ns: NSString { string as NSString }

  /* One undoable replacement with the selection it leaves. */
  func apply(_ edit: TextEdit) {
    guard shouldChangeText(in: edit.range, replacementString: edit.replacement) else { return }
    insertText(edit.replacement, replacementRange: edit.range)
    didChangeText()
    setSelectedRange(edit.selection)
  }

  // ---- Format menu
  @objc func toggleBold(_ sender: Any?) { format(.strong) }
  @objc func toggleItalic(_ sender: Any?) { format(.emphasis) }
  @objc func toggleStrikethrough(_ sender: Any?) { format(.strikethrough) }
  @objc func toggleInlineCode(_ sender: Any?) { format(.code) }
  @objc func insertLink(_ sender: Any?) { apply(FormatCommands.link(in: ns, selection: selectedRange())) }
  private func format(_ f: InlineFormat) {
    apply(FormatCommands.toggle(f, in: ns, selection: selectedRange(), constructs: styler?.constructs ?? []))
  }

  // ---- mouse: ⌘-click links, task boxes
  override func mouseDown(with event: NSEvent) {
    let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
    if mods == .command, let styler {
      let index = characterIndexForInsertion(at: convert(event.locationInWindow, from: nil))
      if let link = styler.constructs.first(where: { if case .link = $0.kind { return $0.range.contains(index) } else { return false } }),
         case .link(let destination) = link.kind, let url = URL(string: destination), ["http", "https", "mailto"].contains(url.scheme ?? "") {
        NSWorkspace.shared.open(url)
        return
      }
    }
    if let styler, event.clickCount == 1, mods.isEmpty {
      let index = characterIndexForInsertion(at: convert(event.locationInWindow, from: nil))
      if let toggle = checkboxToggle(at: index, constructs: styler.constructs) {
        apply(TextEdit(range: toggle.range, replacement: toggle.replacement, selection: selectedRange()))
        return
      }
    }
    super.mouseDown(with: event)
  }

  // ---- keys: Tab walks table cells, Enter adds a row
  override func insertTab(_ sender: Any?) {
    if let edit = TableNavigation.tab(in: ns, selection: selectedRange(), constructs: styler?.constructs ?? [], backward: false) { apply(edit); return }
    super.insertTab(sender)
  }
  override func insertBacktab(_ sender: Any?) {
    if let edit = TableNavigation.tab(in: ns, selection: selectedRange(), constructs: styler?.constructs ?? [], backward: true) { apply(edit); return }
    super.insertBacktab(sender)
  }
  override func insertNewline(_ sender: Any?) {
    if let edit = TableNavigation.enter(in: ns, selection: selectedRange(), constructs: styler?.constructs ?? []) { apply(edit); return }
    super.insertNewline(sender)
  }

  // ---- paste: a URL over a selection links it; an image lands beside the document
  override func paste(_ sender: Any?) {
    let pb = NSPasteboard.general
    if let image = imageData(from: pb) {
      placeImages([(image.data, image.ext, image.name)], at: selectedRange())
      return
    }
    if let text = pb.string(forType: .string), let edit = PasteRules.linkPaste(text: ns, selection: selectedRange(), pasted: text) {
      apply(edit)
      return
    }
    super.paste(sender)
  }

  private func imageData(from pb: NSPasteboard) -> (data: Data, ext: String, name: String?)? {
    if let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL],
       let u = urls.first, PasteRules.imageExtensions.contains(u.pathExtension.lowercased()), let data = try? Data(contentsOf: u) {
      return (data, u.pathExtension.lowercased() == "jpeg" ? "jpg" : u.pathExtension.lowercased(), u.lastPathComponent)
    }
    if let data = pb.data(forType: .png) { return (data, "png", nil) }
    if let images = pb.readObjects(forClasses: [NSImage.self]) as? [NSImage], let image = images.first, let png = Assets.png(from: image) { return (png, "png", nil) }
    return nil
  }

  private func placeImages(_ images: [(Data, String, String?)], at range: NSRange) {
    var rel: [String] = []
    for (data, ext, name) in images {
      switch Assets.save(data, ext: ext, preferredName: name, beside: styler?.baseURL) {
      case .success(let p): rel.append(p)
      case .failure(.noDocument): onToast?("Save the document first — images need a folder to live beside."); return
      case .failure(.write): onToast?("That image could not be saved beside the document — check the folder is writable."); return
      }
    }
    let insert = PasteRules.imageLinks(rel)
    apply(TextEdit(range: range, replacement: insert, selection: NSRange(location: range.location + 2, length: 0)))
  }

  // ---- drop: markdown files open, images place
  override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
    let pb = sender.draggingPasteboard
    guard let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty else {
      return super.performDragOperation(sender)
    }
    let docs = urls.filter { PasteRules.markdownExtensions.contains($0.pathExtension.lowercased()) }
    let images = urls.filter { PasteRules.imageExtensions.contains($0.pathExtension.lowercased()) }
    for u in docs { NSDocumentController.shared.openDocument(withContentsOf: u, display: true) { _, _, _ in } }
    if !images.isEmpty {
      let point = convert(sender.draggingLocation, from: nil)
      let at = characterIndexForInsertion(at: point)
      placeImages(images.compactMap { u in (try? Data(contentsOf: u)).map { ($0, u.pathExtension.lowercased() == "jpeg" ? "jpg" : u.pathExtension.lowercased(), u.lastPathComponent) } }, at: NSRange(location: at, length: 0))
    }
    if docs.isEmpty, images.isEmpty { onToast?("Drop markdown (.md, .markdown, .txt) to open it, or images (.png, .jpg, .gif, .webp) to place them."); }
    return true
  }
}
