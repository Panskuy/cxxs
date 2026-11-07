/**
 * Cleans a README or hand-written description before it is stored: no HTML (we only keep Markdown),
 * no control characters, relative links and images turned into absolute GitHub URLs, and a size cap.
 * The web page renders the result without ever inserting HTML, so this is tidying, not the security boundary.
 */
export const MAX_DETAILS = 20_000

const ABSOLUTE = /^(https?:\/\/|#|mailto:)/i

export function normalizeMarkdown(input: string | null | undefined, repoFullName?: string): string {
  let md = (input ?? '').slice(0, 120_000).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  // Leave fenced code alone: `<div>` inside a code block is code, not markup.
  md = md
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part, i) => (i % 2 === 1 ? part : stripHtml(part, repoFullName)))
    .join('')
  md = md.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  if (md.length > MAX_DETAILS) {
    const cut = md.slice(0, MAX_DETAILS)
    const para = cut.lastIndexOf('\n\n')
    md = (para > MAX_DETAILS * 0.6 ? cut.slice(0, para) : cut).trimEnd()
  }
  return md
}

function stripHtml(text: string, repo?: string): string {
  const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find((x) => x !== undefined) ?? ''
  let s = text.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attr(tag, 'src')
    return src ? `![${attr(tag, 'alt').replace(/[\[\]]/g, '')}](${src})` : ''
  })
  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_m, a: string, inner: string) => {
    const href = attr(`<a ${a}>`, 'href')
    const label = inner.replace(/<[^>]+>/g, '').trim()
    return inner.includes('![') ? inner : href && label ? `[${label}](${href})` : label
  })
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, inner: string) => `\n\n${'#'.repeat(Number(n))} ${inner.replace(/<[^>]+>/g, '').trim()}\n\n`)
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|details|summary|tr)>/gi, '\n\n').replace(/<li\b[^>]*>/gi, '\n- ')
  s = s.replace(/<\/?[a-zA-Z][^>\n]*>/g, '')
  if (repo) {
    const path = (u: string) => u.replace(/^\.?\//, '')
    s = s.replace(/(!?)\[([^\]]*)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?)\s*\)/g, (m, bang: string, label: string, url: string, title: string) => {
      if (ABSOLUTE.test(url) || /^[a-z][a-z0-9+.-]*:/i.test(url)) return m
      const base = bang ? `https://raw.githubusercontent.com/${repo}/HEAD/` : `https://github.com/${repo}/blob/HEAD/`
      return `${bang}[${label}](${base}${path(url)}${title})`
    })
  }
  return s
}

/** The first plain paragraph, handy as a short summary suggestion. */
export function firstParagraph(md: string, max = 300): string {
  for (const block of md.split(/\n{2,}/)) {
    const t = block.trim()
    if (!t || /^(#|```|~~~|[-*+] |\d+\. |>|\||!\[|\[!\[|---|===)/.test(t)) continue
    const plain = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()
    if (plain.length >= 20) return plain.length > max ? plain.slice(0, max - 1).trimEnd() + '…' : plain
  }
  return ''
}

const IMG_HOSTS = ['raw.githubusercontent.com', 'user-images.githubusercontent.com', 'private-user-images.githubusercontent.com', 'camo.githubusercontent.com']
/** Same rule as the web page: images are shown only from GitHub's own hosts. */
export function githubImage(src: string): boolean {
  try {
    const u = new URL(src)
    if (u.protocol !== 'https:') return false
    return IMG_HOSTS.includes(u.hostname) || (u.hostname === 'github.com' && (u.pathname.startsWith('/user-attachments/') || /\/(raw|assets)\//.test(u.pathname)))
  } catch { return false }
}

/** The first picture in a description that may be shown (used as the card cover). */
export function firstImage(md: string | null | undefined): string | null {
  for (const m of (md ?? '').matchAll(/!\[[^\]\n]*\]\((https:\/\/[^)\s]+)/g)) if (githubImage(m[1]) && !/\.(svg)(\?|$)/i.test(m[1])) return m[1]
  return null
}
