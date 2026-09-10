import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildRichText,
  checkboxesToGlyphs,
  cleanDeclarations,
  embedImages,
  inlineStyles,
  insertColgroups,
  parseTokens,
  resolveVars,
  stripPositions
} from './rich-text'

/* The sheets themselves: a ?raw import is stubbed away under vitest, and
 * only the real palette proves the copy carries the app's own values. */
const sheet = (path: string): string =>
  readFileSync(new URL(`../../renderer/styles/${path}`, import.meta.url), 'utf8')
const PALETTE = parseTokens(sheet('tokens.css'), sheet('themes/ledger.css'))

describe('parseTokens — the app’s own values, not a second palette', () => {
  it('reads declarations and ignores comments', () => {
    const tokens = parseTokens(`/* --ink: #ffffff; */\n:root { --ink: #1a1d1b; --rule: #d6dad5; }`)
    expect(tokens.get('ink')).toBe('#1a1d1b')
    expect(tokens.get('rule')).toBe('#d6dad5')
  })

  it('a later sheet wins — the theme palette lands over the defaults', () => {
    const tokens = parseTokens(`:root { --paper: #000; }`, `:root { --paper: #eff1ee; }`)
    expect(tokens.get('paper')).toBe('#eff1ee')
  })
})

describe('resolveVars — every var() becomes a literal', () => {
  const tokens = parseTokens(
    `:root { --ink: #1a1d1b; --shiki-token-comment: var(--ink-ghost); --ink-ghost: #9ba39c; }`
  )

  it('resolves a plain reference', () => {
    expect(resolveVars('color: var(--ink)', tokens)).toBe('color: #1a1d1b')
  })

  it('follows a reference through another token', () => {
    expect(resolveVars('color: var(--shiki-token-comment)', tokens)).toBe('color: #9ba39c')
  })

  it('uses the fallback when the token is unknown, and empties it when there is none', () => {
    expect(resolveVars('color: var(--nope, #123456)', tokens)).toBe('color: #123456')
    expect(resolveVars('background: var(--nope)', tokens)).toBe('background: ')
  })

  it('leaves var-free css alone', () => {
    expect(resolveVars('padding: 0 0.15em', tokens)).toBe('padding: 0 0.15em')
  })
})

describe('cleanDeclarations — no litter in the clipboard', () => {
  it('drops a declaration whose value resolved to nothing', () => {
    expect(cleanDeclarations('background: ; color: #1a1d1b')).toBe('color: #1a1d1b')
  })

  it('keeps order and normalizes spacing', () => {
    expect(cleanDeclarations(' color: red ; padding: 0 ')).toBe('color: red; padding: 0')
  })
})

