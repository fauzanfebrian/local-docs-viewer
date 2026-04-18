export type FileTreeDir = {
  kind: 'dir'
  name: string
  children: FileTreeNode[]
}

export type FileTreeFile = {
  kind: 'file'
  name: string
  relPath: string
}

export type FileTreeNode = FileTreeDir | FileTreeFile

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

function sortTreeDeep(node: FileTreeDir): void {
  node.children = sortNodes(node.children)
  for (const c of node.children) {
    if (c.kind === 'dir') sortTreeDeep(c)
  }
}

/**
 * Build a hierarchical tree from flat workspace-relative markdown paths.
 */
export function buildFileTree(relPaths: string[]): FileTreeNode[] {
  const syntheticRoot: FileTreeDir = { kind: 'dir', name: '', children: [] }
  for (const relPath of relPaths) {
    const parts = relPath.split('/')
    let cur = syntheticRoot
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      if (isFile) {
        cur.children.push({ kind: 'file', name: part, relPath })
        break
      }
      let next = cur.children.find(
        (n): n is FileTreeDir => n.kind === 'dir' && n.name === part,
      )
      if (!next) {
        next = { kind: 'dir', name: part, children: [] }
        cur.children.push(next)
      }
      cur = next
    }
  }
  sortTreeDeep(syntheticRoot)
  return sortNodes(syntheticRoot.children)
}
