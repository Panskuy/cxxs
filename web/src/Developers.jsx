import { useCallback, useEffect, useState } from 'react'
import Layout from './Layout'
import { useAuth } from './auth'
import { cj } from './community'
import { ArrowIcon, CheckIcon, UserIcon, ShieldIcon, CodeIcon, PackageIcon, MailIcon, LockIcon } from './icons'
import './home.css'
import './developers.css'

const STEPS = [
  [UserIcon, 'Apply as a collaborator', 'Tell us who you are and link your GitHub account.'],
  [ShieldIcon, 'We verify you', 'An admin reviews your application. You’ll get an email with the decision.'],
  [CodeIcon, 'Submit a GitHub release', 'Pick one of your own public repositories and the release file you want to publish.'],
  [PackageIcon, 'We verify the app', 'An admin checks every app and every new version before it goes live.'],
]
const NEEDS = [
  'A CXXS account with a verified email address',
  'A public GitHub repository for your app, owned by your connected GitHub account (not a fork, and no links to someone else’s project)',
  'A GitHub release with a downloadable file (.zip, .exe, .msi, .dmg, .pkg, .AppImage, .deb, .rpm, .tar.gz or .7z, up to 200 MB)',
  'A name, a short tagline and a description of what your app does',
]

function Field({ id, label, hint, children }) {
  return <div className="df"><label htmlFor={id}>{label}</label>{children}{hint && <small>{hint}</small>}</div>
}

