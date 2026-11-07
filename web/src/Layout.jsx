import { useState } from 'react'
import { useAuth, loginHref } from './auth'
import { LATEST, productUrl } from './catalog'
import { useCatalog } from './community'
import AccountMenu from './AccountMenu'
import { SearchIcon, MenuIcon, CloseIcon, BoltIcon } from './icons'
import './layout.css'

const NAV = [
  ['/products/', 'Products'],
  ['/#features', 'Why CXXS'],
  ['/developers/', 'Developers'],
  ['/#how', 'How it works'],
  ['/#faq', 'FAQ'],
]

export const Brand = () => (
  <a href="/" className="brand" aria-label="CXXS home">
    <span className="brand__mark" aria-hidden="true"><BoltIcon /></span>CXXS
  </a>
)

function SearchBox({ className, onDone }) {
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '')
  return (
    <form className={className} role="search" action="/products/" onSubmit={onDone}>
      <SearchIcon />
      <input name="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" maxLength={60} />
    </form>
  )
}

export function Header({ banner = true }) {
  const { status, me, openLogin } = useAuth()
  const [open, setOpen] = useState(false)
  const path = location.pathname
  return (
    <>
      {banner && <div className="ann">New: {LATEST.name} {LATEST.version}, {LATEST.tagline.charAt(0).toLowerCase() + LATEST.tagline.slice(1)}. Free to download.<a href={productUrl(LATEST)}>See what’s new →</a></div>}
      <header className="hdr">
        <div className="wrap hdr__in">
          <Brand />
          <nav aria-label="Main">{NAV.map(([h, l]) => <a key={h} href={h} aria-current={h === path ? 'page' : undefined}>{l}</a>)}</nav>
          <SearchBox className="hdr__search" />
          <div className="hdr__r">
            {status === 'user' && me ? (
              <>
                {me.user.role === 'ADMIN' && <a className="hdr__admin hide-s" href="/admin/">Admin</a>}
                <AccountMenu me={me} />
              </>
            ) : status === 'anon' ? (
              <>
                <button className="btn-g hide-s" onClick={() => openLogin({ title: 'Sign in', text: 'Welcome back. Sign in to download and manage your account.' })}>Sign in</button>
                <button className="btn-p" onClick={() => openLogin({ mode: 'register' })}>Sign up</button>
              </>
            ) : null}
            <button className="burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <CloseIcon /> : <MenuIcon />}</button>
          </div>
        </div>
        {open && (
          <div className="mnav">
            <SearchBox />
            {NAV.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)}>{l}</a>)}
            {status === 'anon' && <a href={loginHref}>Sign in</a>}
            {me?.user.role === 'ADMIN' && <a href="/admin/">Admin console</a>}
          </div>
        )}
      </header>
    </>
  )
}

export function Footer() {
  const { products } = useCatalog()
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr__grid">
          <div><Brand /><p>Small, polished apps for your desktop. Free to download, easy to remove.</p></div>
          <div><h4>Store</h4><ul><li><a href="/products/">All products</a></li>{products.slice(0, 6).map((p) => <li key={p.slug}><a href={productUrl(p)}>{p.name}</a></li>)}<li><a href="/#how">How it works</a></li></ul></div>
          <div><h4>Account</h4><ul><li><a href={loginHref}>Sign in</a></li><li><a href="/account/">My account</a></li><li><a href="/account/#downloads">My downloads</a></li><li><a href="/developers/">Publish an app</a></li></ul></div>
          <div><h4>Resources</h4><ul><li><a href="/#faq">FAQ</a></li><li><a href="/#features">Why CXXS</a></li></ul></div>
        </div>
        <div className="ftr__bar"><span>© 2026 CXXS. All rights reserved.</span><span>cxxs.my.id</span></div>
      </div>
    </footer>
  )
}

export default function Layout({ children, banner = true }) {
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Header banner={banner} />
      <main id="main">{children}</main>
      <Footer />
    </>
  )
}
