import AppKit

/* The command palette (⌘K): every menu action, the recent files, the
 * themes and faces — one list, a search field, arrows and Enter. Pure
 * matching lives in PaletteMatch for tests. */
struct PaletteCommand {
  let id: String
  let title: String
  let hint: String
  let run: @MainActor () -> Void
}

enum PaletteMatch {
  /* Subsequence match with a small ranking: prefix beats word-start beats
   * scattered. nil when the query doesn't match at all. */
  static func score(_ query: String, _ title: String) -> Int? {
    let q = query.lowercased(), t = title.lowercased()
    if q.isEmpty { return 0 }
    if t.hasPrefix(q) { return 3 }
    if t.contains(" " + q) { return 2 }
    var ti = t.startIndex
    for ch in q {
      guard let found = t[ti...].firstIndex(of: ch) else { return nil }
      ti = t.index(after: found)
    }
    return 1
  }

  static func filter(_ commands: [PaletteCommand], _ query: String) -> [PaletteCommand] {
    commands.compactMap { c in score(query, c.title).map { (c, $0) } }
      .sorted { $0.1 > $1.1 }
      .map { $0.0 }
  }
}

@MainActor
final class PaletteController: NSObject, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
  static let shared = PaletteController()
  private var panel: NSPanel?
  private var field: NSSearchField!
  private var table: NSTableView!
  private var all: [PaletteCommand] = []
  private var shown: [PaletteCommand] = []

  var isVisible: Bool { panel?.isVisible ?? false }

  func toggle() {
    if isVisible { close() } else { open() }
  }

  func close() {
    panel?.orderOut(nil)
  }

  private func open() {
    all = PaletteCommands.all()
    shown = all
    if panel == nil { build() }
    let p = panel!
    p.appearance = NSAppearance(named: Tokens.theme.isDark ? .darkAqua : .aqua)
    p.backgroundColor = Tokens.Palette.paper
    field.stringValue = ""
    table.reloadData()
    if shown.count > 0 { table.selectRowIndexes([0], byExtendingSelection: false) }
    if let key = NSApp.keyWindow, key !== p {
      let f = key.frame
      p.setFrameOrigin(NSPoint(x: f.midX - p.frame.width / 2, y: f.maxY - 120 - p.frame.height))
    } else { p.center() }
    p.makeKeyAndOrderFront(nil)
    p.makeFirstResponder(field)
  }

  private func build() {
    let p = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 560, height: 380), styleMask: [.titled, .nonactivatingPanel, .fullSizeContentView], backing: .buffered, defer: false)
    p.titleVisibility = .hidden
    p.titlebarAppearsTransparent = true
    p.isMovableByWindowBackground = true
    p.isReleasedWhenClosed = false
    p.hidesOnDeactivate = true
    p.level = .floating
    let content = NSView(frame: p.contentView!.bounds)
    field = NSSearchField(frame: NSRect(x: 12, y: 336, width: 536, height: 32))
    field.placeholderString = "Type a command…"
    field.font = Tokens.Typography.ui
    field.delegate = self
    field.sendsSearchStringImmediately = true
    field.setAccessibilityIdentifier("palette-search")
    table = NSTableView(frame: .zero)
    let column = NSTableColumn(identifier: .init("c")); column.width = 536
    table.addTableColumn(column)
    table.headerView = nil
    table.rowHeight = 28
    table.dataSource = self
    table.delegate = self
    table.backgroundColor = .clear
    table.selectionHighlightStyle = .regular
    table.target = self
    table.action = #selector(rowClicked)
    table.setAccessibilityIdentifier("palette-list")
    let scroll = NSScrollView(frame: NSRect(x: 12, y: 12, width: 536, height: 316))
    scroll.documentView = table
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    content.addSubview(field); content.addSubview(scroll)
    p.contentView = content
    panel = p
  }

  // ---- search field
  func controlTextDidChange(_ obj: Notification) {
    shown = PaletteMatch.filter(all, field.stringValue)
    table.reloadData()
    if shown.count > 0 { table.selectRowIndexes([0], byExtendingSelection: false) }
  }

  func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
    switch selector {
    case #selector(NSResponder.moveDown(_:)): move(1); return true
    case #selector(NSResponder.moveUp(_:)): move(-1); return true
    case #selector(NSResponder.insertNewline(_:)): runSelected(); return true
    case #selector(NSResponder.cancelOperation(_:)): close(); return true
    default: return false
    }
  }

  private func move(_ delta: Int) {
    guard shown.count > 0 else { return }
    let row = max(0, min(shown.count - 1, table.selectedRow + delta))
    table.selectRowIndexes([row], byExtendingSelection: false)
    table.scrollRowToVisible(row)
  }

  @objc private func rowClicked() { runSelected() }

  private func runSelected() {
    guard table.selectedRow >= 0, table.selectedRow < shown.count else { return }
    let command = shown[table.selectedRow]
    close()
    command.run()
  }

  // ---- table
  func numberOfRows(in tableView: NSTableView) -> Int { shown.count }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let cell = NSView()
    let title = NSTextField(labelWithString: shown[row].title)
    title.font = Tokens.Typography.ui
    title.textColor = Tokens.Palette.ink
    title.frame = NSRect(x: 10, y: 5, width: 400, height: 18)
    let hint = NSTextField(labelWithString: shown[row].hint)
    hint.font = Tokens.Typography.ui
    hint.textColor = Tokens.Palette.inkGhost
    hint.alignment = .right
    hint.lineBreakMode = .byTruncatingMiddle
    hint.frame = NSRect(x: 300, y: 5, width: 226, height: 18)
    cell.addSubview(title); cell.addSubview(hint)
    return cell
  }
}

