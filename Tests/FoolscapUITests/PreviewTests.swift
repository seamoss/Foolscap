import XCTest

final class PreviewTests: XCTestCase {
  func testPreviewToggles() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("foolscap-ui-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let file = dir.appendingPathComponent("page.md")
    try "# Page\n\nSome **words**, *italics*, `code`, and a [link](https://example.com).[^n]\n\n> A quote across\n> two lines.\n\n- one\n- two\n\n```swift\nlet x = 1 // note\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[^n]: A footnote.\n".write(to: file, atomically: true, encoding: .utf8)
    let app = XCUIApplication()
    // Never restore a previous run's windows into a test.
    app.launchArguments += ["-ApplePersistenceIgnoreState", "YES"]
    app.launchEnvironment["FOOLSCAP_OPEN"] = file.path
    app.launch()
    let editor = app.textViews["editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    // Through the menus: deterministic under XCUITest, and it proves the
    // items are wired; the key equivalents ride on the same actions.
    let view = app.menuBarItems["View"]
    view.click(); view.menuItems["Toggle Preview"].click()
    let page = app.webViews.firstMatch
    XCTAssertTrue(page.waitForExistence(timeout: 10), "Toggle Preview shows the page")
    XCTAssertTrue(page.staticTexts["Page"].waitForExistence(timeout: 10), "the heading renders")
    XCTAssertTrue(page.tables.firstMatch.waitForExistence(timeout: 5), "the table renders")
    if ProcessInfo.processInfo.environment["FOOLSCAP_SHOT"] == "1" {
      let shot = dir.appendingPathComponent("page.png")
      try? app.windows.firstMatch.screenshot().pngRepresentation.write(to: shot)
      print("FOOLSCAP_SHOT_PATH: \(shot.path)")
    }
    view.click(); view.menuItems["Toggle Preview"].click()
    XCTAssertTrue(editor.waitForExistence(timeout: 5), "toggling again returns to the editor")
    XCTAssertFalse(page.exists, "the page is gone")
    // The help window is covered by HelpWindowTests in the app host.
    app.terminate()
    if ProcessInfo.processInfo.environment["FOOLSCAP_SHOT"] != "1" { try? FileManager.default.removeItem(at: dir) }
  }
}
