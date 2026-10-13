import Foundation

/* A complete HTML document from the pipeline's body: tokens written as
 * custom properties, the export stylesheet inlined, fonts by family name
 * with system fallbacks (standalone) or by bundled file (in-app, through
 * the preview's foolscap: scheme). One builder for preview, HTML export,
 * PDF, and print. */
enum ExportHTML {
  enum Mode {
    /* A file for other people: no bundle references, light and dark by the
     * reader's system. */
    case standalone
    /* The preview and print paths: fonts from the bundle, the chosen theme. */
    case inApp(theme: Theme, sourcePositions: Bool)
    /* PDF and paper: Ledger on white, bundled fonts, no window. */
    case print
  }

  static func document(markdown: String, title: String, mode: Mode, stylesheet: String) -> String {
    let positions: Bool
    if case .inApp(_, let p) = mode { positions = p } else { positions = false }
    let body = Pipeline.html(markdown, sourcePositions: positions)
    return """
    <!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\(escape(title))</title>
    <style>
    \(fontFaces(mode))
    \(tokens(mode))
    \(stylesheet)
    </style>
    </head>
    <body>
    <main class="doc">
    \(body)</main>
    \(script(mode))
    </body>
    </html>

    """
  }

  static func escape(_ s: String) -> String { HTMLRenderer.escape(s) }

  /* Palette and type as custom properties. Standalone follows the system
   * between Ledger and Plate; in-app uses the theme in force; print is
   * Ledger on white (the sheet's @media print does the same). */
  static func tokens(_ mode: Mode) -> String {
    func palette(_ t: Theme, selector: String) -> String {
      let number = "color-mix(in srgb, \(t.accent) 55%, \(t.ink))"
      return "\(selector) { --paper: \(t.paper); --paper-sunk: \(t.paperSunk); --ink: \(t.ink); --ink-soft: \(t.inkSoft); --ink-ghost: \(t.inkGhost); --rule: \(t.rule); --accent: \(t.accent); --tok-number: \(number); }"
    }
    let type = """
    :root {
      --font-body: 'Recursive', 'Recursive Sans Linear Light', system-ui, sans-serif;
      --font-heading: 'Fraunces', 'Iowan Old Style', Georgia, serif;
      --font-code: 'Ioskeley Mono', ui-monospace, Menlo, monospace;
      --vf-body: 'MONO' 0, 'CASL' 0.4;
      --vf-heading-display: 'SOFT' 20, 'WONK' 1;
      --vf-heading-text: 'SOFT' 20, 'WONK' 0;
      --weight-body: 400; --weight-ui: 500; --weight-code: 400; --weight-heading: 600;
      --measure: 68ch; --font-size-body: 17px; --leading-body: 1.7; --space-paragraph: 0.9em;
      --font-size-h1: 2.6rem; --leading-h1: 1.15; --font-size-h2: 1.9rem; --font-size-h3: 1.4rem; --leading-heading: 1.25;
      --tracking-heading-minor: 0.04em; --font-size-ui: 13px; --font-size-code: 0.94em;
      --radius-ui: 6px; --radius-inline: 4px;
    }
    """
    switch mode {
    case .standalone:
      return type + "\n" + palette(.ledger, selector: ":root") + "\n@media (prefers-color-scheme: dark) { " + palette(.plate, selector: ":root") + " }"
    case .inApp(let theme, _):
      var t = type
      if theme.serifBody { t += "\n:root { --font-body: 'Fraunces', Georgia, serif; --vf-body: 'SOFT' 0, 'WONK' 0; --weight-body: 420; }" }
      return t + "\n" + palette(theme, selector: ":root")
    case .print:
      return type + "\n" + palette(.ledger, selector: ":root") + "\n:root { --paper: #ffffff; }"
    }
  }

  /* Bundled faces, served by the preview's scheme handler; a standalone
   * file names families and lets the reader's system fall back. */
  static func fontFaces(_ mode: Mode) -> String {
    if case .standalone = mode { return "" }
    func face(_ family: String, _ file: String, style: String = "normal", weight: String = "100 1000") -> String {
      "@font-face { font-family: '\(family)'; src: url('foolscap://font/\(file)'); font-weight: \(weight); font-style: \(style); font-display: block; }"
    }
    return [
      face("Recursive", "Recursive[CASL,CRSV,MONO,slnt,wght].ttf", weight: "300 1000"),
      face("Fraunces", "Fraunces[SOFT,WONK,opsz,wght].ttf"),
      face("Fraunces", "Fraunces-Italic[SOFT,WONK,opsz,wght].ttf", style: "italic"),
      face("Ioskeley Mono", "IoskeleyMono-Regular.ttf", weight: "400"),
      face("Ioskeley Mono", "IoskeleyMono-Italic.ttf", style: "italic", weight: "400")
    ].joined(separator: "\n")
  }

  /* The preview's bridge: a double-click reports the nearest stamped
   * block's source offset; the app scrolls by offset through `scrollToPos`. */
  static func script(_ mode: Mode) -> String {
    guard case .inApp(_, true) = mode else { return "" }
    return """
    <script>
    (function () {
      const stamped = () => Array.from(document.querySelectorAll('[data-pos]'));
      window.scrollToPos = function (pos) {
        let best = null;
        for (const el of stamped()) { const p = Number(el.dataset.pos); if (p <= pos && (best === null || p >= Number(best.dataset.pos))) best = el; }
        if (best) best.scrollIntoView({ block: 'start' });
      };
      document.addEventListener('dblclick', function (e) {
        const el = e.target.closest('[data-pos]');
        window.webkit.messageHandlers.foolscap.postMessage({ type: 'edit', pos: el ? Number(el.dataset.pos) : 0 });
      });
      document.addEventListener('click', function (e) {
        const a = e.target.closest('a[href]');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) return;
        e.preventDefault();
        window.webkit.messageHandlers.foolscap.postMessage({ type: 'link', href: a.href });
      });
    })();
    </script>
    """
  }
}
