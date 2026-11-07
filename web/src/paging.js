/** Page numbers to show: always the first, the last and a window around the current one, with gaps as null. */
export function pageList(page, pages, around = 1) {
  const keep = new Set([1, pages])
  for (let i = page - around; i <= page + around; i++) if (i >= 1 && i <= pages) keep.add(i)
  const out = []
  let last = 0
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - last > 1) out.push(null)
    out.push(n)
    last = n
  }
  return out
}

/** ?page=N from the address bar (1 when missing or invalid). */
export const pageFromUrl = () => Math.max(1, Math.floor(Number(new URLSearchParams(location.search).get('page'))) || 1)

/** Keeps ?page=N in the address bar without adding history entries. */
export function pageToUrl(page) {
  try {
    const u = new URL(location.href)
    if (page > 1) u.searchParams.set('page', String(page)); else u.searchParams.delete('page')
    history.replaceState(null, '', u)
  } catch { /* the address bar is a convenience only */ }
}
