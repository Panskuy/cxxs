import { useEffect, useState } from 'react'
import { PRODUCTS } from './catalog'

const HDR = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }
/** JSON call to the API: { ok, status, data }. */
export async function cj(path, method = 'GET', body) {
  try {
    const r = await fetch(`/api/web/${path}`, { method, credentials: 'include', headers: HDR, body: body ? JSON.stringify(body) : undefined })
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }
  } catch { return { ok: false, status: 0, data: {} } }
}

export const fmtStars = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n))

export const fmtSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** A collaborator app from the API in the same shape as our own entries in catalog.js. */
export const toProduct = (it) => ({
  ...it,
  size: fmtSize(it.size),
  repoUrl: it.repo,
  requirements: it.requirements || it.platform,
  features: undefined,
  community: true,
})

let cache = null
let inflight = null
/** Collaborator apps that are live in the store (fetched once per page). */
function load() {
  inflight ??= cj('catalog').then((r) => { cache = r.ok ? (r.data.items ?? []).map(toProduct) : []; return cache })
  return inflight
}

/** Our own products followed by the collaborators'. `ready` flips when the API has answered. */
export function useCatalog() {
  const [community, setCommunity] = useState(cache ?? [])
  const [ready, setReady] = useState(cache !== null)
  useEffect(() => {
    let live = true
    load().then((c) => { if (live) { setCommunity(c); setReady(true) } })
    return () => { live = false }
  }, [])
  return { products: [...PRODUCTS, ...community], community, ready }
}
