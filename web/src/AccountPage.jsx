import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, api } from './auth'
import Layout from './Layout'
import Pager from './Pager'
import { useCatalog } from './community'
import { PasswordMeter, strength } from './AuthForm'
import { addPasskey, listPasskeys, passkeysSupported, removePasskey } from './passkey'
import { UserIcon, ShieldIcon, DevicesIcon, DownloadIcon, TrashIcon, MailIcon, LockIcon, KeyIcon, PhoneIcon, TabletIcon, LaptopIcon, UnknownDeviceIcon } from './icons'

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }
const call = async (path, body, method = 'POST') => {
  try {
    const r = await fetch(`/api/web/${path}`, { method, credentials: 'include', headers: H, body: body ? JSON.stringify(body) : undefined })
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }
  } catch {
    return { ok: false, status: 0, data: {} }
  }
}
const explain = (r, fallback = 'Something went wrong. Please try again.') => {
  if (r.status === 0) return 'Cannot reach the server. Check your connection.'
  if (r.status === 403 && r.data.error === 'email_unverified') return 'Verify your current email first. This address cannot be changed until it is confirmed.'
  if (r.status === 403) return 'That password is incorrect.'
  if (r.status === 409) return 'That email is already in use.'
  if (r.status === 429) return `Too many attempts. Try again in ${Math.max(1, Math.ceil((Number(r.data.retryAfter) || 0) / 60))} minute(s).`
  if (r.status === 400 && r.data.message) return r.data.message
  return fallback
}
const fmtDate = (iso, time = false) => new Date(iso).toLocaleString(undefined, time ? { dateStyle: 'medium', timeStyle: 'short' } : { year: 'numeric', month: 'long', day: 'numeric' })
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
const DEVICE = { mobile: PhoneIcon, tablet: TabletIcon, desktop: LaptopIcon, unknown: UnknownDeviceIcon }

function Msg({ m }) {
  return m ? <p className={`ac-msg ${m.kind}`} role="status" aria-live="polite">{m.text}</p> : <p className="ac-msg" aria-hidden="true">&nbsp;</p>
}

function Field({ id, label, error, children }) {
  return (
    <div className={`lf ${error ? 'has-err' : ''}`}>
      <label htmlFor={id} className="mono">{label}</label>
      {children}
      {error && <span className="lf__err" role="alert">{error}</span>}
    </div>
  )
}

function Card({ id, icon: Icon, title, text, children, danger }) {
  return (
    <section className={`ac-card ${danger ? 'ac-card--danger' : ''}`} id={id}>
      <header className="ac-card__h">
        <span className="ac-card__ic"><Icon /></span>
        <div><h2>{title}</h2>{text && <p>{text}</p>}</div>
      </header>
      {children}
    </section>
  )
}

