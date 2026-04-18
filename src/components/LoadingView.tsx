type Props = {
  label?: string
}

export function LoadingView({ label = 'Indexing Markdown files…' }: Props) {
  return (
    <div className="app-shell app-shell--empty">
      <p className="loading-indicator" aria-busy="true">
        {label}
      </p>
    </div>
  )
}
