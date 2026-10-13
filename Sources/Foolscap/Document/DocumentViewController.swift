import AppKit

/* The window's content: the outline in a collapsible sidebar, the editor,
 * the page over it when previewing, and the word count whispering in the
 * corner. The editor stays mounted underneath the page. */
@MainActor
final class DocumentViewController: NSSplitViewController {
  let editor = EditorViewController()
  let outline = OutlineViewController()
  let page = PageView(frame: .zero)
  private let stage = NSViewController()
  private let wordCount = NSTextField(labelWithString: "")
  private(set) var previewing = false
  private var documentTitle: () -> String = { "Untitled" }
  private var settingsObserver: NSObjectProtocol?
  private var peekTimer: Timer?
  private var tracking: NSTrackingArea?

  override func viewDidLoad() {
    super.viewDidLoad()
    let side = NSSplitViewItem(sidebarWithViewController: outline)
    side.minimumThickness = 180
    side.maximumThickness = 360
    side.isCollapsed = true
    side.canCollapse = true
    addSplitViewItem(side)
    let stageView = StageView()
    stageView.onLayout = { [weak self] in self?.layoutStage() }
    stage.view = stageView
    editor.view.frame = stage.view.bounds
    page.frame = stage.view.bounds
    page.isHidden = true
    stage.view.addSubview(editor.view)
    stage.view.addSubview(page)
    wordCount.font = Tokens.Typography.ui
    wordCount.alignment = .right
    wordCount.alphaValue = 0
    wordCount.setAccessibilityIdentifier("wordcount")
    stage.view.addSubview(wordCount)
    addSplitViewItem(NSSplitViewItem(viewController: stage))
    splitView.dividerStyle = .thin
    page.onEdit = { [weak self] pos in self?.exitPreview(to: pos) }
    outline.onJump = { [weak self] loc in
      guard let self else { return }
      if previewing { page.scroll(to: loc) } else { editor.jump(to: loc) }
    }
    editor.onRestyle = { [weak self] text, constructs in
      self?.outline.update(text: text, constructs: constructs)
      self?.wordCount.stringValue = "\(countWords(text as String)) words"
    }
    applySettings()
    settingsObserver = NotificationCenter.default.addObserver(forName: AppSettings.changed, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.applySettings() }
    }
  }

  /* The window's content view runs under the translucent title bar; the
   * editor and the page stop below it, so text never scrolls under the
   * title — the bar shows paper, like the Electron app's drag strip. */
  private func layoutStage() {
    let bar = view.window.map { $0.frame.height - $0.contentLayoutRect.height } ?? 0
    var b = stage.view.bounds
    b.size.height -= bar
    editor.view.frame = b
    page.frame = b
    wordCount.frame = NSRect(x: b.maxX - 220, y: 14, width: 200, height: 18)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    layoutStage()
    let b = stage.view.bounds
    if let tracking { stage.view.removeTrackingArea(tracking) }
    let t = NSTrackingArea(rect: b, options: [.mouseMoved, .activeInKeyWindow, .inVisibleRect], owner: self, userInfo: nil)
    stage.view.addTrackingArea(t)
    tracking = t
  }

  /* The word count fades in on mouse movement and out two seconds later. */
  override func mouseMoved(with event: NSEvent) {
    guard AppSettings.shared.wordCount else { return }
    wordCount.animator().alphaValue = 1
    peekTimer?.invalidate()
    peekTimer = Timer.scheduledTimer(withTimeInterval: Tokens.Motion.wordCountPeek, repeats: false) { [weak self] _ in
      Task { @MainActor in self?.wordCount.animator().alphaValue = 0 }
    }
  }

  private func applySettings() {
    let s = AppSettings.shared
    editor.typewriter = s.typewriter
    editor.focusMode = s.focus
    wordCount.textColor = Tokens.Palette.inkGhost
    if !s.wordCount { wordCount.alphaValue = 0 }
    outline.applyAppearance()
  }

  func configure(title: @escaping () -> String) { documentTitle = title }

  var documentDirectory: URL? {
    get { page.documentDirectory }
    set { page.documentDirectory = newValue; editor.baseURL = newValue }
  }

  @objc func toggleOutline(_ sender: Any?) { splitViewItems[0].animator().isCollapsed.toggle() }
  @objc func toggleTypewriter(_ sender: Any?) { AppSettings.shared.typewriter.toggle() }
  @objc func toggleFocus(_ sender: Any?) { AppSettings.shared.focus.toggle() }
  @objc func toggleWordCount(_ sender: Any?) { AppSettings.shared.wordCount.toggle() }

  @objc func togglePreview(_ sender: Any?) {
    if previewing { exitPreview(to: nil) } else { enterPreview() }
  }

  func enterPreview() {
    let html = ExportHTML.document(markdown: editor.string, title: documentTitle(), mode: .inApp(theme: Tokens.theme, sourcePositions: true), stylesheet: Stylesheet.export)
    let caret = editor.textView.selectedRange().location
    page.load(html: html, scrollTo: caret)
    page.isHidden = false
    previewing = true
    view.window?.makeFirstResponder(page.webView)
  }

  func exitPreview(to pos: Int?) {
    page.isHidden = true
    previewing = false
    if let pos { editor.jump(to: pos) }
    view.window?.makeFirstResponder(editor.textView)
  }

  override func cancelOperation(_ sender: Any?) {
    if previewing { exitPreview(to: nil) }
  }
}

/* A plain view that tells its controller when it's been laid out — the
 * split view resizes it directly, bypassing viewDidLayout. */
final class StageView: NSView {
  var onLayout: (() -> Void)?
  override func layout() {
    super.layout()
    onLayout?()
  }
  override var isFlipped: Bool { false }
}
