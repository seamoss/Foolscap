import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { columnDisplayWidth, parseTable, tableSourceAt } from '../../renderer/editor/table-model'
import ledgerCss from '../../renderer/styles/themes/ledger.css?raw'
import tokensCss from '../../renderer/styles/tokens.css?raw'
import { renderMarkdown } from '../../shared/markdown'

/* Copy as Rich Text: the document as the preview renders it, on the
 * clipboard, ready to paste into Google Docs, Word, or a CMS with its
 * formatting intact. An export writes a file that carries its own
 * stylesheet; a paste carries nothing — every destination throws away
 * <style> blocks and class names — so each declaration has to ride on the
 * element itself.
 *
 * What gets inlined is deliberately narrow: the things a paste target
 * cannot infer. It already knows what a heading, a list, a link, and bold
 * text are, and it will style them like the rest of its own document,
 * which is what anyone pasting wants. It does not know that a table has
 * hairline borders and proportioned columns, that a fence is a tinted
 * block of mono, that a quote is filled, or what color a keyword is.
 * Those travel.
 *
 * Always the light palette, for the reason print gives in export.css:
 * paper is paper even from a dark-mode machine, and a paste lands on
 * someone else's white page.
 *
 * This works on the rendered HTML rather than the tree THE pipeline
 * builds, because the highlighter's markup — the spans this has to
 * recolor — exists only in the output string: a plugin added after it
 * still sees a bare <pre><code>. The markup being rewritten is our own,
 * from one generator, so its shape is known. */

/* ---- Tokens: the app's own values, not a second palette (CLAUDE.md — no
 * hardcoded colors here or anywhere). Later sheets win, so the Ledger
 * palette lands over the defaults. ---- */

export function parseTokens(...sheets: string[]): Map<string, string> {
  const tokens = new Map<string, string>()
  for (const sheet of sheets) {
    const bare = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of bare.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      const [, name, value] = match
      if (name !== undefined && value !== undefined) tokens.set(name, value.trim())
    }
  }
  return tokens
}

/* The default palette, straight from the sheets the app styles with.
 * Injectable because a test can't see a ?raw import — vitest stubs CSS —
 * and a palette resolved from the real files is the only thing worth
 * asserting against. */
export const TOKENS = parseTokens(tokensCss, ledgerCss)

/* Resolve every var() to a literal, including nested ones — a Shiki token
 * color points at a palette color, which is the whole reason a theme
 * restyles code for free. A balanced-paren scan, not a regex: fallbacks
 * carry commas and parens of their own. */
export function resolveVars(css: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 8 || !css.includes('var(')) return css
  let out = ''
  let i = 0
  while (i < css.length) {
    const at = css.indexOf('var(', i)
    if (at === -1) {
      out += css.slice(i)
      break
    }
    out += css.slice(i, at)
    let open = 0
    let j = at + 3
    for (; j < css.length; j++) {
      if (css[j] === '(') open++
      else if (css[j] === ')' && --open === 0) break
    }
    const inner = css.slice(at + 4, j)
    const comma = inner.indexOf(',')
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim().replace(/^--/, '')
    const fallback = comma === -1 ? '' : inner.slice(comma + 1).trim()
    out += resolveVars(tokens.get(name) ?? fallback, tokens, depth + 1)
    i = j + 1
  }
  return out
}

/* Drop declarations left without a value — a var() that resolved to
 * nothing, as Shiki's background does against a palette that names no such
 * token. Invalid CSS is ignored by every renderer anyway; carrying it in
 * the clipboard is just litter. */
export function cleanDeclarations(css: string): string {
  return css
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const colon = part.indexOf(':')
      return colon > 0 && part.slice(colon + 1).trim() !== ''
    })
    .join('; ')
}

/* ---- What each element carries. Written in tokens, resolved once. ---- */