function ApplyForm({ initial, onDone, linked }) {
  const [v, setV] = useState({ publisherName: initial?.publisherName ?? '', github: linked ?? initial?.github ?? '', website: initial?.website ?? '', about: initial?.about ?? '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    const r = await cj('collab/apply', 'POST', { ...v, publisherName: linked ? undefined : v.publisherName, github: linked ? undefined : v.github, website: v.website.trim() || undefined })
    setBusy(false)
    if (r.ok) onDone()
    else setErr(r.status === 403 ? 'Verify your email first (see your account page).' : r.status === 429 ? 'Too many attempts. Try again later.' : r.status === 409 ? 'You have already applied.' : r.data.message || 'Could not send your application. Try again.')
  }
  return (
    <form className="dform" onSubmit={submit} noValidate>
      {!linked && <Field id="d-name" label="Publisher name" hint="Shown on your apps, for example your name or studio."><input id="d-name" value={v.publisherName} onChange={set('publisherName')} maxLength={60} autoComplete="organization" /></Field>}
      {linked
        ? <div className="df"><label>GitHub account</label><p className="glinked"><CheckIcon /> Connected as <b>@{linked}</b></p><small>Your apps will be published under this name, and their repositories should belong to this account.</small></div>
        : <Field id="d-gh" label="GitHub username" hint="Your apps’ repositories should belong to this account (or to an organization you manage)."><input id="d-gh" value={v.github} onChange={set('github')} maxLength={39} placeholder="octocat" autoComplete="off" spellCheck="false" /></Field>}
      <Field id="d-web" label="Website (optional)"><input id="d-web" type="url" value={v.website} onChange={set('website')} maxLength={200} placeholder="https://" /></Field>
      <Field id="d-about" label="What do you build?" hint="A few sentences. This helps us review your application."><textarea id="d-about" rows={4} value={v.about} onChange={set('about')} maxLength={600} /></Field>
      {err && <p className="derr" role="alert">{err}</p>}
      <button className="btn-p dform__go" disabled={busy}><span className="btn-p__t">{busy ? 'Sending…' : 'Send application'}</span></button>
    </form>
  )
}

function Panel() {
  const { status, openLogin } = useAuth()
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [again, setAgain] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const result = new URLSearchParams(location.search).get('github')
  const connect = async () => {
    setConnecting(true)
    const r = await cj('collab/github/connect')
    if (r.ok) window.location.href = r.data.url
    else { setConnecting(false); alert(r.data.error === 'email_unverified' ? 'Verify your email first.' : 'GitHub sign-in is not available right now.') }
  }
  const load = useCallback(async () => {
    const r = await cj('collab/me')
    setMe(r.ok ? r.data : null); setLoading(false)
  }, [])
  useEffect(() => { if (status === 'user') load(); else if (status === 'anon') setLoading(false) }, [status, load])

  if (status === 'loading' || loading) return <div className="dpanel"><p className="muted">Loading…</p></div>
  if (status === 'anon') {
    return (
      <div className="dpanel">
        <h3>Become a collaborator</h3>
        <p>Sign in or create a free account to apply.</p>
        <div className="drow"><button className="btn-p" onClick={() => openLogin({ title: 'Sign in', text: 'Sign in to apply as a collaborator.' })}><span className="btn-p__t">Sign in</span></button><button className="btn-g" onClick={() => openLogin({ mode: 'register' })}>Create account</button></div>
      </div>
    )
  }
  if (!me) return <div className="dpanel"><p className="derr">Could not load your status. Refresh the page.</p></div>
  const a = me.application
  const gh = me.github
  const notice = { connected: ['ok', 'GitHub connected.'], taken: ['bad', 'That GitHub account is already linked to another CXXS account.'], locked: ['bad', 'Your application is tied to a different GitHub account.'], error: ['bad', 'Could not connect GitHub. Please try again.'] }[result]
  if (!a) {
    return (
      <div className="dpanel">
        <h3>Apply to become a collaborator</h3>
        {notice && <div className={`dnote ${notice[0] === 'bad' ? 'warn' : ''}`}><p>{notice[1]}</p></div>}
        {!me.emailVerified ? (
          <div className="dnote warn"><MailIcon /><p>Verify your email first. Open the link we sent you, or request a new one from your <a href="/account/">account page</a>.</p></div>
        ) : gh.configured && !gh.login ? (
          <>
            <p className="muted">Step 1 of 2: connect your GitHub account. This proves which repositories are yours. We only read your public profile and never get access to your code.</p>
            <button className="btn-p" onClick={connect} disabled={connecting}><span className="btn-p__t"><LockIcon /> {connecting ? 'Opening GitHub…' : 'Connect GitHub'}</span></button>
          </>
        ) : <ApplyForm onDone={load} linked={gh.configured ? gh.login : null} />}
      </div>
    )
  }
  if (a.status === 'PENDING') {
    return <div className="dpanel"><span className="dbadge warn">Under review</span><h3>Thanks, {a.publisherName}!</h3><p>Your application is waiting for an admin. We’ll email you as soon as there’s a decision.</p><dl className="dsum"><div><dt>GitHub</dt><dd>@{a.github}</dd></div>{a.website && <div><dt>Website</dt><dd>{a.website}</dd></div>}</dl></div>
  }
  if (a.status === 'APPROVED') {
    return (
      <div className="dpanel">
        <span className="dbadge ok">Approved</span><h3>You’re a CXXS collaborator</h3>
        <p>Submit your apps and manage them from your dashboard. Each app and each new version is reviewed by an admin before it goes live.</p>
        <div className="drow"><a className="btn-p" href="/developers/apps/"><span className="btn-p__t">Open my dashboard <ArrowIcon /></span></a></div>
      </div>
    )
  }
  return (
    <div className="dpanel">
      <span className="dbadge bad">Not approved</span><h3>Your application was not approved</h3>
      {a.reviewNote && <div className="dnote"><p><b>Reason:</b> {a.reviewNote}</p></div>}
      {again ? <ApplyForm initial={a} linked={gh.configured ? gh.login : null} onDone={() => { setAgain(false); load() }} /> : <div className="drow"><button className="btn-p" onClick={() => setAgain(true)}><span className="btn-p__t">Update and apply again</span></button></div>}
    </div>
  )
}

export default function Developers() {
  return (
    <Layout banner={false}>
      <section className="dhero">
        <div className="wrap dhero__in">
          <div>
            <span className="tag tag--info">For developers</span>
            <h1>Publish your app on <em>CXXS</em></h1>
            <p>Reach people who like small, well-made software. Link a public GitHub release, and once an admin has verified you and your app, it appears in the store with its own page, ratings and download count.</p>
            <ul className="dneeds">{NEEDS.map((n) => <li key={n}><CheckIcon />{n}</li>)}</ul>
          </div>
          <Panel />
        </div>
      </section>
      <section className="sec sec--tint">
        <div className="wrap">
          <header className="sec__h sec__h--c"><h2>How publishing works</h2><p>Two checks keep the store trustworthy: one for you, one for your app.</p></header>
          <ol className="steps dsteps">{STEPS.map(([Icon, t, d], i) => <li key={t}><span className="steps__n">{i + 1}</span><span className="steps__i"><Icon /></span><h3>{t}</h3><p>{d}</p></li>)}</ol>
        </div>
      </section>
    </Layout>
  )
}
