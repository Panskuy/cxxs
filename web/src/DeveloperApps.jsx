import { useCallback, useEffect, useState } from 'react'
import Layout from './Layout'
import { useAuth } from './auth'
import { cj, fmtSize } from './community'
import { ArrowIcon } from './icons'
import Markdown from './Markdown'
import './developers.css'

const TONE = { PENDING: 'warn', FETCHING: 'warn', APPROVED: 'ok', REJECTED: 'bad', FAILED: 'bad', UNPUBLISHED: 'muted' }
const LABEL = { PENDING: 'Waiting for review', FETCHING: 'Fetching file…', APPROVED: 'Live', REJECTED: 'Not approved', FAILED: 'File failed', UNPUBLISHED: 'Unpublished' }
const Badge = ({ s, text }) => <span className={`dbadge ${TONE[s] ?? ''}`}>{text ?? LABEL[s] ?? s}</span>
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })

function ConnectButton() {
  const [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); const r = await cj('collab/github/connect'); if (r.ok) window.location.href = r.data.url; else { setBusy(false); alert('GitHub sign-in is not available right now.') } }
  return <button className="btn-p" onClick={go} disabled={busy}><span className="btn-p__t">{busy ? 'Opening GitHub…' : 'Connect GitHub'}</span></button>
}

function Field({ id, label, hint, children }) {
  return <div className="df"><label htmlFor={id}>{label}</label>{children}{hint && <small>{hint}</small>}</div>
}

/** Looks up a repository on GitHub and lets the developer choose the release file to submit. */
function RepoPicker({ initialRepo = '', lockRepo = false, onPick }) {
  const [repo, setRepo] = useState(initialRepo)
  const [mine, setMine] = useState(null)
  useEffect(() => { if (lockRepo) return; cj('collab/github/repos').then((r) => setMine(r.ok ? r.data.repos : [])) }, [lockRepo])
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState({ tag: '', assetId: '' })

  const check = useCallback(async (value) => {
    // A new lookup invalidates whatever was chosen before, so a failed one never leaves a stale choice behind.
    onPick(null)
    setErr(''); setInfo(null); setBusy(true)
    const r = await cj(`collab/github?repo=${encodeURIComponent(value)}`)
    setBusy(false)
    if (!r.ok) return setErr(r.status === 429 ? 'Too many lookups. Try again in a while.' : r.data.message || 'Could not check that repository.')
    if (!r.data.releases.length) return setErr('That repository has no published release with a downloadable file. Create a GitHub release and attach your app first.')
    setInfo(r.data)
    const first = r.data.releases[0]
    setSel({ tag: first.tag, assetId: first.assets[0].id })
    onPick({ repo: value, info: r.data, tag: first.tag, assetId: first.assets[0].id })
  }, [onPick])
  useEffect(() => { if (lockRepo && initialRepo) check(initialRepo) }, [lockRepo, initialRepo, check])

  const rel = info?.releases.find((r) => r.tag === sel.tag)
  const change = (tag, assetId) => { setSel({ tag, assetId }); onPick({ repo, info, tag, assetId }) }
  return (
    <div className="picker">
      {!lockRepo && !mine && <p className="muted">Loading your repositories…</p>}
      {!lockRepo && mine && mine.length > 0 && (
        <Field id="p-mine" label="Your repository" hint="Only your own public repositories that already have a GitHub release with an app file are listed.">
          <select id="p-mine" value={repo} onChange={(e) => { setRepo(e.target.value); if (e.target.value) check(e.target.value); else { onPick(null); setInfo(null); setErr('') } }}>
            <option value="">Select a repository…</option>
            {mine.map((m) => <option key={m.fullName} value={m.fullName}>{m.name} ({m.latest}){m.description ? ` — ${m.description.slice(0, 50)}` : ''}</option>)}
          </select>
        </Field>
      )}
      {!lockRepo && mine && mine.length === 0 && <p className="dnote warn"><span>None of your public repositories has a published release with an app file yet. On GitHub, open your repository, create a release (Releases → Draft a new release) and attach your app’s .zip, .exe, .msi, .dmg or similar, then refresh this page.</span></p>}
      {lockRepo && busy && <p className="muted">Checking {initialRepo}…</p>}
      {err && <p className="derr" role="alert">{err}</p>}
      {info && (
        <div className="found">
          <p><b>{info.repo.fullName}</b>{info.repo.license && <span className="tag">{info.repo.license}</span>}</p>
          {info.repo.description && <p className="muted">{info.repo.description}</p>}
          <div className="dgrid2">
            <Field id="p-tag" label="Release"><select id="p-tag" value={sel.tag} onChange={(e) => change(e.target.value, info.releases.find((r) => r.tag === e.target.value).assets[0].id)}>{info.releases.map((r) => <option key={r.tag} value={r.tag}>{r.tag}{r.prerelease ? ' (pre-release)' : ''}</option>)}</select></Field>
            <Field id="p-asset" label="File to publish"><select id="p-asset" value={sel.assetId} onChange={(e) => change(sel.tag, e.target.value)}>{rel?.assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtSize(a.size)})</option>)}</select></Field>
          </div>
        </div>
      )}
    </div>
  )
}

