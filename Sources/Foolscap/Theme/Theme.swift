import AppKit

/* A theme is seven colours and, optionally, a body face — the contract the
 * Electron app's THEMING.md set, carried over value for value. "Auto"
 * follows the system appearance between Ledger and Plate. */
struct Theme: Identifiable, Equatable, Sendable {
  let id: String
  let label: String
  let isDark: Bool
  let paper: String
  let paperSunk: String
  let ink: String
  let inkSoft: String
  let inkGhost: String
  let rule: String
  let accent: String
  /* Manuscript sets its body in Fraunces; everyone else in Recursive. */
  let serifBody: Bool

  static let ledger = Theme(id: "ledger", label: "Ledger", isDark: false, paper: "#eff1ee", paperSunk: "#e5e8e4", ink: "#1a1d1b", inkSoft: "#5a625c", inkGhost: "#9ba39c", rule: "#d6dad5", accent: "#2f7a6b", serifBody: false)
  static let plate = Theme(id: "plate", label: "Plate", isDark: true, paper: "#14171a", paperSunk: "#1c2024", ink: "#dde3e0", inkSoft: "#8a928d", inkGhost: "#4e5652", rule: "#2a2f2c", accent: "#6fbfa8", serifBody: false)
  static let manuscript = Theme(id: "manuscript", label: "Manuscript", isDark: false, paper: "#fbfaf6", paperSunk: "#f1eee6", ink: "#17140f", inkSoft: "#57534a", inkGhost: "#a8a294", rule: "#e2ded2", accent: "#8b2e2e", serifBody: true)
  static let github = Theme(id: "github", label: "GitHub", isDark: false, paper: "#ffffff", paperSunk: "#f6f8fa", ink: "#1f2328", inkSoft: "#59636e", inkGhost: "#a5adb6", rule: "#d1d9e0", accent: "#0969da", serifBody: false)
  static let githubDark = Theme(id: "github-dark", label: "GitHub Dark", isDark: true, paper: "#0d1117", paperSunk: "#161b22", ink: "#e6edf3", inkSoft: "#8b949e", inkGhost: "#484f58", rule: "#30363d", accent: "#58a6ff", serifBody: false)
  static let vercel = Theme(id: "vercel", label: "Vercel", isDark: true, paper: "#000000", paperSunk: "#111111", ink: "#ededed", inkSoft: "#a1a1a1", inkGhost: "#666666", rule: "#333333", accent: "#0070f3", serifBody: false)
  static let vscode = Theme(id: "vscode", label: "VS Code", isDark: true, paper: "#1e1e1e", paperSunk: "#252526", ink: "#d4d4d4", inkSoft: "#858585", inkGhost: "#5a5a5a", rule: "#3c3c3c", accent: "#3794ff", serifBody: false)

  static let all: [Theme] = [ledger, plate, manuscript, github, githubDark, vercel, vscode]

  static func named(_ id: String) -> Theme? { all.first { $0.id == id } }

  /* The theme for "Auto" under the given appearance. */
  static func auto(dark: Bool) -> Theme { dark ? plate : ledger }
}

extension NSColor {
  /* "#RRGGBB" only; anything else is a programming error in Theme. */
  convenience init(hex: String) {
    var v: UInt64 = 0
    Scanner(string: String(hex.dropFirst())).scanHexInt64(&v)
    self.init(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
  }
}
