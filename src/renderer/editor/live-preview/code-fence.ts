import { syntaxTree } from '@codemirror/language'
import { StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { SyntaxNodeRef } from '@lezer/common'
import { grammarFor } from '../../../shared/grammars'
import { getHighlighter, shikiTheme } from '../../../shared/markdown'
import { tokenMs } from '../../ui/tokens'
import type { CollectCtx } from './index'

/* Construct 6: fenced code via Shiki (ULTRAPLAN §3: real TextMate grammars,
 * themeable from the same tokens). The theme is css-variables — every token
 * color is a var(--shiki-*) reference defined in tokens.css from the ledger
 * palette, so Light/Dark/custom themes restyle code for free.
 *
 * Tokenization is async (grammar loading), so the flow is:
 * collectFence reads a synchronous cache; ensureFenceTokens schedules
 * tokenization for visible fences that miss, and dispatches fenceTokensReady
 * when results land, which re-runs the construct build. Cache keys are
 * lang + content, so edits inside a fence retokenize and everything else
 * stays cached.
 *
 * Two guards keep typing inside a fence cheap: the fence under a caret only
 * retokenizes after a typing pause (--dur-fence-idle), painting its
 * last-known spans meanwhile so nothing flashes plain, and the cache evicts
 * one least-recently-used entry at a time — a wholesale clear would force
 * every visible fence to retokenize at once. */

export const fenceTokensReady = StateEffect.define<null>()

interface TokenSpan {
  /* Offsets relative to the CodeText node start. */
  start: number
  end: number
  color: string
}

export function keyFor(lang: string, code: string): string {
  return `${lang}\u0000${code}`
}

/* The language is the first word of the info string; the rest is metadata
 * (```js {1-3}, ```ts twoslash) that must not reach the grammar lookup. */
export function fenceLang(info: string): string {
  return info.trim().split(/\s/, 1)[0]?.toLowerCase() ?? ''
}

const CACHE_CAP = 100

const cache = new Map<string, TokenSpan[]>()
const pending = new Set<string>()
const unknownLangs = new Set<string>()

/* Last spans painted per fence, keyed by CodeText start — stable while
 * typing inside the fence, which is exactly when the content key misses. */
const stale = new Map<number, TokenSpan[]>()

/* Map iteration order is insertion order, so re-inserting on every hit makes
 * the first key the least recently used. */
function cacheGet(key: string): TokenSpan[] | undefined {
  const spans = cache.get(key)
  if (spans !== undefined) {
    cache.delete(key)
    cache.set(key, spans)
  }
  return spans
}

function cacheSet(key: string, spans: TokenSpan[]): void {
  cache.delete(key)
  cache.set(key, spans)
  if (cache.size > CACHE_CAP) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

/* The highlighter itself lives in shared/markdown.ts — one instance per
 * process, shared with preview and exports, so a grammar loaded for the
 * editor is already warm when the same document renders as HTML. */

async function tokenize(lang: string, code: string, key: string): Promise<boolean> {
  const name = grammarFor(lang)
  if (!name) {
    unknownLangs.add(lang)
    return false
  }
  const highlighter = await getHighlighter()
  if (!highlighter.getLoadedLanguages().includes(name)) {
    await highlighter.loadLanguage(name)
  }
  const lines = highlighter.codeToTokensBase(code, { lang: name, theme: shikiTheme })
  const spans: TokenSpan[] = []
  let lineStart = 0
  for (const line of lines) {
    let col = 0
    for (const token of line) {
      const start = token.offset ?? lineStart + col
      if (token.color) {
        spans.push({ start, end: start + token.content.length, color: token.color })
      }
      col += token.content.length
    }
    const lineLength = line.reduce((n, t) => n + t.content.length, 0)
    lineStart += lineLength + 1 // newline
  }
  cacheSet(key, spans)
  return true
}

export function collectFence(node: SyntaxNodeRef, ctx: CollectCtx): void {
  if (node.name === 'CodeInfo') {
    ctx.push({ kind: 'mark', from: node.from, to: node.to, class: 'fs-code-info' })
    return
  }
  if (node.name !== 'FencedCode') return

  // Fill + mono for every fence line, clamped to the visible range.
  const first = ctx.doc.lineAt(Math.max(node.from, ctx.from)).number
  const last = ctx.doc.lineAt(Math.min(node.to, ctx.to)).number
  for (let n = first; n <= last; n++) {
    ctx.push({ kind: 'line', at: ctx.doc.line(n).from, class: 'fs-fence' })
  }

  // Shiki tokens from the cache, if they've arrived.
  const info = node.node.getChild('CodeInfo')
  const code = node.node.getChild('CodeText')
  if (!info || !code) return
  const lang = fenceLang(ctx.doc.sliceString(info.from, info.to))
  const content = ctx.doc.sliceString(code.from, code.to)
  const fresh = cacheGet(keyFor(lang, content))
  if (fresh) {
    if (stale.size > CACHE_CAP) stale.clear()
    stale.set(code.from, fresh)
  }
  // A miss mid-edit paints the fence's last spans (clamped to the current
  // content) until the idle retokenize lands — misaligned by at most the
  // keystrokes of the current pause, never a flash to plain.
  const spans = fresh ?? stale.get(code.from)
  if (!spans) return
  // Clamped like the line decos above: a giant fence with one visible line
  // must not rebuild thousands of offscreen marks (and a fence overlapping
  // two visible ranges is entered once per range — unclamped, every span
  // would be pushed twice).
  for (const span of spans) {
    const from = Math.max(code.from + span.start, ctx.from)
    const to = Math.min(code.from + span.end, ctx.to, code.to)
    if (from >= to) {
      if (code.from + span.start >= ctx.to) break // spans are start-sorted
      continue
    }
    ctx.push({ kind: 'mark', from, to, style: `color: ${span.color}` })
  }
}

interface WantedFence {
  lang: string
  code: string
  key: string
}

function spawnTokenize(view: EditorView, want: WantedFence): void {
  pending.add(want.key)
  void tokenize(want.lang, want.code, want.key)
    .then((hit) => {
      if (hit) view.dispatch({ effects: fenceTokensReady.of(null) })
    })
    .catch(() => undefined)
    .finally(() => pending.delete(want.key))
}

let idleMsMemo: number | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let idleWanted: WantedFence | null = null

/* One slot, restarted per keystroke: every edit mints a new key, so the
 * fence under the caret tokenizes once per typing pause, not per character. */
function scheduleIdleTokenize(view: EditorView, want: WantedFence): void {
  if (idleWanted?.key === want.key) return
  idleWanted = want
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    const wanted = idleWanted
    idleWanted = null
    if (wanted && !cache.has(wanted.key)) spawnTokenize(view, wanted)
  }, (idleMsMemo ??= tokenMs('--dur-fence-idle')))
}

