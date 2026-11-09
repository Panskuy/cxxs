import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }
const url = (slug) => `/api/web/products/${slug}/stats`

/** Public numbers for a product (people who downloaded, rating) plus the viewer's own rating. */
export function useStats(slug) {
  const { status } = useAuth()
  const [stats, setStats] = useState(null)
  const load = useCallback(async () => {
    try {
      const r = await fetch(url(slug), { credentials: 'include', headers: H })
      if (r.ok) setStats(await r.json())
    } catch { /* numbers are optional */ }
  }, [slug])
  useEffect(() => {
    if (status === 'loading') return
    load()
  }, [load, status])
  useEffect(() => {
    const on = () => load()
    window.addEventListener('stats:refresh', on)
    return () => window.removeEventListener('stats:refresh', on)
  }, [load])
  return [stats, load]
}

const STAR = 'M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4 6 20.7l1.3-6.6L2.4 9.5l6.7-.8z'

export function Stars({ value = 0, size = 16, className = '' }) {
  return (
    <span className={`stars ${className}`} role="img" aria-label={`${value} out of 5 stars`} style={{ '--sz': `${size}px` }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)))
        return (
          <svg key={i} viewBox="0 0 24 24" aria-hidden="true">
            <defs><clipPath id={`sc-${i}-${size}`}><rect width={24 * fill} height="24" /></clipPath></defs>
            <path d={STAR} className="stars__bg" />
            <path d={STAR} className="stars__fg" clipPath={`url(#sc-${i}-${size})`} />
          </svg>
        )
      })}
    </span>
  )
}

const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** One short line: stars, average and how many people downloaded it. */
export function StatLine({ slug }) {
  const [s] = useStats(slug)
  if (!s) return <div className="statline statline--ph" aria-hidden="true">&nbsp;</div>
  return (
    <div className="statline mono">
      {s.rating.count ? (
        <span className="statline__r"><Stars value={s.rating.avg} size={14} /> <b>{s.rating.avg.toFixed(1)}</b> <i>({s.rating.count})</i></span>
      ) : (
        <span className="statline__r statline__r--none">No ratings yet</span>
      )}
      <span className="statline__d">{plural(s.users, 'user', 'users')} downloaded</span>
    </div>
  )
}

