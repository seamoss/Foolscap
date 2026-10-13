import XCTest
@testable import Foolscap

/* The golden-fixture suite: fixtures/NAME.md → fixtures/golden/NAME.golden.html,
 * byte for byte. Regenerate only with UPDATE_GOLDENS=1 and explain the
 * diff in the commit. Fixtures are the Electron app's, so parity is
 * reviewable construct by construct. */
final class PipelineGoldenTests: XCTestCase {
  static let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  /* Read from the test bundle (no TCC check); goldens are written back to
   * the repository only when regenerating. */
  static let fixtures = Bundle(for: PipelineGoldenTests.self).resourceURL!.appendingPathComponent("fixtures")
  static let repoFixtures = root.appendingPathComponent("fixtures")

  func testGoldens() throws {
    let names = try FileManager.default.contentsOfDirectory(atPath: Self.fixtures.path).filter { $0.hasSuffix(".md") }.sorted()
    XCTAssertFalse(names.isEmpty, "no fixtures found at \(Self.fixtures.path)")
    let update = ProcessInfo.processInfo.environment["UPDATE_GOLDENS"] == "1"
    for name in names {
      let md = try String(contentsOf: Self.fixtures.appendingPathComponent(name), encoding: .utf8)
      let html = Pipeline.html(md)
      let goldenName = name.replacingOccurrences(of: ".md", with: ".golden.html")
      let goldenURL = Self.fixtures.appendingPathComponent("golden").appendingPathComponent(goldenName)
      if update {
        try html.write(to: Self.repoFixtures.appendingPathComponent("golden").appendingPathComponent(goldenName), atomically: true, encoding: .utf8)
        continue
      }
      let golden = try String(contentsOf: goldenURL, encoding: .utf8)
      XCTAssertEqual(html, golden, "\(name): output differs from its golden (UPDATE_GOLDENS=1 to regenerate, then explain the diff)")
    }
  }

  func testRawHTMLIsEscapedNeverPassedThrough() {
    let html = Pipeline.html("<script>alert(1)</script>\n\nSome <b>bold</b> text.\n")
    XCTAssertFalse(html.contains("<script>"))
    XCTAssertTrue(html.contains("&lt;script&gt;"))
    XCTAssertTrue(html.contains("&lt;b&gt;bold&lt;/b&gt;"))
  }

  func testGFMExtensionsParse() {
    let html = Pipeline.html("| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~gone~~\n")
    XCTAssertTrue(html.contains("<table>"))
    XCTAssertTrue(html.contains("<input type=\"checkbox\" disabled checked>"))
    XCTAssertTrue(html.contains("<del>gone</del>"))
  }
}
