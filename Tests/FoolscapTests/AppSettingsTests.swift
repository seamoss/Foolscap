import XCTest
@testable import Foolscap

@MainActor
final class AppSettingsTests: XCTestCase {
  private func fresh() -> (AppSettings, UserDefaults) {
    let name = "foolscap-tests-\(UUID().uuidString)"
    let d = UserDefaults(suiteName: name)!
    d.removePersistentDomain(forName: name)
    return (AppSettings(defaults: d), d)
  }

  func testDefaultsAreAutoHouseFaceAndSeventeen() {
    let (s, _) = fresh()
    XCTAssertNil(s.themeID); XCTAssertNil(s.fontID); XCTAssertEqual(s.textSize, 17)
  }

  func testChoicesPersistAndReload() {
    let (s, d) = fresh()
    s.themeID = "plate"; s.fontID = "charter"; s.textSize = 19
    let again = AppSettings(defaults: d)
    XCTAssertEqual(again.themeID, "plate"); XCTAssertEqual(again.fontID, "charter"); XCTAssertEqual(again.textSize, 19)
  }

  func testTextSizeClampsToTheRange() {
    let (s, _) = fresh()
    s.textSize = 40; XCTAssertEqual(s.textSize, 22)
    s.textSize = 3; XCTAssertEqual(s.textSize, 14)
  }

  func testUnknownSavedIDsFallBackToDefaults() {
    let (_, d) = fresh()
    d.set("no-such-theme", forKey: "theme"); d.set("no-such-font", forKey: "font")
    let s = AppSettings(defaults: d)
    XCTAssertNil(s.themeID); XCTAssertNil(s.fontID)
  }

  func testChangeIsAnnounced() {
    let (s, _) = fresh()
    let e = expectation(forNotification: AppSettings.changed, object: s)
    s.textSize = 18
    wait(for: [e], timeout: 1)
  }
}
