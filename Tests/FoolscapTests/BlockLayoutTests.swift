import XCTest
@testable import Foolscap

final class BlockLayoutTests: XCTestCase {
  private func paragraphs(_ text: String) -> [(NSRange, String)] {
    let ns = text as NSString
    var out: [(NSRange, String)] = []
    ns.enumerateSubstrings(in: NSRange(location: 0, length: ns.length), options: .byParagraphs) { s, r, _, _ in out.append((r, s ?? "")) }
    return out
  }

  func testBlocksGetTheirDecorations() {
    let md = "para\n\n> a quote\n> more\n\n```js\nx\n```\n\n---\n\n![a chart](assets/chart.png)\n\nAn ![inline](x.png) image in prose.\n"
    let cs = collectConstructs(md)
    let ns = md as NSString
    var seen: [String: BlockDecoration?] = [:]
    for (r, s) in paragraphs(md) { seen[s] = blockDecoration(forParagraph: r, in: ns, constructs: cs) }
    XCTAssertEqual(seen["para"], .some(nil))
    XCTAssertEqual(seen["> a quote"], .fill)
    XCTAssertEqual(seen["> more"], .fill)
    XCTAssertEqual(seen["```js"], .fill)
    XCTAssertEqual(seen["x"], .fill)
    XCTAssertEqual(seen["---"], .rule)
    XCTAssertEqual(seen["![a chart](assets/chart.png)"], .image(source: "assets/chart.png"))
    XCTAssertEqual(seen["An ![inline](x.png) image in prose."], .some(nil), "an inline image keeps its markup")
  }

  func testCheckboxToggle() {
    let md = "- [ ] open\n- [x] done\n"
    let cs = collectConstructs(md)
    let ns = md as NSString
    let open = ns.range(of: "[ ]"), done = ns.range(of: "[x]")
    XCTAssertEqual(checkboxToggle(at: open.location + 1, constructs: cs)?.replacement, "[x]")
    XCTAssertEqual(checkboxToggle(at: open.location + 1, constructs: cs)?.range, open)
    XCTAssertEqual(checkboxToggle(at: done.location, constructs: cs)?.replacement, "[ ]")
    XCTAssertNil(checkboxToggle(at: ns.range(of: "open").location + 1, constructs: cs), "the word is not the box")
  }
}