const DECLARATIONS: Record<string, string> = {
  /* Headings: the typographic signature is worth carrying, the size is
   * not — a destination's own heading scale should win over ours. */
  heading: 'font-family: var(--font-heading); font-weight: var(--weight-heading)',

  code: [
    'font-family: var(--font-code)',
    'font-size: var(--font-size-code)',
    'background: var(--paper-sunk)',
    'border-radius: var(--radius-inline)',
    'padding: 0 0.15em'
  ].join('; '),
  pre: [
    'font-family: var(--font-code)',
    'font-size: var(--font-size-code)',
    'background: var(--paper-sunk)',
    'border-radius: var(--radius-ui)',
    'padding: 0.8em 1em',
    // Implied by <pre>, spelled out for a destination that unwraps it.
    'white-space: pre',
    'overflow-x: auto'
  ].join('; '),
  'pre code': 'background: none; padding: 0; font-size: 1em',

  blockquote: [
    'margin: var(--space-paragraph) 0',
    'padding: 0.4em 1em',
    'background: var(--paper-sunk)',
    'color: var(--ink-soft)',
    'border-radius: var(--radius-inline)'
  ].join('; '),

  table: 'border-collapse: collapse; width: 100%; margin: var(--space-paragraph) 0',
  cell: 'border: 1px solid var(--rule); padding: var(--pad-table-cell)',
  th: 'background: var(--paper-sunk); font-weight: var(--weight-ui)',

  hr: 'border: none; border-top: 1px solid var(--rule); margin: 2em 0',
  img: 'max-width: 100%',
  /* The checkbox becomes a glyph below; without this the item would carry
   * a bullet as well. */
  task: 'list-style: none',
  footnotes: 'margin-top: 3em; color: var(--ink-soft); font-size: var(--font-size-ui)'
}

type Styles = Map<string, string>

function stylesFor(tokens: Map<string, string>): Styles {
  return new Map(
    Object.entries(DECLARATIONS).map(([key, value]) => [
      key,
      cleanDeclarations(resolveVars(value, tokens))
    ])
  )
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

const attribute = (attrs: string, name: string): string | null => {
  const match = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(attrs)
  return match?.[1] ?? null
}

/* The declarations for one opening tag, given its attributes and whether
 * it sits inside a fence. */
function declarationsFor(
  tag: string,
  attrs: string,
  insidePre: boolean,
  styles: Styles
): string | undefined {
  if (HEADINGS.has(tag)) return styles.get('heading')
  if (tag === 'code') return styles.get(insidePre ? 'pre code' : 'code')
  if (tag === 'th' || tag === 'td') {
    /* GFM alignment arrives as the align attribute, which any text-align
     * we set would override — so it becomes part of the style instead. */
    const align = attribute(attrs, 'align') ?? 'left'
    const own = tag === 'th' ? `${styles.get('cell')}; ${styles.get('th')}` : styles.get('cell')
    return `${own}; text-align: ${align}`
  }
  const classes = (attribute(attrs, 'class') ?? '').split(/\s+/)
  if (tag === 'li' && classes.includes('task-list-item')) return styles.get('task')
  if (tag === 'section' && classes.includes('footnotes')) return styles.get('footnotes')
  return styles.get(tag)
}

/* Attributes are matched quote-aware: a > inside alt text or a style value
 * must not end the tag early. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g

/* Style every element, and strip the class names on the way out: they mean
 * nothing without our stylesheet, and a name like `shiki` landing in a CMS
 * that happens to style it would mean something wrong. Ids stay — footnote
 * links are built on them. */
export function inlineStyles(html: string, tokens: Map<string, string> = TOKENS): string {
  const styles = stylesFor(tokens)
  let insidePre = false
  return html.replace(TAG, (whole, closing: string, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase()
    if (closing !== '') {
      if (tag === 'pre') insidePre = false
      return whole
    }
    const own = declarationsFor(tag, attrs, insidePre, styles)
    if (tag === 'pre') insidePre = true
    const existing = /\sstyle="([^"]*)"/i.exec(attrs)
    /* Ours first: what the document itself produced — a Shiki token
     * color — has to win over the tag's defaults. */
    const merged = cleanDeclarations(
      [own ?? '', resolveVars(existing?.[1] ?? '', tokens)].filter(Boolean).join('; ')
    )
    let rest = attrs
    if (existing) rest = rest.replace(existing[0], '')
    rest = rest.replace(/\sclass="[^"]*"/gi, '')
    return `<${tag}${rest}${merged === '' ? '' : ` style="${merged}"`}>`
  })
}

/* ---- Passes that need the document's source or a whole element ---- */

