import { WorkspaceProvider } from './context/WorkspaceContext'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <WorkspaceProvider>
      <AppRoutes />
    </WorkspaceProvider>
  )
}
