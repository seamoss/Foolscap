import AppKit
import XCTest

/* The end-to-end layer (docs/adr/0001-testing.md): the real app, real
 * keystrokes, a real file. */
final class SmokeTests: XCTestCase {
  func testOpenTypeSaveRoundTrip() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("foolscap-ui-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let file = dir.appendingPathComponent("note.md")
    // A small picture beside the document, for the image fragment.
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 320, pixelsHigh: 120, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor(srgbRed: 0.44, green: 0.75, blue: 0.66, alpha: 1).setFill(); NSRect(x: 0, y: 0, width: 320, height: 120).fill()
    NSColor.white.setFill(); NSRect(x: 40, y: 30, width: 240, height: 60).fill()
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: dir.appendingPathComponent("pic.png"))

    let original = "# Note\n\nSome **bold** words, a [link](https://example.com), `code`, ~~struck~~.\n\n- one\n- two, which is long enough to wrap onto a second line in the editor measure so the hanging indent shows\n  - nested\n\n1. first\n2. second\n\n- [ ] open\n- [x] done\n\n> A quote,\n> across two lines.\n\n```swift\nlet x = 1\n```\n\n---\n\n![a picture](pic.png)\n\n| Specimen | Disposition | Count |\n| --- | :---: | ---: |\n| Gerald | Smug | 1 |\n| Brenda II | Litigious | 22 |\n\nThe end.\n"
    try original.write(to: file, atomically: true, encoding: .utf8)

    let app = XCUIApplication()
    // Never restore a previous run's windows into a test.
    app.launchArguments += ["-ApplePersistenceIgnoreState", "YES"]
    app.launchEnvironment["FOOLSCAP_OPEN"] = file.path
    app.launch()
    let editor = app.textViews["editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 10), "the editor appears with the file")
    XCTAssertEqual(editor.value as? String, original, "the file's text is in the editor, byte for byte")

    editor.click()
    app.typeKey(.downArrow, modifierFlags: .command) // end of document
    editor.typeText("Typed here.")
    XCTAssertEqual(editor.value as? String, original + "Typed here.", "typing changes the text and nothing else")

    // FOOLSCAP_SHOT=1 (via TEST_RUNNER_FOOLSCAP_SHOT) saves what the window
    // shows at this point — the marks of **bold** receded, the caret away
    // from them: the Phase 0 acceptance picture. The sandboxed runner can
    // write only its own temporary directory, so the path is printed.
    if ProcessInfo.processInfo.environment["FOOLSCAP_SHOT"] == "1" {
      app.typeKey(.upArrow, modifierFlags: .command) // the document's top: title bar and first heading in frame
      let shot = dir.appendingPathComponent("phase0.png")
      do {
        // The window, never the screen: a capture must not carry whatever
        // else is on the developer's desktop.
        try app.windows.firstMatch.screenshot().pngRepresentation.write(to: shot)
        print("FOOLSCAP_SHOT_PATH: \(shot.path)")
      } catch { XCTFail("screenshot: \(error)") }
    }

    app.typeKey("s", modifierFlags: .command)
    let deadline = Date().addingTimeInterval(5)
    var onDisk = ""
    repeat {
      onDisk = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
      if onDisk == original + "Typed here." { break }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    } while Date() < deadline
    XCTAssertEqual(onDisk, original + "Typed here.", "⌘S wrote exactly the editor's text")
    app.terminate()
    if ProcessInfo.processInfo.environment["FOOLSCAP_SHOT"] != "1" { try? FileManager.default.removeItem(at: dir) }
  }
}
