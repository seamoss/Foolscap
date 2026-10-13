import XCTest
@testable import Foolscap

final class PasteRulesTests: XCTestCase {
  func testPastedURL() {
    XCTAssertEqual(PasteRules.pastedURL("  https://example.com/a?b=c \n"), "https://example.com/a?b=c")
    XCTAssertNil(PasteRules.pastedURL("see https://example.com"))
    XCTAssertNil(PasteRules.pastedURL("file:///etc/hosts"))
    XCTAssertNil(PasteRules.pastedURL("example.com"))
  }

  func testLinkPasteOverSelection() {
    let e = PasteRules.linkPaste(text: "read the docs now" as NSString, selection: NSRange(location: 5, length: 8), pasted: "https://example.com")!
    XCTAssertEqual(e.replacement, "[the docs](https://example.com)")
    XCTAssertNil(PasteRules.linkPaste(text: "read" as NSString, selection: NSRange(location: 4, length: 0), pasted: "https://example.com"))
    XCTAssertNil(PasteRules.linkPaste(text: "one\ntwo" as NSString, selection: NSRange(location: 0, length: 7), pasted: "https://x.io"))
  }

  func testAssetNames() {
    let now = Date(timeIntervalSince1970: 0)
    XCTAssertEqual(PasteRules.assetName(preferred: "Screenshot 2026-07-28.PNG", ext: "png", now: now), "Screenshot-2026-07-28.png")
    XCTAssertEqual(PasteRules.assetName(preferred: "Café au lait.png", ext: "png", now: now), "Cafe-au-lait.png")
    XCTAssertEqual(PasteRules.assetName(preferred: "../../.secret.png", ext: "png", now: now), "secret.png")
    XCTAssertTrue(PasteRules.assetName(preferred: nil, ext: "png", now: now).hasPrefix("pasted-"))
  }

  func testOpenLinks() {
    let ok = OpenLink.path(from: URL(string: "foolscap://open?path=%2FUsers%2Fme%2Fnotes%2Fbrief.md")!, exists: { _ in true })
    XCTAssertEqual(ok, "/Users/me/notes/brief.md")
    XCTAssertNil(OpenLink.path(from: URL(string: "foolscap://open?path=relative.md")!, exists: { _ in true }))
    XCTAssertNil(OpenLink.path(from: URL(string: "foolscap://open?path=%2Fx.png")!, exists: { _ in true }))
    XCTAssertNil(OpenLink.path(from: URL(string: "foolscap://other?path=%2Fx.md")!, exists: { _ in true }))
    XCTAssertNil(OpenLink.path(from: URL(string: "foolscap://open?path=%2Fmissing.md")!, exists: { _ in false }))
  }

  func testWordCount() {
    XCTAssertEqual(countWords("three little words"), 3)
    XCTAssertEqual(countWords("# Title\n\n- one\n- two ```"), 3)
    XCTAssertEqual(countWords(""), 0)
  }
}
