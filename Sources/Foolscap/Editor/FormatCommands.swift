import Foundation

/* Inline formatting as plain-text edits: wrap the selection in the
 * construct's marks, or strip the marks when the selection already sits
 * inside that construct (decided from the parse, never by string
 * matching). An empty selection formats the word under the caret; with no
 * word, it inserts a marker pair and parks the caret between — pressing
 * the shortcut again before typing removes the empty pair. Pure; the text
 * view applies the edit so it is undoable. */
struct InlineFormat: Equatable {
  let marker: String
  let kind: Construct.Kind
  static let strong = InlineFormat(marker: "**", kind: .strong)
  static let emphasis = InlineFormat(marker: "*", kind: .emphasis)
  static let strikethrough = InlineFormat(marker: "~~", kind: .strikethrough)
  static let code = InlineFormat(marker: "`", kind: .code)
}

struct TextEdit: Equatable {
  let range: NSRange
  let replacement: String
  let selection: NSRange
}

enum FormatCommands {
  static func toggle(_ format: InlineFormat, in text: NSString, selection: NSRange, constructs: [Construct]) -> TextEdit {
    // Inside the construct already (a caret flush against a mark counts).
    if let inside = constructs.first(where: { $0.kind == format.kind && $0.range.location <= selection.location && NSMaxRange($0.range) >= NSMaxRange(selection) }) {
      let inner = text.substring(with: inside.content)
      let newSel = NSRange(location: max(inside.range.location, selection.location - (inside.content.location - inside.range.location)), length: min(selection.length, inner.utf16.count))
      return TextEdit(range: inside.range, replacement: inner, selection: newSel)
    }
    let len = format.marker.utf16.count
    if selection.length > 0 {
      let s = text.substring(with: selection)
      return TextEdit(range: selection, replacement: format.marker + s + format.marker, selection: NSRange(location: selection.location + len, length: selection.length))
    }
    let pos = selection.location
    // Caret between an empty pair it just inserted: take the pair out.
    if pos >= len, pos + len <= text.length, text.substring(with: NSRange(location: pos - len, length: len)) == format.marker, text.substring(with: NSRange(location: pos, length: len)) == format.marker {
      return TextEdit(range: NSRange(location: pos - len, length: len * 2), replacement: "", selection: NSRange(location: pos - len, length: 0))
    }
    if let word = wordRange(in: text, at: pos) {
      let s = text.substring(with: word)
      return TextEdit(range: word, replacement: format.marker + s + format.marker, selection: NSRange(location: word.location + len, length: word.length))
    }
    return TextEdit(range: NSRange(location: pos, length: 0), replacement: format.marker + format.marker, selection: NSRange(location: pos + len, length: 0))
  }

  /* [selection]() with the caret in the parens; an empty selection leaves
   * the caret in the brackets. Insert-only — unlinking is an edit. */
  static func link(in text: NSString, selection: NSRange) -> TextEdit {
    let s = text.substring(with: selection)
    let replacement = "[\(s)]()"
    let caret = selection.length == 0 ? selection.location + 1 : selection.location + s.utf16.count + 3
    return TextEdit(range: selection, replacement: replacement, selection: NSRange(location: caret, length: 0))
  }

  static func wordRange(in text: NSString, at pos: Int) -> NSRange? {
    let isWord: (unichar) -> Bool = { c in
      guard let scalar = Unicode.Scalar(c) else { return false }
      return CharacterSet.alphanumerics.contains(scalar) || c == 0x5F
    }
    var start = pos, end = pos
    while start > 0, isWord(text.character(at: start - 1)) { start -= 1 }
    while end < text.length, isWord(text.character(at: end)) { end += 1 }
    return end > start ? NSRange(location: start, length: end - start) : nil
  }
}
