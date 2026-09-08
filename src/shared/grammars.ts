/* The syntax grammars Foolscap ships — 51 of the 235 Shiki knows,
 * chosen for what turns up in real documents. Every other fence renders as
 * plain text in Ioskeley Mono, still beautifully set. Each grammar costs its
 * size twice (the main bundle for exports, a renderer chunk for the editor),
 * so the whole set is a few megabytes instead of the twenty-odd the full
 * bundle was. Adding one is one line here; the aliases are Shiki's own.
 *
 * Generated from shiki's bundledLanguagesInfo; keys are ids and aliases,
 * both pointing at the same lazy import, which is the shape
 * createBundledHighlighter resolves names against. */
import type { LanguageRegistration } from 'shiki/core'

export type GrammarLoader = () => Promise<{ default: LanguageRegistration[] }>

export const GRAMMARS = {
  'javascript': () => import('shiki/langs/javascript.mjs'),
  'js': () => import('shiki/langs/javascript.mjs'),
  'cjs': () => import('shiki/langs/javascript.mjs'),
  'mjs': () => import('shiki/langs/javascript.mjs'),
  'typescript': () => import('shiki/langs/typescript.mjs'),
  'ts': () => import('shiki/langs/typescript.mjs'),
  'cts': () => import('shiki/langs/typescript.mjs'),
  'mts': () => import('shiki/langs/typescript.mjs'),
  'jsx': () => import('shiki/langs/jsx.mjs'),
  'tsx': () => import('shiki/langs/tsx.mjs'),
  'json': () => import('shiki/langs/json.mjs'),
  'jsonc': () => import('shiki/langs/jsonc.mjs'),
  'html': () => import('shiki/langs/html.mjs'),
  'css': () => import('shiki/langs/css.mjs'),
  'scss': () => import('shiki/langs/scss.mjs'),
  'less': () => import('shiki/langs/less.mjs'),
  'markdown': () => import('shiki/langs/markdown.mjs'),
  'md': () => import('shiki/langs/markdown.mjs'),
  'yaml': () => import('shiki/langs/yaml.mjs'),
  'yml': () => import('shiki/langs/yaml.mjs'),
  'toml': () => import('shiki/langs/toml.mjs'),
  'xml': () => import('shiki/langs/xml.mjs'),
  'shellscript': () => import('shiki/langs/shellscript.mjs'),
  'bash': () => import('shiki/langs/shellscript.mjs'),
  'sh': () => import('shiki/langs/shellscript.mjs'),
  'shell': () => import('shiki/langs/shellscript.mjs'),
  'zsh': () => import('shiki/langs/shellscript.mjs'),
  'shellsession': () => import('shiki/langs/shellsession.mjs'),
  'console': () => import('shiki/langs/shellsession.mjs'),
  'python': () => import('shiki/langs/python.mjs'),
  'py': () => import('shiki/langs/python.mjs'),
  'ruby': () => import('shiki/langs/ruby.mjs'),
  'rb': () => import('shiki/langs/ruby.mjs'),
  'go': () => import('shiki/langs/go.mjs'),
  'rust': () => import('shiki/langs/rust.mjs'),
  'rs': () => import('shiki/langs/rust.mjs'),
  'java': () => import('shiki/langs/java.mjs'),
  'kotlin': () => import('shiki/langs/kotlin.mjs'),
  'kt': () => import('shiki/langs/kotlin.mjs'),
  'kts': () => import('shiki/langs/kotlin.mjs'),
  'swift': () => import('shiki/langs/swift.mjs'),
  'c': () => import('shiki/langs/c.mjs'),
  'cpp': () => import('shiki/langs/cpp.mjs'),
  'c++': () => import('shiki/langs/cpp.mjs'),
  'csharp': () => import('shiki/langs/csharp.mjs'),
  'c#': () => import('shiki/langs/csharp.mjs'),
  'cs': () => import('shiki/langs/csharp.mjs'),
  'objective-c': () => import('shiki/langs/objective-c.mjs'),
  'objc': () => import('shiki/langs/objective-c.mjs'),
  'php': () => import('shiki/langs/php.mjs'),
  'sql': () => import('shiki/langs/sql.mjs'),
  'graphql': () => import('shiki/langs/graphql.mjs'),
  'gql': () => import('shiki/langs/graphql.mjs'),
  'docker': () => import('shiki/langs/docker.mjs'),
  'dockerfile': () => import('shiki/langs/docker.mjs'),
  'make': () => import('shiki/langs/make.mjs'),
  'makefile': () => import('shiki/langs/make.mjs'),
  'diff': () => import('shiki/langs/diff.mjs'),
  'ini': () => import('shiki/langs/ini.mjs'),
  'properties': () => import('shiki/langs/ini.mjs'),
  'lua': () => import('shiki/langs/lua.mjs'),
  'perl': () => import('shiki/langs/perl.mjs'),
  'r': () => import('shiki/langs/r.mjs'),
  'scala': () => import('shiki/langs/scala.mjs'),
  'haskell': () => import('shiki/langs/haskell.mjs'),
  'hs': () => import('shiki/langs/haskell.mjs'),
  'elixir': () => import('shiki/langs/elixir.mjs'),
  'erlang': () => import('shiki/langs/erlang.mjs'),
  'erl': () => import('shiki/langs/erlang.mjs'),
  'clojure': () => import('shiki/langs/clojure.mjs'),
  'clj': () => import('shiki/langs/clojure.mjs'),
  'dart': () => import('shiki/langs/dart.mjs'),
  'zig': () => import('shiki/langs/zig.mjs'),
  'vue': () => import('shiki/langs/vue.mjs'),
  'svelte': () => import('shiki/langs/svelte.mjs'),
  'latex': () => import('shiki/langs/latex.mjs'),
  'nginx': () => import('shiki/langs/nginx.mjs'),
  'powershell': () => import('shiki/langs/powershell.mjs'),
  'ps': () => import('shiki/langs/powershell.mjs'),
  'ps1': () => import('shiki/langs/powershell.mjs'),
  'http': () => import('shiki/langs/http.mjs'),
  'regexp': () => import('shiki/langs/regexp.mjs'),
  'regex': () => import('shiki/langs/regexp.mjs')
} satisfies Record<string, GrammarLoader>

export type GrammarName = keyof typeof GRAMMARS

/* Canonical id for a fence's language tag (`js` → `javascript`), or null
 * when the fence names something this set doesn't carry. */
const CANONICAL: Record<string, GrammarName> = {
  'js': 'javascript',
  'cjs': 'javascript',
  'mjs': 'javascript',
  'ts': 'typescript',
  'cts': 'typescript',
  'mts': 'typescript',
  'md': 'markdown',
  'yml': 'yaml',
  'bash': 'shellscript',
  'sh': 'shellscript',
  'shell': 'shellscript',
  'zsh': 'shellscript',
  'console': 'shellsession',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'kt': 'kotlin',
  'kts': 'kotlin',
  'c++': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',
  'objc': 'objective-c',
  'gql': 'graphql',
  'dockerfile': 'docker',
  'makefile': 'make',
  'properties': 'ini',
  'hs': 'haskell',
  'erl': 'erlang',
  'clj': 'clojure',
  'ps': 'powershell',
  'ps1': 'powershell',
  'regex': 'regexp'
}

export function grammarFor(lang: string): GrammarName | null {
  const key = lang.toLowerCase()
  if (key in CANONICAL) return CANONICAL[key] ?? null
  return key in GRAMMARS ? (key as GrammarName) : null
}
