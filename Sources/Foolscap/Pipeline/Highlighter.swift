import Foundation

/* Fence highlighting with no grammar engine: a single-pass scanner over a
 * language's keywords, comment markers, and string delimiters — the four
 * kinds of token a reader's eye actually uses. Deliberately small; a
 * language is a few lines of data in Languages.swift, built the first
 * time a fence names it and never otherwise. Shared by the editor (live
 * preview) and HTMLRenderer (export), so a fence looks the same in both —
 * the one-pipeline rule reaching into code. */

enum TokenKind: String, Sendable {
  case keyword, constant, string, comment, number
}

struct Token: Equatable, Sendable {
  let kind: TokenKind
  /* UTF-16 offsets into the code string. */
  let range: NSRange
}

struct LanguageSpec: Sendable {
  let keywords: Set<String>
  let constants: Set<String>
  let lineComments: [String]
  let blockComment: (open: String, close: String)?
  /* Delimiters that open a string; backslash escapes inside; three in a
   * row (Python) open a block string. */
  let stringDelimiters: Set<Character>
  let caseInsensitive: Bool
  /* Markup: an identifier right after "<" or "</" is a keyword (tag). */
  let tagsAreKeywords: Bool

  init(keywords: [String], constants: [String] = ["true", "false", "null", "nil", "None", "True", "False"], lineComments: [String] = ["//"], blockComment: (String, String)? = ("/*", "*/"), stringDelimiters: [Character] = ["\"", "'", "`"], caseInsensitive: Bool = false, tagsAreKeywords: Bool = false) {
    self.keywords = Set(caseInsensitive ? keywords.map { $0.lowercased() } : keywords)
    self.constants = Set(constants)
    self.lineComments = lineComments
    self.blockComment = blockComment.map { (open: $0.0, close: $0.1) }
    self.stringDelimiters = Set(stringDelimiters)
    self.caseInsensitive = caseInsensitive
    self.tagsAreKeywords = tagsAreKeywords
  }
}

enum Highlighter {
  static func tokenize(_ code: String, language: LanguageSpec) -> [Token] {
    let scalars = Array(code.unicodeScalars)
    var tokens: [Token] = []
    var i = 0
    var u16 = 0 // utf16 offset of scalars[i]
    var lastSignificant: Unicode.Scalar? = nil // for tag detection

    func width(_ s: Unicode.Scalar) -> Int { s.utf16.count }
    func matches(_ marker: String, at k: Int) -> Bool {
      let m = Array(marker.unicodeScalars)
      guard k + m.count <= scalars.count else { return false }
      for (j, s) in m.enumerated() where scalars[k + j] != s { return false }
      return true
    }
    func emit(_ kind: TokenKind, from start16: Int, to end16: Int) {
      if end16 > start16 { tokens.append(Token(kind: kind, range: NSRange(location: start16, length: end16 - start16))) }
    }
    func isIdentStart(_ s: Unicode.Scalar) -> Bool { s == "_" || s.properties.isAlphabetic }
    func isIdent(_ s: Unicode.Scalar) -> Bool { isIdentStart(s) || s.properties.numericType != nil || (s.value >= 48 && s.value <= 57) }
    func isDigit(_ s: Unicode.Scalar) -> Bool { s.value >= 48 && s.value <= 57 }

    while i < scalars.count {
      let s = scalars[i]
      // comments
      if let lc = language.lineComments.first(where: { matches($0, at: i) }) {
        _ = lc
        let start = u16
        while i < scalars.count, scalars[i] != "\n" { u16 += width(scalars[i]); i += 1 }
        emit(.comment, from: start, to: u16)
        continue
      }
      if let bc = language.blockComment, matches(bc.open, at: i) {
        let start = u16
        let openLen = bc.open.unicodeScalars.count
        for _ in 0..<openLen { u16 += width(scalars[i]); i += 1 }
        while i < scalars.count, !matches(bc.close, at: i) { u16 += width(scalars[i]); i += 1 }
        if i < scalars.count { for _ in 0..<bc.close.unicodeScalars.count { u16 += width(scalars[i]); i += 1 } }
        emit(.comment, from: start, to: u16)
        continue
      }
      // strings
      if language.stringDelimiters.contains(Character(s)) {
        let start = u16
        let delim = s
        let triple = matches(String(repeating: String(delim), count: 3), at: i)
        let n = triple ? 3 : 1
        for _ in 0..<n { u16 += width(scalars[i]); i += 1 }
        while i < scalars.count {
          if scalars[i] == "\\", i + 1 < scalars.count { u16 += width(scalars[i]) + width(scalars[i + 1]); i += 2; continue }
          if triple ? matches(String(repeating: String(delim), count: 3), at: i) : scalars[i] == delim {
            for _ in 0..<n { u16 += width(scalars[i]); i += 1 }
            break
          }
          if !triple, scalars[i] == "\n" { break } // an unterminated line string ends at the line
          u16 += width(scalars[i]); i += 1
        }
        emit(.string, from: start, to: u16)
        lastSignificant = delim
        continue
      }
      // numbers
      if isDigit(s) || (s == "." && i + 1 < scalars.count && isDigit(scalars[i + 1])) {
        let start = u16
        while i < scalars.count, isIdent(scalars[i]) || scalars[i] == "." { u16 += width(scalars[i]); i += 1 }
        emit(.number, from: start, to: u16)
        lastSignificant = s
        continue
      }
      // identifiers
      if isIdentStart(s) {
        let start = u16
        var word = ""
        while i < scalars.count, isIdent(scalars[i]) { word.unicodeScalars.append(scalars[i]); u16 += width(scalars[i]); i += 1 }
        let key = language.caseInsensitive ? word.lowercased() : word
        if language.tagsAreKeywords, lastSignificant == "<" || lastSignificant == "/" {
          emit(.keyword, from: start, to: u16)
        } else if language.keywords.contains(key) {
          emit(.keyword, from: start, to: u16)
        } else if language.constants.contains(word) {
          emit(.constant, from: start, to: u16)
        }
        lastSignificant = "a"
        continue
      }
      if !(s == " " || s == "\t" || s == "\n" || s == "\r") { lastSignificant = s }
      u16 += width(s); i += 1
    }
    return tokens
  }
}
