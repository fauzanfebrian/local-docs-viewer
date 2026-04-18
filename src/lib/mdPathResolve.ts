/**
 * Resolve a Markdown link target relative to the current file's workspace-relative path.
 * Normalizes `.` / `..` segments; returns POSIX-style path.
 */
export function resolveMdHrefToRelPath(fromFileRelPath: string, href: string): string {
  const [pathPart, fragment] = href.split('#')
  const raw = pathPart.replace(/^\.\//, '')
  const fromDir = fromFileRelPath.includes('/')
    ? fromFileRelPath.slice(0, fromFileRelPath.lastIndexOf('/'))
    : ''
  const baseSegments = fromDir ? fromDir.split('/') : []
  const hrefSegments = raw.split('/')
  const stack = [...baseSegments]
  for (const seg of hrefSegments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      stack.pop()
      continue
    }
    stack.push(seg)
  }
  const joined = stack.join('/')
  return fragment ? `${joined}#${fragment}` : joined
}

export function stripFragment(rel: string): string {
  const i = rel.indexOf('#')
  return i === -1 ? rel : rel.slice(0, i)
}

export function encodeDocPath(relPath: string): string {
  return relPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

export function decodeDocPath(encodedPath: string): string {
  if (!encodedPath) return ''
  return encodedPath
    .split('/')
    .map((seg) => decodeURIComponent(seg))
    .join('/')
}
