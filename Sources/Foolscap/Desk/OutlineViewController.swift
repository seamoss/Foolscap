import AppKit

/* The outline (⇧⌘O): headings in a sidebar, click to jump. Fed from the
 * editor's constructs on every restyle. */
@MainActor
final class OutlineViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
  private let table = NSTableView()
  private var headings: [(level: Int, title: String, location: Int)] = []
  var onJump: ((Int) -> Void)?

  override func loadView() {
    let scroll = NSScrollView()
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = true
    let column = NSTableColumn(identifier: .init("h")); column.width = 220
    table.addTableColumn(column)
    table.headerView = nil
    table.rowHeight = 24
    table.dataSource = self
    table.delegate = self
    table.target = self
    table.action = #selector(clicked)
    table.setAccessibilityIdentifier("outline")
    scroll.documentView = table
    view = scroll
    view.frame = NSRect(x: 0, y: 0, width: 240, height: 600)
    applyAppearance()
  }

  func applyAppearance() {
    (view as? NSScrollView)?.backgroundColor = Tokens.Palette.paperSunk
    table.backgroundColor = Tokens.Palette.paperSunk
    table.reloadData()
  }

  func update(text: NSString, constructs: [Construct]) {
    headings = constructs.compactMap {
      if case .heading(let level) = $0.kind { return (level, text.substring(with: $0.content).trimmingCharacters(in: .whitespaces), $0.range.location) }
      return nil
    }
    table.reloadData()
  }

  @objc private func clicked() {
    guard table.clickedRow >= 0, table.clickedRow < headings.count else { return }
    onJump?(headings[table.clickedRow].location)
  }

  func numberOfRows(in tableView: NSTableView) -> Int { headings.count }

  func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
    let h = headings[row]
    let label = NSTextField(labelWithString: h.title)
    label.font = h.level <= 2 ? Tokens.Typography.body(weight: 500) : Tokens.Typography.ui
    label.textColor = h.level <= 2 ? Tokens.Palette.ink : Tokens.Palette.inkSoft
    label.lineBreakMode = .byTruncatingTail
    let cell = NSView()
    label.frame = NSRect(x: 8 + CGFloat(h.level - 1) * 12, y: 3, width: 220 - CGFloat(h.level - 1) * 12, height: 18)
    cell.addSubview(label)
    return cell
  }
}
