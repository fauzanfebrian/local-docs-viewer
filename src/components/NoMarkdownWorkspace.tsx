import { WorkspaceSidebar } from './WorkspaceSidebar'

export function NoMarkdownWorkspace() {
  return (
    <div className="app-shell">
      <WorkspaceSidebar />
      <main className="main">
        <p className="empty-state">
          This folder does not contain any supported documents (
          <code className="inline-code">.md</code>, <code className="inline-code">.markdown</code>,{' '}
          <code className="inline-code">.txt</code>, <code className="inline-code">.pdf</code>). Nested
          folders are scanned, with heavy directories ignored.
        </p>
      </main>
    </div>
  )
}
