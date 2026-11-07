import Layout from './Layout'
import ProductCard from './ProductCard'
import { Stars, useAllReviews, useTotals } from './Rating'
import { LATEST, productUrl } from './catalog'
import { useCatalog } from './community'
import { RICH } from './productpages'
import { ArrowIcon, CheckIcon, GiftIcon, CodeIcon, BoltIcon, ShieldIcon, DevicesIcon, DownloadIcon, UserIcon, PackageIcon } from './icons'
import './home.css'

const FEATURES = [
  [GiftIcon, 'Free to download', 'No payment, no trial timer, no feature locks. Create a free account and download.'],
  [ShieldIcon, 'Verified downloads', 'Every file is checked against its SHA-256 fingerprint before it is sent to you.'],
  [CodeIcon, 'Open where it can be', 'Whenever a product’s source is public, we link to it so you can see what runs on your PC.'],
  [BoltIcon, 'Small and fast', 'We build lightweight apps that start quickly and stay out of your way.'],
  [PackageIcon, 'One account, every app', 'One sign-in for every product, with your download history in one place.'],
  [DevicesIcon, 'You stay in control', 'See where you are signed in, sign out other devices, and delete your account any time.'],
]
const STEPS = [
  [UserIcon, 'Create a free account', 'Sign up with your email. It takes less than a minute.'],
  [CheckIcon, 'Confirm your email', 'Open the link we send you. This keeps downloads tied to real people.'],
  [DownloadIcon, 'Download and run', 'Pick a product, download it, and follow its short install steps.'],
]
const faq = (platforms) => [
  ['Is everything really free?', 'Yes. Every product in the store is free to download. You only need an account to download.'],
  ['Why do I need an account to download?', 'It lets us verify your email, keep a download history for you, and keep the service fair for everyone. You can delete your account at any time from your account page.'],
  ['Which platforms are supported?', `Right now: ${platforms.join(', ')}. Each product page lists its exact requirements.`],
  ['How do I know a download is safe?', 'Every file is verified against its SHA-256 fingerprint before it is sent to you. Some apps are not code-signed yet, so Windows may show a SmartScreen warning: choose “More info”, then “Run anyway”. Where the source is public, the product page links to it.'],
  ['Can I publish my own app here?', 'Yes. Apply as a collaborator from the Developers page. After an admin approves you, submit your app by pointing us at a public GitHub release. An admin reviews every app and every new version before it goes live.'],
  ['How do I report a problem or leave feedback?', 'Rate and review any product you have downloaded from its page. Reviews are shown to everyone.'],
]

function Reviews({ products }) {
  const items = useAllReviews(products)
  if (!items?.length) return null
  return (
    <section className="sec">
      <div className="wrap">
        <header className="sec__h sec__h--c"><h2>What people are saying</h2><p>Latest reviews from people who downloaded our apps.</p></header>
        <ul className="rv">
          {items.slice(0, 3).map((r, i) => <li key={i}><Stars value={r.stars} size={16} /><p>“{r.comment}”</p><span>{r.name} on {r.product}</span></li>)}
        </ul>
      </div>
    </section>
  )
}

