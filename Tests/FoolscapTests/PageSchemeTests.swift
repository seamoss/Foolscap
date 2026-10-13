import XCTest
@testable import Foolscap

final class PageSchemeTests: XCTestCase {
  let fonts = URL(fileURLWithPath: "/app/Fonts")
  let doc = URL(fileURLWithPath: "/Users/me/notes")

  func testFontsAndDocumentFilesResolveInsideTheirRoots() {
    XCTAssertEqual(PageSchemeHandler.resolve(URL(string: "foolscap://font/Fraunces.ttf")!, fonts: fonts, document: doc)?.path, "/app/Fonts/Fraunces.ttf")
    XCTAssertEqual(PageSchemeHandler.resolve(URL(string: "foolscap://doc/assets/chart.png")!, fonts: fonts, document: doc)?.path, "/Users/me/notes/assets/chart.png")
    XCTAssertEqual(PageSchemeHandler.resolve(URL(string: "foolscap://doc/a%20b.png")!, fonts: fonts, document: doc)?.path, "/Users/me/notes/a b.png")
  }

  func testNothingClimbsOutOrReachesElsewhere() {
    XCTAssertNil(PageSchemeHandler.resolve(URL(string: "foolscap://doc/../../etc/passwd")!, fonts: fonts, document: doc))
    XCTAssertNil(PageSchemeHandler.resolve(URL(string: "foolscap://etc/passwd")!, fonts: fonts, document: doc))
    XCTAssertNil(PageSchemeHandler.resolve(URL(string: "file:///etc/passwd")!, fonts: fonts, document: doc))
    XCTAssertNil(PageSchemeHandler.resolve(URL(string: "foolscap://doc/x.png")!, fonts: fonts, document: nil), "an unsaved document has no folder")
  }

  func testRelativeImagesRewriteAbsoluteOnesStay() {
    let html = "<img src=\"assets/a.png\" alt=\"\"><img src=\"https://x.io/b.png\"><img src=\"data:image/png;base64,AAAA\">"
    let out = PageSchemeHandler.rewriteImageSources(html)
    XCTAssertTrue(out.contains("<img src=\"foolscap://doc/assets/a.png\""))
    XCTAssertTrue(out.contains("<img src=\"https://x.io/b.png\">"))
    XCTAssertTrue(out.contains("<img src=\"data:image/png;base64,AAAA\">"))
  }
}
