import type { Components } from 'react-markdown'
import { useMemo } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import type { PluggableList } from 'unified'
import { Link } from 'react-router-dom'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

import { encodeDocPath, resolveMdHrefToRelPath, stripFragment } from '../lib/mdPathResolve'
import { CodeBlock } from './CodeBlock'
import { MermaidBlock } from './MermaidBlock'

type Props = {
  markdown: string
  /** Workspace-relative path to the current file (POSIX), e.g. `notes/readme.md`. */
  docRelPath: string
}

function stripTrailingNewline(s: string): string {
  return s.replace(/\n$/, '')
}

function isLocalMarkdownHref(href: string): boolean {
  return /\.(md|markdown)(#|$)/i.test(href)
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

function createComponents(docRelPath: string): Components {
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
  }
}

export function MarkdownDoc({ markdown, docRelPath }: Props) {
  const components = useMemo(() => createComponents(docRelPath), [docRelPath])
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
    <article className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  )
}
