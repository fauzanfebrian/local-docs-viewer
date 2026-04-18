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
const SUPPORTED_IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp)$/i

export type SupportedFileKind = 'markdown' | 'text' | 'pdf'

export type DocFileRef = {
  /** POSIX-style path relative to workspace root (e.g. `notes/foo.md`). */
  relPath: string
  kind: SupportedFileKind
  handle: FileSystemFileHandle
}

export type ImageFileRef = {
  /** POSIX-style path relative to workspace root (e.g. `notes/assets/foo.png`). */
  relPath: string
  handle: FileSystemFileHandle
}

export type WorkspaceIndex = {
  docs: DocFileRef[]
  images: ImageFileRef[]
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
  const { docs } = await collectWorkspaceIndex(root, { ignoredNames: ignored })
  return docs
}

/**
 * Recursively collects supported docs *and* image assets under `root`.
 * Images are indexed by workspace-relative path so Markdown renderers can resolve `./assets/foo.png`
 * and turn it into an object URL via File System Access API.
 */
export async function collectWorkspaceIndex(
  root: FileSystemDirectoryHandle,
  options?: { ignoredNames?: Set<string> },
): Promise<WorkspaceIndex> {
  const ignored = options?.ignoredNames ?? DEFAULT_IGNORED_DIR_NAMES
  const docs: DocFileRef[] = []
  const images: ImageFileRef[] = []
  await walkDir(root, '', ignored, docs, images)
  docs.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { sensitivity: 'base' }))
  images.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { sensitivity: 'base' }))
  return { docs, images }
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  ignored: Set<string>,
  docAcc: DocFileRef[],
  imageAcc: ImageFileRef[],
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (ignored.has(name)) continue
    const rel = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') {
      await walkDir(handle as FileSystemDirectoryHandle, rel, ignored, docAcc, imageAcc)
      continue
    }
    if (handle.kind !== 'file') continue

    if (SUPPORTED_EXT.test(name)) {
      const kind = classifyKind(name)
      if (!kind) continue
      docAcc.push({ relPath: rel, kind, handle: handle as FileSystemFileHandle })
      continue
    }

    if (SUPPORTED_IMAGE_EXT.test(name)) {
      imageAcc.push({ relPath: rel, handle: handle as FileSystemFileHandle })
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
