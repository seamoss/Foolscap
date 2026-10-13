import Foundation

/* THE cursor-adjacency function. A construct's marks are "revealed" (soft
 * ink) when the selection touches its range, inclusive of both ends, so a
 * caret flush against the opening or closing delimiter counts as inside;
 * otherwise they "recede" (ghost ink). Pure, and the only place this
 * decision is made. */
func selectionTouches(_ selection: NSRange, _ range: NSRange) -> Bool {
  let selEnd = selection.location + selection.length
  let rangeEnd = range.location + range.length
  return selection.location <= rangeEnd && selEnd >= range.location
}
