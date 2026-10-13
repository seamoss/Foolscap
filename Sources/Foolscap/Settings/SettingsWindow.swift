import AppKit
import SwiftUI

/* Settings (⌘,): a quiet card. SwiftUI for the chips — the one place it
 * belongs — hosted in a plain panel. Every control is a veneer over
 * AppSettings; the editors observe that. */
@MainActor
final class SettingsWindowController: NSWindowController {
  static let shared = SettingsWindowController()

  private init() {
    let host = NSHostingController(rootView: SettingsView().environmentObject(AppSettings.shared))
    let window = NSWindow(contentViewController: host)
    window.title = "Settings"
    window.styleMask = [.titled, .closable]
    window.setFrameAutosaveName("Foolscap.Settings")
    window.isReleasedWhenClosed = false
    super.init(window: window)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("not used") }

  func show() {
    window?.center()
    showWindow(nil)
    window?.makeKeyAndOrderFront(nil)
  }
}

struct SettingsView: View {
  @EnvironmentObject var settings: AppSettings

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      section("Theme") {
        chip("Auto", on: settings.themeID == nil) { settings.themeID = nil }
        ForEach(Theme.all) { t in chip(t.label, on: settings.themeID == t.id) { settings.themeID = t.id } }
      }
      section("Font") {
        chip("Recursive", on: settings.fontID == nil) { settings.fontID = nil }
        ForEach(WritingFace.all) { f in chip(f.label, on: settings.fontID == f.id) { settings.fontID = f.id } }
      }
      section("Writing") {
        chip("Typewriter", on: settings.typewriter) { settings.typewriter.toggle() }
        chip("Focus", on: settings.focus) { settings.focus.toggle() }
        chip("Word count", on: settings.wordCount) { settings.wordCount.toggle() }
      }
      section("Text size") {
        chip("−", on: false) { settings.textSize -= 1 }
        Text("\(settings.textSize) pt").font(.system(size: 13, design: .monospaced)).frame(minWidth: 40)
        chip("+", on: false) { settings.textSize += 1 }
        chip("Reset", on: false) { settings.textSize = AppSettings.defaultSize }
      }
    }
    .padding(24)
    .frame(width: 560)
  }

  private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title.uppercased()).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary).tracking(1)
      FlowLayout(spacing: 6) { content() }
    }
  }

  private func chip(_ label: String, on: Bool, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(label).font(.system(size: 13, weight: .medium)).padding(.horizontal, 10).padding(.vertical, 5)
    }
    .buttonStyle(.plain)
    .background(RoundedRectangle(cornerRadius: 6).fill(on ? Color.accentColor.opacity(0.18) : Color.primary.opacity(0.06)))
    .overlay(RoundedRectangle(cornerRadius: 6).stroke(on ? Color.accentColor : Color.clear, lineWidth: 1))
    .accessibilityIdentifier("chip-\(label)")
    .accessibilityAddTraits(on ? [.isSelected] : [])
  }
}

/* Chips wrap like text. */
struct FlowLayout: Layout {
  var spacing: CGFloat = 6
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? 560
    var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
    for s in subviews {
      let size = s.sizeThatFits(.unspecified)
      if x + size.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
      x += size.width + spacing; rowH = max(rowH, size.height)
    }
    return CGSize(width: width, height: y + rowH)
  }
  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
    for s in subviews {
      let size = s.sizeThatFits(.unspecified)
      if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
      s.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
      x += size.width + spacing; rowH = max(rowH, size.height)
    }
  }
}
