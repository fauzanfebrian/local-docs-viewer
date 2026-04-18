import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { decodeDocPath } from '../lib/mdPathResolve'
import { useWorkspace } from '../context/WorkspaceContext'
import { MarkdownDoc } from './MarkdownDoc'
import { TableOfContents, type TocItem } from './TableOfContents'
import { WorkspaceSidebarContent } from './WorkspaceSidebar'
import DOMPurify from 'dompurify'

type ArticleProps = {
  relPath: string
}

type LightboxState = {
  open: boolean
  src: string
  alt: string
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function getLocalPoint(evt: { clientX: number; clientY: number }, rect: DOMRect) {
  return {
    x: evt.clientX - rect.left - rect.width / 2,
    y: evt.clientY - rect.top - rect.height / 2,
  }
}

function createTocFromArticle(articleEl: HTMLElement | null): TocItem[] {
  if (!articleEl) return []
  const headings = Array.from(articleEl.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[]
  const out: TocItem[] = []
  for (const h of headings) {
    const id = (h.getAttribute('id') ?? '').trim()
    if (!id) continue
    const text = (h.textContent ?? '').trim()
    if (!text) continue
    const depth = Number(h.tagName.slice(1)) as TocItem['depth']
    if (!Number.isFinite(depth) || depth < 1 || depth > 6) continue
    out.push({ id, text, depth })
  }
  return out
}

function DocArticleView({ relPath }: ArticleProps) {
  const ws = useWorkspace()
  const [raw, setRaw] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [activeTocId, setActiveTocId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const lbViewportRef = useRef<HTMLDivElement | null>(null)
  const lbPointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const [lbTransform, setLbTransform] = useState<{ scale: number; tx: number; ty: number }>({
    scale: 1,
    tx: 0,
    ty: 0,
  })
  const lbDragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null)
  const lbPinchRef = useRef<{
    startDist: number
    startScale: number
    startTx: number
    startTy: number
    startMid: { x: number; y: number }
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoadError(null)
      setRaw(null)
      ws.revokeActiveImageObjectUrls()
      setTocItems([])
      setActiveTocId(null)
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
  const isMd = ext === 'md' || ext === 'markdown'
  const shouldShowToc = isMd

  const closeSidebars = useCallback(() => {
    setLeftOpen(false)
    setRightOpen(false)
  }, [])

  const closeLightbox = useCallback(() => {
    setLightbox(null)
    lbPointers.current.clear()
    lbDragRef.current = null
    lbPinchRef.current = null
    setLbTransform({ scale: 1, tx: 0, ty: 0 })
  }, [])

  const setArticleEl = useCallback((el: HTMLElement | null) => {
    articleRef.current = el
  }, [])

  const onMarkdownImageClick = useCallback(({ src, alt }: { src: string; alt?: string }) => {
    if (!src) return
    setLbTransform({ scale: 1, tx: 0, ty: 0 })
    setLightbox({ open: true, src, alt: alt ?? '' })
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isModB = (e.key === 'b' || e.key === 'B') && (e.metaKey || e.ctrlKey)
      if (isModB) {
        e.preventDefault()
        setLeftOpen((v) => !v)
        return
      }
      if (e.key === 'Escape') {
        closeSidebars()
        closeLightbox()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeLightbox, closeSidebars])

  useEffect(() => {
    if (!shouldShowToc) return
    const el = articleRef.current
    if (!el) return
    const next = createTocFromArticle(el)
    setTocItems(next)
    if (next.length === 0) setActiveTocId(null)
  }, [raw, shouldShowToc])

  useEffect(() => {
    if (!shouldShowToc) return
    const el = articleRef.current
    if (!el) return
    const headings = Array.from(el.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[]
    if (headings.length === 0) return

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((en) => en.isIntersecting && (en.target as HTMLElement).id)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target) setActiveTocId((visible[0].target as HTMLElement).id)
      },
      { root: null, rootMargin: '-20% 0px -70% 0px', threshold: [0, 1] },
    )

    for (const h of headings) io.observe(h)
    return () => io.disconnect()
  }, [raw, shouldShowToc])

  const isAnySidebarOpen = leftOpen || rightOpen

  if (loadError) {
    return (
      <div className="app-shell app-shell--reader" data-left={leftOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>
        <button
          type="button"
          className="chrome-btn chrome-btn--left"
          aria-controls="sidebar-left"
          aria-expanded={leftOpen}
          aria-label="Toggle file explorer"
          onClick={() => setLeftOpen((v) => !v)}
        >
          ☰
        </button>
        <button
          type="button"
          className="chrome-btn chrome-btn--right"
          aria-controls="sidebar-right"
          aria-expanded={rightOpen}
          aria-label="Toggle table of contents"
          onClick={() => setRightOpen((v) => !v)}
        >
          ≡
        </button>

        <div className={`backdrop${isAnySidebarOpen ? ' is-visible' : ''}`} aria-hidden="true" onClick={closeSidebars} />

        <aside id="sidebar-left" className={`sidebar sidebar--left${leftOpen ? ' is-open' : ''}`}>
          <div className="sidebar__inner">
            <WorkspaceSidebarContent />
          </div>
        </aside>
        <main className="main">
          <p className="empty-state" role="alert">
            {loadError}
          </p>
        </main>
        <aside id="sidebar-right" className={`sidebar sidebar--right${rightOpen ? ' is-open' : ''}`}>
          <div className="sidebar__inner" />
        </aside>
      </div>
    )
  }

  if (ext === 'pdf' && pdfUrl === null) {
    return (
      <div className="app-shell app-shell--reader" data-left={leftOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>
        <button
          type="button"
          className="chrome-btn chrome-btn--left"
          aria-controls="sidebar-left"
          aria-expanded={leftOpen}
          aria-label="Toggle file explorer"
          onClick={() => setLeftOpen((v) => !v)}
        >
          ☰
        </button>
        <button
          type="button"
          className="chrome-btn chrome-btn--right"
          aria-controls="sidebar-right"
          aria-expanded={rightOpen}
          aria-label="Toggle table of contents"
          onClick={() => setRightOpen((v) => !v)}
        >
          ≡
        </button>

        <div className={`backdrop${isAnySidebarOpen ? ' is-visible' : ''}`} aria-hidden="true" onClick={closeSidebars} />

        <aside id="sidebar-left" className={`sidebar sidebar--left${leftOpen ? ' is-open' : ''}`}>
          <div className="sidebar__inner">
            <WorkspaceSidebarContent />
          </div>
        </aside>
        <main className="main">
          <p className="loading-indicator" aria-busy="true">
            Loading document…
          </p>
        </main>
        <aside id="sidebar-right" className={`sidebar sidebar--right${rightOpen ? ' is-open' : ''}`}>
          <div className="sidebar__inner" />
        </aside>
      </div>
    )
  }

  if (ext !== 'pdf' && raw === null) {
    return (
      <div className="app-shell app-shell--reader" data-left={leftOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>
        <button
          type="button"
          className="chrome-btn chrome-btn--left"
          aria-controls="sidebar-left"
          aria-expanded={leftOpen}
          aria-label="Toggle file explorer"
          onClick={() => setLeftOpen((v) => !v)}
        >
          ☰
        </button>
        <button
          type="button"
          className="chrome-btn chrome-btn--right"
          aria-controls="sidebar-right"
          aria-expanded={rightOpen}
          aria-label="Toggle table of contents"
          onClick={() => setRightOpen((v) => !v)}
        >
          ≡
        </button>

        <div className={`backdrop${isAnySidebarOpen ? ' is-visible' : ''}`} aria-hidden="true" onClick={closeSidebars} />

        <aside id="sidebar-left" className={`sidebar sidebar--left${leftOpen ? ' is-open' : ''}`}>
          <div className="sidebar__inner">
            <WorkspaceSidebarContent />
          </div>
        </aside>
        <main className="main">
          <p className="loading-indicator" aria-busy="true">
            Loading document…
          </p>
        </main>
        <aside id="sidebar-right" className={`sidebar sidebar--right${rightOpen ? ' is-open' : ''}`}>
          <div className="sidebar__inner" />
        </aside>
      </div>
    )
  }

  return (
    <div className="app-shell app-shell--reader" data-left={leftOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>
      <button
        type="button"
        className="chrome-btn chrome-btn--left"
        aria-controls="sidebar-left"
        aria-expanded={leftOpen}
        aria-label="Toggle file explorer"
        onClick={() => setLeftOpen((v) => !v)}
      >
        ☰
      </button>
      <button
        type="button"
        className="chrome-btn chrome-btn--right"
        aria-controls="sidebar-right"
        aria-expanded={rightOpen}
        aria-label="Toggle table of contents"
        onClick={() => setRightOpen((v) => !v)}
      >
        ≡
      </button>

      <div className={`backdrop${isAnySidebarOpen ? ' is-visible' : ''}`} aria-hidden="true" onClick={closeSidebars} />

      <aside id="sidebar-left" className={`sidebar sidebar--left${leftOpen ? ' is-open' : ''}`}>
        <div className="sidebar__inner">
          <WorkspaceSidebarContent />
        </div>
      </aside>

      <main className="main" id="reader-main">
        {ext === 'pdf' ? (
          <div className="pdf-wrap">
            <iframe className="pdf-frame" title={relPath} src={pdfUrl ?? ''} />
          </div>
        ) : ext === 'txt' ? (
          <div className="main__article-wrap">
            <pre className="plain-text">{sanitizePlainText(raw ?? '')}</pre>
          </div>
        ) : (
          <div className="main__article-wrap">
            <MarkdownDoc
              markdown={raw ?? ''}
              docRelPath={relPath}
              articleRef={setArticleEl}
              onImageClick={onMarkdownImageClick}
            />
          </div>
        )}
      </main>

      <aside id="sidebar-right" className={`sidebar sidebar--right${rightOpen ? ' is-open' : ''}`}>
        <div className="sidebar__inner">
          {shouldShowToc ? (
            <TableOfContents
              items={tocItems}
              activeId={activeTocId}
              onNavigate={() => {
                // close TOC after navigation on small screens
                setRightOpen(false)
              }}
            />
          ) : null}
        </div>
      </aside>

      {lightbox?.open ? (
        <div className="img-lightbox" role="dialog" aria-modal="true" aria-label="Image viewer">
          <div className="img-lightbox__backdrop" onClick={closeLightbox} />
          <div className="img-lightbox__dialog">
            <button type="button" className="img-lightbox__close" aria-label="Close" onClick={closeLightbox}>
              ×
            </button>
            <div
              className="img-lightbox__viewport"
              ref={lbViewportRef}
              onWheel={(e) => {
                e.preventDefault()
                const vp = lbViewportRef.current
                if (!vp) return
                const rect = vp.getBoundingClientRect()
                const p = getLocalPoint(e, rect)
                setLbTransform((t) => {
                  const nextScale = clamp(t.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 1, 6)
                  const dx = (p.x - t.tx) / t.scale
                  const dy = (p.y - t.ty) / t.scale
                  return {
                    scale: nextScale,
                    tx: p.x - dx * nextScale,
                    ty: p.y - dy * nextScale,
                  }
                })
              }}
            >
              <img
                className="img-lightbox__img"
                src={lightbox.src}
                alt={lightbox.alt}
                draggable={false}
                style={{
                  transform: `translate3d(${lbTransform.tx}px, ${lbTransform.ty}px, 0) scale(${lbTransform.scale})`,
                }}
                onPointerDown={(e) => {
                  const vp = lbViewportRef.current
                  if (!vp) return
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  const rect = vp.getBoundingClientRect()
                  const p = getLocalPoint(e, rect)
                  lbPointers.current.set(e.pointerId, p)

                  const pts = Array.from(lbPointers.current.values())
                  if (pts.length === 1) {
                    lbDragRef.current = { startX: p.x, startY: p.y, startTx: lbTransform.tx, startTy: lbTransform.ty }
                    lbPinchRef.current = null
                  } else if (pts.length === 2) {
                    const [a, b] = pts
                    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                    const dist = Math.hypot(a.x - b.x, a.y - b.y)
                    lbPinchRef.current = {
                      startDist: dist || 1,
                      startScale: lbTransform.scale,
                      startTx: lbTransform.tx,
                      startTy: lbTransform.ty,
                      startMid: mid,
                    }
                    lbDragRef.current = null
                  }
                }}
                onPointerMove={(e) => {
                  const vp = lbViewportRef.current
                  if (!vp) return
                  const rect = vp.getBoundingClientRect()
                  const p = getLocalPoint(e, rect)
                  if (!lbPointers.current.has(e.pointerId)) return
                  lbPointers.current.set(e.pointerId, p)

                  const pts = Array.from(lbPointers.current.values())

                  if (pts.length === 1 && lbDragRef.current) {
                    const d = lbDragRef.current
                    setLbTransform((t) => ({
                      ...t,
                      tx: d.startTx + (p.x - d.startX),
                      ty: d.startTy + (p.y - d.startY),
                    }))
                    return
                  }

                  if (pts.length === 2 && lbPinchRef.current) {
                    const pinch = lbPinchRef.current
                    const [a, b] = pts
                    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
                    const nextScale = clamp((pinch.startScale * dist) / pinch.startDist, 1, 6)

                    const anchor = pinch.startMid
                    const dx = (anchor.x - pinch.startTx) / pinch.startScale
                    const dy = (anchor.y - pinch.startTy) / pinch.startScale

                    setLbTransform({
                      scale: nextScale,
                      tx: anchor.x - dx * nextScale + (mid.x - pinch.startMid.x),
                      ty: anchor.y - dy * nextScale + (mid.y - pinch.startMid.y),
                    })
                  }
                }}
                onPointerUp={(e) => {
                  lbPointers.current.delete(e.pointerId)
                  lbDragRef.current = null
                  lbPinchRef.current = null
                }}
                onPointerCancel={(e) => {
                  lbPointers.current.delete(e.pointerId)
                  lbDragRef.current = null
                  lbPinchRef.current = null
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
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
        <aside className="sidebar">
          <div className="sidebar__inner">
            <WorkspaceSidebarContent />
          </div>
        </aside>
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
        <aside className="sidebar">
          <div className="sidebar__inner">
            <WorkspaceSidebarContent />
          </div>
        </aside>
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
