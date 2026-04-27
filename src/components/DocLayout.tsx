import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { decodeDocPath, encodeDocPath, stripFragment } from '../lib/mdPathResolve'
import { useWorkspace } from '../context/WorkspaceContext'
import { MarkdownDoc } from './MarkdownDoc'
import { MermaidBlock } from './MermaidBlock'
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

const LAST_DOC_KEY_PREFIX = 'ldv:lastDocHref:'
const SCROLL_KEY_PREFIX = 'ldv:scrollY:'

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

function scrollKeyFor(activeWorkspaceId: string | null, relPath: string): string | null {
  if (!activeWorkspaceId) return null
  if (!relPath) return null
  return `${SCROLL_KEY_PREFIX}${activeWorkspaceId}:${stripFragment(relPath)}`
}

function lastDocKeyFor(activeWorkspaceId: string | null): string | null {
  if (!activeWorkspaceId) return null
  return `${LAST_DOC_KEY_PREFIX}${activeWorkspaceId}`
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

function getLocalPointTopLeft(evt: { clientX: number; clientY: number }, rect: DOMRect) {
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  }
}

function clampPan(tx: number, ty: number, sw: number, sh: number, vw: number, vh: number) {
  const minX = sw > vw ? vw - sw : (vw - sw) / 2
  const maxX = sw > vw ? 0 : (vw - sw) / 2
  const minY = sh > vh ? vh - sh : (vh - sh) / 2
  const maxY = sh > vh ? 0 : (vh - sh) / 2
  return { tx: clamp(tx, minX, maxX), ty: clamp(ty, minY, maxY) }
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
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [activeTocId, setActiveTocId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const lbViewportRef = useRef<HTMLDivElement | null>(null)
  const lbPointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const [lbNatural, setLbNatural] = useState<{ w: number; h: number } | null>(null)
  const [lbViewport, setLbViewport] = useState<{ w: number; h: number }>({ w: 1, h: 1 })
  const [lbScale, setLbScale] = useState(1)
  const [lbPan, setLbPan] = useState<{ tx: number; ty: number }>({ tx: 0, ty: 0 })
  const lbDragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null)
  const lbDidInitViewRef = useRef(false)
  const lbPinchRef = useRef<{
    startDist: number
    startScale: number
    startTx: number
    startTy: number
    startMid: { x: number; y: number }
  } | null>(null)
  const didRestoreScroll = useRef(false)

  const lbBase = useMemo(() => {
    if (!lbNatural) return null
    const fit = Math.min(lbViewport.w / lbNatural.w, lbViewport.h / lbNatural.h, 1)
    return { w: Math.max(1, lbNatural.w * fit), h: Math.max(1, lbNatural.h * fit) }
  }, [lbNatural, lbViewport.h, lbViewport.w])

  const lbMaxScale = useMemo(() => {
    if (!lbNatural || !lbBase) return 8
    const maxByNatural = Math.max(1, lbNatural.w / lbBase.w, lbNatural.h / lbBase.h)
    return Math.max(8, maxByNatural * 1.5)
  }, [lbBase, lbNatural])

  const resetLightboxView = useCallback(() => {
    const base = lbBase
    if (!base) {
      setLbScale(1)
      setLbPan({ tx: 0, ty: 0 })
      return
    }
    const tx = (lbViewport.w - base.w) / 2
    const ty = (lbViewport.h - base.h) / 2
    setLbScale(1)
    setLbPan({ tx, ty })
  }, [lbBase, lbViewport.h, lbViewport.w])

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const base = lbBase
      if (!base) return
      setLbScale((s) => {
        const next = clamp(s * factor, 1, lbMaxScale)
        const k = next / s
        setLbPan((p) => {
          const nextTx = px - k * (px - p.tx)
          const nextTy = py - k * (py - p.ty)
          const sw = base.w * next
          const sh = base.h * next
          return clampPan(nextTx, nextTy, sw, sh, lbViewport.w, lbViewport.h)
        })
        return next
      })
    },
    [lbBase, lbMaxScale, lbViewport.h, lbViewport.w],
  )

  useEffect(() => {
    const vp = lbViewportRef.current
    if (!vp) return
    const ro = new ResizeObserver(() => {
      const rect = vp.getBoundingClientRect()
      setLbViewport({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) })
    })
    ro.observe(vp)
    return () => ro.disconnect()
  }, [])

  // When natural/base changes (new image or resize), re-center and re-clamp.
  useEffect(() => {
    const base = lbBase
    if (!base) return
    setLbScale((s) => clamp(s, 1, lbMaxScale))
    setLbPan((p) => {
      const sw = base.w * lbScale
      const sh = base.h * lbScale
      const centered = { tx: (lbViewport.w - sw) / 2, ty: (lbViewport.h - sh) / 2 }
      const { tx, ty } = clampPan(p.tx, p.ty, sw, sh, lbViewport.w, lbViewport.h)
      // If the image is smaller than viewport, always keep it centered.
      return {
        tx: sw <= lbViewport.w ? centered.tx : tx,
        ty: sh <= lbViewport.h ? centered.ty : ty,
      }
    })
  }, [lbBase, lbMaxScale, lbScale, lbViewport.h, lbViewport.w])

  // Initialize view once per lightbox open (after base is known).
  useEffect(() => {
    if (!lightbox?.open) return
    if (!lbBase) return
    if (lbDidInitViewRef.current) return
    lbDidInitViewRef.current = true
    resetLightboxView()
  }, [lbBase, lightbox?.open, resetLightboxView])

  const isReadyForScrollRestore = useMemo(() => {
    const ext = extOf(relPath)
    if (ext === 'pdf') return pdfUrl !== null
    const isImage =
      ext === 'png' ||
      ext === 'jpg' ||
      ext === 'jpeg' ||
      ext === 'gif' ||
      ext === 'svg' ||
      ext === 'webp' ||
      ext === 'avif' ||
      ext === 'bmp' ||
      ext === 'ico' ||
      ext === 'tif' ||
      ext === 'tiff'
    return isImage ? imageUrl !== null : raw !== null
  }, [relPath, pdfUrl, imageUrl, raw])

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
      setImageUrl((prev) => {
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

        if (
          ext === 'png' ||
          ext === 'jpg' ||
          ext === 'jpeg' ||
          ext === 'gif' ||
          ext === 'svg' ||
          ext === 'webp' ||
          ext === 'avif' ||
          ext === 'bmp' ||
          ext === 'ico' ||
          ext === 'tif' ||
          ext === 'tiff'
        ) {
          const handle = ws.getFileHandle(relPath) ?? ws.getImageHandle(relPath)
          if (!handle) throw new Error('File not found in workspace index.')
          const file = await handle.getFile()
          const url = URL.createObjectURL(file)
          if (!cancelled) setImageUrl(url)
          return
        }

        const text = await (ext === 'txt' || ext === 'mmd' ? ws.loadText(relPath) : ws.loadMarkdown(relPath))
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
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [relPath, ws])

  // Persist the current doc path (so reload returns to the same page).
  useEffect(() => {
    if (ws.phase !== 'active') return
    const key = lastDocKeyFor(ws.activeWorkspaceId)
    if (!key) return
    if (!relPath) return
    safeLocalStorageSet(key, `/doc/${encodeDocPath(relPath)}`)
  }, [relPath, ws.activeWorkspaceId, ws.phase])

  // Restore + persist scroll position per (workspaceId, relPath).
  useEffect(() => {
    didRestoreScroll.current = false
  }, [relPath])

  useEffect(() => {
    if (!isReadyForScrollRestore) return
    if (didRestoreScroll.current) return
    const key = scrollKeyFor(ws.activeWorkspaceId, relPath)
    if (!key) return
    const saved = safeLocalStorageGet(key)
    const y = saved ? Number(saved) : NaN
    didRestoreScroll.current = true
    if (!Number.isFinite(y) || y <= 0) return
    requestAnimationFrame(() => {
      window.scrollTo({ top: y })
    })
  }, [isReadyForScrollRestore, relPath, ws.activeWorkspaceId])

  useEffect(() => {
    const key = scrollKeyFor(ws.activeWorkspaceId, relPath)
    if (!key) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        safeLocalStorageSet(key, String(window.scrollY || 0))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [relPath, ws.activeWorkspaceId])

  const ext = extOf(relPath)
  const isMd = ext === 'md' || ext === 'markdown'
  const isMermaid = ext === 'mmd'
  const isImage =
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'gif' ||
    ext === 'svg' ||
    ext === 'webp' ||
    ext === 'avif' ||
    ext === 'bmp' ||
    ext === 'ico' ||
    ext === 'tif' ||
    ext === 'tiff'
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
    lbDidInitViewRef.current = false
    setLbNatural(null)
    setLbScale(1)
    setLbPan({ tx: 0, ty: 0 })
  }, [])

  const setArticleEl = useCallback((el: HTMLElement | null) => {
    articleRef.current = el
  }, [])

  const onMarkdownImageClick = useCallback(({ src, alt }: { src: string; alt?: string }) => {
    if (!src) return
    setLightbox({ open: true, src, alt: alt ?? '' })
    lbDidInitViewRef.current = false
    setLbNatural(null)
    setLbScale(1)
    setLbPan({ tx: 0, ty: 0 })
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
        return
      }

      if (!lightbox?.open) return

      if (e.key === '+' || e.key === '=' ) {
        e.preventDefault()
        zoomAt(lbViewport.w / 2, lbViewport.h / 2, 1.25)
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        zoomAt(lbViewport.w / 2, lbViewport.h / 2, 1 / 1.25)
        return
      }
      if (e.key === '0') {
        e.preventDefault()
        resetLightboxView()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeLightbox, closeSidebars, lightbox?.open, lbViewport.h, lbViewport.w, resetLightboxView, zoomAt])

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

  if (ext !== 'pdf') {
    const isReady = isImage ? imageUrl !== null : raw !== null
    if (!isReady) {
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
        ) : imageUrl ? (
          <div className="main__article-wrap">
            <div className="image-doc">
              <img
                className="image-doc__img"
                src={imageUrl}
                alt={relPath.split('/').pop() ?? relPath}
                loading="eager"
                onClick={() => {
                  setLightbox({ open: true, src: imageUrl, alt: relPath.split('/').pop() ?? relPath })
                  lbDidInitViewRef.current = false
                  setLbNatural(null)
                  setLbScale(1)
                  setLbPan({ tx: 0, ty: 0 })
                }}
              />
              <div className="image-doc__hint">Click to zoom</div>
            </div>
          </div>
        ) : ext === 'txt' ? (
          <div className="main__article-wrap">
            <pre className="plain-text">{sanitizePlainText(raw ?? '')}</pre>
          </div>
        ) : isMermaid ? (
          <div className="main__article-wrap">
            <MermaidBlock chart={raw ?? ''} />
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
            <div className="img-lightbox__toolbar" role="group" aria-label="Zoom controls">
              <button
                type="button"
                className="img-lightbox__toolbtn"
                onClick={() => zoomAt(lbViewport.w / 2, lbViewport.h / 2, 1 / 1.25)}
                aria-label="Zoom out"
              >
                −
              </button>
              <div className="img-lightbox__zoom" aria-label="Zoom level">
                {Math.round(lbScale * 100)}%
              </div>
              <button
                type="button"
                className="img-lightbox__toolbtn"
                onClick={() => zoomAt(lbViewport.w / 2, lbViewport.h / 2, 1.25)}
                aria-label="Zoom in"
              >
                +
              </button>
              <button type="button" className="img-lightbox__toolbtn" onClick={resetLightboxView} aria-label="Reset zoom">
                Reset
              </button>
            </div>
            <div
              className="img-lightbox__viewport"
              ref={lbViewportRef}
              onWheel={(e) => {
                e.preventDefault()
                const vp = lbViewportRef.current
                if (!vp) return
                const rect = vp.getBoundingClientRect()
                const p = getLocalPointTopLeft(e, rect)
                zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15)
              }}
              onDoubleClick={(e) => {
                const vp = lbViewportRef.current
                if (!vp) return
                const rect = vp.getBoundingClientRect()
                const p = getLocalPointTopLeft(e, rect)
                zoomAt(p.x, p.y, 2)
              }}
            >
              <img
                className="img-lightbox__img"
                src={lightbox.src}
                alt={lightbox.alt}
                draggable={false}
                data-can-pan={lbScale > 1 ? 'true' : 'false'}
                onLoad={(e) => {
                  const vp = lbViewportRef.current
                  const vw = vp?.clientWidth ?? lbViewport.w
                  const vh = vp?.clientHeight ?? lbViewport.h
                  const w = e.currentTarget.naturalWidth || vw || 1
                  const h = e.currentTarget.naturalHeight || vh || 1
                  setLbNatural({ w, h })
                }}
                style={
                  lbBase
                    ? {
                        width: lbBase.w * lbScale,
                        height: lbBase.h * lbScale,
                        transform: `translate3d(${lbPan.tx}px, ${lbPan.ty}px, 0)`,
                      }
                    : undefined
                }
                onPointerDown={(e) => {
                  const vp = lbViewportRef.current
                  if (!vp) return
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  const rect = vp.getBoundingClientRect()
                  const p = getLocalPointTopLeft(e, rect)
                  lbPointers.current.set(e.pointerId, p)

                  const pts = Array.from(lbPointers.current.values())
                  if (pts.length === 1) {
                    lbDragRef.current = { startX: p.x, startY: p.y, startTx: lbPan.tx, startTy: lbPan.ty }
                    lbPinchRef.current = null
                  } else if (pts.length === 2) {
                    const [a, b] = pts
                    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                    const dist = Math.hypot(a.x - b.x, a.y - b.y)
                    lbPinchRef.current = {
                      startDist: dist || 1,
                      startScale: lbScale,
                      startTx: lbPan.tx,
                      startTy: lbPan.ty,
                      startMid: mid,
                    }
                    lbDragRef.current = null
                  }
                }}
                onPointerMove={(e) => {
                  const vp = lbViewportRef.current
                  if (!vp) return
                  const rect = vp.getBoundingClientRect()
                  const p = getLocalPointTopLeft(e, rect)
                  if (!lbPointers.current.has(e.pointerId)) return
                  lbPointers.current.set(e.pointerId, p)

                  const pts = Array.from(lbPointers.current.values())

                  if (pts.length === 1 && lbDragRef.current) {
                    const d = lbDragRef.current
                    const nextTx = d.startTx + (p.x - d.startX)
                    const nextTy = d.startTy + (p.y - d.startY)
                    const base = lbBase
                    if (!base) return
                    const sw = base.w * lbScale
                    const sh = base.h * lbScale
                    setLbPan(clampPan(nextTx, nextTy, sw, sh, lbViewport.w, lbViewport.h))
                    return
                  }

                  if (pts.length === 2 && lbPinchRef.current) {
                    const pinch = lbPinchRef.current
                    const [a, b] = pts
                    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
                    const base = lbBase
                    if (!base) return

                    const nextScale = clamp((pinch.startScale * dist) / pinch.startDist, 1, lbMaxScale)
                    const k = nextScale / pinch.startScale
                    const anchor = pinch.startMid
                    const nextTx = anchor.x - k * (anchor.x - pinch.startTx) + (mid.x - pinch.startMid.x)
                    const nextTy = anchor.y - k * (anchor.y - pinch.startTy) + (mid.y - pinch.startMid.y)
                    const sw = base.w * nextScale
                    const sh = base.h * nextScale

                    setLbScale(nextScale)
                    setLbPan(clampPan(nextTx, nextTy, sw, sh, lbViewport.w, lbViewport.h))
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
            Indexing documents…
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
