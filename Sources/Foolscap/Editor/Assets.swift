import AppKit

/* Pasted and dropped images live in assets/ beside the document, linked
 * relatively. Not the document, so not NSDocument's write — but atomic. */
enum Assets {
  enum Failure: Error { case noDocument, write(Error) }

  static func save(_ data: Data, ext: String, preferredName: String?, beside documentDirectory: URL?) -> Result<String, Failure> {
    guard let dir = documentDirectory else { return .failure(.noDocument) }
    let assets = dir.appendingPathComponent("assets", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
      var name = PasteRules.assetName(preferred: preferredName, ext: ext)
      let stem = String(name.dropLast(ext.count + 1))
      var n = 2
      while FileManager.default.fileExists(atPath: assets.appendingPathComponent(name).path) { name = "\(stem)-\(n).\(ext)"; n += 1 }
      try data.write(to: assets.appendingPathComponent(name), options: .atomic)
      return .success("assets/\(name)")
    } catch { return .failure(.write(error)) }
  }

  /* PNG bytes for a pasteboard image. */
  static func png(from image: NSImage) -> Data? {
    guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
    return rep.representation(using: .png, properties: [:])
  }
}
