import AppKit

/* Every colour, size, and duration, resolved for the settings in force.
 * Components ask here; nothing hardcodes. Palette values come from the
 * active Theme (the seven themes are in Theme.swift); type comes from the
 * bundled faces (Fonts.swift) with the axes the Electron tokens.css set. */
@MainActor
enum Tokens {
  static var settings: AppSettings { .shared }
  static var theme: Theme { settings.theme }

  @MainActor enum Palette {
    static var paper: NSColor { NSColor(hex: theme.paper) }
    static var paperSunk: NSColor { NSColor(hex: theme.paperSunk) }
    static var ink: NSColor { NSColor(hex: theme.ink) }
    static var inkSoft: NSColor { NSColor(hex: theme.inkSoft) }
    static var inkGhost: NSColor { NSColor(hex: theme.inkGhost) }
    static var rule: NSColor { NSColor(hex: theme.rule) }
    static var accent: NSColor { NSColor(hex: theme.accent) }
    static var selection: NSColor { accent.withAlphaComponent(0.26) }
    /* Syntax colours derive from the palette, as the Electron --shiki-*
     * tokens did: keywords in the accent, strings in soft ink, comments
     * in ghost, numbers and constants between accent and ink. */
    static func syntax(_ kind: TokenKind) -> NSColor {
      switch kind {
      case .keyword: return accent
      case .string: return inkSoft
      case .comment: return inkGhost
      case .number, .constant: return accent.blended(withFraction: 0.45, of: ink) ?? accent
      }
    }
  }

  @MainActor enum Typography {
    static var bodySize: CGFloat { CGFloat(settings.textSize) }
    static let leadingBody: CGFloat = 1.7
    static let leadingHeading: CGFloat = 1.25
    static let leadingH1: CGFloat = 1.15
    static let paragraphSpace: CGFloat = 0.9   // em
    static let headingSpace: CGFloat = 0.6     // em
    static let codeScale: CGFloat = 0.94
    static let leadingCode: CGFloat = 1.5
    /* Per nesting level, in points; the marker's own width is added. */
    static let listIndent: CGFloat = 24
    static let listItemSpace: CGFloat = 0.25   // em
    static let ghostWeight: Double = 320
    static let strongWeight: Double = 700

    /* Body: the chosen writing face, else Recursive at CASL 0.4 — or
     * Fraunces at SOFT 0, WONK 0, weight 420 under Manuscript. */
    static func body(weight: Double = 400, italic: Bool = false) -> NSFont {
      let size = bodySize
      if let face = settings.face { return face.font(size: size, weight: weight >= 600 ? .bold : .regular, italic: italic) }
      if theme.serifBody {
        return Fonts.font(italic ? "fraunces-italic" : "fraunces", size: size, axes: [("SOFT", 0), ("WONK", 0), ("wght", weight == 400 ? 420 : weight), ("opsz", Double(size))]) ?? fallbackBody(size, weight, italic)
      }
      return Fonts.font("recursive", size: size, axes: [("MONO", 0), ("CASL", 0.4), ("wght", weight), ("slnt", italic ? -15 : 0)]) ?? fallbackBody(size, weight, italic)
    }
    static var regular: NSFont { body() }
    static var bold: NSFont { body(weight: strongWeight) }
    static var italic: NSFont { body(italic: true) }
    static var boldItalic: NSFont { body(weight: strongWeight, italic: true) }
    static var mono: NSFont {
      Fonts.font("ioskeley", size: (bodySize * codeScale).rounded()) ?? NSFont.monospacedSystemFont(ofSize: bodySize * codeScale, weight: .regular)
    }
    static var monoItalic: NSFont {
      Fonts.font("ioskeley-italic", size: (bodySize * codeScale).rounded()) ?? mono
    }
    static func heading(_ level: Int) -> NSFont {
      let scale: [CGFloat] = [2.6, 1.9, 1.4, 1.0, 1.0, 1.0]
      let size = (bodySize * scale[min(max(level, 1), 6) - 1]).rounded()
      if let face = settings.face { return face.font(size: size, weight: .bold) }
      let display = level <= 2
      return Fonts.font("fraunces", size: size, axes: [("SOFT", 20), ("WONK", display ? 1 : 0), ("wght", 600), ("opsz", Double(size))]) ?? fallbackHeading(size)
    }
    static var ui: NSFont { Fonts.font("recursive", size: 13, axes: [("MONO", 0), ("CASL", 0), ("wght", 500)]) ?? NSFont.systemFont(ofSize: 13, weight: .medium) }

    private static func fallbackBody(_ size: CGFloat, _ weight: Double, _ italic: Bool) -> NSFont {
      let f = weight >= 600 ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
      return italic ? NSFontManager.shared.convert(f, toHaveTrait: .italicFontMask) : f
    }
    private static func fallbackHeading(_ size: CGFloat) -> NSFont { NSFont.boldSystemFont(ofSize: size) }

    static var bodyAttributes: [NSAttributedString.Key: Any] {
      let p = NSMutableParagraphStyle()
      p.lineHeightMultiple = leadingBody
      p.paragraphSpacing = bodySize * paragraphSpace
      return [.font: regular, .foregroundColor: Palette.ink, .paragraphStyle: p]
    }
    static func headingAttributes(_ level: Int) -> [NSAttributedString.Key: Any] {
      let p = NSMutableParagraphStyle()
      p.lineHeightMultiple = level == 1 ? leadingH1 : leadingHeading
      p.paragraphSpacingBefore = bodySize * headingSpace * 1.5
      p.paragraphSpacing = bodySize * headingSpace
      return [.font: heading(level), .foregroundColor: Palette.ink, .paragraphStyle: p]
    }
  }

  @MainActor enum Layout {
    static let windowWidth: CGFloat = 980
    static let windowHeight: CGFloat = 760
    /* The editor runs the window's width minus a page inset on each side,
     * as the Electron --measure-app did; only the rendered page caps its
     * measure (68ch, in export.css). */
    static let pageInset: CGFloat = 56
    static let minGutter: CGFloat = 56
    static let topInset: CGFloat = 48
    /* Block fills reach a little past the text on each side. */
    static let fillBleed: CGFloat = 10
    /* Above and below a picture drawn under its source line. */
    static let imageGap: CGFloat = 8
    /* Inset of a grid cell's text from its hairlines. */
    static let cellPadding: CGFloat = 10
  }

  @MainActor enum Motion {
    static let mark: TimeInterval = 0.14
    static let fade: TimeInterval = 0.24
    static let toast: TimeInterval = 4.0
    static let wordCountPeek: TimeInterval = 2.0
  }
}
