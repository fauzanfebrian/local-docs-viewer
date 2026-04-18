/** Directory names skipped during crawl (heavy or irrelevant trees). */
export const DEFAULT_IGNORED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '.obsidian',
  'dist',
  '.next',
  'build',
  '.turbo',
  '.cache',
  'coverage',
])

const SUPPORTED_EXT = /\.(md|markdown|txt|pdf)$/i

export type SupportedFileKind = 'markdown' | 'text' | 'pdf'

export type DocFileRef = {
  /** POSIX-style path relative to workspace root (e.g. `notes/foo.md`). */
  relPath: string
  kind: SupportedFileKind
  handle: FileSystemFileHandle
}

/**
 * Recursively collects supported docs under `root`:
 * `.md` / `.markdown` / `.txt` / `.pdf`.
 * Skips ignored directory names (see {@link DEFAULT_IGNORED_DIR_NAMES}).
 */
export async function collectDocFiles(
  root: FileSystemDirectoryHandle,
  options?: { ignoredNames?: Set<string> },
): Promise<DocFileRef[]> {
  const ignored = options?.ignoredNames ?? DEFAULT_IGNORED_DIR_NAMES
  const out: DocFileRef[] = []
  await walkDir(root, '', ignored, out)
  out.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { sensitivity: 'base' }))
  return out
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  ignored: Set<string>,
  acc: DocFileRef[],
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (ignored.has(name)) continue
    const rel = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') {
      await walkDir(handle as FileSystemDirectoryHandle, rel, ignored, acc)
      continue
    }
    if (handle.kind === 'file' && SUPPORTED_EXT.test(name)) {
      const kind = classifyKind(name)
      if (!kind) continue
      acc.push({ relPath: rel, kind, handle: handle as FileSystemFileHandle })
    }
  }
}

export async function readTextFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

export async function getFileBlob(handle: FileSystemFileHandle): Promise<File> {
  return await handle.getFile()
}

function classifyKind(filename: string): SupportedFileKind | null {
  if (/\.(md|markdown)$/i.test(filename)) return 'markdown'
  if (/\.txt$/i.test(filename)) return 'text'
  if (/\.pdf$/i.test(filename)) return 'pdf'
  return null
}
