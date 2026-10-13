import Foundation

/* Tokens containing a letter or digit, so bare marks (#, >, -, ```) don't
 * inflate the number. */
func countWords(_ text: String) -> Int {
  var count = 0
  for token in text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }) {
    if token.contains(where: { $0.isLetter || $0.isNumber }) { count += 1 }
  }
  return count
}
