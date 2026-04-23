import { Navigate, Route, Routes } from 'react-router-dom'

import { DocLayout } from './components/DocLayout'
import { LandingView } from './components/LandingView'
import { LoadingView } from './components/LoadingView'
import { NoMarkdownWorkspace } from './components/NoMarkdownWorkspace'
import { UnsupportedFsView } from './components/UnsupportedFsView'
import { useWorkspace } from './context/WorkspaceContext'
import { decodeDocPath, stripFragment } from './lib/mdPathResolve'

const VERCEL_404_REDIRECT_KEY = 'ldv:vercel404:intendedPath'
const LAST_DOC_KEY_PREFIX = 'ldv:lastDocHref:'

function readVercel404IntendedPath(): string | null {
  try {
    const raw = sessionStorage.getItem(VERCEL_404_REDIRECT_KEY)
    if (!raw) return null
    const v = raw.trim()
    if (!v.startsWith('/')) return null
    return v
  } catch {
    return null
  }
}

function clearVercel404IntendedPath() {
  try {
    sessionStorage.removeItem(VERCEL_404_REDIRECT_KEY)
  } catch {
    // ignore
  }
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function readLastDocHref(activeWorkspaceId: string | null): string | null {
  if (!activeWorkspaceId) return null
  const v = safeLocalStorageGet(`${LAST_DOC_KEY_PREFIX}${activeWorkspaceId}`)
  if (!v) return null
  const href = v.trim()
  if (!href.startsWith('/doc/')) return null
  return href
}

function RootRoute() {
  const ws = useWorkspace()
  const intended = readVercel404IntendedPath()

  // Vercel 404 fallback: only navigate after workspace hydration,
  // otherwise the doc route can show a false "not found" while indexing.
  if (intended) {
    if (ws.phase === 'active' || ws.phase === 'permission' || ws.phase === 'unsupported') {
      clearVercel404IntendedPath()
      return <Navigate to={intended} replace />
    }
    // Keep user on root while we hydrate/scan; we'll redirect once ready.
    if (ws.phase === 'loading') return <LoadingView />
    return <LandingView />
  }

  if (ws.phase === 'unsupported') {
    return <UnsupportedFsView />
  }
  if (ws.phase === 'landing' || ws.phase === 'permission') {
    return <LandingView />
  }
  if (ws.phase === 'loading') {
    return <LoadingView />
  }
  if (ws.phase === 'active') {
    if (ws.docFiles.length === 0) {
      return <NoMarkdownWorkspace />
    }

    // Restore last opened document within this workspace (if still present).
    const lastHref = readLastDocHref(ws.activeWorkspaceId)
    if (lastHref) {
      const encoded = lastHref.slice('/doc/'.length).split('?')[0]?.split('#')[0] ?? ''
      const rel = decodeDocPath(encoded)
      const relFile = stripFragment(rel)
      if (relFile && ws.getFileHandle(relFile)) {
        return <Navigate to={lastHref} replace />
      }
    }

    if (ws.firstDocHref) {
      return <Navigate to={ws.firstDocHref} replace />
    }
  }
  return <LandingView />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/doc/*" element={<DocLayout />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
