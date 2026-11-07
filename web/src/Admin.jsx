import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth'
import Markdown from './Markdown'
import { pageFromUrl, pageList, pageToUrl } from './paging'

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }
const call = async (path, method = 'GET', body) => {
  try {
    const r = await fetch(`/api/web/admin/${path}`, { method, credentials: 'include', headers: H, body: body ? JSON.stringify(body) : undefined })
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }
  } catch { return { ok: false, status: 0, data: {} } }
}
const fmt = (n) => Number(n ?? 0).toLocaleString('en-US')
const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const rel = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/* ---------- icons ---------- */
const Ic = ({ d, children }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children ?? <path d={d} />}</svg>
const I = {
  dash: <Ic><rect x="3.5" y="3.5" width="7" height="8" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.6" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.6" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.6" /></Ic>,
  users: <Ic><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7" /><path d="M16 5.6a3.1 3.1 0 010 5.8M17.5 14.6c1.8.6 2.7 2.2 3 4.4" /></Ic>,
  down: <Ic><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" /></Ic>,
  act: <Ic><path d="M3.5 12h4l2.5-6.5 4 13 2.5-6.5h4" /></Ic>,
  star: <Ic><path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8 6.9 19.5l1-5.7-4.1-4 5.7-.8z" /></Ic>,
  menu: <Ic><path d="M4 7h16M4 12h16M4 17h16" /></Ic>,
  sun: <Ic><circle cx="12" cy="12" r="3.8" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></Ic>,
  moon: <Ic><path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z" /></Ic>,
  refresh: <Ic><path d="M19.5 8A8 8 0 006 6.5L4 9M4 4.5V9h4.5M4.5 16A8 8 0 0018 17.5L20 15M20 19.5V15h-4.5" /></Ic>,
  bolt: <Ic><path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" /></Ic>,
  shield: <Ic><path d="M12 3l7 3v5.5c0 4.2-2.8 7.4-7 9.5-4.2-2.100-7-5.300-7-9.500V6l7-3Z" /><path d="M9 12l2.200 2.200L15.500 10" /></Ic>,
  pkg: <Ic><path d="M12 3l8 4.200v9.600L12 21l-8-4.200V7.200L12 3Z" /><path d="M4.400 7.400L12 11.600l7.600-4.200M12 11.600V21" /></Ic>,
  more: <Ic><circle cx="5.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18.5" cy="12" r="1" /></Ic>,
  out: <Ic><path d="M14 4.5H6.5a1.5 1.5 0 00-1.5 1.5v12a1.5 1.5 0 001.5 1.5H14M10 12h10M17 8.5l3.5 3.5-3.5 3.5" /></Ic>,
  lock: <Ic><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></Ic>,
  ext: <Ic><path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v4a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 015 18V9.5A1.5 1.5 0 016.5 8H10" /></Ic>,
  search: <Ic><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></Ic>,
}

/* ---------- small pieces ---------- */
const Pill = ({ tone = 'neutral', children }) => <span className={`pill pill--${tone}`}><i />{children}</span>
const Avatar = ({ name, email }) => <span className="av" aria-hidden="true">{(name || email || '?')[0].toUpperCase()}</span>
const Skeleton = ({ rows = 5 }) => <div className="sk" aria-busy="true">{Array.from({ length: rows }, (_, i) => <i key={i} style={{ width: `${92 - (i % 3) * 14}%` }} />)}</div>
const Empty = ({ children }) => <div className="empty">{children}</div>

/** Numbered pagination under a table or list (server-side: the API returns one page at a time). */
function AdminPager({ page, pages, total, onPage, noun = 'items' }) {
  return (
    <footer className="pager">
      <span>{fmt(total)} {total === 1 ? noun.replace(/s$/, '') : noun}</span>
      {pages > 1 && (
        <nav aria-label="Pagination">
          <button className="btn btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          {pageList(page, pages).map((n, i) => (n === null ? <span key={`g${i}`} className="pager__gap">…</span> : <button key={n} className={`pg ${n === page ? 'on' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>))}
          <button className="btn btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </nav>
      )}
    </footer>
  )
}

/** Page number that survives a reload (?page=N) and starts again from 1 when `reset` values change. */
function usePage(...reset) {
  const [page, setPage] = useState(pageFromUrl)
  const first = useRef(true)
  const key = JSON.stringify(reset)
  useEffect(() => { if (first.current) { first.current = false; return } setPage(1) }, [key])
  useEffect(() => { pageToUrl(page) }, [page])
  return [page, setPage]
}

