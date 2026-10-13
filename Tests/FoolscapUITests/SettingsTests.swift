import XCTest

final class SettingsTests: XCTestCase {
  func testSettingsOpensAndThemeChipsSelect() throws {
    let app = XCUIApplication()
    // Never restore a previous run's windows into a test.
    app.launchArguments += ["-ApplePersistenceIgnoreState", "YES"]
    app.launch()
    app.typeKey(",", modifierFlags: .command)
    let settings = app.windows["Settings"]
    XCTAssertTrue(settings.waitForExistence(timeout: 5), "⌘, opens Settings")
    let plate = settings.buttons["chip-Plate"]
    XCTAssertTrue(plate.waitForExistence(timeout: 3))
    plate.click()
    XCTAssertTrue(plate.isSelected, "the chosen theme chip reads selected")
    let auto = settings.buttons["chip-Auto"]
    auto.click()
    XCTAssertTrue(auto.isSelected)
    XCTAssertFalse(plate.isSelected)
    app.terminate()
  }
}
