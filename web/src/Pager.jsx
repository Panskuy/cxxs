import { pageList } from './paging'
import './pager.css'

/** Numbered pagination for the store pages. */
export default function Pager({ page, pages, onPage, label = 'Pagination', tight = false }) {
  if (pages <= 1) return null
  return (
    <nav className={`pager ${tight ? 'pager--tight' : ''}`} aria-label={label}>
      <button className="pager__b" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">← Previous</button>
      <ul>
        {pageList(page, pages).map((n, i) => (n === null
          ? <li key={`gap${i}`} className="pager__gap" aria-hidden="true">…</li>
          : <li key={n}><button className={`pager__n ${n === page ? 'on' : ''}`} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} onClick={() => onPage(n)}>{n}</button></li>))}
      </ul>
      <button className="pager__b" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">Next →</button>
    </nav>
  )
}
