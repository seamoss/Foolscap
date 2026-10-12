import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { createCssVariablesTheme, createBundledHighlighter, type HighlighterGeneric } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { unified } from 'unified'
import { GRAMMARS, type GrammarName } from './grammars'

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

export type Highlighter = HighlighterGeneric<GrammarName, string>

/* Shiki's bundle factory over Foolscap's own grammar set (grammars.ts)
 * rather than the full bundle: names resolve against that set, so the
 * build carries those grammars and no others. */
const createHighlighter = createBundledHighlighter<GrammarName, string>({
  langs: GRAMMARS,
  themes: {},
  engine: () => createJavaScriptRegexEngine({ forgiving: true })
})

let highlighterPromise: Promise<Highlighter> | null = null

/* One highlighter per process, shared by this pipeline and the editor's
 * fence decorations (code-fence.ts). The JavaScript regex engine, not
 * Oniguruma: the WASM engine plus the batteries-included rehype plugin
 * cost ~1.2s of first-render latency per window (measured), all spent
 * fetching WASM and registering ~220 grammars up front. Here nothing
 * loads until a fence actually names a language. */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) highlighterPromise = createHighlighter({ themes: [shikiTheme], langs: [] })
  return highlighterPromise
}

/* Minimal structural view of a hast node — enough to stamp positions
 * without pulling in @types/hast. */
interface HastNode {
  type?: string
  tagName?: string
  position?: { start?: { offset?: number } }
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/* Every <pre> in document order. */
function preElements(tree: HastNode): HastNode[] {
  const found: HastNode[] = []
  const walk = (node: HastNode): void => {
    if (node.type === 'element' && node.tagName === 'pre') found.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return found
}

/* Code-block stamps ride across the highlighter on the file being
 * processed, not in plugin state — the processor is shared, and renders
 * overlap. */
interface StampCarrier {
  data: object
}
const codeStamps = (file: StampCarrier): { codeStamps?: unknown[] } =>
  file.data as { codeStamps?: unknown[] }

/* Stamp each element with its source offset (data-pos). Preview mode uses
 * this to map a double-click back into the editor; exports never enable it,
 * so their output stays byte-identical. */
function rehypeSourcePositions() {
  return (tree: HastNode, file: StampCarrier): void => {
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && node.position?.start?.offset !== undefined) {
        node.properties = { ...node.properties, dataPos: String(node.position.start.offset) }
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
    codeStamps(file).codeStamps = preElements(tree).map((pre) => pre.properties?.['dataPos'])
  }
}

/* Shiki swaps each <pre> it highlights for a fresh one, and the stamp goes
 * with the old node — so a double-click in a code block found no position
 * and dropped the editor at the top of the document. The swap is in place,
 * one <pre> for one, so the stamps go back on in document order. */
function rehypeRestoreCodeStamps() {
  return (tree: HastNode, file: StampCarrier): void => {
    const stamps = codeStamps(file).codeStamps ?? []
    preElements(tree).forEach((pre, i) => {
      const stamp = stamps[i]
      if (stamp !== undefined) pre.properties = { ...pre.properties, dataPos: stamp }
    })
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
  const highlighted = positioned.use(rehypeShikiFromHighlighter, highlighter, {
    theme: shikiTheme,
    defaultLanguage: 'text',
    fallbackLanguage: 'text',
    // Grammars load on demand per fence; unknown languages fall back.
    lazy: true
  })
  const restamped = sourcePositions ? highlighted.use(rehypeRestoreCodeStamps) : highlighted
  return restamped.use(rehypeStringify)
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
