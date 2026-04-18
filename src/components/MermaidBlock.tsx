import mermaid from 'mermaid'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'

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

export function MermaidBlock({ chart }: Props) {
  const reactId = useId().replace(/:/g, '')
  const titleId = `${reactId}-mermaid-detail-title`
  const closeRef = useRef<HTMLButtonElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => {
    ensureMermaidConfig()
    let cancelled = false
    const id = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 9)}`
    ;(async () => {
      try {
        const { svg: out } = await mermaid.render(id, chart.trim())
        if (!cancelled) {
          // Mermaid is responsible for script stripping in `securityLevel: 'antiscript'`.
          // Additional SVG sanitization was causing style/label loss in some diagrams.
          setSvg(out)
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
  }, [chart, reactId])

  useEffect(() => {
    if (!detailOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
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
              Close
            </button>
          </header>
          <div
            className="mermaid-detail-body"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
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
            onClick={() => setDetailOpen(true)}
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
