import XCTest
@testable import Foolscap

/* PDF export runs the real page through a real print operation. */
@MainActor
final class PagePrinterTests: XCTestCase {
  func testPDFExportWritesAPaginatedPDF() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("foolscap-pdf-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let out = dir.appendingPathComponent("doc.pdf")
    let md = (1...40).map { "## Section \($0)\n\nParagraph \($0) with **bold**, `code`, and a [link](https://example.com).\n" }.joined(separator: "\n")
    let done = expectation(description: "pdf written")
    PagePrinter.pdf(markdown: md, title: "Doc", documentDirectory: nil, to: out) { error in
      XCTAssertNil(error)
      done.fulfill()
    }
    wait(for: [done], timeout: 30)
    let data = try Data(contentsOf: out)
    XCTAssertTrue(data.starts(with: Array("%PDF".utf8)))
    let pdf = PDFDocumentCount(data: data)
    XCTAssertGreaterThan(pdf, 1, "forty sections paginate across pages")
    try? FileManager.default.removeItem(at: dir)
  }

  private func PDFDocumentCount(data: Data) -> Int {
    guard let provider = CGDataProvider(data: data as CFData), let doc = CGPDFDocument(provider) else { return 0 }
    return doc.numberOfPages
  }
}