/** Full block for a product page: score, bars, your rating, latest reviews. */
export function RatingPanel({ slug, name }) {
  const { status, openLogin, say } = useAuth()
  const [s, load] = useStats(slug)
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (s?.mine) { setStars(s.mine.stars); setComment(s.mine.comment ?? '') }
    else if (s && !s.mine) { setStars(0); setComment('') }
  }, [s?.mine?.stars, s?.mine?.comment, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!stars) return say('Pick a star rating first.', 'err')
    setBusy(true)
    try {
      const r = await fetch(`/api/web/products/${slug}/rating`, { method: 'PUT', credentials: 'include', headers: H, body: JSON.stringify({ stars, comment: comment.trim() || undefined }) })
      if (r.status === 401) return openLogin({ title: 'Sign in to rate', text: 'Sign in to leave a rating.' })
      if (r.status === 403) return say('Download it first, then you can rate it.', 'err')
      if (r.status === 429) return say('Too many changes. Try again later.', 'err')
      if (!r.ok) throw new Error()
      say('Thanks for rating!')
      await load()
    } catch { say('Could not save your rating.', 'err') } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await fetch(`/api/web/products/${slug}/rating`, { method: 'DELETE', credentials: 'include', headers: H })
      await load()
      say('Rating removed.')
    } finally { setBusy(false) }
  }

  const total = s?.rating.count ?? 0
  const shown = hover || stars

  return (
    <div className="rate">
      <div className="rate__top">
        <div className="rate__score">
          <b>{total ? s.rating.avg.toFixed(1) : '–'}</b>
          <Stars value={s?.rating.avg ?? 0} size={20} />
          <span className="mono">{total ? plural(total, 'rating', 'ratings') : 'No ratings yet'}</span>
        </div>
        <div className="rate__bars" aria-hidden="true">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = s?.rating.dist[n - 1] ?? 0
            return (
              <div key={n} className="rate__bar"><span className="mono">{n}</span><i><u style={{ width: total ? `${(c / total) * 100}%` : 0 }} /></i><span className="mono">{c}</span></div>
            )
          })}
        </div>
        <div className="rate__users">
          <b>{(s?.users ?? 0).toLocaleString('en-US')}</b>
          <span className="mono">{s?.users === 1 ? 'user' : 'users'} downloaded</span>
          <small className="mono">{(s?.downloads ?? 0).toLocaleString('en-US')} downloads in total</small>
        </div>
      </div>

      <div className="rate__mine">
        {status === 'user' ? (
          s?.canRate ? (
            <>
              <h4>{s.mine ? 'Your rating' : `Rate ${name}`}</h4>
              <div className="rate__pick" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => setStars(n)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} /></svg>
                  </button>
                ))}
              </div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={280} rows={2} placeholder="Say a little about it (optional)" aria-label="Review" />
              <div className="rate__act">
                <button className="btn-p" onClick={send} disabled={busy || !stars}><span>{s.mine ? 'Update rating' : 'Submit rating'}</span></button>
                {s.mine && <button className="btn-g" onClick={remove} disabled={busy}>Remove</button>}
              </div>
            </>
          ) : (
            <p className="rate__hint">Download {name} to leave a rating.</p>
          )
        ) : status === 'anon' ? (
          <p className="rate__hint">
            <button className="rate__link" onClick={() => openLogin({ title: 'Sign in to rate', text: 'Sign in, download the app, then leave a rating.' })}>Sign in</button> to rate {name} once you have downloaded it.
          </p>
        ) : null}
      </div>

      {!!s?.reviews.length && (
        <ul className="rate__list">
          {s.reviews.map((r) => (
            <li key={r.id}>
              <Stars value={r.stars} size={13} /><p>{r.comment}</p><span className="mono">{r.name}</span>
              <Reply slug={slug} review={r} canReply={!!s.canReply} onChange={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The author's public answer under a review, with a small editor for the author. */
function Reply({ slug, review, canReply, onChange }) {
  const { say } = useAuth()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(review.reply?.text ?? '')
  const [busy, setBusy] = useState(false)
  const api = `/api/web/products/${slug}/ratings/${review.id}/reply`
  const save = async () => {
    if (!text.trim()) return say('Write a reply first.', 'err')
    setBusy(true)
    try {
      const r = await fetch(api, { method: 'PUT', credentials: 'include', headers: H, body: JSON.stringify({ text: text.trim() }) })
      if (r.status === 429) return say('Too many replies. Try again later.', 'err')
      if (!r.ok) throw new Error()
      setOpen(false); say('Reply posted.'); await onChange()
    } catch { say('Could not save your reply.', 'err') } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!confirm('Delete your reply?')) return
    setBusy(true)
    try { await fetch(api, { method: 'DELETE', credentials: 'include', headers: H }); setOpen(false); setText(''); say('Reply deleted.'); await onChange() } finally { setBusy(false) }
  }
  return (
    <>
      {review.reply && !open && (
        <div className="rate__reply">
          <b className="mono">Reply from {review.reply.by}</b>
          <p>{review.reply.text}</p>
        </div>
      )}
      {canReply && !open && (
        <button className="rate__link rate__rbtn" onClick={() => { setText(review.reply?.text ?? ''); setOpen(true) }}>{review.reply ? 'Edit reply' : 'Reply'}</button>
      )}
      {canReply && open && (
        <div className="rate__rform">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} autoFocus placeholder="Reply to this review (public)" aria-label="Reply" />
          <div className="rate__act">
            <button className="btn-p" onClick={save} disabled={busy || !text.trim()}><span>{review.reply ? 'Save reply' : 'Post reply'}</span></button>
            <button className="btn-g" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            {review.reply && <button className="btn-g" onClick={remove} disabled={busy}>Delete</button>}
          </div>
        </div>
      )}
    </>
  )
}

/** Latest written reviews across several products, newest first, each tagged with the product's name. */
export function useAllReviews(products) {
  const [items, setItems] = useState(null)
  const key = products.map((p) => p.slug).join(',')
  useEffect(() => {
    let live = true
    Promise.all(products.map((p) => fetch(url(p.slug), { credentials: 'include', headers: H }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((s) => (s?.reviews ?? []).map((r) => ({ ...r, product: p.name })))))
      .then((all) => live && setItems(all.flat().sort((a, b) => String(b.at).localeCompare(String(a.at)))))
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return items
}

/** Totals across products: how many different people downloaded something. Falls back to per-product sums. */
export function useTotals(products) {
  const [t, setT] = useState(null)
  const key = products.map((p) => p.slug).join(',')
  useEffect(() => {
    let live = true
    Promise.all(products.map((p) => fetch(url(p.slug), { credentials: 'include', headers: H }).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((all) => live && setT({ downloads: all.reduce((a, s) => a + (s?.downloads ?? 0), 0), ratings: all.reduce((a, s) => a + (s?.rating.count ?? 0), 0) }))
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return t
}