function Profile({ me, refresh }) {
  const [name, setName] = useState(me.user.name || '')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [pw, setPw] = useState('')
  const [emsg, setEmsg] = useState(null)
  const [ebusy, setEbusy] = useState(false)
  const [sent, setSent] = useState(null)
  const [sending, setSending] = useState(false)
  const verified = me.user.emailVerified
  const dirty = name.trim() !== (me.user.name || '')

  const saveName = async (e) => {
    e.preventDefault()
    setMsg(null); setBusy(true)
    const r = await call('account/profile', { name }, 'PATCH')
    setBusy(false)
    if (r.ok) { await refresh(); setMsg({ kind: 'ok', text: 'Saved.' }) } else setMsg({ kind: 'err', text: explain(r, 'Could not save your name.') })
  }
  const saveEmail = async (e) => {
    e.preventDefault()
    setEmsg(null); setEbusy(true)
    const r = await call('account/email', { email: newEmail, password: pw })
    setEbusy(false)
    if (r.ok) { await refresh(); setEmailOpen(false); setNewEmail(''); setPw(''); setMsg({ kind: 'ok', text: 'Email updated.' }) } else setEmsg({ kind: 'err', text: explain(r, 'Could not change your email.') })
  }

  const resend = async () => {
    setSending(true); setSent(null)
    const r = await call('auth/resend-verification')
    setSending(false)
    if (r.ok) setSent({ kind: 'ok', text: 'Verification email sent. Check your inbox (and spam).' })
    else if (r.status === 400) { await refresh() }
    else setSent({ kind: 'err', text: explain(r, 'Could not send the email.') })
  }

  return (
    <Card id="profile" icon={UserIcon} title="Profile" text="How you appear on this site.">
      <form onSubmit={saveName} className="ac-form" noValidate>
        <Field id="ac-name" label="Display name">
          <input id="ac-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <div className="ac-row">
          <button className="ac-btn ac-btn--p" disabled={!dirty || !name.trim() || busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          <Msg m={msg} />
        </div>
      </form>

      <div className="ac-split" />
      <div className="ac-line">
        <div>
          <span className="mono ac-k">Email</span>
          <p className="ac-v">{me.user.email} <span className={`ac-badge mono ${verified ? 'ok' : 'warn'}`}>{verified ? 'Verified' : 'Not verified'}</span></p>
        </div>
        {verified && !emailOpen && <button className="ac-btn" onClick={() => setEmailOpen(true)}><MailIcon /> Change email</button>}
      </div>
      {!verified && (
        <div className="ac-note" role="note">
          <p>Confirm this address by opening the link we emailed you. Until then you cannot change your email.</p>
          <div className="ac-row">
            <button className="ac-btn" onClick={resend} disabled={sending}><MailIcon /> {sending ? 'Sending…' : 'Resend verification email'}</button>
            <Msg m={sent} />
          </div>
        </div>
      )}
      {emailOpen && (
        <form onSubmit={saveEmail} className="ac-form ac-form--in" noValidate>
          <Field id="ac-newemail" label="New email">
            <input id="ac-newemail" type="email" autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" placeholder="new@example.com" />
          </Field>
          <Field id="ac-epw" label="Current password">
            <input id="ac-epw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </Field>
          <div className="ac-row">
            <button className="ac-btn ac-btn--p" disabled={!newEmail || !pw || ebusy}>{ebusy ? 'Updating…' : 'Update email'}</button>
            <button type="button" className="ac-btn" onClick={() => { setEmailOpen(false); setEmsg(null) }}>Cancel</button>
            <Msg m={emsg} />
          </div>
        </form>
      )}
    </Card>
  )
}

function Password() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const mismatch = again && next !== again

  const submit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (next.length < 12) return setMsg({ kind: 'err', text: 'New password must be at least 12 characters.' })
    if (next !== again) return setMsg({ kind: 'err', text: 'The new passwords do not match.' })
    setBusy(true)
    const r = await call('account/password', { current: cur, next })
    setBusy(false)
    if (r.ok) {
      setCur(''); setNext(''); setAgain('')
      const n = r.data.signedOut || 0
      setMsg({ kind: 'ok', text: n ? `Password changed. ${n} other device${n > 1 ? 's were' : ' was'} signed out.` : 'Password changed.' })
    } else setMsg({ kind: 'err', text: r.status === 403 ? 'Your current password is incorrect.' : explain(r, 'Could not change your password.') })
  }

  return (
    <Card id="password" icon={ShieldIcon} title="Password" text="Changing it signs out every other device.">
      <form onSubmit={submit} className="ac-form" noValidate>
        <Field id="ac-cur" label="Current password">
          <input id="ac-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field id="ac-new" label="New password">
          <input id="ac-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <PasswordMeter value={next} />
        </Field>
        <Field id="ac-again" label="Repeat new password" error={mismatch ? 'The passwords do not match.' : null}>
          <input id="ac-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="ac-row">
          <button className="ac-btn ac-btn--p" disabled={!cur || strength(next) < 2 || !again || busy}>{busy ? 'Changing…' : 'Change password'}</button>
          <Msg m={msg} />
        </div>
      </form>
    </Card>
  )
}

