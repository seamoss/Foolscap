import Foundation
import Markdown

/* THE conversion from swift-markdown's line/column source locations to the
 * NSRanges (UTF-16 offsets) that NSTextStorage speaks. Columns from
 * swift-markdown are 1-based UTF-8 byte offsets into the line; lines are
 * 1-based. Built once per parse over the same string. */
struct SourceOffsets {
  private let text: String
  /* utf8 offset of the start of each line (index 0 = line 1). */
  private let lineStarts: [Int]
  private let utf8ToUTF16: [Int]

  init(_ text: String) {
    self.text = text
    var starts = [0]
    var u16 = [Int](repeating: 0, count: text.utf8.count + 1)
    var u8 = 0
    var acc = 0
    for scalar in text.unicodeScalars {
      let bytes = scalar.utf8.count
      for k in 0..<bytes { u16[u8 + k] = acc }
      u8 += bytes
      acc += scalar.utf16.count
      if scalar == "\n" { starts.append(u8) }
    }
    u16[u8] = acc
    lineStarts = starts
    utf8ToUTF16 = u16
  }

  func utf16Offset(_ loc: SourceLocation) -> Int? {
    let line = loc.line - 1
    guard line >= 0, line < lineStarts.count else { return nil }
    let u8 = lineStarts[line] + (loc.column - 1)
    guard u8 >= 0, u8 < utf8ToUTF16.count else { return nil }
    return utf8ToUTF16[u8]
  }

  func nsRange(_ range: SourceRange?) -> NSRange? {
    guard let range, let from = utf16Offset(range.lowerBound), let to = utf16Offset(range.upperBound), to >= from else { return nil }
    return NSRange(location: from, length: to - from)
  }
}
