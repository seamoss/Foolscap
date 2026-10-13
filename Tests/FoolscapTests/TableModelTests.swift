import XCTest
@testable import Foolscap

final class TableModelTests: XCTestCase {
  func testParsesCellsAlignmentsAndRanges() {
    let text = "| Name | Count | Note |\n| :--- | ---: | :---: |\n| a | 1 | x |\n| b \\| c | 22 | |\n"
    let m = TableModel.parse(text)!
    XCTAssertEqual(m.columnCount, 3)
    XCTAssertEqual(m.header.cells.map(\.text), ["Name", "Count", "Note"])
    XCTAssertEqual(m.alignments, [.left, .right, .center])
    XCTAssertEqual(m.body.count, 2)
    XCTAssertEqual(m.body[1].cells.map(\.text), ["b \\| c", "22", ""])
    let ns = text as NSString
    XCTAssertEqual(ns.substring(with: m.body[0].cells[1].range), "1")
    XCTAssertEqual(ns.substring(with: m.header.cells[0].range), "Name")
  }

  func testBorderlessRows() {
    let m = TableModel.parse("a | b\n--|--\n1 | 2\n")!
    XCTAssertEqual(m.header.cells.map(\.text), ["a", "b"])
    XCTAssertEqual(m.body[0].cells.map(\.text), ["1", "2"])
    XCTAssertEqual(m.alignments, [nil, nil])
  }

  func testTableConstructCoversWholeLinesAndMarksPipes() {
    let md = "para\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nafter\n"
    let t = collectConstructs(md).first { $0.kind == .table }!
    let ns = md as NSString
    XCTAssertEqual(ns.substring(with: t.range), "| a | b |\n| - | - |\n| 1 | 2 |\n")
    XCTAssertEqual(t.marks.count, 9)
    XCTAssertTrue(t.marks.allSatisfy { ns.substring(with: $0) == "|" })
  }

  func testRowsGetGridDecorationsUnlessRevealed() {
    let md = "| a | b |\n| - | - |\n| 1 | 2 |\n"
    let cs = collectConstructs(md)
    let ns = md as NSString
    let row = TableRowLayout(role: .body, cells: ["1", "2"], columnWidths: [30, 30], alignments: [nil, nil], isFirst: false, isLast: true)
    let p = NSRange(location: 20, length: 10)
    XCTAssertEqual(blockDecoration(forParagraph: p, in: ns, constructs: cs, tables: { _ in row }), .tableRow(row))
    XCTAssertNil(blockDecoration(forParagraph: p, in: ns, constructs: cs, tables: { _ in nil }), "revealed: plain source")
  }
}
