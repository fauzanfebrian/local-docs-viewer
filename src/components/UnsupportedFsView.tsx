export function UnsupportedFsView() {
  return (
    <div className="app-shell app-shell--empty">
      <div className="landing-panel">
        <h1 className="landing-panel__title">Unsupported browser</h1>
        <p className="landing-panel__lead">
          This viewer needs the{' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API"
            target="_blank"
            rel="noreferrer noopener"
          >
            File System Access API
          </a>
          . Use a recent Chromium-based desktop browser over HTTPS (or localhost).
        </p>
      </div>
    </div>
  )
}
