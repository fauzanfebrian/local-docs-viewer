import mermaid from 'mermaid'
import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

let configured = false

/** Matte grayscale — overrides Mermaid dark defaults (bright cScale / hue-shifted fillTypes). */
const MATTE_THEME = {
  darkMode: true,
  useGradient: false,
  dropShadow: 'none',
  background: '#1c1c1c',
  primaryColor: '#2e2e2e',
  secondaryColor: '#282828',
  tertiaryColor: '#1a1a1a',
  primaryBorderColor: 'rgba(255, 255, 255, 0.11)',
  secondaryBorderColor: 'rgba(255, 255, 255, 0.09)',
  tertiaryBorderColor: 'rgba(255, 255, 255, 0.08)',
  primaryTextColor: '#c8c8c8',
  secondaryTextColor: '#a3a3a3',
  tertiaryTextColor: '#909090',
  lineColor: 'rgba(200, 198, 195, 0.4)',
  textColor: '#cecece',
  mainBkg: '#1c1c1c',
  nodeBkg: '#2a2a2a',
  nodeBorder: 'rgba(255, 255, 255, 0.12)',
  clusterBkg: 'rgba(255, 255, 255, 0.04)',
  clusterBorder: 'rgba(255, 255, 255, 0.1)',
  defaultLinkColor: 'rgba(190, 188, 185, 0.48)',
  arrowheadColor: 'rgba(195, 193, 190, 0.5)',
  titleColor: '#b0b0b0',
  edgeLabelBackground: '#181818',
  /** Replaces hue-shifted flowchart fills (fillType2–7 default to saturated complements). */
  fillType0: '#2e2e2e',
  fillType1: '#333333',
  fillType2: '#2c2c2c',
  fillType3: '#303030',
  fillType4: '#323232',
  fillType5: '#292929',
  fillType6: '#313131',
  fillType7: '#2f2f2f',
  /** Replaces default rainbow cScale (#f4a8ff, #46ecd5, …). */
  cScale0: '#2f2f2f',
  cScale1: '#343434',
  cScale2: '#2b2b2b',
  cScale3: '#383838',
  cScale4: '#2d2d2d',
  cScale5: '#333333',
  cScale6: '#2a2a2a',
  cScale7: '#363636',
  cScale8: '#2e2e2e',
  cScale9: '#323232',
  cScale10: '#2c2c2c',
  cScale11: '#303030',
  cScale12: '#313131',
  cScaleLabel0: '#c2c2c2',
  cScaleLabel1: '#c2c2c2',
  cScaleLabel2: '#bebebe',
  cScaleLabel3: '#c2c2c2',
  cScaleLabel4: '#bebebe',
  cScaleLabel5: '#c2c2c2',
  cScaleLabel6: '#bebebe',
  cScaleLabel7: '#c2c2c2',
  cScaleLabel8: '#bebebe',
  cScaleLabel9: '#c2c2c2',
  cScaleLabel10: '#bebebe',
  cScaleLabel11: '#c2c2c2',
  scaleLabelColor: '#bdbdbd',
  git0: '#3a3a3a',
  git1: '#333333',
  git2: '#2e2e2e',
  git3: '#363636',
  git4: '#303030',
  git5: '#383838',
  git6: '#2c2c2c',
  git7: '#343434',
  quadrant1Fill: '#2a2a2a',
  quadrant2Fill: '#2e2e2e',
  quadrant3Fill: '#262626',
  quadrant4Fill: '#2c2c2c',
  quadrantTitleFill: '#b0b0b0',
} as const

function ensureMermaidConfig() {
  if (configured) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    // Client-side only, user-selected local files: relax enough to render labels reliably,
    // while still stripping scripts.
    securityLevel: 'antiscript',
    fontFamily: 'var(--font-mono)',
    // Prefer HTML labels for better layout/kerning (still sanitized by Mermaid in `antiscript`).
    flowchart: { htmlLabels: true },
    themeVariables: { ...MATTE_THEME },
  })
  configured = true
}

type Props = {
  chart: string
}

