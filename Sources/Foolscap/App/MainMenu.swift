import AppKit

/* The menu bar, in code. Standard selectors throughout, so NSDocumentController
 * and the first responder chain do the work: openDocument:, saveDocument:,
 * undo:, and friends need no target. */
enum MainMenu {
  static func build() -> NSMenu {
    let menu = NSMenu()
    menu.addItem(app())
    menu.addItem(file())
    menu.addItem(edit())
    menu.addItem(format())
    menu.addItem(view())
    menu.addItem(window())
    menu.addItem(help())
    return menu
  }

  private static func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
    let it = NSMenuItem(title: title, action: action, keyEquivalent: key)
    it.keyEquivalentModifierMask = mods
    return it
  }

  private static func submenu(_ title: String, _ items: [NSMenuItem]) -> NSMenuItem {
    let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    let m = NSMenu(title: title)
    items.forEach(m.addItem)
    holder.submenu = m
    return holder
  }

  private static func app() -> NSMenuItem {
    submenu("Foolscap", [
      item("About Foolscap", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
      .separator(),
      item("Settings…", #selector(AppDelegate.showSettings(_:)), ","),
      .separator(),
      item("Hide Foolscap", #selector(NSApplication.hide(_:)), "h"),
      item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
      item("Show All", #selector(NSApplication.unhideAllApplications(_:))),
      .separator(),
      item("Quit Foolscap", #selector(NSApplication.terminate(_:)), "q")
    ])
  }

  private static func file() -> NSMenuItem {
    // NSDocumentController fills "Open Recent" itself once it finds a submenu
    // whose last item clears the recents.
    let recent = submenu("Open Recent", [item("Clear Menu", #selector(NSDocumentController.clearRecentDocuments(_:)))])
    return submenu("File", [
      item("New Tab", #selector(DocumentWindowController.newTab(_:)), "t"),
      item("New Window", #selector(NSDocumentController.newDocument(_:)), "n"),
      item("Open…", #selector(NSDocumentController.openDocument(_:)), "o"),
      recent,
      item("Reopen Closed Tab", #selector(AppDelegate.reopenClosedDocument(_:)), "T"),
      .separator(),
      item("Close", #selector(NSWindow.performClose(_:)), "w"),
      item("Save", #selector(NSDocument.save(_:)), "s"),
      item("Save As…", #selector(NSDocument.saveAs(_:)), "S"),
      item("Revert to Saved", #selector(NSDocument.revertToSaved(_:))),
      item("Browse All Versions…", #selector(NSDocument.browseVersions(_:))),
      .separator(),
      submenu("Export", [
        item("As HTML…", #selector(MarkdownDocument.exportHTML(_:))),
        item("As PDF…", #selector(MarkdownDocument.exportPDF(_:)))
      ]),
      item("Copy as Rich Text", #selector(MarkdownDocument.copyAsRichText(_:)), "c", [.command, .option]),
      .separator(),
      item("Reveal in Finder", #selector(MarkdownDocument.revealInFinder(_:))),
      item("Copy Path", #selector(MarkdownDocument.copyPath(_:))),
      item("Page Setup…", #selector(NSDocument.runPageLayout(_:)), "P"),
      item("Print…", #selector(NSDocument.printDocument(_:)), "p")
    ])
  }

  private static func edit() -> NSMenuItem {
    submenu("Edit", [
      item("Undo", Selector(("undo:")), "z"),
      item("Redo", Selector(("redo:")), "Z"),
      .separator(),
      item("Cut", #selector(NSText.cut(_:)), "x"),
      item("Copy", #selector(NSText.copy(_:)), "c"),
      item("Paste", #selector(NSText.paste(_:)), "v"),
      item("Select All", #selector(NSText.selectAll(_:)), "a"),
      .separator(),
      submenu("Find", [
        findItem("Find…", 1, "f"),
        findItem("Find and Replace…", 12, "f", [.command, .option]),
        findItem("Find Next", 2, "g"),
        findItem("Find Previous", 3, "G"),
        findItem("Use Selection for Find", 7, "e")
      ])
    ])
  }

  /* NSTextView's find bar, driven by the standard performFindPanelAction:
   * with the NSFindPanelAction tags. */
  private static func findItem(_ title: String, _ tag: Int, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
    let it = item(title, #selector(NSTextView.performFindPanelAction(_:)), key, mods)
    it.tag = tag
    return it
  }

  private static func format() -> NSMenuItem {
    submenu("Format", [
      item("Bold", #selector(FoolscapTextView.toggleBold(_:)), "b"),
      item("Italic", #selector(FoolscapTextView.toggleItalic(_:)), "i"),
      item("Strikethrough", #selector(FoolscapTextView.toggleStrikethrough(_:)), "X"),
      item("Inline Code", #selector(FoolscapTextView.toggleInlineCode(_:)), "C"),
      .separator(),
      item("Link", #selector(FoolscapTextView.insertLink(_:)), "K")
    ])
  }

  private static func view() -> NSMenuItem {
    submenu("View", [
      item("Commands…", #selector(AppDelegate.togglePalette(_:)), "k"),
      item("Toggle Preview", #selector(DocumentViewController.togglePreview(_:)), "e"),
      item("Toggle Outline", #selector(DocumentViewController.toggleOutline(_:)), "O"),
      item("Toggle Typewriter Mode", #selector(DocumentViewController.toggleTypewriter(_:))),
      item("Toggle Focus Mode", #selector(DocumentViewController.toggleFocus(_:))),
      item("Toggle Word Count", #selector(DocumentViewController.toggleWordCount(_:))),
      .separator(),
      item("Larger Text", #selector(AppDelegate.textLarger(_:)), "+"),
      item("Smaller Text", #selector(AppDelegate.textSmaller(_:)), "-"),
      item("Actual Text Size", #selector(AppDelegate.textReset(_:)), "0"),
      .separator(),
      item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])
    ])
  }

  private static func help() -> NSMenuItem {
    let h = submenu("Help", [
      item("wtf is this?", #selector(AppDelegate.showManual(_:)), "?")
    ])
    NSApp.helpMenu = h.submenu
    return h
  }

  private static func window() -> NSMenuItem {
    let w = submenu("Window", [
      item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
      item("Zoom", #selector(NSWindow.performZoom(_:))),
      .separator(),
      item("Bring All to Front", #selector(NSApplication.arrangeInFront(_:)))
    ])
    NSApp.windowsMenu = w.submenu
    return w
  }
}