/** A 14-day bar chart: one series, so no legend; the card title names it. Hover shows the exact value. */
function Bars({ title, hint, data, tone = 'a' }) {
  const [hi, setHi] = useState(null)
  const W = 320, Hh = 130, pad = { l: 30, r: 4, t: 8, b: 20 }
  const max = Math.max(1, ...data.map((d) => d.n))
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4
  const iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b
  const bw = iw / data.length
  const total = data.reduce((a, d) => a + d.n, 0)
  const x = (i) => pad.l + i * bw
  const y = (v) => pad.t + ih - (v / top) * ih
  const dayLabel = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return (
    <section className="panel chart">
      <header><div><h3>{title}</h3><p>{hint}</p></div><b>{fmt(total)}</b></header>
      <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={`${title}, last 14 days: ${data.map((d) => `${dayLabel(d.day)} ${d.n}`).join(', ')}`} onMouseLeave={() => setHi(null)}>
        {[0, 0.5, 1].map((f) => <g key={f}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} /><text className="tick" x={pad.l - 6} y={y(top * f) + 3} textAnchor="end">{Math.round(top * f)}</text></g>)}
        {data.map((d, i) => {
          const h = Math.max(d.n ? 2 : 0, ih - (y(d.n) - pad.t)), bx = x(i) + bw * 0.22, w = bw * 0.56, by = pad.t + ih - h
          return (
            <g key={d.day} onMouseEnter={() => setHi(i)}>
              <rect x={x(i)} y={pad.t} width={bw} height={ih} fill="transparent" />
              {d.n > 0 && <path className={`bar bar--${tone} ${hi === i ? 'on' : ''}`} d={`M${bx},${by + h} V${by + 4} Q${bx},${by} ${bx + 4},${by} H${bx + w - 4} Q${bx + w},${by} ${bx + w},${by + 4} V${by + h} Z`} />}
            </g>
          )
        })}
        {[0, 6, 13].map((i) => <text key={i} className="tick" x={x(i) + bw / 2} y={Hh - 5} textAnchor={i === 0 ? 'start' : i === 13 ? 'end' : 'middle'}>{dayLabel(data[i].day)}</text>)}
        {hi !== null && (
          <g className="tip" transform={`translate(${Math.min(Math.max(x(hi) + bw / 2, 44), W - 44)},${Math.max(y(data[hi].n) - 8, 22)})`}>
            <rect x="-40" y="-20" width="80" height="26" rx="6" /><text y="-3" textAnchor="middle">{dayLabel(data[hi].day)} · {data[hi].n}</text>
          </g>
        )}
      </svg>
    </section>
  )
}

