import type { TocItem } from '../lib/parseToc'

type TocProps = {
  items: TocItem[]
}

export function TableOfContents({ items }: TocProps) {
  if (items.length === 0) return null

  return (
    <nav className="toc" aria-label="On this page">
      <h2 className="toc__title">On this page</h2>
      <ul className="toc__list">
        {items.map((item, index) => (
          <li
            key={`${index}-${item.id}`}
            className={`toc__item toc__item--depth-${item.depth}`}
          >
            <a href={`#${item.id}`}>{item.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