/* A table's column proportions live in its source, not its markup — the
 * delimiter row's dash runs, where a drag-to-resize leaves them. The same
 * three functions the preview sizes tables with, so a pasted table is
 * proportioned like the page it came from. */
export function insertColgroups(html: string, markdown: string): string {
  return html.replace(/<table\b[^>]*\bdata-pos="(\d+)"[^>]*>/g, (tag, pos: string) => {
    const source = tableSourceAt(markdown, Number(pos))
    if (!source) return tag
    const model = parseTable(source.text)
    const weights = model.header.map((_, i) => columnDisplayWidth(model, i))
    const total = weights.reduce((a, b) => a + b, 0)
    if (weights.length === 0 || total <= 0) return tag
    const cols = weights
      .map((weight) => `<col style="width: ${((weight / total) * 100).toFixed(3)}%">`)
      .join('')
    return `${tag}<colgroup>${cols}</colgroup>`
  })
}

/* Position stamps exist for the colgroups above; nothing downstream wants
 * them, and a paste should carry no machinery. */
export function stripPositions(html: string): string {
  return html.replace(/ data-pos="\d+"/g, '')
}

/* A disabled checkbox is inert markup that most destinations drop
 * entirely, taking the done/not-done with it. A glyph is text, and text
 * survives anything. */
export function checkboxesToGlyphs(html: string): string {
  return html
    .replace(/<input type="checkbox" checked disabled>/g, '☑')
    .replace(/<input type="checkbox" disabled>/g, '☐')
}

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

/* Total encoded image bytes one copy will carry. A document of screenshots
 * would otherwise put tens of megabytes on the clipboard; past the budget
 * the rest fall back to file URLs, which the apps that can read local
 * files still resolve. */
const IMAGE_BUDGET = 8 * 1024 * 1024

/* A relative src means nothing once pasted — the destination has no idea
 * which folder the document lived in. Local images travel as data URIs,
 * which Docs and most CMSes accept and upload; anything too big for the
 * budget becomes an absolute file URL. Remote images are portable already. */
export async function embedImages(html: string, docDir: string | null): Promise<string> {
  const sources = new Set(
    [...html.matchAll(/<img\b[^>]*?\ssrc="([^"]*)"/g)].map((match) => match[1] ?? '')
  )
  let budget = IMAGE_BUDGET
  let out = html
  for (const src of sources) {
    if (src === '' || /^(?:data|https?|file):/i.test(src)) continue
    const decoded = src.replace(/&amp;/g, '&')
    const path = isAbsolute(decoded) ? decoded : docDir ? resolve(docDir, decoded) : null
    if (path === null) continue
    let replacement = pathToFileURL(path).toString()
    const mime = IMAGE_TYPES[extname(path).toLowerCase()]
    if (mime) {
      try {
        const encoded = (await readFile(path)).toString('base64')
        if (encoded.length <= budget) {
          budget -= encoded.length
          replacement = `data:${mime};base64,${encoded}`
        }
      } catch {
        // Unreadable or gone: the file URL is still the better guess.
      }
    }
    out = out.split(`src="${src}"`).join(`src="${replacement}"`)
  }
  return out
}

export interface RichText {
  /* text/html — what a rich destination pastes. */
  html: string
  /* text/plain — the markdown itself, the honest source for anywhere that
   * takes only text. */
  text: string
}

export async function buildRichText(
  markdown: string,
  docDir: string | null,
  tokens: Map<string, string> = TOKENS
): Promise<RichText> {
  const rendered = await renderMarkdown(markdown, { sourcePositions: true })
  const withColumns = stripPositions(insertColgroups(rendered, markdown))
  const styled = checkboxesToGlyphs(inlineStyles(withColumns, tokens))
  const withImages = await embedImages(styled, docDir)
  /* A fragment under one wrapper, which is what every other app puts on
   * the pasteboard: the platform prepends its own <meta charset> when the
   * HTML flavor is written, and a doctype arriving after that meta would
   * be malformed. The wrapper carries the text font — the one inherited
   * thing worth having — and nothing that fixes a size. */
  const font = cleanDeclarations(resolveVars('font-family: var(--font-body)', tokens))
  return { html: `<div style="${font}">\n${withImages}\n</div>`, text: markdown }
}
