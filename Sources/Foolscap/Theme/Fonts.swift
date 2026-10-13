import AppKit
import CoreText

/* The bundled faces — Recursive (body and UI), Fraunces (headings), and
 * Ioskeley Mono (code) — registered for this process from Resources/Fonts
 * at launch, and resolved by file rather than by family name so a font's
 * own naming (Recursive calls its default instance "Recursive Sans Linear
 * Light") can never send us to a system fallback. Variation axes are set
 * through CoreText; the token file says which. */
enum Fonts {
  enum Role { case body, ui, code, heading }

  private struct Face { let file: String; let descriptor: NSFontDescriptor }
  nonisolated(unsafe) private static var faces: [String: Face] = [:]
  nonisolated(unsafe) private static var registered = false

  private static let files: [String: String] = [
    "recursive": "Recursive[CASL,CRSV,MONO,slnt,wght].ttf",
    "fraunces": "Fraunces[SOFT,WONK,opsz,wght].ttf",
    "fraunces-italic": "Fraunces-Italic[SOFT,WONK,opsz,wght].ttf",
    // Regular and Italic only: code is never set bold, and each Ioskeley
    // face is 2 MB. Phase 5 subsets these.
    "ioskeley": "IoskeleyMono-Regular.ttf",
    "ioskeley-italic": "IoskeleyMono-Italic.ttf"
  ]

  /* Idempotent; the app calls it once at launch and tests call it freely. */
  static func register() {
    guard !registered else { return }
    registered = true
    guard let dir = Bundle.main.resourceURL?.appendingPathComponent("Fonts") else { return }
    for (key, file) in files {
      let url = dir.appendingPathComponent(file)
      CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
      guard let descs = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor], let first = descs.first else { continue }
      faces[key] = Face(file: file, descriptor: first as NSFontDescriptor)
    }
  }

  static var isLoaded: Bool { register(); return faces.count == files.count }

  /* A variation axis by its four-character tag, e.g. ("CASL", 0.4). */
  typealias Axes = [(tag: String, value: Double)]

  static func font(_ key: String, size: CGFloat, axes: Axes = []) -> NSFont? {
    register()
    guard let face = faces[key] else { return nil }
    var descriptor = face.descriptor
    if !axes.isEmpty {
      var variation: [NSNumber: NSNumber] = [:]
      for (tag, value) in axes { variation[NSNumber(value: Self.tagValue(tag))] = NSNumber(value: value) }
      descriptor = descriptor.addingAttributes([NSFontDescriptor.AttributeName(kCTFontVariationAttribute as String): variation])
    }
    return NSFont(descriptor: descriptor, size: size)
  }

  private static func tagValue(_ tag: String) -> UInt32 {
    tag.utf8.reduce(0) { ($0 << 8) | UInt32($1) }
  }
}
