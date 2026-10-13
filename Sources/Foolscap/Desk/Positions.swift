import Foundation

/* Where you were in each file — caret and top-of-view offsets — so a file
 * reopens where you left it. UserDefaults, newest 500. */
struct DocPosition: Codable, Equatable { let head: Int; let top: Int }

final class Positions: @unchecked Sendable {
  static let shared = Positions()
  private let key = "positions"
  private let cap = 500
  private let lock = NSLock()
  private var entries: [String: (DocPosition, Double)]

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    var e: [String: (DocPosition, Double)] = [:]
    if let raw = defaults.dictionary(forKey: key) as? [String: [String: Double]] {
      for (path, v) in raw { if let h = v["head"], let t = v["top"], let at = v["at"] { e[path] = (DocPosition(head: Int(h), top: Int(t)), at) } }
    }
    entries = e
  }
  private let defaults: UserDefaults

  func recall(_ path: String) -> DocPosition? { lock.withLock { entries[path]?.0 } }

  func remember(_ path: String, _ p: DocPosition, now: Double = Date().timeIntervalSince1970) {
    lock.withLock {
      entries[path] = (p, now)
      if entries.count > cap {
        for (k, _) in entries.sorted(by: { $0.value.1 < $1.value.1 }).prefix(entries.count - cap) { entries.removeValue(forKey: k) }
      }
      var raw: [String: [String: Double]] = [:]
      for (k, v) in entries { raw[k] = ["head": Double(v.0.head), "top": Double(v.0.top), "at": v.1] }
      defaults.set(raw, forKey: key)
    }
  }
}

/* ⇧⌘T: recently closed files, app-wide, in memory. */
final class ClosedDocuments: @unchecked Sendable {
  static let shared = ClosedDocuments()
  private var paths: [String] = []
  private let lock = NSLock()
  func push(_ path: String) { lock.withLock { paths.removeAll { $0 == path }; paths.append(path); if paths.count > 20 { paths.removeFirst() } } }
  func pop(exists: (String) -> Bool) -> String? {
    lock.withLock {
      while let p = paths.popLast() { if exists(p) { return p } }
      return nil
    }
  }
  var count: Int { lock.withLock { paths.count } }
}
