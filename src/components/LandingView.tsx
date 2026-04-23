import { useWorkspace } from '../context/WorkspaceContext'

export function LandingView() {
  const ws = useWorkspace()
  const isPermission = ws.phase === 'permission'

  return (
    <div className="app-shell app-shell--empty">
      <div className="landing-panel">
        <h1 className="landing-panel__title">Personal docs</h1>
        <p className="landing-panel__lead">
          This viewer runs entirely in your browser. Choose a folder on your device; nothing is uploaded
          to a server. Supported: <code className="inline-code">.md</code>, <code className="inline-code">.markdown</code>,{' '}
          <code className="inline-code">.mmd</code>, <code className="inline-code">.txt</code>, <code className="inline-code">.pdf</code>, and images. Heavy folders like{' '}
          <code className="inline-code">node_modules</code> or <code className="inline-code">.git</code>{' '}
          are skipped.
        </p>
        {isPermission ? (
          <div className="landing-panel__callout" role="status">
            <p className="landing-panel__callout-text">
              Your saved workspace <strong>{ws.activeRootName ?? 'folder'}</strong> needs read access again
              after reload. Restore access to continue without picking the folder again.
            </p>
            <button type="button" className="btn-primary" onClick={() => void ws.restoreWorkspaceAccess()}>
              Restore Workspace Access
            </button>
          </div>
        ) : (
          <div className="landing-panel__actions">
            <button type="button" className="btn-primary" onClick={() => void ws.openFolderPicker()}>
              Open Folder
            </button>
          </div>
        )}
        {ws.errorMessage ? (
          <p className="landing-panel__error" role="alert">
            {ws.errorMessage}
          </p>
        ) : null}
        {ws.workspaces.length > 0 && (isPermission || ws.phase === 'landing') ? (
          <p className="landing-panel__footer">
            <button type="button" className="btn-link" onClick={() => void ws.removeActiveWorkspace()}>
              Forget current saved folder
            </button>
          </p>
        ) : null}
      </div>
    </div>
  )
}
