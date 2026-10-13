import XCTest
@testable import Foolscap

/* The one promise at the document layer: bytes in, the same bytes out, for
 * every fixture — and with a window up, where the text storage is the
 * truth. */
@MainActor
final class DocumentRoundTripTests: XCTestCase {
  func testEveryFixtureRoundTripsWithoutAWindow() throws {
    let dir = PipelineGoldenTests.fixtures
    for name in try FileManager.default.contentsOfDirectory(atPath: dir.path).filter({ $0.hasSuffix(".md") }) {
      let bytes = try Data(contentsOf: dir.appendingPathComponent(name))
      let doc = MarkdownDocument()
      try doc.read(from: bytes, ofType: "net.daringfireball.markdown")
      XCTAssertEqual(try doc.data(ofType: "net.daringfireball.markdown"), bytes, name)
    }
  }

  func testRoundTripsThroughTheEditor() throws {
    let bytes = try Data(contentsOf: PipelineGoldenTests.fixtures.appendingPathComponent("constructs.md"))
    let doc = MarkdownDocument()
    try doc.read(from: bytes, ofType: "net.daringfireball.markdown")
    doc.makeWindowControllers()
    XCTAssertEqual(try doc.data(ofType: "net.daringfireball.markdown"), bytes, "the styled storage still writes the original bytes")
    doc.windowControllers.forEach { $0.close() }
  }
}
