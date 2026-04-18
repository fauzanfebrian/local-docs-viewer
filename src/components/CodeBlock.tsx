import { useEffect, useState } from 'react'
import { getSingletonHighlighter } from 'shiki/bundle/web'

import { sanitizeHighlightedCodeHtml } from '../lib/sanitizeHtml'

/** Dark tokens for --code-bg (#141414); keeps syntax readable on matte panels. */
const SHIKI_THEME = 'github-dark-dimmed'

const BUNDLED_LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'jsonc',
  'shellscript',
  'yaml',
  'sql',
  'css',
  'scss',
  'html',
  'html-derivative',
  'markdown',
  'mdx',
  'graphql',
  'xml',
  'vue',
  'svelte',
  'astro',
  'python',
  'java',
  'wasm',
] as const

const LANG_ALIASES: Record<string, string> = {
  sh: 'shellscript',
  bash: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  dockerfile: 'shellscript',
  md: 'markdown',
  js: 'javascript',
  ts: 'typescript',
  text: 'markdown',
  txt: 'markdown',
}

let highlighterPromise: ReturnType<typeof getSingletonHighlighter> | null = null

function getHighlighter() {
  highlighterPromise ??= getSingletonHighlighter({
    themes: [SHIKI_THEME],
    langs: [...BUNDLED_LANGS],
  })
  return highlighterPromise
}

function resolveLang(lang: string): string {
  const normalized = lang.toLowerCase()
  return LANG_ALIASES[normalized] ?? normalized
}

type Props = {
  code: string
  language: string
}

export function CodeBlock({ code, language }: Props) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const primary = resolveLang(language)
    const fallbacks = [primary, 'markdown']
    ;(async () => {
      const highlighter = await getHighlighter()
      let out = ''
      for (const lang of fallbacks) {
        try {
          out = highlighter.codeToHtml(code, { lang, theme: SHIKI_THEME })
          break
        } catch {
          /* try next */
        }
      }
      if (!cancelled) {
        const rawHtml =
          out || `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`
        setHtml(sanitizeHighlightedCodeHtml(rawHtml))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, language])

  if (!html) {
    return (
      <div className="code-block code-block--loading" aria-busy="true">
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  return (
    <div
      className="code-block shiki-outer"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
