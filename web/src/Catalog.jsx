import { useEffect, useMemo, useRef, useState } from 'react'
import Pager from './Pager'
import { pageFromUrl, pageToUrl } from './paging'
import Layout from './Layout'
import ProductCard from './ProductCard'
import { useCatalog } from './community'
import { SearchIcon, ArrowIcon, PackageIcon } from './icons'
import './catalog.css'

const PAGE_SIZE = 12

export default function Catalog() {
  const { products: PRODUCTS } = useCatalog()
  const CATEGORIES = ['All', ...new Set(PRODUCTS.map((p) => p.category))]
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '')
  const [cat, setCat] = useState('All')
  const [sort, setSort] = useState('popular')
  const [page, setPage] = useState(pageFromUrl)
  const grid = useRef(null)
  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    const rows = PRODUCTS.filter((p) => (cat === 'All' || p.category === cat) && (!n || `${p.name} ${p.tagline} ${p.summary} ${p.category} ${p.platform} ${p.publisher?.name ?? ''} ${p.repoName ?? ''}`.toLowerCase().includes(n)))
    // Our own apps first, then by GitHub stars (popular) or by name.
    return sort === 'name' ? [...rows].sort((a, b) => a.name.localeCompare(b.name)) : [...rows].sort((a, b) => Number(!!a.external) - Number(!!b.external) || (b.stars ?? 0) - (a.stars ?? 0))
  }, [q, cat, sort, PRODUCTS])
  // Changing the search, category or sort starts again from page 1.
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } setPage(1) }, [q, cat, sort])
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const shown = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  useEffect(() => { pageToUrl(current) }, [current])
  const go = (n) => { setPage(n); grid.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  return (
    <Layout banner={false}>
      <div className="cat-head">
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Products</span></nav>
          <h1>All products</h1>
          <p>Small, polished apps for your desktop. Free to download.</p>
        </div>
      </div>
      <div className="wrap cat">
        <div className="cat__bar">
          <label className="cat__search"><SearchIcon /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" maxLength={60} /></label>
          <div className="seg" role="group" aria-label="Category">{CATEGORIES.map((c) => <button key={c} className={cat === c ? 'on' : ''} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>
          <select className="cat__sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort"><option value="popular">Most popular</option><option value="name">Name A to Z</option></select>
          <span className="cat__n" aria-live="polite">{list.length ? `${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, list.length)} of ${list.length}` : '0'} {list.length === 1 ? 'product' : 'products'}</span>
        </div>
        <div className="cat__grid" ref={grid}>
          {shown.map((p) => <ProductCard key={p.slug} p={p} />)}
          {!q && cat === 'All' && current === pages && (
            <div className="cc cc--soon"><span className="cc__soon-i"><PackageIcon /></span><h2>More on the way</h2><p>Build something? Apply as a collaborator and publish your app here.</p><a className="link" href="/developers/">Publish your own app <ArrowIcon /></a></div>
          )}
        </div>
        <Pager page={current} pages={pages} onPage={go} label="Products pages" />
        {!list.length && <div className="cat__empty"><h2>No products found</h2><p>Try a different search term.</p><button className="btn-g" onClick={() => { setQ(''); setCat('All') }}>Clear filters</button></div>}
      </div>
    </Layout>
  )
}