describe('the finished HTML', () => {
  const DOC = [
    '# Title',
    '',
    'A paragraph with **bold**, `code`, and a [link](https://example.com).',
    '',
    '| ID | Note |',
    '| ---- | -------------- |',
    '| R01 | first |',
    '',
    '| L | C | R |',
    '| :-- | :-: | --: |',
    '| a | b | c |',
    '',
    '> quoted',
    '',
    '- [ ] todo',
    '- [x] done',
    '',
    '```js',
    'const x = 1 // note',
    '```',
    '',
    '---',
    ''
  ].join('\n')

  const built = buildRichText(DOC, null, PALETTE)

  it('is one wrapped fragment — the platform states the encoding itself', async () => {
    const { html } = await built
    expect(html.startsWith('<div style="font-family:')).toBe(true)
    expect(html.trimEnd().endsWith('</div>')).toBe(true)
    expect(html).not.toContain('<!doctype')
  })

  it('carries no var(), no stylesheet, no class names, and no position machinery', async () => {
    const { html } = await built
    expect(html).not.toContain('var(')
    expect(html).not.toContain('<style')
    expect(html).not.toContain('data-pos')
    // A stray `shiki` or `task-list-item` would mean something wrong in a
    // CMS that styles those names.
    expect(html).not.toContain('class=')
  })

  it('styles the things a paste target cannot infer', async () => {
    const { html } = await built
    // Table: collapsed hairlines from the rule token, header fill.
    expect(html).toContain('border-collapse: collapse')
    expect(html).toContain('border: 1px solid #d6dad5')
    expect(html).toMatch(/<th[^>]+background: #e5e8e4/)
    // Fence and inline code: tinted, mono.
    expect(html).toMatch(/<pre[^>]+background: #e5e8e4/)
    expect(html).toMatch(/<code[^>]+font-family: 'Ioskeley Mono'/)
    // Quote fill, rule hairline, image sizing rule for later.
    expect(html).toMatch(/<blockquote[^>]+background: #e5e8e4/)
    expect(html).toMatch(/<hr[^>]+border-top: 1px solid #d6dad5/)
  })

  it('leaves what a destination already knows alone', async () => {
    const { html } = await built
    // Headings keep the serif signature but never a size — the
    // destination's own heading scale should win.
    expect(html).toMatch(/<h1[^>]+font-family: 'Fraunces Variable'/)
    expect(html).not.toMatch(/<h1[^>]+font-size/)
    // Paragraphs, links, and emphasis carry nothing at all.
    expect(html).toContain('<p>A paragraph with <strong>bold</strong>')
    expect(html).toContain('<a href="https://example.com">link</a>')
  })

  it('keeps GFM column alignment, which a style would otherwise override', async () => {
    const { html } = await built
    expect(html).toMatch(/<td[^>]+text-align: center[^>]*>b<\/td>/)
    expect(html).toMatch(/<td[^>]+text-align: right[^>]*>c<\/td>/)
    expect(html).toMatch(/<td[^>]+text-align: left[^>]*>a<\/td>/)
  })

  it('proportions columns the way the source does, so a resized column travels', async () => {
    const { html } = await built
    // 4-wide ID against a 14-wide Note: the delimiter row's dash runs.
    expect(html).toContain('<colgroup><col style="width: 22.222%"><col style="width: 77.778%">')
  })

  it('turns task checkboxes into glyphs that survive any destination', async () => {
    const { html } = await built
    expect(html).not.toContain('<input')
    expect(html).toContain('☐ todo')
    expect(html).toContain('☑ done')
    expect(html).toMatch(/<li[^>]+list-style: none/)
  })

  it('resolves Shiki token colors to literals', async () => {
    const { html } = await built
    // The comment token points at --ink-ghost through the theme.
    expect(html).toMatch(/<span style="color:\s*#9ba39c">\s*\/\/ note<\/span>/)
  })

  it('hands plain-text destinations the markdown itself', async () => {
    const { text } = await built
    expect(text).toBe(DOC)
  })
})

describe('the passes over finished HTML, on their own', () => {
  it('insertColgroups: no source table, no colgroup', () => {
    const html = '<table data-pos="9999"><tr><td>x</td></tr></table>'
    expect(insertColgroups(html, 'no table here')).toBe(html)
  })

  it('stripPositions leaves other data attributes alone', () => {
    expect(stripPositions('<p data-pos="3" data-footnotes>x</p>')).toBe('<p data-footnotes>x</p>')
  })

  it('checkboxesToGlyphs handles both states and nothing else', () => {
    expect(checkboxesToGlyphs('<input type="checkbox" disabled> a')).toBe('☐ a')
    expect(checkboxesToGlyphs('<input type="checkbox" checked disabled> b')).toBe('☑ b')
    expect(checkboxesToGlyphs('<input type="text">')).toBe('<input type="text">')
  })
})

describe('inlineStyles — the rewrite of our own markup', () => {
  it('a > inside an attribute value does not end the tag early', () => {
    const out = inlineStyles('<img src="a.png" alt="a > b"><hr>', PALETTE)
    expect(out).toContain('alt="a > b"')
    expect(out).toMatch(/<hr[^>]+border-top/)
  })

  it('code is fence code only inside a fence, and inline code after it', () => {
    const out = inlineStyles('<pre><code>x</code></pre><p><code>y</code></p>', PALETTE)
    expect(out).toMatch(/<pre[^>]+padding: 0\.8em 1em/)
    expect(out).toMatch(/<code style="background: none[^"]*">x/)
    expect(out).toMatch(/<code style="font-family[^"]*background: #e5e8e4[^"]*">y/)
  })

  it('keeps ids, which footnote links are built on', () => {
    expect(inlineStyles('<h2 id="notes" class="sr-only">Footnotes</h2>', PALETTE)).toContain(
      'id="notes"'
    )
  })

  it('leaves closing tags alone', () => {
    expect(inlineStyles('</table>', PALETTE)).toBe('</table>')
  })
})

describe('embedImages', () => {
  it('leaves remote and data sources alone', async () => {
    const html = '<img src="https://example.com/a.png"><img src="data:image/png;base64,AA">'
    expect(await embedImages(html, '/tmp')).toBe(html)
  })

  it('an unreadable local image still gets an absolute file url', async () => {
    const out = await embedImages('<img src="missing.png">', '/tmp/nowhere')
    expect(out).toContain('src="file:///tmp/nowhere/missing.png"')
  })

  it('without a document folder a relative source is left as it is', async () => {
    expect(await embedImages('<img src="pic.png">', null)).toBe('<img src="pic.png">')
  })
})

describe('the palette the copy is built from', () => {
  it('resolves the app’s own tokens, so a copy is never a second theme', () => {
    expect(PALETTE.get('rule')).toBe('#d6dad5')
    expect(PALETTE.get('paper-sunk')).toBe('#e5e8e4')
    // Shiki's tokens point through the palette — that indirection is what
    // makes a theme restyle code for free, and it has to survive the copy.
    expect(resolveVars('var(--shiki-token-comment)', PALETTE)).toBe('#9ba39c')
  })
})
