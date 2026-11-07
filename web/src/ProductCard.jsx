import './catalog.css'
import { DownloadButton } from './auth'
import { StatLine } from './Rating'
import { fmtStars } from './community'
import { useState } from 'react'
import { productUrl } from './catalog'
import { WindowsIcon, PackageIcon } from './icons'
import { RICH } from './productpages'
import Shot from './Shot'

const initial = (p) => p.name[0].toUpperCase()

/** The picture on a card: the product's own preview when it has one, otherwise a tidy tile with its name. */
function Cover({ p }) {
  const [broken, setBroken] = useState(false)
  if (RICH[p.slug]) return <div className="cc__vis cc__vis--wall"><Shot id="player" pad={28} /></div>
  if (p.cover && !broken) return <div className="cc__vis cc__vis--img"><img src={p.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /></div>
  return <div className="cc__vis cc__vis--tile"><span aria-hidden="true">{initial(p)}</span><b>{p.name}</b></div>
}

export default function ProductCard({ p }) {
  const href = productUrl(p)
  const soon = p.status === 'soon'
  return (
    <article className="cc">
      <a href={href} aria-label={`Open ${p.name}`} tabIndex={-1}><Cover p={p} /></a>
      <div className="cc__body">
        <div className="pc__tags">
          <span className="tag">{p.category}</span>
          <span className="tag">{p.platform === 'Windows' ? <WindowsIcon /> : <PackageIcon />} {p.platform}</span>
          {soon && <span className="tag tag--warn">Coming soon</span>}
          {p.external ? <span className="tag tag--info">Open source</span> : p.community && <span className="tag tag--info">Community</span>}
        </div>
        <h2><a href={href}>{p.name}</a></h2>
        <p className="cc__tag">{p.tagline}</p>
        {p.community && p.repoName && <p className="cc__by">by <a href={`https://github.com/${p.repoOwner}`} target="_blank" rel="noreferrer">@{p.repoOwner}</a> · <a href={p.repo} target="_blank" rel="noreferrer">{p.repoName}</a>{p.external && p.stars != null ? ` · ★ ${fmtStars(p.stars)}` : ''}</p>}
        {!soon && !p.external && <StatLine slug={p.slug} />}
        <div className="cc__foot">
          <div className="cc__price"><b>{p.price}</b><span>{soon ? 'Not released yet' : p.external ? `${p.version} · ${p.platform}` : `${p.version} · ${p.size}`}</span></div>
          {soon || p.external ? <a className="btn-g" href={href}>{p.external ? 'View' : 'Details'}</a> : <DownloadButton slug={p.slug} label="Download" variant="nav" />}
        </div>
      </div>
    </article>
  )
}
