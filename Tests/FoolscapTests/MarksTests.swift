import XCTest
@testable import Foolscap

final class MarksTests: XCTestCase {
  let bold = NSRange(location: 10, length: 8) // "**word**" at 10..<18

  func testCaretInsideTouches() { XCTAssertTrue(selectionTouches(NSRange(location: 13, length: 0), bold)) }
  func testCaretFlushAgainstEitherDelimiterTouches() {
    XCTAssertTrue(selectionTouches(NSRange(location: 10, length: 0), bold))
    XCTAssertTrue(selectionTouches(NSRange(location: 18, length: 0), bold))
  }
  func testCaretOneAwayDoesNot() {
    XCTAssertFalse(selectionTouches(NSRange(location: 9, length: 0), bold))
    XCTAssertFalse(selectionTouches(NSRange(location: 19, length: 0), bold))
  }
  func testSelectionOverlappingTouches() { XCTAssertTrue(selectionTouches(NSRange(location: 0, length: 12), bold)) }
  func testSelectionElsewhereDoesNot() { XCTAssertFalse(selectionTouches(NSRange(location: 20, length: 5), bold)) }
}
