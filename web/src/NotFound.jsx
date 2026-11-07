import Layout from './Layout'
import { SearchIcon } from './icons'
import './notfound.css'

// Shown by the web server for any address that does not exist.
export default function NotFound() {
  const path = decodeURIComponent(window.location.pathname + window.location.search).slice(0, 80)
  return (
    <Layout banner={false}>
      <div className="nf">
        <p className="nf__code">404</p>
        <h1>We can’t find that page</h1>
        <p className="nf__sub">The address <code>{path}</code> doesn’t exist, or it has moved.</p>
        <form className="nf__search" role="search" action="/products/">
          <SearchIcon /><input name="q" type="search" placeholder="Search products" aria-label="Search products" maxLength={60} />
          <button className="btn-p" type="submit">Search</button>
        </form>
        <div className="nf__links"><a className="btn-g" href="/">Back to home</a><a className="btn-g" href="/products/">Browse products</a></div>
      </div>
    </Layout>
  )
}
