import XCTest
@testable import Foolscap

final class ExportHTMLTests: XCTestCase {
  let md = "# Title\n\nBody with `code`.\n\n- item\n"

  func testStandaloneDocumentIsSelfContained() {
    let html = ExportHTML.document(markdown: md, title: "T <&>", mode: .standalone, stylesheet: "body{}")
    XCTAssertTrue(html.hasPrefix("<!doctype html>"))
    XCTAssertTrue(html.contains("<title>T &lt;&amp;&gt;</title>"))
    XCTAssertTrue(html.contains("--paper: #eff1ee"))
    XCTAssertTrue(html.contains("prefers-color-scheme: dark"))
    XCTAssertFalse(html.contains("foolscap://"), "no bundle references leave the app")
    XCTAssertFalse(html.contains("data-pos"), "exports carry no source stamps")
    XCTAssertFalse(html.contains("<script"))
  }

  func testInAppDocumentStampsAndBridges() {
    let html = ExportHTML.document(markdown: md, title: "T", mode: .inApp(theme: .plate, sourcePositions: true), stylesheet: "")
    XCTAssertTrue(html.contains("--paper: #14171a"))
    XCTAssertTrue(html.contains("foolscap://font/Recursive"))
    XCTAssertTrue(html.contains("<h1 data-pos=\"0\">"))
    XCTAssertTrue(html.contains("<p data-pos=\"9\">"))
    XCTAssertTrue(html.contains("messageHandlers.foolscap"))
  }

  func testPrintIsLedgerOnWhite() {
    let html = ExportHTML.document(markdown: md, title: "T", mode: .print, stylesheet: "")
    XCTAssertTrue(html.contains("--paper: #ffffff"))
    XCTAssertTrue(html.contains("--accent: #2f7a6b"))
  }

  func testSourceStampsNeverChangeExportBytes() {
    XCTAssertEqual(Pipeline.html(md), Pipeline.html(md, sourcePositions: false))
    XCTAssertNotEqual(Pipeline.html(md), Pipeline.html(md, sourcePositions: true))
  }
}
