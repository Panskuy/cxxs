import './markdown.css'

/**
 * A small Markdown renderer for app descriptions. It builds React elements and never inserts HTML,
 * so nothing in a README can run script. Links must be http(s) or mailto; images only from GitHub's own hosts.
 */
const IMG_HOSTS = ['raw.githubusercontent.com', 'user-images.githubusercontent.com', 'private-user-images.githubusercontent.com', 'camo.githubusercontent.com']

function imageOk(src) {
  try {
    const u = new URL(src)
    if (u.protocol !== 'https:') return false
    if (IMG_HOSTS.includes(u.hostname)) return true
    return u.hostname === 'github.com' && (u.pathname.startsWith('/user-attachments/') || /\/(raw|assets)\//.test(u.pathname))
  } catch { return false }
}
function linkOk(href) {
  try { return ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol) } catch { return false }
}

// `code`, ![alt](src), [text](href), **bold**, *italic* / _italic_, bare https:// links
const INLINE = /(`[^`\n]+`)|(!\[[^\]\n]*\]\([^)\s]+(?:\s+"[^"]*")?\))|(\[(?:[^\[\]\n]|!\[[^\]\n]*\]\([^)\s]*\))*\]\([^)\s]+(?:\s+"[^"]*")?\))|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\s][^*\n]*\*|(?<![A-Za-z0-9])_[^_\s][^_\n]*_(?![A-Za-z0-9]))|(https?:\/\/[^\s<>)\]]+)/g

function inline(text, key = '') {
  const out = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${key}${n++}`
    const [tok] = m
    if (m[1]) out.push(<code key={k}>{tok.slice(1, -1)}</code>)
    else if (m[2]) {
      const g = tok.match(/^!\[([^\]]*)\]\(([^)\s]+)/)
      if (g && imageOk(g[2])) out.push(<img key={k} src={g[2]} alt={g[1]} loading="lazy" referrerPolicy="no-referrer" />)
    } else if (m[3]) {
      const g = tok.match(/^\[([\s\S]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/)
      const kids = g ? inline(g[1], `${k}.`) : []
      if (g && linkOk(g[2])) { if (kids.length) out.push(<a key={k} href={g[2]} target="_blank" rel="noopener noreferrer nofollow ugc">{kids}</a>) } else out.push(...kids)
    } else if (m[4]) out.push(<b key={k}>{inline(tok.slice(2, -2), `${k}.`)}</b>)
    else if (m[5]) out.push(<i key={k}>{inline(tok.slice(1, -1), `${k}.`)}</i>)
    else if (m[6]) {
      const url = tok.replace(/[.,;:!?]+$/, '')
      out.push(<a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow ugc">{url}</a>)
      last = m.index + url.length
      continue
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

function blocks(lines, key = '') {
  const out = []
  let i = 0
  let n = 0
  while (i < lines.length) {
    const line = lines[i]
    const k = `${key}b${n++}`
    if (!line.trim()) { i++; continue }
    const fence = line.match(/^\s*(```|~~~)/)
    if (fence) {
      const body = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      i++
      out.push(<pre key={k}><code>{body.join('\n')}</code></pre>)
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (h) {
      const L = h[1].length
      const Tag = L <= 2 ? 'h3' : L === 3 ? 'h4' : 'h5'
      out.push(<Tag key={k}>{inline(h[2], `${k}.`)}</Tag>)
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push(<hr key={k} />); i++; continue }
    if (line.trim().startsWith('>')) {
      const q = []
      while (i < lines.length && lines[i].trim().startsWith('>')) q.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(<blockquote key={k}>{blocks(q, `${k}.`)}</blockquote>)
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      out.push(
        <div className="md__table" key={k}><table>
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${k}h${j}.`)}</th>)}</tr></thead>
          <tbody>{rows.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j}>{inline(c, `${k}r${a}c${j}.`)}</td>)}</tr>)}</tbody>
        </table></div>,
      )
      continue
    }
    const li = line.match(LIST)
    if (li) {
      const base = li[1].length
      const ordered = /\d/.test(li[2])
      const items = []
      while (i < lines.length) {
        const m = lines[i].match(LIST)
        if (m && m[1].length === base && /\d/.test(m[2]) === ordered) {
          items.push({ text: [m[3]], sub: [] })
          i++
        } else if (items.length && lines[i].trim() && (lines[i].match(/^\s*/)[0].length > base)) {
          const cur = items[items.length - 1]
          if (LIST.test(lines[i])) cur.sub.push(lines[i].slice(Math.min(base + 2, lines[i].match(/^\s*/)[0].length))); else cur.text.push(lines[i].trim())
          i++
        } else break
      }
      const Tag = ordered ? 'ol' : 'ul'
      out.push(<Tag key={k}>{items.map((it, j) => <li key={j}>{inline(it.text.join(' '), `${k}i${j}.`)}{it.sub.length > 0 && blocks(it.sub, `${k}i${j}s`)}</li>)}</Tag>)
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++].trim())
    if (!para.length) { i++; continue }
    out.push(<p key={k}>{inline(para.join(' '), `${k}.`)}</p>)
  }
  return out
}

export default function Markdown({ text }) {
  return <div className="md">{blocks(String(text ?? '').replace(/\r\n?/g, '\n').split('\n'))}</div>
}
