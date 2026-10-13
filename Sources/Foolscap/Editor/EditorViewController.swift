import AppKit

/* The editor: an NSTextView on TextKit 2, holding plain markdown. The live
 * preview is LiveStyler's attributes over that text — this controller only
 * wires the view and tells the styler when the text or the selection
 * changed. Undo is the document's: the text view finds NSDocument's undo
 * manager through the window, so every edit dirties the document and ⌘Z
 * walks back through it — nothing here overrides undoManager (a controller
 * override and the text view's lookup call each other forever). */
final class EditorViewController: NSViewController, NSTextViewDelegate, NSTextLayoutManagerDelegate {
  private(set) var textView: FoolscapTextView!
  private var styler: LiveStyler!
  private var scroll: NSScrollView!
  private var settingsObserver: NSObjectProtocol?

  var string: String { textView.string }

  override func loadView() {
    let scroll = NSScrollView()
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = true
    scroll.backgroundColor = Tokens.Palette.paper

    let tv = FoolscapTextView(usingTextLayoutManager: true)
    tv.isRichText = false
    tv.allowsUndo = true
    tv.isAutomaticQuoteSubstitutionEnabled = false
    tv.isAutomaticDashSubstitutionEnabled = false
    tv.isAutomaticTextReplacementEnabled = false
    tv.isAutomaticSpellingCorrectionEnabled = false
    tv.isContinuousSpellCheckingEnabled = true
    tv.usesFontPanel = false
    tv.drawsBackground = false
    tv.font = Tokens.Typography.regular
    tv.textColor = Tokens.Palette.ink
    tv.insertionPointColor = Tokens.Palette.accent
    tv.textContainerInset = NSSize(width: Tokens.Layout.minGutter, height: Tokens.Layout.topInset)
    tv.setAccessibilityIdentifier("editor")
    tv.isVerticallyResizable = true
    tv.isHorizontallyResizable = false
    tv.autoresizingMask = [.width]
    tv.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    tv.textContainer?.widthTracksTextView = true
    tv.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
    tv.delegate = self
    tv.usesFindBar = true
    tv.isIncrementalSearchingEnabled = true
    tv.onToast = { [weak self] message in Toast.show(message, in: self?.view.window) }
    scroll.documentView = tv
    textView = tv
    self.scroll = scroll
    styler = LiveStyler(textView: tv)
    tv.styler = styler
    tv.textLayoutManager?.delegate = self
    view = scroll
    applyAppearance()
    settingsObserver = NotificationCenter.default.addObserver(forName: AppSettings.changed, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.settingsChanged() }
    }
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    measure()
  }

  /* Full width minus the page inset — the editor is a desk, not a column. */
  private func measure() {
    let gutter = Tokens.Layout.pageInset
    if textView.textContainerInset.width != gutter {
      textView.textContainerInset = NSSize(width: gutter, height: Tokens.Layout.topInset)
    }
  }

  /* Theme and type in force: the paper, the caret, the selection, the
   * window's appearance (so system chrome matches a dark theme), and a
   * full restyle for the type. */
  private func applyAppearance() {
    scroll.backgroundColor = Tokens.Palette.paper
    textView.backgroundColor = Tokens.Palette.paper
    textView.insertionPointColor = Tokens.Palette.accent
    textView.selectedTextAttributes = [.backgroundColor: Tokens.Palette.selection]
    view.window?.appearance = NSAppearance(named: Tokens.theme.isDark ? .darkAqua : .aqua)
    view.window?.backgroundColor = Tokens.Palette.paper
  }

  override func viewDidAppear() {
    super.viewDidAppear()
    applyAppearance()
  }

  private func settingsChanged() {
    applyAppearance()
    styler.restyle(selection: textView.selectedRange())
  }

  /* Where relative image paths resolve from — the document's folder. */
  var baseURL: URL? {
    get { styler.baseURL }
    set { styler.baseURL = newValue; textView.textLayoutManager?.invalidateLayout(for: textView.textLayoutManager!.documentRange) }
  }

  /* TextKit 2 asks per paragraph; blocks get a BlockFragment that draws
   * their costume, everything else the stock fragment. */
  nonisolated func textLayoutManager(_ textLayoutManager: NSTextLayoutManager, textLayoutFragmentFor location: any NSTextLocation, in textElement: NSTextElement) -> NSTextLayoutFragment {
    // The protocol is nonisolated; NSTextView drives layout on the main
    // thread, which this asserts rather than assumes.
    // NSTextLayoutFragment isn't Sendable, so it can't be the closure's
    // result; it rides out through a local the closure assigns on main.
    nonisolated(unsafe) var made: NSTextLayoutFragment?
    nonisolated(unsafe) let element = textElement
    nonisolated(unsafe) let manager = textLayoutManager
    MainActor.assumeIsolated { made = fragment(for: element, in: manager) }
    return made ?? NSTextLayoutFragment(textElement: textElement, range: textElement.elementRange)
  }

  private func fragment(for textElement: NSTextElement, in textLayoutManager: NSTextLayoutManager) -> NSTextLayoutFragment {
    guard let elementRange = textElement.elementRange else { return NSTextLayoutFragment(textElement: textElement, range: textElement.elementRange) }
    let start = textLayoutManager.offset(from: textLayoutManager.documentRange.location, to: elementRange.location)
    let end = textLayoutManager.offset(from: textLayoutManager.documentRange.location, to: elementRange.endLocation)
    let paragraph = NSRange(location: start, length: end - start)
    if let (decoration, image) = styler.decoration(forParagraph: paragraph) {
      let measure = textView.textContainer.map { $0.size.width - $0.lineFragmentPadding * 2 } ?? 700
      return BlockFragment(textElement: textElement, range: elementRange, decoration: decoration, image: image, measure: measure, style: .current)
    }
    return NSTextLayoutFragment(textElement: textElement, range: elementRange)
  }

  /* Replace the whole text — opening, reverting, an external change. Goes
   * through the storage directly (not insertText) so it is not an undoable
   * edit and does not dirty the document. */
  func load(_ text: String) {
    loadViewIfNeeded() // the document loads before the window shows the view
    applyAppearance()
    guard let storage = textView.textStorage else { return }
    storage.beginEditing()
    storage.replaceCharacters(in: NSRange(location: 0, length: storage.length), with: text)
    storage.endEditing()
    textView.undoManager?.removeAllActions()
    textView.setSelectedRange(NSRange(location: 0, length: 0))
    styler.restyle(selection: textView.selectedRange())
  }

  /* Hooks for the desk: the outline and the word count follow restyles. */
  var onRestyle: ((NSString, [Construct]) -> Void)? {
    get { styler.onRestyle }
    set { styler.onRestyle = newValue }
  }
  var typewriter = false
  var focusMode: Bool {
    get { styler.focusMode }
    set { styler.focusMode = newValue }
  }

  func textDidChange(_ notification: Notification) {
    styler.restyle(selection: textView.selectedRange())
    if typewriter { centerCaret() }
  }

  /* Typewriter mode: the line being typed stays vertically centred. */
  private func centerCaret() {
    guard let tlm = textView.textLayoutManager, let cs = textView.textContentStorage,
          let loc = cs.location(cs.documentRange.location, offsetBy: textView.selectedRange().location) else { return }
    tlm.ensureLayout(for: NSTextRange(location: loc))
    var caretY: CGFloat? = nil
    tlm.enumerateTextLayoutFragments(from: loc, options: [.ensuresLayout]) { f in caretY = f.layoutFragmentFrame.midY; return false }
    guard let y = caretY else { return }
    let target = max(0, y - scroll.contentSize.height / 2)
    scroll.contentView.animator().setBoundsOrigin(NSPoint(x: 0, y: target))
    scroll.reflectScrolledClipView(scroll.contentView)
  }

  func jump(to location: Int) {
    let at = min(location, (textView.string as NSString).length)
    textView.setSelectedRange(NSRange(location: at, length: 0))
    textView.scrollRangeToVisible(NSRange(location: at, length: 0))
    view.window?.makeFirstResponder(textView)
  }

  /* Where the reader is: caret and the top-of-view offset. */
  var position: DocPosition {
    let top = textView.characterIndexForInsertion(at: NSPoint(x: textView.textContainerInset.width, y: scroll.contentView.bounds.minY + textView.textContainerInset.height))
    return DocPosition(head: textView.selectedRange().location, top: top)
  }

  func restore(_ p: DocPosition) {
    let n = (textView.string as NSString).length
    textView.setSelectedRange(NSRange(location: min(p.head, n), length: 0))
    textView.scrollRangeToVisible(NSRange(location: min(p.top, n), length: 0))
  }

  func textViewDidChangeSelection(_ notification: Notification) {
    styler.selectionChanged(to: textView.selectedRange())
  }
}
