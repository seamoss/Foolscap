import XCTest
@testable import Foolscap

final class TableFormatTests: XCTestCase {
  func testFormatsAlignsAndIsIdempotent() {
    let messy = "|a|bb|c|\n|:-|-:|:-:|\n|longer cell|1|x|\n"
    let once = TableModel.parse(messy)!.formatted()
    // The header pads by its column's alignment too — a centred "c".
    XCTAssertEqual(once, "| a           |  bb |  c  |\n| :---------- | --: | :-: |\n| longer cell |   1 |  x  |")
    XCTAssertEqual(TableModel.parse(once)!.formatted(), once)
  }

  func testDisplayWidthAndBreaks() {
    XCTAssertEqual(TableModel.displayWidth("日本"), 4)
    XCTAssertEqual(TableModel.displayWidth("e\u{0301}"), 1)
    XCTAssertEqual(TableModel.displayLines("one<br>two<BR/>three"), ["one", "two", "three"])
    XCTAssertEqual(TableModel.longestWord("a few words<br>longest here"), "longest")
  }

  func testBrPassesThroughTheRenderer() {
    XCTAssertTrue(Pipeline.html("| a |\n|---|\n| x<br>y |\n").contains("x<br>y"))
    XCTAssertTrue(Pipeline.html("<b>no</b>\n").contains("&lt;b&gt;"))
  }

  func testPaletteMatch() {
    XCTAssertEqual(PaletteMatch.score("tog", "Toggle Preview"), 3)
    XCTAssertEqual(PaletteMatch.score("prev", "Toggle Preview"), 2)
    XCTAssertEqual(PaletteMatch.score("tpv", "Toggle Preview"), 1)
    XCTAssertNil(PaletteMatch.score("xyz", "Toggle Preview"))
  }

  func testClosedDocumentsStack() {
    let c = ClosedDocuments()
    c.push("/a.md"); c.push("/b.md"); c.push("/a.md")
    XCTAssertEqual(c.count, 2)
    XCTAssertEqual(c.pop(exists: { _ in true }), "/a.md")
    XCTAssertEqual(c.pop(exists: { $0 != "/b.md" }), nil)
  }

  func testPositionsRoundTrip() {
    let name = "foolscap-pos-\(UUID().uuidString)"
    let d = UserDefaults(suiteName: name)!
    let p = Positions(defaults: d)
    p.remember("/x.md", DocPosition(head: 10, top: 4))
    XCTAssertEqual(Positions(defaults: d).recall("/x.md"), DocPosition(head: 10, top: 4))
    d.removePersistentDomain(forName: name)
  }
}
