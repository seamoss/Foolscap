import XCTest
import Markdown
@testable import Foolscap

/* The one line/column → NSRange conversion, checked against what NSString
 * (UTF-16) says, with multi-byte and astral characters in the way. */
final class SourceOffsetsTests: XCTestCase {
  private struct Finder: MarkupWalker {
    var found: Markup?
    let want: (Markup) -> Bool
    init(want: @escaping (Markup) -> Bool) { self.want = want }
    mutating func defaultVisit(_ m: Markup) { if found == nil, want(m) { found = m } else { descendInto(m) } }
  }

  private func rangeOfFirst<T: Markup>(_ type: T.Type, in text: String) -> NSRange? {
    var f = Finder(want: { $0 is T })
    f.visit(Pipeline.parse(text))
    return SourceOffsets(text).nsRange(f.found?.range)
  }

  func testASCII() {
    let text = "plain **bold** text\n"
    XCTAssertEqual(rangeOfFirst(Strong.self, in: text), NSRange(location: 6, length: 8))
  }

  func testMultiByteBeforeTheConstruct() {
    let text = "café **bold**\n" // é is 2 bytes, 1 UTF-16 unit
    let ns = text as NSString
    XCTAssertEqual(rangeOfFirst(Strong.self, in: text), ns.range(of: "**bold**"))
  }

  func testAstralCharactersBeforeTheConstruct() {
    let text = "🙂🙂 *em*\n" // 4 bytes, 2 UTF-16 units each
    let ns = text as NSString
    XCTAssertEqual(rangeOfFirst(Emphasis.self, in: text), ns.range(of: "*em*"))
  }

  func testSecondLine() {
    let text = "# Title\n\nsome `code` here\n"
    let ns = text as NSString
    XCTAssertEqual(rangeOfFirst(InlineCode.self, in: text), ns.range(of: "`code`"))
    XCTAssertEqual(rangeOfFirst(Heading.self, in: text), ns.range(of: "# Title"))
  }
}
