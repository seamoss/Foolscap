import XCTest
@testable import Foolscap

final class FootnotesTests: XCTestCase {
  func testReferencesAndDefinitionsRender() {
    let html = Pipeline.html("A claim[^a] and another[^b].\n\n[^a]: First note.\n[^b]: Second, with *emphasis*.\n")
    XCTAssertTrue(html.contains("<sup class=\"fnref\" id=\"fnref-a\"><a href=\"#fn-a\">1</a></sup>"))
    XCTAssertTrue(html.contains("<sup class=\"fnref\" id=\"fnref-b\"><a href=\"#fn-b\">2</a></sup>"))
    XCTAssertTrue(html.contains("<li id=\"fn-a\"><p>First note. <a class=\"fnback\" href=\"#fnref-a\">↩</a></p></li>"))
    XCTAssertTrue(html.contains("<li id=\"fn-b\"><p>Second, with <em>emphasis</em>. <a class=\"fnback\""))
    XCTAssertFalse(html.contains("[^a]"))
  }

  func testNumberingFollowsFirstReferenceAndUndefinedStays() {
    let html = Pipeline.html("See[^z] then[^y], and[^z] again; [^nope] has no definition.\n\n[^y]: Y\n[^z]: Z\n")
    XCTAssertTrue(html.contains("id=\"fnref-z\"><a href=\"#fn-z\">1</a>"))
    XCTAssertTrue(html.contains("id=\"fnref-y\"><a href=\"#fn-y\">2</a>"))
    XCTAssertTrue(html.contains("[^nope]"))
  }

  func testContinuationLines() {
    let e = Footnotes.extract("x[^a]\n\n[^a]: one\n    two\nafter\n")
    XCTAssertEqual(e.definitions.map(\.body), ["one\ntwo"])
    XCTAssertTrue(e.markdown.contains("after"))
  }
}
