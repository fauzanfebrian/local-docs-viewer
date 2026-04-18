import { buildFileTree } from '../lib/fileTree'
import { useWorkspace } from '../context/WorkspaceContext'
import { FileTreeNav } from './FileTreeNav'

export function WorkspaceSidebarContent() {
  const ws = useWorkspace()
  const tree = buildFileTree(ws.docFiles.map((f) => f.relPath))

  return (
    <>
      <div className="sidebar__brand">Personal docs</div>

      {ws.workspaces.length > 0 ? (
        <label className="sidebar__field">
          <span className="sidebar__field-label">Workspace</span>
          <select
            className="sidebar__select"
            value={ws.activeWorkspaceId ?? ''}
            onChange={(e) => void ws.setActiveWorkspaceId(e.target.value)}
          >
            {ws.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {ws.needsPermissionRestore ? (
        <div className="sidebar__callout" role="status">
          <p className="sidebar__callout-text">Read access must be restored for this tab.</p>
          <button type="button" className="btn-primary btn-primary--small" onClick={() => void ws.restoreWorkspaceAccess()}>
            Restore Workspace Access
          </button>
        </div>
      ) : null}

      <div className="sidebar__actions">
        <button type="button" className="btn-secondary" onClick={() => void ws.openFolderPicker()}>
          Add folder…
        </button>
      </div>

      {ws.errorMessage ? (
        <p className="sidebar__error" role="alert">
          {ws.errorMessage}
        </p>
      ) : null}

      <nav className="sidebar__nav" aria-label="Documents">
        {ws.needsPermissionRestore ? (
          <p className="sidebar__empty">Restore access to refresh the file list.</p>
        ) : (
          <FileTreeNav nodes={tree} />
        )}
      </nav>
    </>
  )
}

export function WorkspaceSidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__inner">
        <WorkspaceSidebarContent />
      </div>
    </aside>
  )
}
