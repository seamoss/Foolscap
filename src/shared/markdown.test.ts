import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown — THE pipeline', () => {
  it('renders headings, gfm strikethrough, and tables', async () => {
    const html = await renderMarkdown('# H\n\n~~x~~\n\n| a |\n| - |\n| b |')
    expect(html).toContain('<h1 id="h">H</h1>')
    expect(html).toContain('<del>x</del>')
    expect(html).toContain('<table>')
  })

  it('renders footnotes (deferred from the editor, promised to exports)', async () => {
    const html = await renderMarkdown('ref[^1]\n\n[^1]: def')
    expect(html).toContain('data-footnotes')
    expect(html).toContain('def')
  })

  it('headings carry github-style anchor ids', async () => {
    const html = await renderMarkdown('# Getting Started!\n\n## Café "quoted"')
    expect(html).toContain('<h1 id="getting-started">')
    expect(html).toContain('<h2 id="café-quoted">')
  })

  it('duplicate heading text gets suffixed ids', async () => {
    const html = await renderMarkdown('## Install\n\n## Install\n\n## Install')
    expect(html).toContain('<h2 id="install">')
    expect(html).toContain('<h2 id="install-1">')
    expect(html).toContain('<h2 id="install-2">')
  })

  it('a hand-written toc link resolves to its heading', async () => {
    const html = await renderMarkdown('- [Install](#install)\n\n## Install')
    const href = /<a href="#([^"]+)">/.exec(html)?.[1]
    expect(href).toBe('install')
    expect(html).toContain(`<h2 id="${href}">`)
  })

  it('highlights fences through the same css-variables Shiki theme', async () => {
    const html = await renderMarkdown('```js\nconst x = 1\n```')
    expect(html).toContain('var(--shiki-')
    expect(html).toContain('shiki')
  })

  it('does not pass raw html through (dangerous html stays escaped)', async () => {
    const html = await renderMarkdown('hello <script>alert(1)</script>')
    expect(html).not.toContain('<script>')
  })

  it('a literal <br> is a line break — the one a table cell can hold — in any spelling', async () => {
    const html = await renderMarkdown('| a |\n| - |\n| x<br>y <br/> z<BR />w |')
    expect(html).toContain('<td>x<br>\ny <br>\nz<br>\nw</td>')
  })

  it('<br> breaks a paragraph line too, while other raw tags still stay out', async () => {
    const html = await renderMarkdown('para<br>two <span>s</span>')
    expect(html).toContain('<p>para<br>\ntwo s</p>')
    expect(html).not.toContain('<span>')
  })

  it('unknown fence languages fall back to plain text', async () => {
    const html = await renderMarkdown('```nosuchlang\nplain\n```')
    expect(html).toContain('plain')
  })

  it('sourcePositions stamps block elements with source offsets', async () => {
    const html = await renderMarkdown('# One\n\ntext here', { sourcePositions: true })
    expect(html).toContain('<h1 id="one" data-pos="0">')
    expect(html).toContain('data-pos="7"')
  })

  it('default rendering carries no position stamps (exports stay clean)', async () => {
    const html = await renderMarkdown('# One\n\ntext here')
    expect(html).not.toContain('data-pos')
  })
})

/* Golden files (ULTRAPLAN §8): fixtures/*.md must render byte-identically
 * to their committed .golden.html. Regenerate deliberately with
 * UPDATE_GOLDENS=1 pnpm test — a diff here means export output changed and
 * the change must be intentional. */
describe('golden files', () => {
  const dir = join(process.cwd(), 'fixtures')

  it('every fixture matches its golden output', async () => {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.md'))
    expect(files.length).toBeGreaterThan(0)
    await mkdir(join(dir, 'golden'), { recursive: true })
    for (const file of files) {
      const markdown = await readFile(join(dir, file), 'utf8')
      const html = await renderMarkdown(markdown)
      const goldenPath = join(dir, 'golden', file.replace(/\.md$/, '.golden.html'))
      if (process.env['UPDATE_GOLDENS']) {
        await writeFile(goldenPath, html, 'utf8')
      } else {
        const golden = await readFile(goldenPath, 'utf8')
        expect(html, `${file} diverged from its golden output`).toBe(golden)
      }
    }
  })
})
