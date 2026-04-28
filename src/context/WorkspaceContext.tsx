import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { collectWorkspaceIndex, readTextFile, type DocFileRef } from '../lib/fsCrawl'
import { encodeDocPath } from '../lib/mdPathResolve'
import {
  loadWorkspaceState,
  saveWorkspaceState,
  type StoredWorkspace,
} from '../lib/workspaceStorage'

export type ViewerPhase =
  | 'landing'
  | 'permission'
  | 'loading'
  | 'active'
  | 'unsupported'

type WorkspaceContextValue = {
  phase: ViewerPhase
  /** True when read permission is `prompt` (needs user gesture to restore). */
  needsPermissionRestore: boolean
  errorMessage: string | null
  workspaces: Pick<StoredWorkspace, 'id' | 'name'>[]
  activeWorkspaceId: string | null
  activeRootName: string | null
  docFiles: DocFileRef[]
  getFileHandle: (relPath: string) => FileSystemFileHandle | undefined
  /** Image handle lookup by workspace-relative path (POSIX). */
  getImageHandle: (relPath: string) => FileSystemFileHandle | undefined
  loadMarkdown: (relPath: string) => Promise<string>
  loadText: (relPath: string) => Promise<string>
  /** Track object URLs created for the *currently rendered* markdown document. */
  trackImageObjectUrl: (url: string) => void
  /** Revoke all tracked object URLs (call on doc switch/unmount). */
  revokeActiveImageObjectUrls: () => void
  setActiveWorkspaceId: (id: string) => Promise<void>
  openFolderPicker: () => Promise<void>
  /** Re-grant read access without opening the directory picker (user gesture). */
  restoreWorkspaceAccess: () => Promise<void>
  removeActiveWorkspace: () => Promise<void>
  firstDocHref: string | null
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

/** Colocated with {@link WorkspaceProvider} for discoverability. */
// eslint-disable-next-line react-refresh/only-export-components -- hook must live next to provider
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}

