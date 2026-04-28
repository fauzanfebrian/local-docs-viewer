import type { Components } from 'react-markdown'
import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import type { PluggableList } from 'unified'
import { Link } from 'react-router-dom'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

import { encodeDocPath, resolveMdHrefToRelPath, stripFragment } from '../lib/mdPathResolve'
import { useWorkspace } from '../context/WorkspaceContext'
import { CodeBlock } from './CodeBlock'
import { MermaidBlock } from './MermaidBlock'

type Props = {
  markdown: string
  /** Workspace-relative path to the current file (POSIX), e.g. `notes/readme.md`. */
  docRelPath: string
  articleRef?: (el: HTMLElement | null) => void
  onImageClick?: (img: { src: string; alt?: string }) => void
}

function remarkStripHtmlComments() {
  return (tree: unknown) => {
    type MdAstNode = {
      type?: unknown
      value?: unknown
      children?: unknown
      // allow extra mdast fields without using `any`
      [k: string]: unknown
    }

    const isNode = (v: unknown): v is MdAstNode => typeof v === 'object' && v !== null

    const isCommentHtml = (node: MdAstNode) =>
      node.type === 'html' && typeof node.value === 'string' && node.value.trim().startsWith('<!--')

    const walk = (node: unknown) => {
      if (!isNode(node)) return
      if (!node || typeof node !== 'object') return
      const children = node.children
      if (Array.isArray(children)) {
        const filtered = children.filter((c) => !(isNode(c) && isCommentHtml(c)))
        node.children = filtered
        for (const child of filtered) walk(child)
      }
    }
    walk(tree)
  }
}

function stripTrailingNewline(s: string): string {
  return s.replace(/\n$/, '')
}

function isExternalUrlLike(raw: string): boolean {
  const s = raw.trim()
  if (s === '') return false
  // protocol-relative URLs, e.g. //example.com/a.md
  if (/^\/\//.test(s)) return true
  // any scheme: http:, https:, mailto:, file:, vscode:, etc.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return true
  return false
}

function isLocalMarkdownHref(href: string): boolean {
  if (isExternalUrlLike(href)) return false
  if (href.trim().startsWith('#')) return false
  return /\.(md|markdown)(#|$)/i.test(href)
}

function isProbablyLocalImageSrc(src: string): boolean {
  const s = src.trim()
  if (s === '') return false
  if (/^(https?:)?\/\//i.test(s)) return false
  if (/^(data|blob):/i.test(s)) return false
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(s)) return false
  if (s.startsWith('#')) return false
  return true
}

function resolveImageSrcToWorkspaceRelPath(docRelPath: string, src: string): string {
  const trimmed = src.trim()
  if (trimmed.startsWith('/')) return stripFragment(trimmed.slice(1))
  return stripFragment(resolveMdHrefToRelPath(docRelPath, trimmed))
}

function MdImage({
  src,
  alt,
  className,
  docRelPath,
  ws,
  onImageClick,
  ...props
}: React.ComponentPropsWithoutRef<'img'> & {
  docRelPath: string
  ws: ReturnType<typeof useWorkspace>
  onImageClick?: (img: { src: string; alt?: string }) => void
}) {
  const rawSrc = (src ?? '').trim()
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)
  const [isBroken, setIsBroken] = useState(false)

  useEffect(() => {
    let cancelled = false

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolvedSrc(null)
    setIsBroken(false)

    if (!rawSrc || !isProbablyLocalImageSrc(rawSrc)) return

    const rel = resolveImageSrcToWorkspaceRelPath(docRelPath, rawSrc)
    const handle = ws.getImageHandle(rel)
    if (!handle) return

    void (async () => {
      try {
        const file = await handle.getFile()
        if (cancelled) return
        const url = URL.createObjectURL(file)
        ws.trackImageObjectUrl(url)
        setResolvedSrc(url)
      } catch {
        if (!cancelled) setIsBroken(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rawSrc, docRelPath, ws])

  const finalSrc = resolvedSrc ?? (rawSrc || undefined)
  const cls = [className, isBroken ? 'is-broken' : null].filter(Boolean).join(' ') || undefined

  return (
    <img
      {...props}
      src={finalSrc}
      alt={alt ?? ''}
      className={cls}
      loading="lazy"
      onClick={(e) => {
        props.onClick?.(e)
        if (!finalSrc) return
        onImageClick?.({ src: finalSrc, alt: alt ?? undefined })
      }}
      onError={(e) => {
        props.onError?.(e)
        setIsBroken(true)
      }}
    />
  )
}

function MdLink({
  href,
  children,
  className,
  title,
  id,
  docRelPath,
}: React.ComponentPropsWithoutRef<'a'> & { docRelPath: string }) {
  if (!href) {
    return (
      <a className={className} title={title} id={id}>
        {children}
      </a>
    )
  }

  if (isLocalMarkdownHref(href)) {
    const [pathPart, fragment] = href.split('#')
    const resolvedPath = stripFragment(resolveMdHrefToRelPath(docRelPath, pathPart))
    const hash = fragment ? `#${fragment}` : ''
    const to = `/doc/${encodeDocPath(resolvedPath)}${hash}`
    return (
      <Link className={className} title={title} id={id} to={to}>
        {children}
      </Link>
    )
  }

  if (/^https?:\/\//i.test(href)) {
    return (
      <a
        href={href}
        className={className}
        title={title}
        id={id}
        target="_blank"
        rel="noreferrer noopener"
      >
        {children}
      </a>
    )
  }

  return (
    <span className={className} title={title} id={id}>
      {children}
    </span>
  )
}

function createComponents(
  docRelPath: string,
  ws: ReturnType<typeof useWorkspace>,
  onImageClick?: (img: { src: string; alt?: string }) => void,
): Components {
  return {
    table: ({ children, ...props }) => (
      <div className="table-scroll">
        <table {...props}>{children}</table>
      </div>
    ),
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...props }) => {
      const text = stripTrailingNewline(String(children))
      const match = /language-([^\s]+)/.exec(className ?? '')
      if (match) {
        const lang = match[1]
        if (lang === 'mermaid') {
          return <MermaidBlock chart={text} />
        }
        return <CodeBlock code={text} language={lang} />
      }
      if (text.includes('\n')) {
        return <CodeBlock code={text} language="markdown" />
      }
      return (
        <code className="inline-code" {...props}>
          {children}
        </code>
      )
    },
    a: (props) => <MdLink {...props} docRelPath={docRelPath} />,
    img: (props) => <MdImage {...props} docRelPath={docRelPath} ws={ws} onImageClick={onImageClick} />,
  }
}

export function MarkdownDoc({ markdown, docRelPath, articleRef, onImageClick }: Props) {
  const ws = useWorkspace()
  const components = useMemo(
    () => createComponents(docRelPath, ws, onImageClick),
    [docRelPath, ws, onImageClick],
  )
  const rehypePlugins = useMemo<PluggableList>(
    () => [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'wrap',
          properties: { className: 'heading-anchor' },
        },
      ],
    ],
    [],
  )

  const urlTransform = useMemo(
    () => (url: string) => {
      const t = defaultUrlTransform(url)
      const trimmed = (t || '').trim()
      if (/^javascript:/i.test(trimmed) || /^vbscript:/i.test(trimmed)) return ''
      if (/^data:/i.test(trimmed)) return ''
      return t
    },
    [],
  )

  return (
    <article className="markdown-body" ref={articleRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkStripHtmlComments]}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransform}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </article>
  )
}