/* Side-effect half: request tokenization for visible fences not yet cached.
 * Fire-and-forget; a fenceTokensReady dispatch re-runs the collector. A
 * fence holding a caret waits for a typing pause; anything else (scrolled
 * into view, pasted wholesale) tokenizes immediately. */
export function ensureFenceTokens(view: EditorView): void {
  const tree = syntaxTree(view.state)
  const doc = view.state.doc
  const selection = view.state.selection
  const immediate: WantedFence[] = []
  let atCaret: WantedFence | null = null
  for (const range of view.visibleRanges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (node.name !== 'FencedCode') return
        const info = node.node.getChild('CodeInfo')
        const code = node.node.getChild('CodeText')
        if (!info || !code) return
        const lang = fenceLang(doc.sliceString(info.from, info.to))
        const content = doc.sliceString(code.from, code.to)
        const key = keyFor(lang, content)
        if (cache.has(key) || pending.has(key) || unknownLangs.has(lang)) return
        const want = { lang, code: content, key }
        if (selection.ranges.some((r) => r.head >= node.from && r.head <= node.to)) {
          atCaret = want
        } else {
          immediate.push(want)
        }
      }
    })
  }
  for (const want of immediate) spawnTokenize(view, want)
  if (atCaret) scheduleIdleTokenize(view, atCaret)
}

/* Test hooks — the async path is exercised via these, the pure path via
 * collectFence with a seeded cache. */
export const fenceTestHooks = { cache, tokenize, cacheSet, cacheGet, stale }
