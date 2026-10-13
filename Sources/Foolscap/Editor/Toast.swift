import AppKit

/* A transient notice in the window's corner: one slot, self-dismissing. */
@MainActor
enum Toast {
  private static var current: NSView?

  static func show(_ message: String, in window: NSWindow?) {
    guard let content = window?.contentView else { NSSound.beep(); return }
    current?.removeFromSuperview()
    let label = NSTextField(labelWithString: message)
    label.font = Tokens.Typography.ui
    label.textColor = Tokens.Palette.ink
    label.maximumNumberOfLines = 2
    label.preferredMaxLayoutWidth = 420
    let box = NSView()
    box.wantsLayer = true
    box.layer?.backgroundColor = Tokens.Palette.paperSunk.cgColor
    box.layer?.borderColor = Tokens.Palette.rule.cgColor
    box.layer?.borderWidth = 1
    box.layer?.cornerRadius = 6
    box.addSubview(label)
    label.frame = NSRect(x: 12, y: 8, width: label.intrinsicContentSize.width, height: label.intrinsicContentSize.height)
    box.frame = NSRect(x: content.bounds.midX - (label.frame.width + 24) / 2, y: 24, width: label.frame.width + 24, height: label.frame.height + 16)
    box.autoresizingMask = [.minXMargin, .maxXMargin, .maxYMargin]
    content.addSubview(box)
    current = box
    DispatchQueue.main.asyncAfter(deadline: .now() + Tokens.Motion.toast) { [weak box] in
      guard let box, current === box else { return }
      NSAnimationContext.runAnimationGroup({ $0.duration = Tokens.Motion.fade; box.animator().alphaValue = 0 }) { box.removeFromSuperview(); if current === box { current = nil } }
    }
  }
}
