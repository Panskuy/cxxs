import { useEffect, useState } from 'react'
import { useAuth, DownloadButton } from './auth'
import Layout from './Layout'
import { RatingPanel, StatLine } from './Rating'
import { bySlug } from './catalog'
import { cj, toProduct, fmtStars } from './community'
import { RICH } from './productpages'
import Markdown from './Markdown'
import { ShieldIcon, CheckIcon, WindowsIcon, CodeIcon, PackageIcon } from './icons'
import './product.css'

// `code` and **bold** in plain strings from catalog.js
const rich = (text) => text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((s, i) => (s.startsWith('`') ? <code key={i}>{s.slice(1, -1)}</code> : s.startsWith('**') ? <b key={i}>{s.slice(2, -2)}</b> : s))

const slugFromPath = () => location.pathname.split('/').filter(Boolean)[1] ?? ''

function Missing() {
  return (
    <Layout banner={false}>
      <div className="wrap" style={{ padding: '80px 0', textAlign: 'center' }}>
        <h1>Product not found</h1><p style={{ color: 'var(--muted)', margin: '10px 0 22px' }}>We couldn’t find that product.</p>
        <a className="btn-g" href="/products/">Browse products</a>
      </div>
    </Layout>
  )
}

export default function Product() {
  const slug = slugFromPath()
  const own = bySlug(slug)
  const [remote, setRemote] = useState(own ? { state: 'ok', p: own } : { state: 'loading' })
  useEffect(() => {
    if (own) return
    cj(`catalog/${encodeURIComponent(slug)}`).then((r) => setRemote(r.ok ? { state: 'ok', p: toProduct(r.data.item) } : { state: 'missing' }))
  }, [slug, own])
  if (remote.state === 'loading') return <Layout banner={false}><div className="wrap" style={{ padding: '120px 0', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div></Layout>
  if (remote.state === 'missing') return <Missing />
  return <ProductView p={remote.p} />
}

/** Main picture: the app's own image from GitHub when there is one, otherwise a tidy tile. */
function Hero({ p }) {
  const [broken, setBroken] = useState(false)
  if (p.cover && !broken) return <div className="pd__cover pd__cover--img"><img src={p.cover} alt={`${p.name} preview`} referrerPolicy="no-referrer" onError={() => setBroken(true)} /></div>
  const facts = [p.version, p.platform, p.license].filter(Boolean)
  return (
    <div className="pd__cover">
      <span aria-hidden="true">{p.name[0].toUpperCase()}</span><b>{p.name}</b><p>{p.tagline}</p>
      {facts.length > 0 && <div className="pd__facts">{facts.map((f) => <i key={f}>{f}</i>)}</div>}
    </div>
  )
}

function ProductView({ p }) {
  const { status } = useAuth()
  const R = RICH[p.slug] ?? {}
  const soon = p.status === 'soon'
  const ext = !!p.external // listed from GitHub: downloads happen on GitHub, so no ratings or download counts here
  const link = (href, text) => <a className="link" href={href} target="_blank" rel="noreferrer">{text}</a>
  const github = p.community ? [
    ['Owner', p.repoOwner ? link(`https://github.com/${p.repoOwner}`, `@${p.repoOwner}`) : null],
    ['Repository', p.repoName ? link(p.repo, p.repoName) : null],
    ['Release', p.releaseUrl ? link(p.releaseUrl, `${p.version} on GitHub`) : null],
    ...(ext ? [['GitHub stars', p.stars != null ? p.stars.toLocaleString('en-US') : null]] : [['SHA-256', p.sha256 ? <code className="hash">{p.sha256}</code> : null]]),
  ] : []
  const specs = [['Version', p.version], ...github, ['Platform', p.requirements ?? p.platform], ['License', p.license], ['Price', p.price], ...(ext || p.community ? [] : [['Download size', p.size], ['File', p.file]]), ...(p.community && !ext ? [['Download size', p.size], ['File', p.file]] : []), ...(p.specs ?? [])].filter(([, v]) => v)
  const nav = [['overview', 'Overview'], p.details && ['about', 'About'], (R.Features || p.features) && ['features', 'Features'], ['specs', 'Specifications'], p.install && ['install', 'Install'], p.faq && ['faq', 'FAQ'], !soon && !ext && ['reviews', 'Reviews']].filter(Boolean)

  return (
    <Layout banner={false}>
      <div className="pd wrap">
        <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/products/">Products</a><span>/</span><span aria-current="page">{p.name}</span></nav>

        <div className="pd__top">
          <div className="pd__media">
            {R.Visual ? <R.Visual /> : <Hero p={p} />}
          </div>
          <aside className="buy" aria-label={`Get ${p.name}`}>
            <div className="pc__tags"><span className="tag">{p.category}</span>{soon ? <span className="tag tag--warn">Coming soon</span> : <span className="tag tag--ok">{p.price}</span>}</div>
            <h1>{p.name}</h1>
            <p className="buy__tag">{p.tagline}</p>
            {!soon && !ext && <a className="buy__rate" href="#reviews"><StatLine slug={p.slug} /></a>}
            {ext && p.stars != null && <p className="buy__stars">★ {fmtStars(p.stars)} stars on GitHub</p>}
            <div className="buy__price"><b>{p.price}</b><span>{soon ? 'Not released yet' : 'No payment needed'}</span></div>
            {ext
              ? <a className="btn-p btn-p--lg btn-p--block" href={p.releaseUrl} target="_blank" rel="noopener noreferrer"><span className="btn-p__t">Download from GitHub</span><small>{p.version} · {p.platform}</small></a>
              : soon
              ? <button className="btn-p btn-p--lg btn-p--block" disabled><span className="btn-p__t">Coming soon</span></button>
              : <DownloadButton slug={p.slug} label={`Download ${p.version}`} sub={`${p.size} · ${p.platform}`} variant="large" className="btn-p--block" />}
            {status === 'anon' && !soon && !ext && <p className="buy__note">Create a free account to download. It only takes a minute.</p>}
            {ext && <p className="buy__note">The download comes straight from the project’s own GitHub release page.</p>}
            <ul className="buy__facts">
              <li>{p.platform === 'Windows' ? <WindowsIcon /> : <PackageIcon />} {p.requirements ?? p.platform}</li>
              {!soon && !ext && <li><ShieldIcon /> Verified against its SHA-256 fingerprint</li>}
              {p.community && !ext && <li><CheckIcon /> Reviewed by CXXS before publishing</li>}
              {ext && <li><CodeIcon /> Open source on GitHub</li>}
              {p.license && <li><CodeIcon /> {p.license} license</li>}
            </ul>
            {p.repo && <a className="btn-g buy__src" href={p.repo} target="_blank" rel="noreferrer">{p.community ? 'View on GitHub' : 'View source'}</a>}
          </aside>
        </div>

        <nav className="pd__nav" aria-label="Product sections">{nav.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}</nav>

        <section className="pd__s" id="overview">
          <h2>Overview</h2>
          <p className="lead">{p.summary}</p>
          {p.community && p.publisher && (
            <div className="pub">
              <span className="pub__av" aria-hidden="true">{p.publisher.name[0].toUpperCase()}</span>
              <div><b>{ext ? `Made by ${p.publisher.name}` : `Published by ${p.publisher.name}`}</b><p>{ext ? 'Listed from GitHub for convenience. CXXS did not build or review this app. Check the project page and its license before you install it.' : 'A community app. CXXS reviewed the developer and this release before it went live, and the file is verified against the SHA-256 shown in the specifications.'}</p></div>
              <div className="pub__links">
                <a className="link" href={`https://github.com/${p.repoOwner ?? p.publisher.github}`} target="_blank" rel="noreferrer">Owner: @{p.repoOwner ?? p.publisher.github}</a>
                {p.repoName && <a className="link" href={p.repo} target="_blank" rel="noreferrer">Repo: {p.repoName}</a>}
                {p.publisher.website && <a className="link" href={p.publisher.website} target="_blank" rel="noreferrer">Website</a>}
              </div>
            </div>
          )}
          {R.Overview && <R.Overview />}
        </section>

        {p.details && (
          <section className="pd__s" id="about">
            <h2>About {p.name}</h2>
            <Markdown text={p.details} />
          </section>
        )}

        {(R.Features || p.features) && <section className="pd__s" id="features">
          <h2>Features</h2>
          {R.Features ? <R.Features /> : (
            <div className="gest">{(p.features ?? []).map(([t, d]) => <div key={t}><span><CheckIcon /></span><b>{t}</b><p>{d}</p></div>)}</div>
          )}
        </section>}

        <section className="pd__s" id="specs">
          <h2>Specifications</h2>
          <dl className="specs">{specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </section>

        {p.install && (
          <section className="pd__s" id="install">
            <h2>Install</h2>
            <ol className="inst">{p.install.map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><b>{t}</b><p>{rich(d)}</p></div></li>)}</ol>
            {p.notes && <div className="notes">{p.notes.map(([t, d]) => <div key={t}><h4>{t}</h4><p>{rich(d)}</p></div>)}</div>}
          </section>
        )}

        {p.faq && (
          <section className="pd__s" id="faq">
            <h2>Questions</h2>
            <div className="faq faq--pd">{p.faq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{rich(a)}</p></details>)}</div>
          </section>
        )}

        {!soon && !ext && (
          <section className="pd__s" id="reviews">
            <h2>Ratings and reviews</h2>
            <RatingPanel slug={p.slug} name={p.name} />
          </section>
        )}
      </div>
    </Layout>
  )
}
