import XCTest
@testable import Foolscap

final class FormatCommandsTests: XCTestCase {
  private func apply(_ e: TextEdit, to s: String) -> String { (s as NSString).replacingCharacters(in: e.range, with: e.replacement) }

  func testWrapsASelection() {
    let s = "make this bold"
    let e = FormatCommands.toggle(.strong, in: s as NSString, selection: NSRange(location: 5, length: 4), constructs: collectConstructs(s))
    XCTAssertEqual(apply(e, to: s), "make **this** bold")
    XCTAssertEqual(e.selection, NSRange(location: 7, length: 4))
  }

  func testUnwrapsWhenInside() {
    let s = "make **this** bold"
    let e = FormatCommands.toggle(.strong, in: s as NSString, selection: NSRange(location: 8, length: 0), constructs: collectConstructs(s))
    XCTAssertEqual(apply(e, to: s), "make this bold")
  }

  func testWordUnderCaretAndEmptyPair() {
    let s = "plain word here"
    let e = FormatCommands.toggle(.emphasis, in: s as NSString, selection: NSRange(location: 8, length: 0), constructs: collectConstructs(s))
    XCTAssertEqual(apply(e, to: s), "plain *word* here")
    let blank = "x  y"
    let e2 = FormatCommands.toggle(.code, in: blank as NSString, selection: NSRange(location: 2, length: 0), constructs: [])
    let after = apply(e2, to: blank)
    XCTAssertEqual(after, "x `` y"); XCTAssertEqual(e2.selection, NSRange(location: 3, length: 0))
    let e3 = FormatCommands.toggle(.code, in: after as NSString, selection: e2.selection, constructs: collectConstructs(after))
    XCTAssertEqual(apply(e3, to: after), "x  y", "the shortcut again removes the empty pair")
  }

  func testLinkInsertion() {
    let e = FormatCommands.link(in: "see docs" as NSString, selection: NSRange(location: 4, length: 4))
    XCTAssertEqual(e.replacement, "[docs]()"); XCTAssertEqual(e.selection, NSRange(location: 11, length: 0))
    let empty = FormatCommands.link(in: "x" as NSString, selection: NSRange(location: 1, length: 0))
    XCTAssertEqual(empty.replacement, "[]()"); XCTAssertEqual(empty.selection, NSRange(location: 2, length: 0))
  }
}