function Dashboard() {
  const [o, setO] = useState(null)
  const [ts, setTs] = useState(null)
  const [recent, setRecent] = useState(null)
  const load = useCallback(() => {
    call('overview').then((r) => r.ok && setO(r.data))
    call('timeseries').then((r) => r.ok && setTs(r.data))
    call('logins').then((r) => r.ok && setRecent(r.data.items.slice(0, 8)))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { window.__adReload = load; return () => { delete window.__adReload } }, [load])
  if (!o) return <Skeleton rows={6} />
  const pct = o.users ? Math.round((o.verified / o.users) * 100) : 0
  const kpi = [
    ['Total users', fmt(o.users), `+${o.newWeek} in the last 7 days`],
    ['Email verified', `${pct}%`, `${fmt(o.verified)} of ${fmt(o.users)} accounts`],
    ['Downloads', fmt(o.downloads), `${fmt(o.downloaders)} unique users`],
    ['Active sessions', fmt(o.sessions), `${fmt(o.logins24h)} sign-ins in 24 h`],
  ]
  return (
    <>
      <div className="kpis">{kpi.map(([k, v, s]) => <div className="kpi panel" key={k}><span>{k}</span><b>{v}</b><small>{s}</small></div>)}</div>
      <div className="grid3">
        {ts ? (<>
          <Bars title="New users" hint="Sign-ups per day" data={ts.signups} />
          <Bars title="Downloads" hint="Per day" data={ts.downloads} />
          <Bars title="Sign-ins" hint="Successful, per day" data={ts.logins} />
        </>) : <><Skeleton rows={4} /><Skeleton rows={4} /><Skeleton rows={4} /></>}
      </div>
      <div className="grid2">
        <section className="panel">
          <header className="ph"><h3>Needs attention</h3></header>
          <ul className="attn">
            <li><span>{I.shield} Collaborator applications</span><b>{fmt(o.pendingCollab)}</b><a className="link" href="/admin/collaborators/">Review</a></li>
            <li><span>{I.pkg} App submissions waiting</span><b>{fmt(o.pendingSubs)}</b><a className="link" href="/admin/submissions/">Review</a></li>
            <li><span>{I.users} Unverified accounts</span><b>{fmt(o.unverified)}</b><a className="link" href="/admin/users/?status=unverified">Review</a></li>
            <li><span>{I.act} Failed sign-ins (24 h)</span><b>{fmt(o.failedLogins24h)}</b><a className="link" href="/admin/activity/?filter=failed">Review</a></li>
            <li><span>{I.lock} Disabled accounts</span><b>{fmt(o.disabled)}</b><a className="link" href="/admin/users/?status=disabled">Review</a></li>
            <li><span>{I.star} Ratings (average {o.ratings ? o.avgRating : '–'})</span><b>{fmt(o.ratings)}</b><a className="link" href="/admin/ratings/">Moderate</a></li>
          </ul>
        </section>
        <section className="panel">
          <header className="ph"><h3>Recent activity</h3><a className="link" href="/admin/activity/">View all</a></header>
          {!recent ? <Skeleton rows={4} /> : (
            <ul className="feed">
              {recent.map((i) => (
                <li key={i.id}><Pill tone={i.success ? 'ok' : 'bad'}>{i.success ? 'OK' : 'Failed'}</Pill><span className="feed__t">{i.reason?.startsWith('admin:') ? i.reason : i.email}</span><time>{rel(i.createdAt)}</time></li>
              ))}
              {!recent.length && <Empty>No activity yet.</Empty>}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

const ACTIONS = {
  verify: ['Mark email verified', 'Marks their email address as confirmed.', 'Mark verified', false, 'p'],
  logout: ['Sign out everywhere', 'Ends all of their sessions. They can sign in again.', 'Sign out', false, 'p'],
  disable: ['Disable account', 'Blocks sign-in and ends all their sessions.', 'Disable', false, 'danger'],
  enable: ['Enable account', 'Lets them sign in again.', 'Enable', false, 'p'],
  'make-admin': ['Make admin', 'Gives full access to this console. Confirm with your password.', 'Make admin', true, 'p'],
  'make-user': ['Remove admin', 'Makes them a regular member and ends their sessions.', 'Remove admin', true, 'danger'],
  delete: ['Delete account', 'Permanently deletes the account with its downloads and ratings. This cannot be undone.', 'Delete', true, 'danger'],
}
const actionsFor = (u, meEmail) => {
  const self = u.email === meEmail
  return Object.keys(ACTIONS).filter((a) => !(a === 'disable' && (u.disabled || self)) && !(a === 'enable' && !u.disabled) && !(a === 'verify' && u.verified)
    && !(a === 'make-admin' && u.role === 'ADMIN') && !(a === 'make-user' && (u.role !== 'ADMIN' || self)) && !(a === 'delete' && self) && !(a === 'logout' && !u.sessions))
}

function Menu({ items, onPick, label }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  useEffect(() => {
    if (!open) return
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    const close = () => setOpen(false)
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc); window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  if (!items.length) return null
  return (
    <div className="menu" ref={ref}>
      <button className="iconbtn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const room = innerHeight - r.bottom; setPos({ right: innerWidth - r.right, ...(room < 260 ? { bottom: innerHeight - r.top + 4 } : { top: r.bottom + 4 }) }); setOpen(!open) }}>{I.more}</button>
      {open && <div className="menu__list" role="menu" style={pos}>{items.map(([k, text, danger]) => <button role="menuitem" key={k} className={danger ? 'danger' : ''} onClick={() => { setOpen(false); onPick(k) }}>{text}</button>)}</div>}
    </div>
  )
}

function Confirm({ pick, onClose, onDone, toast }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, text, label, needsPw, tone] = ACTIONS[pick.action]
  useEffect(() => { const esc = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [onClose])
  const run = async () => {
    setBusy(true); setErr('')
    const r = await call(`users/${pick.user.id}/action`, 'POST', { action: pick.action, password: pw || undefined })
    setBusy(false)
    if (r.ok) { toast(`${title}: ${pick.user.email}`); onDone() }
    else setErr(r.status === 403 ? 'Wrong password.' : r.status === 429 ? 'Too many attempts. Try again later.' : r.data.message || 'Could not do that.')
  }
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
        <h3 id="dlg-t">{title}</h3>
        <p className="dialog__who"><Avatar name={pick.user.name} email={pick.user.email} /><span><b>{pick.user.name || '—'}</b><br />{pick.user.email}</span></p>
        <p>{text}</p>
        {needsPw && <label className="field">Your password<input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && pw && run()} /></label>}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dialog__act">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={`btn btn--${tone}`} onClick={run} disabled={busy || (needsPw && !pw)}>{busy ? 'Working…' : label}</button>
        </div>
      </div>
    </div>
  )
}

const STATUS = [['', 'All'], ['verified', 'Verified'], ['unverified', 'Unverified'], ['disabled', 'Disabled']]
function Users({ meEmail, toast }) {
  const preset = Object.fromEntries(new URLSearchParams(location.search))
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(['verified', 'unverified', 'disabled'].includes(preset.status) ? preset.status : '')
  const [role, setRole] = useState('')
  const [page, setPage] = usePage(q, status, role)
  const [data, setData] = useState(null)
  const [pick, setPick] = useState(null)
  const load = useCallback(async () => {
    const r = await call(`users?q=${encodeURIComponent(q)}&page=${page}&role=${role}&status=${status}`)
    if (r.ok) setData(r.data)
  }, [q, page, role, status])
  useEffect(() => { const t = setTimeout(load, 220); return () => clearTimeout(t) }, [load])
  useEffect(() => { window.__adReload = load; return () => { delete window.__adReload } }, [load])
  return (
    <>
      <div className="toolbar">
        <label className="search">{I.search}<input placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" /></label>
        <div className="seg" role="group" aria-label="Status">{STATUS.map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>)}</div>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"><option value="">All roles</option><option value="ADMIN">Admins</option><option value="USER">Members</option></select>
      </div>
      <section className="panel table-card">
        {!data ? <Skeleton rows={6} /> : (
          <div className="scroll">
            <table>
              <thead><tr><th>User</th><th>Role</th><th>Status</th><th className="r">Downloads</th><th>Joined</th><th className="w1"><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td><div className="who"><Avatar name={u.name} email={u.email} /><div><b>{u.name || '—'}</b><span>{u.email}</span></div></div></td>
                    <td>{u.role === 'ADMIN' ? <Pill tone="info">Admin</Pill> : <span className="muted">Member</span>}</td>
                    <td>{u.disabled ? <Pill tone="bad">Disabled</Pill> : u.verified ? <Pill tone="ok">Verified</Pill> : <Pill tone="warn">Unverified</Pill>}</td>
                    <td className="r num">{u.downloads}</td>
                    <td className="muted" title={when(u.createdAt)}>{rel(u.createdAt)}</td>
                    <td><Menu label={`Actions for ${u.email}`} items={actionsFor(u, meEmail).map((a) => [a, ACTIONS[a][0], ACTIONS[a][4] === 'danger'])} onPick={(a) => setPick({ user: u, action: a })} /></td>
                  </tr>
                ))}
                {!data.users.length && <tr><td colSpan="6"><Empty>No users match these filters.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && <AdminPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} noun="users" />}
      </section>
      {pick && <Confirm pick={pick} toast={toast} onClose={() => setPick(null)} onDone={() => { setPick(null); load() }} />}
    </>
  )
}

function ListPage({ path, params = {}, cols, row, empty, noun, extra }) {
  const [q, setQ] = useState('')
  const [page, setPage] = usePage(q, JSON.stringify(params))
  const [data, setData] = useState(null)
  const pkey = JSON.stringify(params)
  const load = useCallback(() => {
    const sp = new URLSearchParams({ q, page: String(page), ...params })
    return call(`${path}?${sp}`).then((r) => r.ok && setData(r.data))
  }, [path, q, page, pkey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 220); return () => clearTimeout(t) }, [load])
  useEffect(() => { window.__adReload = load; return () => { delete window.__adReload } }, [load])
  return (
    <>
      <div className="toolbar">
        <label className="search">{I.search}<input placeholder="Search this list" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>
        {extra}
      </div>
      <section className="panel table-card">
        {!data ? <Skeleton rows={6} /> : (
          <div className="scroll">
            <table>
              <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {data.items.map((i) => <tr key={i.id}>{row(i, load)}</tr>)}
                {!data.items.length && <tr><td colSpan={cols.length}><Empty>{empty}</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && <AdminPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} noun={noun} />}
      </section>
    </>
  )
}

/* ---------- collaborators and app submissions ---------- */
function ReviewDialog({ title, who, text, needNote, confirmLabel, tone = 'p', onClose, onSubmit }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const esc = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [onClose])
  const go = async () => { setBusy(true); setErr(''); const m = await onSubmit(note); setBusy(false); if (m) setErr(m) }
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="rv-t">
        <h3 id="rv-t">{title}</h3>
        {who && <p className="dialog__who"><span>{who}</span></p>}
        {text && <p>{text}</p>}
        <label className="field">{needNote ? 'Reason (sent to the applicant)' : 'Note (optional)'}<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} autoFocus /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dialog__act"><button className="btn" onClick={onClose}>Cancel</button><button className={`btn btn--${tone}`} onClick={go} disabled={busy || (needNote && !note.trim())}>{busy ? 'Working…' : confirmLabel}</button></div>
      </div>
    </div>
  )
}

