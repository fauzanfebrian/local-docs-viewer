import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

import { encodeDocPath } from '../lib/mdPathResolve'
import type { FileTreeNode } from '../lib/fileTree'

function splitName(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf('.')
  if (i === -1) return { base: name, ext: '' }
  return { base: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() }
}

function badgeForExt(ext: string): string | null {
  if (ext === 'md' || ext === 'markdown') return 'MD'
  if (ext === 'mmd') return 'MMD'
  if (ext === 'txt') return 'TXT'
  if (ext === 'pdf') return 'PDF'
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
  )
    return 'IMG'
  return null
}

function highlightText(text: string, tokens: string[]) {
  if (tokens.length === 0) return text
  const lower = text.toLowerCase()
  const hits: Array<{ start: number; end: number }> = []

  for (const raw of tokens) {
    const t = raw.trim().toLowerCase()
    if (!t) continue
    let i = 0
    while (true) {
      const at = lower.indexOf(t, i)
      if (at === -1) break
      hits.push({ start: at, end: at + t.length })
      i = at + t.length
    }
  }

  if (hits.length === 0) return text
  hits.sort((a, b) => a.start - b.start || a.end - b.end)

  // Merge overlaps so we don't nest/fragment marks.
  const merged: Array<{ start: number; end: number }> = []
  for (const h of hits) {
    const last = merged[merged.length - 1]
    if (!last || h.start > last.end) merged.push({ ...h })
    else last.end = Math.max(last.end, h.end)
  }

  const out: ReactNode[] = []
  let cursor = 0
  for (const m of merged) {
    if (m.start > cursor) out.push(text.slice(cursor, m.start))
    out.push(
      <mark key={`${m.start}:${m.end}`} className="file-tree__hit">
        {text.slice(m.start, m.end)}
      </mark>,
    )
    cursor = m.end
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  return <>{out}</>
}

type BranchProps = {
  nodes: FileTreeNode[]
  pathPrefix?: string
  query?: string
}

function FileTreeBranch({ nodes, pathPrefix = '', query = '' }: BranchProps) {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return (
    <ul className="file-tree">
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <li key={`${pathPrefix}/${node.name}`} className="file-tree__dir">
            <div className="file-tree__dir-label">{node.name}</div>
            <FileTreeBranch nodes={node.children} pathPrefix={`${pathPrefix}/${node.name}`} query={query} />
          </li>
        ) : (
          <li key={node.relPath} className="file-tree__file">
            <NavLink
              to={`/doc/${encodeDocPath(node.relPath)}`}
              className={({ isActive }) =>
                isActive ? 'sidebar__link is-active' : 'sidebar__link'
              }
            >
              <span className="file-tree__file-name">
                {highlightText(splitName(node.name).base, tokens)}
              </span>
              {badgeForExt(splitName(node.name).ext) ? (
                <span className="file-tree__badge" aria-hidden="true">
                  {badgeForExt(splitName(node.name).ext)}
                </span>
              ) : (
                <span className="file-tree__badge file-tree__badge--unknown" aria-hidden="true">
                  {splitName(node.name).ext.toUpperCase()}
                </span>
              )}
            </NavLink>
          </li>
        ),
      )}
    </ul>
  )
}

export function FileTreeNav({ nodes, query }: { nodes: FileTreeNode[]; query?: string }) {
  if (nodes.length === 0) {
    return <p className="sidebar__empty">No supported documents in this folder.</p>
  }
  return <FileTreeBranch nodes={nodes} query={query} />
}