function Passkeys() {
  const [list, setList] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [removing, setRemoving] = useState(null) // { id, name }
  const [pw, setPw] = useState('')
  const supported = passkeysSupported()
  const load = useCallback(async () => {
    const r = await listPasskeys()
    if (r.ok) setList(r.data.passkeys)
  }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    setMsg(null); setBusy(true)
    const r = await addPasskey(name.trim())
    setBusy(false)
    if (r.ok) { setName(''); setMsg({ kind: 'ok', text: 'Passkey saved. You can now sign in with it.' }); load() } else if (r.message) setMsg({ kind: 'err', text: r.message })
  }
  const remove = async (e) => {
    e.preventDefault()
    setMsg(null); setBusy(true)
    const r = await removePasskey(removing.id, pw)
    setBusy(false)
    if (r.ok) { setRemoving(null); setPw(''); setMsg({ kind: 'ok', text: 'Passkey removed.' }); load() } else setMsg({ kind: 'err', text: r.status === 403 ? 'That password is incorrect.' : explain(r, 'Could not remove the passkey.') })
  }

  return (
    <Card id="passkeys" icon={KeyIcon} title="Passkeys" text="Sign in with your fingerprint, face, screen lock or a security key. Nothing secret is stored on our servers, and a passkey cannot be used on a fake website.">
      {!list ? <p className="ac-empty mono">Loading…</p> : list.length === 0 ? <p className="ac-empty mono">No passkeys yet.</p> : (
        <ul className="ac-list">
          {list.map((k) => (
            <li key={k.id}>
              <span className="ac-list__ic"><KeyIcon /></span>
              <div className="ac-list__tx">
                <b>{k.name}</b>
                <span className="mono">Added {fmtDate(k.createdAt)} · {k.lastUsedAt ? `used ${ago(k.lastUsedAt)}` : 'not used yet'}{k.backedUp ? ' · synced' : ''}</span>
              </div>
              <button className="ac-btn ac-btn--sm" onClick={() => { setRemoving({ id: k.id, name: k.name }); setPw(''); setMsg(null) }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <form className="ac-form" onSubmit={remove}>
          <Field id="pk-pw" label={`Password to remove “${removing.name}”`}>
            <input id="pk-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </Field>
          <div className="ac-row">
            <button className="ac-btn ac-btn--p" disabled={!pw || busy}>{busy ? 'Removing…' : 'Remove passkey'}</button>
            <button type="button" className="ac-btn" onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </form>
      )}
      {supported ? (
        <div className="ac-row">
          <input className="ac-pkname" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Name (optional), e.g. My laptop" aria-label="Passkey name" />
          <button className="ac-btn ac-btn--p" onClick={add} disabled={busy}>{busy && !removing ? 'Waiting for your device…' : 'Add a passkey'}</button>
        </div>
      ) : <p className="ac-empty mono">This browser does not support passkeys.</p>}
      <Msg m={msg} />
    </Card>
  )
}

function Devices() {
  const [list, setList] = useState(null)
  const load = useCallback(async () => {
    const r = await api('sessions')
    if (r.ok) setList((await r.json()).sessions)
  }, [])
  useEffect(() => { load() }, [load])
  const revoke = async (id) => { await api(`sessions/${id}`, { method: 'DELETE' }); load() }
  const others = async () => { await api('logout-others', { method: 'POST', body: '{}' }); load() }

  return (
    <Card id="devices" icon={DevicesIcon} title="Devices" text="Where you are signed in right now.">
      {!list ? <p className="ac-empty mono">Loading…</p> : (
        <ul className="ac-list">
          {list.map((s) => {
            const Dev = DEVICE[s.device] ?? DEVICE.unknown
            return (
              <li key={s.id} className={s.current ? 'is-current' : ''}>
                <span className="ac-list__ic"><Dev /></span>
                <div className="ac-list__tx">
                  <b>{s.client === 'MOBILE' ? 'Mobile app' : 'Web'} · {s.label}</b>
                  <span className="mono">{s.ip} · {s.current ? 'this device' : `active ${ago(s.lastSeenAt)}`} · signed in {fmtDate(s.createdAt)}</span>
                </div>
                {!s.current && <button className="ac-btn ac-btn--sm" onClick={() => revoke(s.id)}>Sign out</button>}
              </li>
            )
          })}
        </ul>
      )}
      {list && list.length > 1 && <button className="ac-btn" onClick={others}>Sign out all other devices</button>}
    </Card>
  )
}

function Downloads() {
  const { products } = useCatalog()
  const PRODUCT_NAMES = Object.fromEntries(products.map((p) => [p.slug, p.name]))
  const [list, setList] = useState(null)
  const [pg, setPg] = useState(1)
  useEffect(() => {
    call('account/downloads', null, 'GET').then((r) => r.ok && setList(r.data.downloads))
  }, [])
  return (
    <Card id="downloads" icon={DownloadIcon} title="Downloads" text="Your recent downloads.">
      {!list ? <p className="ac-empty mono">Loading…</p> : list.length === 0 ? (
        <p className="ac-empty">Nothing yet. <a href="/products/">Browse products</a></p>
      ) : (
        <ul className="ac-list">
          {list.slice((Math.min(pg, Math.ceil(list.length / 8)) - 1) * 8, Math.min(pg, Math.ceil(list.length / 8)) * 8).map((d) => (
            <li key={d.id}>
              <span className="ac-list__ic"><DownloadIcon /></span>
              <div className="ac-list__tx"><b>{PRODUCT_NAMES[d.product] ?? d.product} {d.version}</b><span className="mono">{fmtDate(d.createdAt, true)}</span></div>
            </li>
          ))}
        </ul>
      )}
      {list && list.length > 8 && <Pager tight page={Math.min(pg, Math.ceil(list.length / 8))} pages={Math.ceil(list.length / 8)} onPage={setPg} label="Downloads pages" />}
    </Card>
  )
}

function Danger({ me }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const match = email.trim().toLowerCase() === me.user.email

  const remove = async (e) => {
    e.preventDefault()
    setMsg(null); setBusy(true)
    const r = await call('account/delete', { password: pw })
    if (r.ok) { window.location.replace('/'); return }
    setBusy(false)
    setMsg({ kind: 'err', text: explain(r, 'Could not delete your account.') })
  }
  return (
    <Card id="danger" icon={TrashIcon} title="Delete account" text="This removes your account, your devices and your download history. It cannot be undone." danger>
      <form onSubmit={remove} className="ac-form" noValidate>
        <Field id="ac-del-email" label={`Type ${me.user.email} to confirm`}>
          <input id="ac-del-email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" spellCheck="false" />
        </Field>
        <Field id="ac-del-pw" label="Password">
          <input id="ac-del-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </Field>
        <div className="ac-row">
          <button className="ac-btn ac-btn--danger" disabled={!match || !pw || busy}>{busy ? 'Deleting…' : 'Delete my account'}</button>
          <Msg m={msg} />
        </div>
      </form>
    </Card>
  )
}

const NAV = [['profile', 'Profile', UserIcon], ['password', 'Password', ShieldIcon], ['passkeys', 'Passkeys', KeyIcon], ['devices', 'Devices', DevicesIcon], ['downloads', 'Downloads', DownloadIcon], ['danger', 'Delete account', TrashIcon]]

export default function AccountPage() {
  const { status, me, openLogin, refresh } = useAuth()
  const root = useRef(null)

  if (status === 'loading') return <Layout banner={false}><div className="gate">Loading…</div></Layout>

  if (status === 'anon') {
    return (
      <Layout banner={false}><div className="ac-gate">
        <div className="ac-gate__card">
          <span className="lm__ic"><LockIcon /></span>
          <h1>Sign in to manage your account</h1>
          <p>Update your profile, change your password, see where you are signed in and review your downloads.</p>
          <div className="ac-row ac-row--c">
            <button className="ac-btn ac-btn--p" onClick={() => openLogin({ title: 'Sign in', text: 'Sign in to manage your account.' })}>Sign in</button>
            <button className="ac-btn" onClick={() => openLogin({ mode: 'register' })}>Create account</button>
          </div>
          <a className="ac-back" href="/">← Back to home</a>
        </div>
      </div></Layout>
    )
  }

  const u = me.user
  return (
    <Layout banner={false}><div className="ac-page"><div className="ac" ref={root}>
      <main className="ac-main">
        <div className="ac-hero">
          <span className="ac-avatar" aria-hidden="true">{(u.name || u.email)[0].toUpperCase()}</span>
          <div>
            <h1>{u.name || 'Your account'}</h1>
            <p className="ac-sub">{u.email}</p>
            <div className="ac-chips">
              <span className="chip">{u.role === 'ADMIN' ? 'Admin' : 'Member'}</span>
              <span className="chip">Joined {fmtDate(u.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="ac-grid">
          <aside className="ac-nav" aria-label="Account sections">
            {NAV.map(([id, label, Icon]) => <a key={id} href={`#${id}`} className={id === 'danger' ? 'is-danger' : ''}><Icon />{label}</a>)}
          </aside>
          <div className="ac-cards">
            <Profile me={me} refresh={refresh} />
            <Password />
            <Passkeys />
            <Devices />
            <Downloads />
            <Danger me={me} />
          </div>
        </div>
      </main>
    </div></div></Layout>
  )
}