const REVIEW_TONE = { PENDING: 'warn', FETCHING: 'warn', APPROVED: 'ok', REJECTED: 'bad', FAILED: 'bad' }
const STATUS_LABEL = { PENDING: 'Pending', FETCHING: 'Fetching file', APPROVED: 'Approved', REJECTED: 'Rejected', FAILED: 'File failed' }

function useStatusFilter(first) {
  const initial = new URLSearchParams(location.search).get('status')
  return useState(initial ?? first)
}

function Collaborators({ toast }) {
  const [st, setSt] = useStatusFilter('PENDING')
  const [page, setPage] = usePage(st)
  const [data, setData] = useState(null)
  const items = data?.items
  const [pick, setPick] = useState(null)
  const load = useCallback(() => call(`collaborators?status=${st}&page=${page}`).then((r) => r.ok && setData(r.data)), [st, page])
  useEffect(() => { setData(null); load() }, [load])
  useEffect(() => { window.__adReload = load; return () => { delete window.__adReload } }, [load])
  const review = async (note) => {
    const r = await call(`collaborators/${pick.a.id}/review`, 'POST', { decision: pick.decision, note: note.trim() || undefined })
    if (!r.ok) return r.data.message || 'Could not save the decision.'
    toast(pick.decision === 'approve' ? 'Collaborator approved' : 'Application rejected'); setPick(null); load()
  }
  return (
    <>
      <div className="toolbar"><div className="seg" role="group" aria-label="Status">{[['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['', 'All']].map(([k, l]) => <button key={l} className={st === k ? 'on' : ''} aria-pressed={st === k} onClick={() => setSt(k)}>{l}</button>)}</div></div>
      {!items ? <Skeleton rows={4} /> : !items.length ? <section className="panel"><Empty>No applications here.</Empty></section> : (
        <div className="rcards">
          {items.map((a) => (
            <section className="panel rcard" key={a.id}>
              <header>
                <div className="who"><Avatar name={a.publisherName} email={a.email} /><div><b>{a.publisherName}</b><span>{a.email} {a.verified ? '' : '(email not verified)'}</span></div></div>
                <Pill tone={REVIEW_TONE[a.status]}>{STATUS_LABEL[a.status]}</Pill>
              </header>
              <dl className="rmeta">
                <div><dt>GitHub</dt><dd><a href={`https://github.com/${a.github}`} target="_blank" rel="noreferrer">@{a.github}</a> {a.githubVerified ? <Pill tone="ok">Verified via GitHub sign-in</Pill> : <Pill tone="warn">Typed in, not verified</Pill>}</dd></div>
                {a.website && <div><dt>Website</dt><dd><a href={a.website} target="_blank" rel="noreferrer">{a.website}</a></dd></div>}
                <div><dt>Applied</dt><dd>{when(a.createdAt)}</dd></div>
                <div><dt>Apps</dt><dd>{a.apps}</dd></div>
              </dl>
              <p className="rabout">{a.about}</p>
              {a.reviewNote && <p className="muted">Note: {a.reviewNote}</p>}
              <div className="ractions">
                {a.status !== 'APPROVED' && <button className="btn btn--p" onClick={() => setPick({ a, decision: 'approve' })}>Approve</button>}
                {a.status !== 'REJECTED' && <button className="btn btn--danger-o" onClick={() => setPick({ a, decision: 'reject' })}>{a.status === 'APPROVED' ? 'Revoke' : 'Reject'}</button>}
              </div>
            </section>
          ))}
        </div>
      )}
      {data && data.pages > 1 && <section className="panel"><AdminPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} noun="applications" /></section>}
      {pick && <ReviewDialog title={pick.decision === 'approve' ? 'Approve collaborator' : pick.a.status === 'APPROVED' ? 'Revoke collaborator' : 'Reject application'} who={`${pick.a.publisherName} · ${pick.a.email}`}
        text={pick.decision === 'approve' ? 'They will be able to submit apps. Each app and release still needs your approval.' : pick.a.status === 'APPROVED' ? 'Their live apps will be unpublished.' : undefined}
        needNote={pick.decision === 'reject'} confirmLabel={pick.decision === 'approve' ? 'Approve' : pick.a.status === 'APPROVED' ? 'Revoke' : 'Reject'} tone={pick.decision === 'approve' ? 'p' : 'danger'} onClose={() => setPick(null)} onSubmit={review} />}
    </>
  )
}

const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

function Submissions({ toast }) {
  const [st, setSt] = useStatusFilter('PENDING')
  const [page, setPage] = usePage(st)
  const [data, setData] = useState(null)
  const items = data?.items
  const [pick, setPick] = useState(null)
  const load = useCallback(() => call(`submissions?status=${st}&page=${page}`).then((r) => r.ok && setData(r.data)), [st, page])
  useEffect(() => { setData(null); load() }, [load])
  useEffect(() => { window.__adReload = load; return () => { delete window.__adReload } }, [load])
  useEffect(() => { if (!items?.some((i) => i.status === 'FETCHING')) return; const id = setInterval(load, 4000); return () => clearInterval(id) }, [items, load])
  const review = async (note) => {
    const r = await call(`submissions/${pick.s.id}/review`, 'POST', { decision: pick.decision, note: note.trim() || undefined })
    if (!r.ok) return r.data.message || 'Could not save the decision.'
    toast(pick.decision === 'approve' ? 'App approved and published' : 'Submission rejected'); setPick(null); load()
  }
  const unpublish = async (s) => { if (confirm(`Unpublish ${s.product.name}?`)) { const r = await call(`products/${s.product.slug}/unpublish`, 'POST', {}); if (r.ok) { toast('Unpublished'); load() } } }
  return (
    <>
      <div className="toolbar"><div className="seg" role="group" aria-label="Status">{[['PENDING', 'Pending'], ['APPROVED', 'Live'], ['REJECTED', 'Rejected'], ['FAILED', 'Failed'], ['', 'All']].map(([k, l]) => <button key={l} className={st === k ? 'on' : ''} aria-pressed={st === k} onClick={() => setSt(k)}>{l}</button>)}</div></div>
      {!items ? <Skeleton rows={4} /> : !items.length ? <section className="panel"><Empty>No submissions here.</Empty></section> : (
        <div className="rcards">
          {items.map((s) => (
            <section className="panel rcard" key={s.id}>
              <header>
                <div><b className="rtitle">{s.product.name} <span className="mono">{s.tag}</span></b><span className="muted">{s.product.tagline}</span></div>
                <div className="rtags">{s.product.external ? <Pill tone="neutral">Listed from GitHub</Pill> : s.first ? <Pill tone="info">New app</Pill> : <Pill tone="neutral">New version</Pill>}<Pill tone={REVIEW_TONE[s.status]}>{STATUS_LABEL[s.status]}</Pill></div>
              </header>
              <p className="rabout">{s.product.summary}</p>
              {s.product.details && <details className="rabout"><summary>Full description ({s.product.details.length.toLocaleString('en-US')} characters, as the page will show it)</summary><div style={{ marginTop: 10 }}><Markdown text={s.product.details} /></div></details>}
              <dl className="rmeta">
                <div><dt>Publisher</dt><dd>{s.owner.publisher || s.product.repo.split('/')[0]} · {s.owner.email}</dd></div>
                <div><dt>Repository</dt><dd><a href={`https://github.com/${s.product.repo}`} target="_blank" rel="noreferrer">{s.product.repo}</a> {!s.product.external && (s.owner.ownerMatches ? <Pill tone="ok">owner matches @{s.owner.github}</Pill> : <Pill tone="warn">owner differs from @{s.owner.github}</Pill>)}</dd></div>
                <div><dt>Release</dt><dd><a href={s.releaseUrl} target="_blank" rel="noreferrer">{s.tag} on GitHub</a></dd></div>
                <div><dt>File</dt><dd className="mono">{s.assetName} · {size(s.assetSize)}</dd></div>
                {!s.product.external && <div><dt>SHA-256</dt><dd>{s.sha256 ? <><code className="hash">{s.sha256}</code> <a href={`https://www.virustotal.com/gui/file/${s.sha256}`} target="_blank" rel="noreferrer">Check on VirusTotal</a></> : <span className="muted">{s.status === 'FETCHING' ? 'Fetching…' : 'not available'}</span>}</dd></div>}
                <div><dt>Listing</dt><dd>{s.product.category} · {s.product.platform}{s.product.license ? ` · ${s.product.license}` : ''}</dd></div>
                <div><dt>Submitted</dt><dd>{when(s.createdAt)}</dd></div>
              </dl>
              {s.error && <p className="err">{s.error}</p>}
              {s.note && <p className="muted">Note: {s.note}</p>}
              <div className="ractions">
                {s.status === 'PENDING' && <button className="btn btn--p" onClick={() => setPick({ s, decision: 'approve' })}>Approve and publish</button>}
                {['PENDING', 'FAILED'].includes(s.status) && <button className="btn btn--danger-o" onClick={() => setPick({ s, decision: 'reject' })}>Reject</button>}
                {s.status === 'APPROVED' && s.product.status === 'APPROVED' && <button className="btn btn--danger-o" onClick={() => unpublish(s)}>Unpublish app</button>}
              </div>
            </section>
          ))}
        </div>
      )}
      {data && data.pages > 1 && <section className="panel"><AdminPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} noun="submissions" /></section>}
      {pick && <ReviewDialog title={pick.decision === 'approve' ? 'Approve and publish' : 'Reject submission'} who={`${pick.s.product.name} ${pick.s.tag} · ${pick.s.owner.email}`}
        text={pick.decision === 'approve' ? 'The app goes live in the store right away. Only approve after you have looked at the repository, the release and the file.' : undefined}
        needNote={pick.decision === 'reject'} confirmLabel={pick.decision === 'approve' ? 'Approve and publish' : 'Reject'} tone={pick.decision === 'approve' ? 'p' : 'danger'} onClose={() => setPick(null)} onSubmit={review} />}
    </>
  )
}

const Downloads = () => (
  <ListPage path="downloads" noun="downloads" empty="No downloads yet." cols={['When', 'User', 'Product', 'Version', 'IP address']}
    row={(i) => <><td className="muted" title={when(i.createdAt)}>{rel(i.createdAt)}</td><td>{i.email}</td><td>{i.product}</td><td className="mono">{i.version}</td><td className="mono">{i.ip}</td></>} />
)
function Activity() {
  const [f, setF] = useState(['failed', 'admin'].includes(new URLSearchParams(location.search).get('filter')) ? new URLSearchParams(location.search).get('filter') : 'all')
  return (
    <ListPage path="logins" params={{ filter: f }} noun="events" empty="Nothing matches."
      extra={<div className="seg" role="group" aria-label="Filter">{[['all', 'All'], ['failed', 'Failed'], ['admin', 'Admin actions']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>}
      cols={['When', 'Email', 'Result', 'Detail', 'IP address']}
      row={(i) => <><td className="muted" title={when(i.createdAt)}>{rel(i.createdAt)}</td><td>{i.email}</td><td><Pill tone={i.success ? 'ok' : 'bad'}>{i.success ? 'Success' : 'Failed'}</Pill></td><td className="mono">{i.reason || '—'}</td><td className="mono">{i.ip}</td></>} />
  )
}
const Ratings = ({ toast }) => (
  <ListPage path="ratings" noun="ratings" empty="No ratings yet." cols={['Updated', 'User', 'Product', 'Rating', 'Comment', '']}
    row={(i, reload) => (
      <><td className="muted" title={when(i.updatedAt)}>{rel(i.updatedAt)}</td><td>{i.email}</td><td>{i.product}</td>
        <td><span className="stars" aria-label={`${i.stars} out of 5`}>{'★'.repeat(i.stars)}<span>{'★'.repeat(5 - i.stars)}</span></span></td>
        <td className="cm">{i.comment || <span className="muted">—</span>}</td>
        <td><button className="btn btn--sm btn--danger-o" onClick={async () => { if (confirm('Delete this rating?')) { await call(`ratings/${i.id}`, 'DELETE'); toast('Rating deleted'); reload() } }}>Delete</button></td></>
    )} />
)

const NAV = [['dashboard', 'Dashboard', I.dash], ['users', 'Users', I.users], ['collaborators', 'Collaborators', I.shield], ['submissions', 'Submissions', I.pkg], ['downloads', 'Downloads', I.down], ['activity', 'Activity', I.act], ['ratings', 'Ratings', I.star]]
const TITLES = { dashboard: ['Dashboard', 'How the site is doing right now.'], users: ['Users', 'Accounts, roles and access.'], collaborators: ['Collaborators', 'Review people who want to publish apps.'], submissions: ['Submissions', 'Review apps and new versions before they go live.'], downloads: ['Downloads', 'Who downloaded what, and when.'], activity: ['Activity', 'Sign-ins and admin actions.'], ratings: ['Ratings', 'Moderate reviews.'] }

function useTheme() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('ad-theme') || '' } catch { return '' } })
  useEffect(() => {
    const el = document.documentElement
    if (theme) { el.setAttribute('data-ad-theme', theme); el.setAttribute('data-theme', theme) } else { el.removeAttribute('data-ad-theme'); el.removeAttribute('data-theme') }
    try { theme ? localStorage.setItem('ad-theme', theme) : localStorage.removeItem('ad-theme') } catch { /* storage may be blocked */ }
  }, [theme])
  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  return [dark, () => setTheme(dark ? 'light' : 'dark')]
}