function newWorkspaceId(): string {
  return crypto.randomUUID()
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<ViewerPhase>('landing')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<StoredWorkspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null)
  const [docFiles, setDocFiles] = useState<DocFileRef[]>([])
  const [needsPermissionRestore, setNeedsPermissionRestore] = useState(false)
  const contentCache = useRef<Map<string, string>>(new Map())
  const imageHandleByRelPath = useRef<Map<string, FileSystemFileHandle>>(new Map())
  const activeImageObjectUrls = useRef<Set<string>>(new Set())

  const persist = useCallback(async (next: StoredWorkspace[], activeId: string | null) => {
    setWorkspaces(next)
    setActiveWorkspaceIdState(activeId)
    await saveWorkspaceState({ workspaces: next, activeWorkspaceId: activeId })
  }, [])

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  )

  const scanWorkspace = useCallback(async (root: FileSystemDirectoryHandle) => {
    setPhase('loading')
    setDocFiles([])
    imageHandleByRelPath.current = new Map()
    setErrorMessage(null)
    try {
      const idx = await collectWorkspaceIndex(root)
      setDocFiles(idx.docs)
      imageHandleByRelPath.current = new Map(idx.images.map((i) => [i.relPath, i.handle]))
      contentCache.current = new Map()
      setPhase('active')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e))
      setPhase('landing')
    }
  }, [])

  const evaluateActivePermission = useCallback(async (): Promise<'granted' | 'prompt' | 'denied'> => {
    if (!activeWorkspace) return 'denied'
    try {
      // Spec: `queryPermission` / `requestPermission` (not `verifyPermission`).
      const q = await activeWorkspace.rootHandle.queryPermission({ mode: 'read' })
      return q
    } catch {
      return 'denied'
    }
  }, [activeWorkspace])

  const hydrateFromIdb = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      setPhase('unsupported')
      return
    }
    const stored = await loadWorkspaceState()
    if (!stored || stored.workspaces.length === 0) {
      setWorkspaces([])
      setActiveWorkspaceIdState(null)
      setDocFiles([])
      setPhase('landing')
      return
    }
    setWorkspaces(stored.workspaces)
    const activeId = stored.activeWorkspaceId ?? stored.workspaces[0]?.id ?? null
    setActiveWorkspaceIdState(activeId)
    const active = stored.workspaces.find((w) => w.id === activeId) ?? stored.workspaces[0]
    if (!active) {
      setPhase('landing')
      return
    }
    const perm = await active.rootHandle.queryPermission({ mode: 'read' })
    if (perm === 'granted') {
      setNeedsPermissionRestore(false)
      await scanWorkspace(active.rootHandle)
      return
    }
    if (perm === 'prompt') {
      setNeedsPermissionRestore(true)
      setDocFiles([])
      setPhase('permission')
      return
    }
    setNeedsPermissionRestore(false)
    setDocFiles([])
    setPhase('landing')
    setErrorMessage('Read access was denied for the saved workspace.')
  }, [scanWorkspace])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void hydrateFromIdb()
    })
    return () => cancelAnimationFrame(id)
  }, [hydrateFromIdb])

  const getFileHandle = useCallback(
    (relPath: string) => docFiles.find((f) => f.relPath === relPath)?.handle,
    [docFiles],
  )

  const getImageHandle = useCallback((relPath: string) => {
    return imageHandleByRelPath.current.get(relPath)
  }, [])

  const trackImageObjectUrl = useCallback((url: string) => {
    activeImageObjectUrls.current.add(url)
  }, [])

  const revokeActiveImageObjectUrls = useCallback(() => {
    activeImageObjectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    activeImageObjectUrls.current.clear()
  }, [])

  const loadMarkdown = useCallback(
    async (relPath: string) => {
      const hit = contentCache.current.get(relPath)
      if (hit !== undefined) return hit
      const handle = getFileHandle(relPath)
      if (!handle) throw new Error('File not found in workspace index.')
      const raw = await readTextFile(handle)
      contentCache.current.set(relPath, raw)
      return raw
    },
    [getFileHandle],
  )

  const loadText = loadMarkdown

  const firstDocHref = useMemo(() => {
    const first = docFiles[0]?.relPath
    if (!first) return null
    return `/doc/${encodeDocPath(first)}`
  }, [docFiles])

  const setActiveWorkspaceId = useCallback(
    async (id: string) => {
      const ws = workspaces.find((w) => w.id === id)
      if (!ws) return
      await persist(workspaces, id)
      const perm = await ws.rootHandle.queryPermission({ mode: 'read' })
      if (perm === 'granted') {
        setNeedsPermissionRestore(false)
        await scanWorkspace(ws.rootHandle)
        return
      }
      if (perm === 'prompt') {
        setNeedsPermissionRestore(true)
        setDocFiles([])
        setPhase('permission')
        return
      }
      setNeedsPermissionRestore(false)
      setDocFiles([])
      setErrorMessage('Read access was denied for that workspace.')
      setPhase('landing')
    },
    [workspaces, persist, scanWorkspace],
  )

  const openFolderPicker = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      setPhase('unsupported')
      return
    }
    setErrorMessage(null)
    let handle: FileSystemDirectoryHandle
    try {
      handle = await window.showDirectoryPicker({ mode: 'read' })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setErrorMessage(e instanceof Error ? e.message : String(e))
      return
    }
    const perm = await handle.queryPermission({ mode: 'read' })
    if (perm === 'prompt') {
      const req = await handle.requestPermission({ mode: 'read' })
      if (req !== 'granted') {
        setErrorMessage('Read permission is required to index Markdown files.')
        return
      }
    } else if (perm === 'denied') {
      setErrorMessage('Read permission was denied.')
      return
    }
    const entry: StoredWorkspace = {
      id: newWorkspaceId(),
      name: handle.name,
      rootHandle: handle,
    }
    const next = [...workspaces, entry]
    await persist(next, entry.id)
    setNeedsPermissionRestore(false)
    await scanWorkspace(handle)
  }, [workspaces, persist, scanWorkspace])

  const restoreWorkspaceAccess = useCallback(async () => {
    if (!activeWorkspace) return
    setErrorMessage(null)
    try {
      const current = await activeWorkspace.rootHandle.queryPermission({ mode: 'read' })
      if (current === 'granted') {
        setNeedsPermissionRestore(false)
        await scanWorkspace(activeWorkspace.rootHandle)
        return
      }
      const req = await activeWorkspace.rootHandle.requestPermission({ mode: 'read' })
      if (req !== 'granted') {
        setErrorMessage('Read permission is required to open your saved folder.')
        return
      }
      setNeedsPermissionRestore(false)
      await scanWorkspace(activeWorkspace.rootHandle)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }
  }, [activeWorkspace, scanWorkspace])

  const removeActiveWorkspace = useCallback(async () => {
    if (!activeWorkspaceId) return
    const next = workspaces.filter((w) => w.id !== activeWorkspaceId)
    const nextActive = next[0]?.id ?? null
    contentCache.current = new Map()
    setDocFiles([])
    await persist(next, nextActive)
    if (!nextActive) {
      setNeedsPermissionRestore(false)
      setPhase('landing')
      return
    }
    const ws = next.find((w) => w.id === nextActive)
    if (!ws) {
      setPhase('landing')
      return
    }
    const perm = await ws.rootHandle.queryPermission({ mode: 'read' })
    if (perm === 'granted') {
      setNeedsPermissionRestore(false)
      await scanWorkspace(ws.rootHandle)
      return
    }
    if (perm === 'prompt') {
      setNeedsPermissionRestore(true)
      setPhase('permission')
      return
    }
    setPhase('landing')
  }, [activeWorkspaceId, workspaces, persist, scanWorkspace])

  /** Re-check permission when tab regains focus (handles can go stale after long idle). */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (!activeWorkspace || phase === 'landing' || phase === 'unsupported') return
      void (async () => {
        const p = await evaluateActivePermission()
        if (p === 'prompt') {
          setNeedsPermissionRestore(true)
          setDocFiles([])
          setPhase('permission')
        }
      })()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [activeWorkspace, phase, evaluateActivePermission])

  const value: WorkspaceContextValue = {
    phase,
    needsPermissionRestore,
    errorMessage,
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
    activeWorkspaceId,
    activeRootName: activeWorkspace?.name ?? null,
    docFiles,
    getFileHandle,
    getImageHandle,
    loadMarkdown,
    loadText,
    trackImageObjectUrl,
    revokeActiveImageObjectUrls,
    setActiveWorkspaceId,
    openFolderPicker,
    restoreWorkspaceAccess,
    removeActiveWorkspace,
    firstDocHref,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