/** Long description in Markdown: pull it from the repository's README, or write it here. */
function DetailsEditor({ repo, value, onChange, onSummary }) {
  const [tab, setTab] = useState('write')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const importReadme = async () => {
    if (value.trim() && !confirm('Replace what you wrote with the README from GitHub?')) return
    setBusy(true); setMsg('')
    const r = await cj(`collab/github/readme?repo=${encodeURIComponent(repo)}`)
    setBusy(false)
    if (!r.ok) return setMsg(r.data.message || 'Could not read the README. Try again, or write the description yourself.')
    onChange(r.data.markdown)
    if (r.data.summary) onSummary(r.data.summary)
    setTab('preview')
    setMsg('README imported. You can edit it before you submit.')
  }
  return (
    <div className="df deditor">
      <label htmlFor="n-det">Full description (optional)</label>
      <div className="deditor__bar">
        <div className="seg" role="tablist" aria-label="Editor mode">
          <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>Write</button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>Preview</button>
        </div>
        <button type="button" className="btn-g" onClick={importReadme} disabled={busy}>{busy ? 'Reading…' : 'Import README from GitHub'}</button>
      </div>
      {tab === 'write'
        ? <textarea id="n-det" rows={12} value={value} onChange={(e) => onChange(e.target.value)} maxLength={20000} placeholder={'## What it does\n\nExplain your app, its features and how to use it. Markdown works: headings, lists, links, code and tables.'} />
        : <div className="deditor__prev">{value.trim() ? <Markdown text={value} /> : <p className="muted">Nothing to preview yet.</p>}</div>}
      <small>{msg || 'Shown on your app’s page. Markdown is supported. Images are only shown when they are hosted on GitHub. Without this, only the short description above is shown.'} <span className="deditor__n">{value.length.toLocaleString('en-US')} / 20,000</span></small>
    </div>
  )
}

