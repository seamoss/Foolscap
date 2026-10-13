import AppKit
import Combine

/* The user's choices — theme, writing face, text size — one object, backed
 * by UserDefaults, observed by every editor. Nothing here is per-document. */
@MainActor
final class AppSettings: ObservableObject {
  static let shared = AppSettings()
  static let changed = Notification.Name("foolscap.settings.changed")

  private let defaults: UserDefaults

  /* nil = Auto (Ledger by day, Plate by night). */
  @Published var themeID: String? { didSet { persist("theme", themeID); announce() } }
  /* nil = the house face (Recursive, or Fraunces under Manuscript). */
  @Published var fontID: String? { didSet { persist("font", fontID); announce() } }
  @Published var typewriter: Bool { didSet { defaults.set(typewriter, forKey: "typewriter"); announce() } }
  @Published var focus: Bool { didSet { defaults.set(focus, forKey: "focus"); announce() } }
  @Published var wordCount: Bool { didSet { defaults.set(wordCount, forKey: "wordCount"); announce() } }
  @Published var textSize: Int {
    didSet {
      // A @Published setter re-enters didSet on assignment, so clamp only
      // when it changes the value, and return — the re-entry does the rest.
      let clamped = Self.clamp(textSize)
      if clamped != textSize { textSize = clamped; return }
      defaults.set(textSize, forKey: "textSize")
      announce()
    }
  }

  static let sizeRange = 14...22
  static let defaultSize = 17
  static func clamp(_ n: Int) -> Int { min(max(n, sizeRange.lowerBound), sizeRange.upperBound) }

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    themeID = defaults.string(forKey: "theme").flatMap { Theme.named($0)?.id }
    fontID = defaults.string(forKey: "font").flatMap { WritingFace.named($0)?.id }
    let saved = defaults.integer(forKey: "textSize")
    textSize = saved == 0 ? Self.defaultSize : Self.clamp(saved)
    typewriter = defaults.bool(forKey: "typewriter")
    focus = defaults.bool(forKey: "focus")
    wordCount = defaults.object(forKey: "wordCount") as? Bool ?? true
  }

  /* The theme in force right now, Auto resolved against the system. */
  var theme: Theme {
    if let themeID, let t = Theme.named(themeID) { return t }
    let dark = NSApp?.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
    return Theme.auto(dark: dark)
  }

  var face: WritingFace? { fontID.flatMap(WritingFace.named) }

  private func persist(_ key: String, _ value: String?) {
    if let value { defaults.set(value, forKey: key) } else { defaults.removeObject(forKey: key) }
  }

  private func announce() { NotificationCenter.default.post(name: Self.changed, object: self) }
}

/* The writing-face roster. The Electron app bundled ten Google faces; here
 * the page offers the house face plus faces every Mac already has — the
 * app stays small and the choice stays real. One face carries the page;
 * code keeps its mono. */
struct WritingFace: Identifiable, Equatable, Sendable {
  let id: String
  let label: String
  let family: String
  let serif: Bool

  static let all: [WritingFace] = [
    WritingFace(id: "new-york", label: "New York", family: ".New York", serif: true),
    WritingFace(id: "charter", label: "Charter", family: "Charter", serif: true),
    WritingFace(id: "georgia", label: "Georgia", family: "Georgia", serif: true),
    WritingFace(id: "palatino", label: "Palatino", family: "Palatino", serif: true),
    WritingFace(id: "iowan", label: "Iowan Old Style", family: "Iowan Old Style", serif: true),
    WritingFace(id: "sf", label: "SF Pro", family: ".AppleSystemUIFont", serif: false),
    WritingFace(id: "helvetica-neue", label: "Helvetica Neue", family: "Helvetica Neue", serif: false),
    WritingFace(id: "avenir-next", label: "Avenir Next", family: "Avenir Next", serif: false),
    WritingFace(id: "seravek", label: "Seravek", family: "Seravek", serif: false),
    WritingFace(id: "gill-sans", label: "Gill Sans", family: "Gill Sans", serif: false)
  ]

  static func named(_ id: String) -> WritingFace? { all.first { $0.id == id } }

  func font(size: CGFloat, weight: NSFont.Weight = .regular, italic: Bool = false) -> NSFont {
    let base: NSFont
    if id == "sf" { base = NSFont.systemFont(ofSize: size, weight: weight) }
    else if id == "new-york" {
      let d = NSFont.systemFont(ofSize: size, weight: weight).fontDescriptor.withDesign(.serif) ?? NSFontDescriptor()
      base = NSFont(descriptor: d, size: size) ?? NSFont.systemFont(ofSize: size)
    } else {
      let m = NSFontManager.shared
      base = m.font(withFamily: family, traits: weight == .bold ? .boldFontMask : [], weight: weight == .bold ? 9 : 5, size: size) ?? NSFont.systemFont(ofSize: size)
    }
    return italic ? NSFontManager.shared.convert(base, toHaveTrait: .italicFontMask) : base
  }
}
