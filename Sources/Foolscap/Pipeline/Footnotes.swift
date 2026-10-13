import Foundation

/* GFM footnotes, which swift-markdown doesn't parse: a pre-pass lifts the
 * definitions out of the markdown and turns each reference into a
 * placeholder the parser carries through as text; a post-pass turns the
 * placeholders into the superscript links and renders the definitions —
 * through the same pipeline — as the footnotes section. One parser, used
 * twice; no second grammar. */
enum Footnotes {
  struct Extracted: Equatable {
    /* The markdown with definitions removed and references replaced. */
    let markdown: String
    /* Definitions in order of first reference: (id, markdown body). */
    let definitions: [(id: String, body: String)]
    static func == (a: Extracted, b: Extracted) -> Bool {
      a.markdown == b.markdown && a.definitions.map(\.id) == b.definitions.map(\.id) && a.definitions.map(\.body) == b.definitions.map(\.body)
    }
  }

  /* Private-use delimiters: never in real text, never touched by cmark. */
  static let open = "\u{F8F0}"
  static let close = "\u{F8F1}"

  static func extract(_ markdown: String) -> Extracted {
    var bodies: [String: String] = [:]
    var kept: [String] = []
    var current: String? = nil
    for line in markdown.split(separator: "\n", omittingEmptySubsequences: false).map(String.init) {
      if let m = line.range(of: #"^\[\^([^\]\s]+)\]:[ \t]?"#, options: .regularExpression),
         let close = line.firstIndex(of: "]") {
        let id = String(line[line.index(m.lowerBound, offsetBy: 2)..<close])
        bodies[id] = String(line[m.upperBound...])
        current = id
        continue
      }
      // Indented continuation lines belong to the open definition.
      if let id = current, line.hasPrefix("    ") || line.hasPrefix("\t") {
        bodies[id, default: ""] += "\n" + line.trimmingCharacters(in: .whitespaces)
        continue
      }
      current = nil
      kept.append(line)
    }
    var order: [String] = []
    var text = kept.joined(separator: "\n")
    let refs = try! NSRegularExpression(pattern: #"\[\^([^\]\s]+)\]"#)
    let ns = text as NSString
    var out = ""
    var at = 0
    for m in refs.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
      let id = ns.substring(with: m.range(at: 1))
      guard bodies[id] != nil else { continue } // no definition: leave it as written
      out += ns.substring(with: NSRange(location: at, length: m.range.location - at))
      if !order.contains(id) { order.append(id) }
      out += "\(open)\(id)\(close)"
      at = NSMaxRange(m.range)
    }
    out += ns.substring(from: at)
    text = out
    return Extracted(markdown: text, definitions: order.map { ($0, bodies[$0] ?? "") })
  }

  /* Placeholders → superscript links; definitions → the section, each
   * body rendered by `render` (the pipeline's own HTML). */
  static func resolve(html: String, definitions: [(id: String, body: String)], render: (String) -> String) -> String {
    guard !definitions.isEmpty else { return html }
    var out = html
    for (n, def) in definitions.enumerated() {
      let number = n + 1
      let link = "<sup class=\"fnref\" id=\"fnref-\(def.id)\"><a href=\"#fn-\(def.id)\">\(number)</a></sup>"
      out = out.replacingOccurrences(of: "\(open)\(def.id)\(close)", with: link)
    }
    var section = "<section class=\"footnotes\">\n<ol>\n"
    for def in definitions {
      var body = render(def.body).trimmingCharacters(in: .whitespacesAndNewlines)
      let back = "<a class=\"fnback\" href=\"#fnref-\(def.id)\">↩</a>"
      if body.hasSuffix("</p>") { body = String(body.dropLast(4)) + " " + back + "</p>" } else { body += " " + back }
      section += "<li id=\"fn-\(def.id)\">\(body)</li>\n"
    }
    section += "</ol>\n</section>\n"
    return out + section
  }
}
