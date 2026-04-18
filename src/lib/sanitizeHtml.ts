import DOMPurify from 'dompurify'

/**
 * Sanitize Shiki HTML before `dangerouslySetInnerHTML`.
 * Strips scripts, embeds, and event-handler attributes.
 */
export function sanitizeHighlightedCodeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'link',
      'meta',
      'base',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'style',
    ],
    ALLOW_DATA_ATTR: false,
  })
}

/**
 * Sanitize Mermaid SVG before DOM insertion.
 */
export function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    // Mermaid relies on <style> inside the generated <svg>. DOMPurify's default SVG
    // profile can strip styling, which makes diagrams look broken (misplaced labels,
    // missing strokes/fills). Keep SVG + filters and explicitly allow safe styling.
    // Also allow HTML inside <foreignObject> (some diagram types use it for labels).
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['style'],
    ADD_ATTR: ['style'],
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'link',
      'meta',
      'base',
      'form',
      'input',
      'button',
      'textarea',
      'select',
    ],
    ALLOW_DATA_ATTR: false,
  })
}