export default function Admin() {
  const { status, me, openLogin, logout } = useAuth()
  // One real page per section: /admin/, /admin/users/, /admin/downloads/, /admin/activity/, /admin/ratings/
  const seg = location.pathname.split('/').filter(Boolean)[1] ?? 'dashboard'
  const tab = NAV.some(([k]) => k === seg) ? seg : 'dashboard'
  const [nav, setNav] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)
  const [dark, toggleTheme] = useTheme()
  const timer = useRef(0)
  const toast = useCallback((text) => { clearTimeout(timer.current); setToastMsg(text); timer.current = setTimeout(() => setToastMsg(null), 3500) }, [])
  useEffect(() => { document.title = `${TITLES[tab][0]} · CXXS Admin` }, [tab])

  if (status === 'loading') return <div className="gate"><p className="muted">Loading…</p></div>
  if (status === 'anon') {
    return (
      <div className="gate"><div className="gate__card">
        <span className="gate__ic">{I.lock}</span><h1>CXXS Admin</h1><p>Sign in with an administrator account to continue.</p>
        <button className="btn btn--p btn--lg" onClick={() => openLogin({ title: 'Admin sign in', text: 'Sign in with an administrator account.' })}>Sign in</button>
      </div></div>
    )
  }
  // Same answer as an unknown page: the server hides these endpoints from non-admins too.
  if (me.user.role !== 'ADMIN') {
    return <div className="gate"><div className="gate__card"><h1>404</h1><p>This page does not exist.</p><a className="btn btn--lg" href="/">Back to home</a></div></div>
  }
  const [title, sub] = TITLES[tab]
  return (
    <div className="shell">
      <aside className={`side ${nav ? 'open' : ''}`} aria-label="Primary">
        <div className="side__brand"><span className="logo" aria-hidden="true">{I.bolt}</span><div><b>CXXS</b><small>Admin console</small></div></div>
        <nav>
          <p className="side__h">Manage</p>
          {NAV.map(([k, l, ic]) => <a key={k} href={k === 'dashboard' ? '/admin/' : `/admin/${k}/`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}>{ic}<span>{l}</span></a>)}
          <p className="side__h">Site</p>
          <a href="/" target="_blank" rel="noreferrer">{I.ext}<span>View store</span></a>
        </nav>
        <div className="side__me">
          <Avatar name={me.user.name} email={me.user.email} />
          <div><b>{me.user.name || 'Admin'}</b><small>{me.user.email}</small></div>
          <button className="iconbtn" onClick={logout} aria-label="Sign out" title="Sign out">{I.out}</button>
        </div>
      </aside>
      {nav && <button className="scrim" aria-label="Close menu" onClick={() => setNav(false)} />}
      <div className="main">
        <header className="top">
          <button className="iconbtn burger" onClick={() => setNav(true)} aria-label="Open menu">{I.menu}</button>
          <div><h1>{title}</h1><p>{sub}</p></div>
          <div className="top__r">
            <button className="iconbtn" onClick={() => window.__adReload?.()} aria-label="Refresh" title="Refresh">{I.refresh}</button>
            <button className="iconbtn" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">{dark ? I.sun : I.moon}</button>
          </div>
        </header>
        <main className="content" key={tab}>
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'users' && <Users meEmail={me.user.email} toast={toast} />}
          {tab === 'collaborators' && <Collaborators toast={toast} />}
          {tab === 'submissions' && <Submissions toast={toast} />}
          {tab === 'downloads' && <Downloads />}
          {tab === 'activity' && <Activity />}
          {tab === 'ratings' && <Ratings toast={toast} />}
        </main>
      </div>
      {toastMsg && <div className="toast" role="status" aria-live="polite">{toastMsg}</div>}
    </div>
  )
}
