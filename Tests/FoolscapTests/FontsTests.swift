import CoreText
import XCTest
@testable import Foolscap

/* The bundled faces register and resolve by file, and the variation axes
 * actually move the glyphs — a bold Recursive is wider than a regular one,
 * and a monospaced Recursive sets "iii" as wide as "mmm". */
final class FontsTests: XCTestCase {
  func testAllFacesLoad() {
    XCTAssertTrue(Fonts.isLoaded, "every file in Resources/Fonts registered")
    XCTAssertEqual(Fonts.font("recursive", size: 17)?.familyName?.hasPrefix("Recursive"), true)
    XCTAssertEqual(Fonts.font("fraunces", size: 17)?.familyName, "Fraunces")
    XCTAssertEqual(Fonts.font("ioskeley", size: 16)?.familyName, "Ioskeley Mono")
  }

  func testWeightAxisIsApplied() {
    // Recursive keeps its advances across weights (only the stems grow), so
    // the proof is the font reporting the axis value it was asked for; the
    // MONO test below proves the same mechanism moves glyphs.
    let bold = Fonts.font("recursive", size: 40, axes: [("MONO", 0), ("wght", 800)])!
    let variation = CTFontCopyVariation(bold) as? [NSNumber: NSNumber] ?? [:]
    let wght = NSNumber(value: "wght".utf8.reduce(UInt32(0)) { ($0 << 8) | UInt32($1) })
    XCTAssertEqual(variation[wght]?.doubleValue, 800)
  }

  func testMonoAxisMakesAdvancesEqual() {
    let mono = Fonts.font("recursive", size: 40, axes: [("MONO", 1)])!
    XCTAssertEqual(width("iiii", mono), width("mmmm", mono), accuracy: 0.5)
    let prop = Fonts.font("recursive", size: 40, axes: [("MONO", 0)])!
    XCTAssertLessThan(width("iiii", prop), width("mmmm", prop))
  }

  private func width(_ s: String, _ f: NSFont) -> CGFloat {
    (s as NSString).size(withAttributes: [.font: f]).width
  }
}
