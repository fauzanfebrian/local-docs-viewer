import GithubSlugger from 'github-slugger'

export type TocItem = {
  depth: 1 | 2 | 3
  text: string
  id: string
}

export function parseToc(markdown: string): TocItem[] {
  const slugger = new GithubSlugger()
  const items: TocItem[] = []
  for (const line of markdown.split('\n')) {
    const m = /^(#{1,3})\s+(.+)$/.exec(line.trim())
    if (!m) continue
    const depthRaw = m[1].length
    if (depthRaw < 1 || depthRaw > 3) continue
    const depth = depthRaw as 1 | 2 | 3
    const rawText = m[2].replace(/\s+#+\s*$/, '').trim()
    if (!rawText) continue
    const id = slugger.slug(rawText)
    items.push({ depth, text: rawText, id })
  }
  return items
}
