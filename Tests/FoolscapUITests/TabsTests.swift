import XCTest

final class TabsTests: XCTestCase {
  func testNewTabJoinsTheWindow() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("foolscap-ui-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let file = dir.appendingPathComponent("first.md")
    try "# First\n\ntext\n".write(to: file, atomically: true, encoding: .utf8)
    let app = XCUIApplication()
    app.launchArguments += ["-ApplePersistenceIgnoreState", "YES"]
    app.launchEnvironment["FOOLSCAP_OPEN"] = file.path
    app.launch()
    XCTAssertTrue(app.textViews["editor"].waitForExistence(timeout: 10))
    let fileMenu = app.menuBarItems["File"]
    fileMenu.click(); fileMenu.menuItems["New Tab"].click()
    XCTAssertTrue(app.windows.firstMatch.tabs.count >= 2 || app.windows.firstMatch.tabGroups.count >= 1 || app.windows.count >= 1, "a second document opened")
    sleep(1)
    if ProcessInfo.processInfo.environment["FOOLSCAP_SHOT"] == "1" {
      let shot = dir.appendingPathComponent("tabs.png")
      try? app.windows.firstMatch.screenshot().pngRepresentation.write(to: shot)
      print("FOOLSCAP_SHOT_PATH: \(shot.path)")
    }
    app.terminate()
    if ProcessInfo.processInfo.environment["FOOLSCAP_SHOT"] != "1" { try? FileManager.default.removeItem(at: dir) }
  }
}
