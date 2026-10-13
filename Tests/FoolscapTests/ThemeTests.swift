import XCTest
@testable import Foolscap

final class ThemeTests: XCTestCase {
  func testSevenThemesWithUniqueIDs() {
    XCTAssertEqual(Theme.all.count, 7)
    XCTAssertEqual(Set(Theme.all.map(\.id)).count, 7)
  }

  func testEveryThemeDefinesTheWholePalette() {
    let hex = try! NSRegularExpression(pattern: "^#[0-9a-f]{6}$")
    for t in Theme.all {
      for v in [t.paper, t.paperSunk, t.ink, t.inkSoft, t.inkGhost, t.rule, t.accent] {
        XCTAssertNotNil(hex.firstMatch(in: v, range: NSRange(location: 0, length: v.utf16.count)), "\(t.id): \(v)")
      }
    }
  }

  func testAutoFollowsAppearance() {
    XCTAssertEqual(Theme.auto(dark: false).id, "ledger")
    XCTAssertEqual(Theme.auto(dark: true).id, "plate")
  }

  func testHexColours() {
    let c = NSColor(hex: "#2f7a6b").usingColorSpace(.sRGB)!
    XCTAssertEqual(Int((c.redComponent * 255).rounded()), 0x2f)
    XCTAssertEqual(Int((c.greenComponent * 255).rounded()), 0x7a)
    XCTAssertEqual(Int((c.blueComponent * 255).rounded()), 0x6b)
  }
}
