import { Navigate, Route, Routes } from 'react-router-dom'

import { DocLayout } from './components/DocLayout'
import { LandingView } from './components/LandingView'
import { LoadingView } from './components/LoadingView'
import { NoMarkdownWorkspace } from './components/NoMarkdownWorkspace'
import { UnsupportedFsView } from './components/UnsupportedFsView'
import { useWorkspace } from './context/WorkspaceContext'

function RootRoute() {
  const ws = useWorkspace()

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