/* The command list, rebuilt each time the palette opens. */
@MainActor
enum PaletteCommands {
  static func all() -> [PaletteCommand] {
    var out: [PaletteCommand] = []
    // Every menu item with an action, under its menu's name.
    func walk(_ menu: NSMenu, prefix: String) {
      for item in menu.items {
        if let sub = item.submenu { walk(sub, prefix: prefix.isEmpty ? item.title : "\(prefix): \(item.title)"); continue }
        guard let action = item.action, !item.title.isEmpty, item.title != "Clear Menu" else { continue }
        let title = prefix == "Foolscap" || prefix == "File" || prefix == "Edit" || prefix == "View" || prefix == "Window" || prefix == "Help" ? item.title : "\(prefix): \(item.title)"
        let hint = keyHint(item)
        out.append(PaletteCommand(id: "menu:\(prefix):\(item.title)", title: title, hint: hint) {
          NSApp.sendAction(action, to: item.target, from: item)
        })
      }
    }
    if let main = NSApp.mainMenu { walk(main, prefix: "") }
    // Recent files, newest first.
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    for url in NSDocumentController.shared.recentDocumentURLs.prefix(10) {
      let dir = url.deletingLastPathComponent().path
      let shown = dir.hasPrefix(home) ? "~" + dir.dropFirst(home.count) : dir
      out.append(PaletteCommand(id: "recent:\(url.path)", title: "Open: \(url.lastPathComponent)", hint: shown) {
        NSDocumentController.shared.openDocument(withContentsOf: url, display: true) { _, _, error in if let error { NSApp.presentError(error) } }
      })
    }
    out.append(PaletteCommand(id: "theme:auto", title: "Theme: Auto (System)", hint: "") { AppSettings.shared.themeID = nil })
    for t in Theme.all { out.append(PaletteCommand(id: "theme:\(t.id)", title: "Theme: \(t.label)", hint: "") { AppSettings.shared.themeID = t.id }) }
    out.append(PaletteCommand(id: "font:default", title: "Font: Recursive (Default)", hint: "") { AppSettings.shared.fontID = nil })
    for f in WritingFace.all { out.append(PaletteCommand(id: "font:\(f.id)", title: "Font: \(f.label)", hint: f.serif ? "serif" : "sans") { AppSettings.shared.fontID = f.id }) }
    return out
  }

  private static func keyHint(_ item: NSMenuItem) -> String {
    guard !item.keyEquivalent.isEmpty else { return "" }
    var s = ""
    let m = item.keyEquivalentModifierMask
    if m.contains(.control) { s += "⌃" }
    if m.contains(.option) { s += "⌥" }
    if m.contains(.shift) { s += "⇧" }
    if m.contains(.command) { s += "⌘" }
    let key = item.keyEquivalent
    return s + (key == key.lowercased() && key.uppercased() != key ? key.uppercased() : key)
  }
}
