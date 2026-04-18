import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { decodeDocPath } from '../lib/mdPathResolve'
import { useWorkspace } from '../context/WorkspaceContext'
import { MarkdownDoc } from './MarkdownDoc'
import { parseToc } from '../lib/parseToc'
import { TableOfContents } from './TableOfContents'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import DOMPurify from 'dompurify'

type ArticleProps = {
  relPath: string
}

function extOf(path: string): string {
  const base = path.split('/').pop() ?? path
  const i = base.lastIndexOf('.')
  return i === -1 ? '' : base.slice(i + 1).toLowerCase()
}

function sanitizePlainText(text: string): string {
  // Treat as *text*; DOMPurify here is defensive for edge cases where someone later
  // changes rendering to `dangerouslySetInnerHTML`.
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}

function DocArticleView({ relPath }: ArticleProps) {
  const ws = useWorkspace()
  const [raw, setRaw] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoadError(null)
      setRaw(null)
      ws.revokeActiveImageObjectUrls()
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      try {
        const ext = extOf(relPath)
        if (ext === 'pdf') {
          const handle = ws.getFileHandle(relPath)
          if (!handle) throw new Error('File not found in workspace index.')
          const file = await handle.getFile()
          const url = URL.createObjectURL(file)
          if (!cancelled) setPdfUrl(url)
          return
        }
        const text = await (ext === 'txt' ? ws.loadText(relPath) : ws.loadMarkdown(relPath))
        if (!cancelled) setRaw(text)
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e))
          setRaw(null)
        }
      }
    })()
    return () => {
      cancelled = true
      ws.revokeActiveImageObjectUrls()
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [relPath, ws])

  const ext = extOf(relPath)
  const tocItems = raw && (ext === 'md' || ext === 'markdown') ? parseToc(raw) : []

  if (loadError) {
    return (
      <div className="app-shell">
        <WorkspaceSidebar />
        <main className="main">
          <p className="empty-state" role="alert">
            {loadError}
          </p>
        </main>
      </div>
    )
  }

  if (ext === 'pdf' && pdfUrl === null) {
    return (
      <div className="app-shell">
        <WorkspaceSidebar />
        <main className="main">
          <p className="loading-indicator" aria-busy="true">
            Loading document…
          </p>
        </main>
      </div>
    )
  }

  if (ext !== 'pdf' && raw === null) {
    return (
      <div className="app-shell">
        <WorkspaceSidebar />
        <main className="main">
          <p className="loading-indicator" aria-busy="true">
            Loading document…
          </p>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <WorkspaceSidebar />
      <main className="main">
        {ext === 'pdf' ? (
          <div className="pdf-wrap">
            <iframe className="pdf-frame" title={relPath} src={pdfUrl ?? ''} />
          </div>
        ) : ext === 'txt' ? (
          <div className="main__grid main__grid--single">
            <div className="main__article-wrap">
              <pre className="plain-text">{sanitizePlainText(raw ?? '')}</pre>
            </div>
            <div className="main__toc-wrap" />
          </div>
        ) : (
          <div className="main__grid">
            <div className="main__article-wrap">
              <MarkdownDoc markdown={raw ?? ''} docRelPath={relPath} />
            </div>
            <div className="main__toc-wrap">
              <TableOfContents items={tocItems} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export function DocLayout() {
  const ws = useWorkspace()
  const params = useParams()
  const splat = params['*'] ?? ''
  const relPath = useMemo(() => decodeDocPath(splat), [splat])

  if (ws.phase === 'unsupported') {
    return <Navigate to="/" replace />
  }

  if ((ws.phase === 'permission' || ws.needsPermissionRestore) && ws.docFiles.length === 0) {
    return (
      <div className="app-shell">
        <WorkspaceSidebar />
        <main className="main">
          <div className="main__article-wrap">
            <p className="empty-state">
              Read access to your saved folder must be restored after a reload or long idle period.
            </p>
            <p className="landing-panel__actions">
              <button type="button" className="btn-primary" onClick={() => void ws.restoreWorkspaceAccess()}>
                Restore Workspace Access
              </button>
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (ws.phase === 'loading') {
    return (
      <div className="app-shell">
        <WorkspaceSidebar />
        <main className="main">
          <p className="loading-indicator" aria-busy="true">
            Indexing Markdown files…
          </p>
        </main>
      </div>
    )
  }

  if (ws.phase === 'active' && ws.docFiles.length === 0) {
    return <Navigate to="/" replace />
  }

  if (!relPath) {
    if (ws.firstDocHref) {
      return <Navigate to={ws.firstDocHref} replace />
    }
    return <Navigate to="/" replace />
  }

  if (ws.phase === 'active' && !ws.getFileHandle(relPath)) {
    if (ws.firstDocHref) {
      return <Navigate to={ws.firstDocHref} replace />
    }
    return <Navigate to="/" replace />
  }

  return <DocArticleView relPath={relPath} />
}