function NewApp({ meta, onDone }) {
  const [pick, setPick] = useState(null)
  const [v, setV] = useState({ name: '', tagline: '', summary: '', details: '', cover: '', category: meta.categories[0], platform: meta.platforms[0], requirements: '', license: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const onPick = useCallback((p) => { setPick(p); if (p) setV((x) => ({ ...x, license: x.license || p.info.repo.license || '', name: x.name || p.info.repo.fullName.split('/')[1] })) }, [])
  const submit = async (e) => {
    e.preventDefault()
    if (!pick) return setErr('Check your repository and choose a release first.')
    setErr(''); setBusy(true)
    const r = await cj('collab/apps', 'POST', { repo: pick.repo, tag: pick.tag, assetId: pick.assetId, ...v, requirements: v.requirements || undefined, license: v.license || undefined, details: v.details.trim() || undefined, cover: v.cover.trim() || undefined })
    setBusy(false)
    if (r.ok) onDone()
    else setErr(r.data.message || (r.status === 429 ? 'Too many submissions today. Try again tomorrow.' : r.status === 413 ? 'The description is too long. Shorten it and try again.' : 'Could not submit. Try again.'))
  }
  return (
    <form className="dform" onSubmit={submit} noValidate>
      <RepoPicker onPick={onPick} />
      {pick && (
        <>
          <div className="dgrid2">
            <Field id="n-name" label="App name"><input id="n-name" value={v.name} onChange={set('name')} maxLength={40} /></Field>
            <Field id="n-tag" label="Tagline" hint="One line, up to 80 characters."><input id="n-tag" value={v.tagline} onChange={set('tagline')} maxLength={80} /></Field>
          </div>
          <Field id="n-sum" label="Short description" hint="What it does and who it is for (30 to 800 characters). Shown in the overview."><textarea id="n-sum" rows={4} value={v.summary} onChange={set('summary')} maxLength={800} /></Field>
          <DetailsEditor repo={pick.repo} value={v.details} onChange={(details) => setV((x) => ({ ...x, details }))} onSummary={(sum) => setV((x) => (x.summary.trim().length >= 30 ? x : { ...x, summary: sum }))} />
          <Field id="n-cover" label="Cover image (optional)" hint="A path in your repository (like docs/cover.png) or a link to an image hosted on GitHub. Leave it empty and we use the first image in your description, or GitHub’s automatic preview card of your repository."><input id="n-cover" value={v.cover} onChange={set('cover')} maxLength={300} placeholder="docs/cover.png" autoComplete="off" /></Field>
          <div className="dgrid2">
            <Field id="n-cat" label="Category"><select id="n-cat" value={v.category} onChange={set('category')}>{meta.categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field id="n-plat" label="Platform"><select id="n-plat" value={v.platform} onChange={set('platform')}>{meta.platforms.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field id="n-req" label="Requirements (optional)"><input id="n-req" value={v.requirements} onChange={set('requirements')} maxLength={120} placeholder="Windows 10 or 11, 64-bit" /></Field>
            <Field id="n-lic" label="License (optional)"><input id="n-lic" value={v.license} onChange={set('license')} maxLength={40} placeholder="MIT" /></Field>
          </div>
          <p className="dnote"><span>An admin will review your app before it appears in the store. We fetch the release file from GitHub and record its SHA-256 so the file people download is exactly the one reviewed.</span></p>
        </>
      )}
      {err && <p className="derr" role="alert">{err}</p>}
      <button className="btn-p dform__go" disabled={busy || !pick}><span className="btn-p__t">{busy ? 'Submitting…' : 'Submit for review'}</span></button>
    </form>
  )
}

function NewVersion({ app, onDone }) {
  const [pick, setPick] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr(''); setBusy(true)
    const r = await cj(`collab/apps/${app.slug}/releases`, 'POST', { tag: pick.tag, assetId: pick.assetId })
    setBusy(false)
    if (r.ok) onDone(); else setErr(r.data.message || 'Could not submit. Try again.')
  }
  return (
    <div className="dform dform--in">
      <RepoPicker initialRepo={app.repo} lockRepo onPick={setPick} />
      {err && <p className="derr" role="alert">{err}</p>}
      <button className="btn-p" onClick={submit} disabled={busy || !pick}><span className="btn-p__t">{busy ? 'Submitting…' : 'Submit this version'}</span></button>
    </div>
  )
}

function AppCard({ app, onChange }) {
  const [open, setOpen] = useState(false)
  const unpublish = async () => { if (confirm(`Unpublish ${app.name}? It will disappear from the store.`)) { await cj(`collab/apps/${app.slug}/unpublish`, 'POST', {}); onChange() } }
  return (
    <article className="dapp">
      <header>
        <div><h3>{app.name}</h3><p className="muted">{app.tagline}</p></div>
        <Badge s={app.status} />
      </header>
      {app.reviewNote && <p className="dnote warn"><span><b>Reviewer’s note:</b> {app.reviewNote}</span></p>}
      <ul className="drel">
        {app.releases.map((r) => (
          <li key={r.id}><span className="mono">{r.tag}</span><span className="muted">{r.assetName} · {fmtSize(r.assetSize)} · {when(r.createdAt)}</span><Badge s={r.status} />{(r.note && r.status === 'REJECTED') && <small className="derr">{r.note}</small>}{r.error && <small className="derr">{r.error}</small>}</li>
        ))}
      </ul>
      <div className="drow">
        {app.status !== 'APPROVED' && app.status !== 'UNPUBLISHED' && !app.releases.some((r) => ['PENDING', 'FETCHING'].includes(r.status)) && <button className="btn-g" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Submit again'}</button>}
        {app.status === 'APPROVED' && <><a className="btn-g" href={`/apps/${app.slug}/`}>View in store <ArrowIcon /></a><button className="btn-g" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Submit a new version'}</button><button className="btn-g btn-g--danger" onClick={unpublish}>Unpublish</button></>}
      </div>
      {open && <NewVersion app={app} onDone={() => { setOpen(false); onChange() }} />}
    </article>
  )
}

export default function DeveloperApps() {
  const { status, openLogin } = useAuth()
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const load = useCallback(async () => { const r = await cj('collab/me'); setMe(r.ok ? r.data : null); setLoading(false) }, [])
  useEffect(() => { if (status === 'user') load(); else if (status === 'anon') setLoading(false) }, [status, load])
  // Releases are fetched in the background: keep refreshing while any is still downloading.
  const fetching = me?.apps.some((a) => a.releases.some((r) => r.status === 'FETCHING'))
  useEffect(() => { if (!fetching) return; const id = setInterval(load, 4000); return () => clearInterval(id) }, [fetching, load])

  let body
  if (status === 'loading' || loading) body = <p className="muted">Loading…</p>
  else if (status === 'anon') body = <div className="dpanel"><h3>Sign in to continue</h3><button className="btn-p" onClick={() => openLogin({ title: 'Sign in', text: 'Sign in to manage your apps.' })}><span className="btn-p__t">Sign in</span></button></div>
  else if (me?.application?.status === 'APPROVED' && me.github?.configured && !me.github.login) body = <div className="dpanel"><h3>Connect your GitHub account</h3><p>To publish, connect the GitHub account that owns your repositories. We only read your public profile and never get access to your code.</p><ConnectButton /></div>
  else if (me?.application?.status !== 'APPROVED') body = <div className="dpanel"><h3>You’re not a collaborator yet</h3><p>Apply first. Once an admin approves you, you can submit apps here.</p><a className="btn-p" href="/developers/"><span className="btn-p__t">Go to Developers</span></a></div>
  else {
    body = (
      <>
        <div className="dtop">
          <p className="muted">Publishing as <b>{me.application.publisherName}</b> (@{me.application.github})</p>
          {!adding && <button className="btn-p" onClick={() => setAdding(true)}><span className="btn-p__t">Submit a new app</span></button>}
        </div>
        {adding && <section className="dcard"><h2>Submit a new app</h2><NewApp meta={me} onDone={() => { setAdding(false); load() }} /><button className="link" onClick={() => setAdding(false)}>Cancel</button></section>}
        {me.apps.length === 0 && !adding && <div className="dpanel"><h3>No apps yet</h3><p>Submit your first app. We’ll review it and let you know by email.</p></div>}
        <div className="dlist">{me.apps.map((a) => <AppCard key={a.slug} app={a} onChange={load} />)}</div>
      </>
    )
  }
  return (
    <Layout banner={false}>
      <div className="dhead"><div className="wrap"><nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/developers/">Developers</a><span>/</span><span aria-current="page">My apps</span></nav><h1>My apps</h1></div></div>
      <div className="wrap dmain">{body}</div>
    </Layout>
  )
}
