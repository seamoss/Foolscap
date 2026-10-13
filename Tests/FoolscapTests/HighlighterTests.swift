import XCTest
@testable import Foolscap

final class HighlighterTests: XCTestCase {
  private func kinds(_ code: String, _ lang: String) -> [(String, TokenKind)] {
    let spec = Languages.spec(for: lang)!
    let ns = code as NSString
    return Highlighter.tokenize(code, language: spec).map { (ns.substring(with: $0.range), $0.kind) }
  }

  func testJavaScript() {
    let got = kinds("// comment\nconst x = { a: 1, b: \"two\", c: true }; /* block */", "js")
    XCTAssertEqual(got.map { $0.0 }, ["// comment", "const", "1", "\"two\"", "true", "/* block */"])
    XCTAssertEqual(got.map { $0.1 }, [.comment, .keyword, .number, .string, .constant, .comment])
  }

  func testPythonCommentsAndTripleStrings() {
    let got = kinds("def f():\n    \"\"\"doc\nstring\"\"\"  # note\n    return None", "python")
    XCTAssertEqual(got.map { $0.0 }, ["def", "\"\"\"doc\nstring\"\"\"", "# note", "return", "None"])
    XCTAssertEqual(got[1].1, .string); XCTAssertEqual(got[2].1, .comment)
  }

  func testStringsEscapeAndStopAtTheLine() {
    let got = kinds("a = \"with \\\" escape\"\nb = 'unterminated\nc = 2", "swift")
    XCTAssertEqual(got.map { $0.0 }, ["\"with \\\" escape\"", "'unterminated", "2"])
  }

  func testShellAndSQL() {
    XCTAssertEqual(kinds("if [ -f x ]; then echo hi; fi # done", "bash").map { $0.0 }, ["if", "then", "echo", "fi", "# done"])
    XCTAssertEqual(kinds("SELECT name FROM users WHERE id = 1 -- c", "sql").map { $0.0 }, ["SELECT", "FROM", "WHERE", "1", "-- c"])
  }

  func testHTMLTagsAreKeywords() {
    let got = kinds("<div class=\"a\"><!-- c --></div>", "html")
    XCTAssertEqual(got.map { $0.0 }, ["div", "\"a\"", "<!-- c -->", "div"])
    XCTAssertEqual(got[0].1, .keyword)
  }

  func testOffsetsAreUTF16() {
    let code = "x = \"🙂\" // after"
    let ns = code as NSString
    let t = Highlighter.tokenize(code, language: Languages.spec(for: "js")!)
    XCTAssertEqual(ns.substring(with: t[1].range), "// after")
  }

  func testUnknownLanguageHighlightsNothingAndLoadsNothing() {
    XCTAssertNil(Languages.spec(for: "brainfuck"))
    XCTAssertFalse(Languages.loaded.contains("rust"), "a language loads only when a fence names it")
    _ = Languages.spec(for: "rs")
    XCTAssertTrue(Languages.loaded.contains("rust"))
  }

  func testExportWrapsTokens() {
    let html = Pipeline.html("```js\nconst n = 1 // c\n```\n")
    XCTAssertTrue(html.contains("<span class=\"tok-keyword\">const</span>"))
    XCTAssertTrue(html.contains("<span class=\"tok-number\">1</span>"))
    XCTAssertTrue(html.contains("<span class=\"tok-comment\">// c</span>"))
    XCTAssertTrue(html.contains("<code class=\"language-js\">"))
  }
}
