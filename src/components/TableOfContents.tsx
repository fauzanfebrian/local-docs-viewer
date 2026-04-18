export type TocItem = {
  depth: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  id: string
}

type TocProps = {
  items: TocItem[]
  activeId?: string | null
  onNavigate?: () => void
}

export function TableOfContents({ items, activeId, onNavigate }: TocProps) {
  if (items.length === 0) return null

  const list = buildNestedToc(items, activeId ?? null, onNavigate)

  return (
    <nav className="toc" aria-label="On this page">
      <h2 className="toc__title">On this page</h2>
      {list}
    </nav>
  )
}

function buildNestedToc(items: TocItem[], activeId: string | null, onNavigate?: () => void) {
  type Node = TocItem & { children: Node[] }
  const root: Node = { id: '__root__', text: '', depth: 1, children: [] }
  const stack: Node[] = [root]

  for (const item of items) {
    const node: Node = { ...item, children: [] }
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= item.depth) stack.pop()
    stack[stack.length - 1]!.children.push(node)
    stack.push(node)
  }

  const render = (nodes: Node[], isRoot = false) => {
    const ulClass = isRoot ? 'toc__list' : 'toc__sublist'
    return (
      <ul className={ulClass}>
        {nodes.map((n) => {
          const isActive = activeId === n.id
          return (
            <li key={n.id} className={`toc__item toc__item--depth-${n.depth}`}>
              <a
                href={`#${n.id}`}
                className={isActive ? 'is-active' : undefined}
                onClick={() => onNavigate?.()}
              >
                {n.text}
              </a>
              {n.children.length > 0 ? render(n.children) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  return render(root.children, true)
}