function hashStringToBase36(input: string): string {
  // Simple deterministic hash (non-crypto) for stable Mermaid render ids.
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

type ViewBox = { x: number; y: number; w: number; h: number }

function parseViewBoxAttr(v: string | null): ViewBox | null {
  if (!v) return null
  const parts = v
    .trim()
    .split(/[\s,]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
  if (parts.length !== 4) return null
  const [x, y, w, h] = parts
  if (!w || !h) return null
  return { x, y, w, h }
}

function clientToSvgPoint(rect: DOMRect, vb: ViewBox, clientX: number, clientY: number) {
  const fx = rect.width ? (clientX - rect.left) / rect.width : 0.5
  const fy = rect.height ? (clientY - rect.top) / rect.height : 0.5
  return {
    x: vb.x + fx * vb.w,
    y: vb.y + fy * vb.h,
    fx,
    fy,
  }
}

export function MermaidBlock({ chart }: Props) {
  const reactId = useId().replace(/:/g, '')
  const titleId = `${reactId}-mermaid-detail-title`
  const closeRef = useRef<HTMLButtonElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const svgHostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())

  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const viewBoxRef = useRef<ViewBox | null>(null)
  const pendingVbRef = useRef<ViewBox | null>(null)
  const rafRef = useRef<number | null>(null)
  const baseViewBoxRef = useRef<ViewBox | null>(null)
  const dragRef = useRef<{ start: { x: number; y: number }; startVb: ViewBox } | null>(null)
  const pinchRef = useRef<{
    startA: { x: number; y: number }
    startB: { x: number; y: number }
    startVb: ViewBox
  } | null>(null)

  const trimmedChart = useMemo(() => chart.trim(), [chart])
  const chartHash = useMemo(() => hashStringToBase36(trimmedChart), [trimmedChart])

  useEffect(() => {
    ensureMermaidConfig()
    let cancelled = false
    const id = `mermaid-${reactId}-${chartHash}`
    ;(async () => {
      try {
        const { svg: out } = await mermaid.render(id, trimmedChart)
        if (!cancelled) {
          // Mermaid is responsible for script stripping in `securityLevel: 'antiscript'`.
          // Additional SVG sanitization was causing style/label loss in some diagrams.
          setSvg((prev) => (prev === out ? prev : out))
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setSvg(null)
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [trimmedChart, reactId, chartHash])

  useEffect(() => {
    if (!detailOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    pointers.current.clear()
    dragRef.current = null
    pinchRef.current = null
    viewBoxRef.current = baseViewBoxRef.current
    pendingVbRef.current = null
    const svgEl = svgHostRef.current?.querySelector('svg') as SVGSVGElement | null
    const vb = baseViewBoxRef.current
    if (svgEl && vb) svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [detailOpen])

  const scheduleViewBox = (next: ViewBox) => {
    pendingVbRef.current = next
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const vb = pendingVbRef.current
      if (!vb) return
      viewBoxRef.current = vb
      const svgEl = svgHostRef.current?.querySelector('svg') as SVGSVGElement | null
      if (!svgEl) return
      svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
    })
  }

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    if (!detailOpen) return
    const host = svgHostRef.current
    if (!host) return
    const svgEl = host.querySelector('svg') as SVGSVGElement | null
    svgRef.current = svgEl
    if (!svgEl) return

    svgEl.style.width = '100%'
    svgEl.style.height = '100%'
    svgEl.style.maxWidth = 'none'
    svgEl.style.maxHeight = 'none'
    svgEl.style.display = 'block'
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')

    const vb =
      parseViewBoxAttr(svgEl.getAttribute('viewBox')) ??
      (() => {
        try {
          const bb = svgEl.getBBox()
          return { x: bb.x, y: bb.y, w: bb.width || 1, h: bb.height || 1 }
        } catch {
          return { x: 0, y: 0, w: 1000, h: 1000 }
        }
      })()

    baseViewBoxRef.current = vb
    viewBoxRef.current = vb
    svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
  }, [detailOpen, svg])

  useEffect(() => {
    if (!detailOpen) return
    const vp = viewportRef.current
    if (!vp) return

    const onWheel = (e: WheelEvent) => {
      // non-passive listener: can prevent scroll while zooming
      e.preventDefault()
      const rect = vp.getBoundingClientRect()
      const current = viewBoxRef.current ?? baseViewBoxRef.current
      if (!current) return

      const base = baseViewBoxRef.current ?? current
      const zoom = e.deltaY < 0 ? 1 / 1.1 : 1.1
      const nextW = clamp(current.w * zoom, base.w / 6, base.w * 6)
      const nextH = clamp(current.h * zoom, base.h / 6, base.h * 6)

      const anchor = clientToSvgPoint(rect, current, e.clientX, e.clientY)
      const nx = anchor.x - anchor.fx * nextW
      const ny = anchor.y - anchor.fy * nextH
      scheduleViewBox({ x: nx, y: ny, w: nextW, h: nextH })
    }

    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel as EventListener)
  }, [detailOpen])

  if (error) {
    return (
      <div className="mermaid-block mermaid-block--error">
        <p>Mermaid diagram error</p>
        <pre>{error}</pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="mermaid-block mermaid-block--loading" aria-busy="true">
        Rendering diagram…
      </div>
    )
  }

  const modal =
    detailOpen &&
    createPortal(
      <div
        className="mermaid-detail-root"
        role="presentation"
        onClick={() => setDetailOpen(false)}
      >
        <div
          className="mermaid-detail-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="mermaid-detail-header">
            <h2 id={titleId} className="mermaid-detail-title">
              Diagram
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="mermaid-detail-close"
              onClick={() => setDetailOpen(false)}
              aria-label="Close diagram view"
            >
              ×
            </button>
          </header>
          <div
            className="mermaid-detail-body mermaid-detail-body--zoom"
            ref={viewportRef}
          >
            <div
              className="mermaid-detail-zoom"
              onPointerDown={(e) => {
                const vp = viewportRef.current
                if (!vp) return
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                const vb = viewBoxRef.current ?? baseViewBoxRef.current
                if (!vb) return
                pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

                const pts = Array.from(pointers.current.values())
                if (pts.length === 1) {
                  dragRef.current = { start: pts[0]!, startVb: vb }
                  pinchRef.current = null
                } else if (pts.length === 2) {
                  const [a, b] = pts
                  pinchRef.current = { startA: a!, startB: b!, startVb: vb }
                  dragRef.current = null
                }
              }}
              onPointerMove={(e) => {
                const vp = viewportRef.current
                if (!vp) return
                const vb = viewBoxRef.current ?? baseViewBoxRef.current
                if (!vb) return
                if (!pointers.current.has(e.pointerId)) return

                pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

                const pts = Array.from(pointers.current.values())
                const rect = vp.getBoundingClientRect()

                if (pts.length === 1 && dragRef.current) {
                  const d = dragRef.current
                  const dxClient = pts[0]!.x - d.start.x
                  const dyClient = pts[0]!.y - d.start.y
                  const dxSvg = rect.width ? (dxClient / rect.width) * d.startVb.w : 0
                  const dySvg = rect.height ? (dyClient / rect.height) * d.startVb.h : 0
                  scheduleViewBox({ ...d.startVb, x: d.startVb.x - dxSvg, y: d.startVb.y - dySvg })
                  return
                }

                if (pts.length === 2 && pinchRef.current) {
                  const pinch = pinchRef.current
                  const [a, b] = pts
                  const startDistClient =
                    Math.hypot(pinch.startA.x - pinch.startB.x, pinch.startA.y - pinch.startB.y) || 1
                  const distClient = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1
                  const scale = startDistClient / distClient

                  const mid0Client = {
                    x: (pinch.startA.x + pinch.startB.x) / 2,
                    y: (pinch.startA.y + pinch.startB.y) / 2,
                  }
                  const midClient = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }

                  const base = baseViewBoxRef.current ?? pinch.startVb
                  const nextW = clamp(pinch.startVb.w * scale, base.w / 6, base.w * 6)
                  const nextH = clamp(pinch.startVb.h * scale, base.h / 6, base.h * 6)

                  // Anchor in SVG coords is based on the *start* viewBox and *start* midpoint.
                  const anchor = clientToSvgPoint(rect, pinch.startVb, mid0Client.x, mid0Client.y)
                  const frac = clientToSvgPoint(rect, pinch.startVb, midClient.x, midClient.y)
                  const nx = anchor.x - frac.fx * nextW
                  const ny = anchor.y - frac.fy * nextH
                  scheduleViewBox({ x: nx, y: ny, w: nextW, h: nextH })
                }
              }}
              onPointerUp={(e) => {
                pointers.current.delete(e.pointerId)
                dragRef.current = null
                pinchRef.current = null
              }}
              onPointerCancel={(e) => {
                pointers.current.delete(e.pointerId)
                dragRef.current = null
                pinchRef.current = null
              }}
              ref={svgHostRef}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <figure className="mermaid-block mermaid-block--figure">
        <figcaption className="mermaid-block__toolbar">
          <span className="mermaid-block__label">Diagram</span>
          <button
            type="button"
            className="mermaid-block__expand"
            onClick={() => {
              viewBoxRef.current = baseViewBoxRef.current
              const svgEl = svgHostRef.current?.querySelector('svg') as SVGSVGElement | null
              const vb = baseViewBoxRef.current
              if (svgEl && vb) svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
              setDetailOpen(true)
            }}
            aria-haspopup="dialog"
            aria-expanded={detailOpen}
          >
            View full size
          </button>
        </figcaption>
        {detailOpen ? (
          <div className="mermaid-block__canvas mermaid-block__canvas--placeholder">
            Diagram open in full-size view.
          </div>
        ) : (
          <div
            className="mermaid-block__canvas"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </figure>
      {modal}
    </>
  )
}
