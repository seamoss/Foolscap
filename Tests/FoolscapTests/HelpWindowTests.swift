import XCTest
@testable import Foolscap

@MainActor
final class HelpWindowTests: XCTestCase {
  func testHelpMenuIsWired() {
    let menu = MainMenu.build()
    let help = menu.items.first { $0.title == "Help" }?.submenu
    XCTAssertNotNil(help)
    let item = help?.items.first { $0.title == "wtf is this?" }
    XCTAssertEqual(item?.action, #selector(AppDelegate.showManual(_:)))
    XCTAssertNotEqual(item?.action, #selector(NSApplication.showHelp(_:)), "NSApplication's own showHelp: would answer first with 'Help isn't available'")
    XCTAssertEqual(item?.keyEquivalent, "?")
    XCTAssertEqual(menu.items.first { $0.title == "View" }?.submenu?.items.first { $0.title == "Toggle Preview" }?.action, #selector(DocumentViewController.togglePreview(_:)))
  }

  func testHelpWindowShowsAndRendersTheManual() {
    let controller = HelpWindowController.shared
    controller.show()
    let window = controller.window!
    XCTAssertTrue(window.isVisible)
    XCTAssertEqual(window.title, "wtf is this?")
    let loaded = expectation(description: "manual loaded")
    let page = window.contentView as! PageView
    page.onLoad = {
      page.webView.evaluateJavaScript("document.querySelector('h1').textContent") { value, _ in
        XCTAssertEqual(value as? String, "wtf is this?")
        loaded.fulfill()
      }
    }
    wait(for: [loaded], timeout: 15)
    window.orderOut(nil)
  }
}
