import XCTest
@testable import Foolscap

/* Every construct the live preview draws, pinned by range against the
 * fixture documents — the editor-side half of the golden suite. */
final class ConstructsTests: XCTestCase {
  private func text(_ s: String) -> (String, NSString) { (s, s as NSString) }

  func testListItemsCarryDepthAndMarker() {
    let (md, ns) = text("- one\n- two\n  - nested\n\n1. first\n12. twelfth\n")
    let items = collectConstructs(md).filter { if case .listItem = $0.kind { return true } else { return false } }
    XCTAssertEqual(items.count, 5)
    XCTAssertEqual(items[0].kind, .listItem(depth: 1, ordered: false))
    XCTAssertEqual(ns.substring(with: items[0].marks[0]), "- ")
    XCTAssertEqual(ns.substring(with: items[0].content), "one")
    XCTAssertEqual(items[2].kind, .listItem(depth: 2, ordered: false))
    XCTAssertEqual(ns.substring(with: items[2].marks[0]), "- ")
    XCTAssertEqual(items[4].kind, .listItem(depth: 1, ordered: true))
    XCTAssertEqual(ns.substring(with: items[4].marks[0]), "12. ")
  }

  func testTaskBoxesSplitOutOfTheMarker() {
    let (md, ns) = text("- [ ] open\n- [x] done\n")
    let all = collectConstructs(md)
    let boxes = all.filter { if case .taskCheckbox = $0.kind { return true } else { return false } }
    XCTAssertEqual(boxes.map(\.kind), [.taskCheckbox(checked: false), .taskCheckbox(checked: true)])
    XCTAssertEqual(ns.substring(with: boxes[1].range), "[x]")
    let items = all.filter { if case .listItem = $0.kind { return true } else { return false } }
    XCTAssertEqual(ns.substring(with: items[0].marks[0]), "- ")
    XCTAssertEqual(ns.substring(with: items[0].content), " open")
  }

  func testBlockQuoteMarksEveryLine() {
    let (md, ns) = text("> A quote,\n> across two lines.\n")
    let q = collectConstructs(md).first { $0.kind == .blockQuote }!
    XCTAssertEqual(q.marks.map { ns.substring(with: $0) }, ["> ", "> "])
  }

  func testFencedCodeBlock() {
    let (md, ns) = text("```js\nconst x = 1\n```\n")
    let c = collectConstructs(md).first { if case .codeBlock = $0.kind { return true } else { return false } }!
    XCTAssertEqual(c.kind, .codeBlock(language: "js", fenced: true))
    XCTAssertEqual(c.marks.map { ns.substring(with: $0) }, ["```js\n", "```"])
    XCTAssertEqual(ns.substring(with: c.content), "const x = 1\n")
  }

  func testIndentedCodeBlockHasNoMarks() {
    let (md, _) = text("para\n\n    indented code\n")
    let c = collectConstructs(md).first { if case .codeBlock = $0.kind { return true } else { return false } }!
    XCTAssertEqual(c.kind, .codeBlock(language: nil, fenced: false))
    XCTAssertEqual(c.marks, [])
  }

  func testLinkImageStrikeAndRule() {
    let (md, ns) = text("An [inline link](https://example.com/a) and ![a chart](assets/chart.png), ~~struck~~.\n\n---\n")
    let all = collectConstructs(md)
    let link = all.first { if case .link = $0.kind { return true } else { return false } }!
    XCTAssertEqual(link.kind, .link(destination: "https://example.com/a"))
    XCTAssertEqual(ns.substring(with: link.content), "inline link")
    XCTAssertEqual(link.marks.map { ns.substring(with: $0) }, ["[", "](https://example.com/a)"])
    let image = all.first { if case .image = $0.kind { return true } else { return false } }!
    XCTAssertEqual(image.kind, .image(source: "assets/chart.png"))
    XCTAssertEqual(image.marks.map { ns.substring(with: $0) }, ["![", "](assets/chart.png)"])
    let strike = all.first { $0.kind == .strikethrough }!
    XCTAssertEqual(ns.substring(with: strike.content), "struck")
    let rule = all.first { $0.kind == .thematicBreak }!
    XCTAssertEqual(ns.substring(with: rule.range), "---")
  }

  func testEveryFixtureCollectsWithoutGaps() throws {
    for name in ["constructs.md", "edge-cases.md", "task-lists.md"] {
      let md = try String(contentsOf: PipelineGoldenTests.fixtures.appendingPathComponent(name), encoding: .utf8)
      let ns = md as NSString
      // One assertion per fixture, not one per range: XCTAssert's per-call
      // bookkeeping in an app-hosted test made this loop take minutes.
      let constructs = collectConstructs(md)
      let outOfBounds = constructs.filter { NSMaxRange($0.range) > ns.length }
      let strayMarks = constructs.flatMap { c in c.marks.filter { NSIntersectionRange($0, c.range).length != $0.length } }
      XCTAssertTrue(outOfBounds.isEmpty, "\(name): \(outOfBounds.count) ranges out of bounds")
      XCTAssertTrue(strayMarks.isEmpty, "\(name): \(strayMarks.count) marks outside their construct")
    }
  }
}