export default function Home() {
  const { products: PRODUCTS } = useCatalog()
  const FEATURED = PRODUCTS.filter((p) => (p.featured || p.community) && p.status === 'available').slice(0, 6)
  const PLATFORMS = [...new Set(PRODUCTS.map((p) => p.platform))]
  const live = PRODUCTS.filter((p) => p.status === 'available')
  const hosted = live.filter((p) => !p.external) // only apps we host have downloads and ratings
  const totals = useTotals(hosted)
  const spot = FEATURED.find((p) => RICH[p.slug]?.Spotlight)
  const Spot = spot && RICH[spot.slug].Spotlight
  const available = live.length
  return (
    <Layout>
      <section className="hero">
        <div className="wrap hero__in">
          <div className="hero__copy">
            <a className="pill-new" href={productUrl(LATEST)}><b>New</b> {LATEST.name} {LATEST.version} <ArrowIcon /></a>
            <h1>Polished apps for your desktop. <em>Free</em> to download.</h1>
            <p className="hero__sub">CXXS is a small store of fast, carefully made software. Pick an app, download it, and get on with your day.</p>
            <div className="hero__cta">
              <a className="btn-p btn-p--lg hero__browse" href="/products/"><span className="btn-p__t">Browse products <ArrowIcon /></span></a>
              <a className="btn-g btn-g--lg" href="/#how">How it works</a>
            </div>
            <ul className="hero__pts"><li><CheckIcon /> Free downloads</li><li><CheckIcon /> SHA-256 verified</li><li><CheckIcon /> One account for every app</li></ul>
          </div>
          <div className="hero__vis">
            <div className="hero__stack">
              {FEATURED.slice(0, 3).map((p) => (
                <a key={p.slug} className="mini" href={productUrl(p)}>
                  <span className="mini__i" aria-hidden="true">{p.name[0].toUpperCase()}</span>
                  <span className="mini__t"><b>{p.name}</b><span>{p.tagline}</span></span>
                  <span className="tag tag--ok">{p.price}</span>
                </a>
              ))}
              {FEATURED.length === 0 && <p className="muted">New apps are coming soon.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="trust" aria-label="Highlights">
        <div className="wrap trust__in">
          {[[String(available), available === 1 ? 'app available' : 'apps available'], ['Free', 'to download'], [PLATFORMS.join(' · '), 'platforms'], [totals ? totals.downloads.toLocaleString('en-US') : '–', 'downloads so far']].map(([a, b]) => <div key={b}><b>{a}</b><span>{b}</span></div>)}
        </div>
      </section>

      <section className="sec" id="products">
        <div className="wrap">
          <header className="sec__h sec__h--row"><div><h2>Featured products</h2><p>Hand-picked, ready to download.</p></div><a className="link" href="/products/">All products <ArrowIcon /></a></header>
          <div className="cat__grid">{(FEATURED.length ? FEATURED : PRODUCTS).map((p) => <ProductCard key={p.slug} p={p} />)}</div>
        </div>
      </section>

      <section className="sec sec--tint" id="features">
        <div className="wrap">
          <header className="sec__h sec__h--c"><h2>Why people choose CXXS</h2><p>Software that respects your time, your computer and your privacy.</p></header>
          <div className="feat">{FEATURES.map(([Icon, t, d]) => <div className="feat__c" key={t}><span className="feat__i"><Icon /></span><h3>{t}</h3><p>{d}</p></div>)}</div>
        </div>
      </section>

      {Spot && (
        <section className="sec" id="spotlight">
          <div className="wrap">
            <header className="sec__h sec__h--c"><h2>Spotlight: {spot.name}</h2><p>{spot.tagline}. This is a live preview, try it.</p></header>
            <div className="demo"><Spot /></div>
            <p className="spot__more"><a className="link" href={productUrl(spot)}>See {spot.name} <ArrowIcon /></a></p>
          </div>
        </section>
      )}

      <section className="sec sec--tint" id="how">
        <div className="wrap">
          <header className="sec__h sec__h--c"><h2>Up and running in three steps</h2><p>From sign-up to your desktop in about a minute.</p></header>
          <ol className="steps">{STEPS.map(([Icon, t, d], i) => <li key={t}><span className="steps__n">{i + 1}</span><span className="steps__i"><Icon /></span><h3>{t}</h3><p>{d}</p></li>)}</ol>
        </div>
      </section>

      <Reviews products={hosted} />

      <section className="sec" id="faq">
        <div className="wrap wrap--narrow">
          <header className="sec__h sec__h--c"><h2>Frequently asked questions</h2></header>
          <div className="faq">{faq(PLATFORMS).map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="cta">
        <div className="wrap cta__in">
          <div><h2>Find your next favorite app</h2><p>Free to download. One account for everything.</p></div>
          <a className="btn-p btn-p--lg cta__btn" href="/products/"><span className="btn-p__t">Browse products <ArrowIcon /></span></a>
        </div>
      </section>
    </Layout>
  )
}
