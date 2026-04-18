import { NavLink } from 'react-router-dom'

import { encodeDocPath } from '../lib/mdPathResolve'
import type { FileTreeNode } from '../lib/fileTree'

function splitName(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf('.')
  if (i === -1) return { base: name, ext: '' }
  return { base: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() }
}

function badgeForExt(ext: string): string | null {
  if (ext === 'md' || ext === 'markdown') return 'MD'
  if (ext === 'txt') return 'TXT'
  if (ext === 'pdf') return 'PDF'
  return null
}

type BranchProps = {
  nodes: FileTreeNode[]
  pathPrefix?: string
}

function FileTreeBranch({ nodes, pathPrefix = '' }: BranchProps) {
  return (
    <ul className="file-tree">
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <li key={`${pathPrefix}/${node.name}`} className="file-tree__dir">
            <div className="file-tree__dir-label">{node.name}</div>
            <FileTreeBranch nodes={node.children} pathPrefix={`${pathPrefix}/${node.name}`} />
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
                {splitName(node.name).base}
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

export function FileTreeNav({ nodes }: { nodes: FileTreeNode[] }) {
  if (nodes.length === 0) {
    return <p className="sidebar__empty">No supported documents in this folder.</p>
  }
  return <FileTreeBranch nodes={nodes} />
}
