import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import {
  createCssVariablesTheme,
  createHighlighter,
  createJavaScriptRegexEngine,
  type Highlighter
} from 'shiki'
import { unified } from 'unified'

/* THE one markdown pipeline (ULTRAPLAN §3.1 corollary, CLAUDE.md second
 * rule). HTML export and PDF export both render through here — never a
 * second parser, never a "just for export" alternative. GFM covers tables,
 * strikethrough, autolinks, task lists, and footnotes. Fences highlight via
 * the same css-variables Shiki theme as the editor, so every token color in
 * an export resolves from tokens.css exactly like on screen. */

export const shikiTheme = createCssVariablesTheme({
  name: 'foolscap-vars',
  variablePrefix: '--shiki-',
  fontStyle: true
})

let highlighterPromise: Promise<Highlighter> | null = null

/* One highlighter per process, shared by this pipeline and the editor's
 * fence decorations (code-fence.ts). The JavaScript regex engine, not
 * Oniguruma: the WASM engine plus the batteries-included rehype plugin
 * cost ~1.2s of first-render latency per window (measured), all spent
 * fetching WASM and registering ~220 grammars up front. Here nothing
 * loads until a fence actually names a language. */
export function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [shikiTheme],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true })
  })
  return highlighterPromise
}

/* Minimal structural view of a hast node — enough to stamp positions
 * without pulling in @types/hast. */
interface HastNode {
  type?: string
  position?: { start?: { offset?: number } }
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/* Stamp each element with its source offset (data-pos). Preview mode uses
 * this to map a double-click back into the editor; exports never enable it,
 * so their output stays byte-identical. */
function rehypeSourcePositions() {
  return (tree: HastNode): void => {
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && node.position?.start?.offset !== undefined) {
        node.properties = { ...node.properties, dataPos: String(node.position.start.offset) }
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  }
}

/* Minimal structural view of an mdast node — enough to retype one kind of
 * node without pulling in @types/mdast. */
interface MdastNode {
  type: string
  value?: string
  children?: MdastNode[]
}

const BR_HTML = /^<br\s*\/?>$/i

/* A literal <br> is a line break. Raw HTML otherwise stays out of the
 * output (nothing here passes it through), but this one tag is the only
 * line break a pipe table can hold — a newline ends the row — so the
 * editor's grid types it on Shift-Enter, and GitHub reads it the same
 * way. The node is retyped in place: remark-rehype renders `break` as
 * <br>, exactly like a hard line break. */
function remarkBrTags() {
  return (tree: MdastNode): void => {
    const walk = (node: MdastNode): void => {
      for (const child of node.children ?? []) {
        if (child.type === 'html' && child.value !== undefined && BR_HTML.test(child.value)) {
          child.type = 'break'
          delete child.value
        }
        walk(child)
      }
    }
    walk(tree)
  }
}

async function buildProcessor(sourcePositions: boolean) {
  const highlighter = await getHighlighter()
  const base = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBrTags)
    .use(remarkRehype)
    .use(rehypeSlug)
  const positioned = sourcePositions ? base.use(rehypeSourcePositions) : base
  return positioned
    .use(rehypeShikiFromHighlighter, highlighter, {
      theme: shikiTheme,
      defaultLanguage: 'text',
      fallbackLanguage: 'text',
      // Grammars load on demand per fence; unknown languages fall back.
      lazy: true
    })
    .use(rehypeStringify)
}

const processors = new Map<string, ReturnType<typeof buildProcessor>>()

function getProcessor(sourcePositions: boolean): ReturnType<typeof buildProcessor> {
  const key = sourcePositions ? 'positions' : 'plain'
  let cached = processors.get(key)
  if (!cached) {
    cached = buildProcessor(sourcePositions)
    processors.set(key, cached)
  }
  return cached
}

export interface RenderOptions {
  sourcePositions?: boolean
}

/* Markdown → HTML body fragment.
 *
 * The explicit cwd matters: without one, vfile calls process.cwd() through a
 * default-import of node:process that rolldown (vite 8) bundles without CJS
 * interop in the Electron main build — `.default` comes back undefined and
 * the pipeline crashes. We never resolve paths through vfile, so any value
 * works. */
export async function renderMarkdown(
  markdown: string,
  options: RenderOptions = {}
): Promise<string> {
  const processor = await getProcessor(options.sourcePositions === true)
  const file = await processor.process({
    value: markdown,
    cwd: '/'
  })
  return String(file)
}
