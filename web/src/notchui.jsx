/*
 * The notch-woy island, drawn with code. Every position, size, radius, color and path below is a
 * port of the app's own renderer (src/render.rs), in the same logical pixels, so nothing here is a
 * screenshot. Text is measured with the real font (Inter) to truncate like the app does.
 */

// ---------- colors (render.rs) ----------
export const WHITE = [255, 255, 255]
export const GRAY = [170, 170, 170]
export const DIM = [135, 135, 135]
export const GREEN = [48, 209, 88]
export const YELLOW = [255, 214, 10]
export const RED = [255, 69, 58]
export const BLUE = [10, 132, 255]
export const ORANGE = [255, 159, 10]
export const TOGGLE_OFF = [62, 62, 66]
export const ART = [205, 170, 195] // the app's sample cover
export const TINT = [135, 79, 119] // palette::tint(ART): what the app derives from that cover
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))))
export const vivid = (c) => { const m = Math.max(...c, 1); return c.map((v) => Math.round((v / m) * 235)) }
const batteryColor = (b) => (b.plugged ? GREEN : b.percent <= 10 ? RED : b.percent <= 20 ? YELLOW : WHITE)

// ---------- text measuring (Inter) ----------
const FONT = "'Inter', system-ui, sans-serif"
let ctx2d
const measure = (text, weight, size) => {
  ctx2d ??= document.createElement('canvas').getContext?.('2d') ?? null
  if (!ctx2d) return text.length * size * 0.56 // no canvas: rough estimate
  ctx2d.font = `${weight} ${size}px ${FONT}`
  return ctx2d.measureText(text).width
}
export const fit = (text, weight, size, max) => {
  if (max == null || measure(text, weight, size) <= max) return text
  let s = text
  while (s.length > 1 && measure(s + '…', weight, size) > max) s = s.slice(0, -1)
  return s.trimEnd() + '…'
}
// Word-wraps to `lines` lines, ellipsizing the last (render.rs wrap)
const wrap = (text, weight, size, max, lines) => {
  const words = text.split(' ')
  const out = []
  let cur = ''
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i]
    if (measure(next, weight, size) <= max || !cur) cur = next
    else {
      out.push(cur)
      cur = words[i]
      if (out.length === lines - 1) { cur = words.slice(i).join(' '); break }
    }
  }
  out.push(cur)
  return out.slice(0, lines).map((l, i, a) => (i === a.length - 1 ? fit(l, weight, size, max) : l))
}

// ---------- svg primitives ----------
export const rrPath = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2)
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
}
const circlePath = (cx, cy, r) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`
const arcPath = (cx, cy, r, start, sweep) => {
  const pt = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]
  const [x0, y0] = pt(start)
  if (sweep >= 359.5) { const [x1, y1] = pt(start + 180); return `M${x0} ${y0}A${r} ${r} 0 1 1 ${x1} ${y1}A${r} ${r} 0 1 1 ${x0} ${y0}` }
  const [x1, y1] = pt(start + sweep)
  return `M${x0} ${y0}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1} ${y1}`
}
const Fill = ({ d, c = WHITE, o = 1, rule }) => <path d={d} fill={rgb(c)} fillOpacity={o} fillRule={rule} />
const Stroke = ({ d, w, c = WHITE, o = 1 }) => <path d={d} fill="none" stroke={rgb(c)} strokeOpacity={o} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
const Rect = ({ x, y, w, h, r = 0, c = WHITE, o = 1 }) => <rect x={x} y={y} width={w} height={h} rx={r} fill={rgb(c)} fillOpacity={o} />
export const T = ({ children, x, y, size, weight = 400, c = WHITE, o = 1, anchor = 'start', max }) => (
  <text x={x} y={y} fontSize={size} fontWeight={weight} fill={rgb(c)} fillOpacity={o} textAnchor={anchor} fontFamily={FONT} style={{ whiteSpace: 'pre' }}>
    {fit(String(children), weight, size, max)}
  </text>
)
const Glass = ({ d }) => (<><Fill d={d} o={0.1} /><Stroke d={d} w={1} o={0.08} /></>)

// ---------- icons ----------
const Speaker = ({ x, mid, level, muted, c = WHITE, o = 1 }) => {
  const body = rrPath(x, mid - 3, 4, 6, 1.3)
  const cone = `M${x + 3.2} ${mid - 3}L${x + 7.6} ${mid - 6.8}Q${x + 8.6} ${mid - 7.6} ${x + 8.6} ${mid - 6.3}L${x + 8.6} ${mid + 6.3}Q${x + 8.6} ${mid + 7.6} ${x + 7.6} ${mid + 6.8}L${x + 3.2} ${mid + 3}Z`
  const waves = level <= 0 ? 0 : level < 0.34 ? 1 : level < 0.67 ? 2 : 3
  const cx = x + 8.6
  return (
    <g>
      <Fill d={body + cone} c={c} o={o} />
      {muted ? (
        <>
          <Stroke d={`M${x - 1} ${mid - 7.5}L${x + 12} ${mid + 7.5}`} w={4} c={c[0] === 255 ? [0, 0, 0] : c} o={o} />
          <Stroke d={`M${x - 1} ${mid - 7.5}L${x + 12} ${mid + 7.5}`} w={1.6} c={c} o={o} />
        </>
      ) : (
        [3.6, 6.8, 10].map((r, i) => {
          const d = r * Math.SQRT1_2
          return <Stroke key={r} d={`M${cx + d} ${mid - d}Q${cx + r * Math.SQRT2} ${mid} ${cx + d} ${mid + d}`} w={1.6} c={c} o={o * (i < waves ? 1 : 0.25)} />
        })
      )}
    </g>
  )
}
const Play = ({ cx, cy, o = 1 }) => <Fill d={`M${cx - 6} ${cy - 8.5}L${cx + 8} ${cy}L${cx - 6} ${cy + 8.5}Z`} o={o} />
const Pause = ({ cx, cy, o = 1 }) => <Fill d={rrPath(cx - 6.5, cy - 8.5, 4.5, 17, 1.5) + rrPath(cx + 2, cy - 8.5, 4.5, 17, 1.5)} o={o} />
const Skip = ({ cx, cy, forward, o = 1 }) => {
  const d = forward ? 1 : -1
  return <Fill o={o} d={[cx - 8 * d, cx].map((b) => `M${b} ${cy - 6}L${b + 8 * d} ${cy}L${b} ${cy + 6}Z`).join('')} />
}
const LyricsIcon = ({ cx, cy, o = 1 }) => (
  <Fill rule="evenodd" o={o} d={rrPath(cx - 8, cy - 7, 16, 12, 3.5) + `M${cx - 4.5} ${cy + 5}L${cx - 4.5} ${cy + 8.5}L${cx - 0.5} ${cy + 5}Z` + circlePath(cx - 2.6, cy - 1, 1.8) + circlePath(cx + 2.6, cy - 1, 1.8)} />
)
const OutputIcon = ({ cx, cy, o = 1 }) => (
  <g>
    {[8, 4].map((r) => <Stroke key={r} d={arcPath(cx, cy - 1.5, r, 130, 280)} w={1.8} o={o} />)}
    <Fill d={`M${cx - 5.5} ${cy + 9}L${cx + 5.5} ${cy + 9}L${cx} ${cy + 3}Z`} o={o} />
  </g>
)
const Device = ({ kind, cx, cy, o = 1 }) => {
  if (kind === 'headphones') {
    const r = 5.5, y = cy + 1, k = r * 0.5522848
    return (
      <g>
        <Stroke d={`M${cx - r} ${y}C${cx - r} ${y - k} ${cx - k} ${y - r} ${cx} ${y - r}C${cx + k} ${y - r} ${cx + r} ${y - k} ${cx + r} ${y}`} w={1.6} o={o} />
        <Fill d={rrPath(cx - r - 1.3, y - 0.5, 3.2, 6, 1.3) + rrPath(cx + r - 1.9, y - 0.5, 3.2, 6, 1.3)} o={o} />
      </g>
    )
  }
  if (kind === 'keyboard') {
    return (
      <g>
        <Stroke d={rrPath(cx - 7, cy - 4.5, 14, 9, 2)} w={1.3} o={o} />
        <Fill d={[0, 1, 2, 3].map((i) => rrPath(cx - 4.6 + i * 2.6, cy - 2, 1.6, 1.6, 0.4)).join('') + rrPath(cx - 3, cy + 1.2, 6, 1.5, 0.5)} o={o} />
      </g>
    )
  }
  if (kind === 'phone') return <Stroke d={rrPath(cx - 4, cy - 7, 8, 14, 2) + `M${cx - 1.3} ${cy + 4.6}L${cx + 1.3} ${cy + 4.6}`} w={1.4} o={o} />
  // Bluetooth rune
  return <Stroke d={`M${cx - 3.5} ${cy - 3.5}L${cx + 3.5} ${cy + 3.2}L${cx} ${cy + 6.8}L${cx} ${cy - 6.8}L${cx + 3.5} ${cy - 3.2}L${cx - 3.5} ${cy + 3.5}`} w={1.4} o={o} />
}
const BATTERY_ASPECT = 2.15
export const batteryW = (h, plugged) => h * BATTERY_ASPECT + (1 + h * 0.13) + (plugged ? 3 + h * 0.6 : 0)
const Bolt = ({ x, y, s, c = WHITE, o = 1 }) => {
  const pts = [[4.6, 0], [0, 6.8], [3.6, 6.8], [2.8, 12], [8, 4.8], [4.4, 4.8], [5.6, 0]]
  return <Fill c={c} o={o} d={pts.map(([px, py], i) => `${i ? 'L' : 'M'}${x + px * s} ${y + py * s}`).join('') + 'Z'} />
}
const Battery = ({ x, y, h, b, o = 1 }) => {
  const w = h * BATTERY_ASPECT, r = h * 0.32
  const level = w * Math.min(1, Math.max(0, b.percent / 100))
  const nubW = h * 0.13
  const size = h * 0.78
  return (
    <g>
      <Rect x={x} y={y} w={w} h={h} r={r} o={o * 0.35} />
      {level > 0.5 && <Rect x={x} y={y} w={level} h={h} r={Math.min(r, level / 2)} c={batteryColor(b)} o={o} />}
      <Rect x={x + w + 1} y={y + h * 0.31} w={nubW} h={h * 0.38} r={nubW / 2} o={o * 0.35} />
      <T x={x + w / 2} y={y + h / 2 + size * 0.35} size={size} weight={600} c={[0, 0, 0]} o={o * 0.85} anchor="middle">{b.percent}</T>
      {b.plugged && <Bolt x={x + w + 1 + nubW + 3} y={y + h / 2 - 6 * ((h / 12) * 0.85)} s={(h / 12) * 0.85} o={o} />}
    </g>
  )
}
const Airplane = ({ cx, cy, o = 1 }) => {
  const half = [[0, -7.6], [1.4, -6], [1.4, -1.8], [7.4, 1.9], [7.4, 3.4], [1.4, 1.8], [1.4, 4.9], [3.5, 6.5], [3.5, 7.6], [0, 6.7]]
  const outline = [...half, ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y])]
  return <Fill o={o} d={outline.map(([x, y], i) => `${i ? 'L' : 'M'}${cx + x} ${cy + y}`).join('') + 'Z'} />
}
const Wifi = ({ cx, cy, o = 1 }) => {
  const base = cy + 5
  return (
    <g>
      {[4, 7.5, 11].map((r) => { const d = r * Math.SQRT1_2; return <Stroke key={r} d={`M${cx - d} ${base - d}Q${cx} ${base - r * Math.SQRT2} ${cx + d} ${base - d}`} w={1.8} o={o} /> })}
      <Fill d={circlePath(cx, base, 1.6)} o={o} />
    </g>
  )
}
const Sun = ({ cx, cy, dark, o = 1 }) => {
  const c = dark ? [40, 40, 40] : WHITE
  return (
    <g>
      <Fill d={circlePath(cx, cy, 3.4)} c={c} o={o} />
      <Stroke w={1.5} c={c} o={o} d={Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `M${cx + Math.cos(a) * 5.6} ${cy + Math.sin(a) * 5.6}L${cx + Math.cos(a) * 7.6} ${cy + Math.sin(a) * 7.6}` }).join('')} />
    </g>
  )
}

// ---------- Resting notch (drawn from the left and right edges of the current shape) ----------
const MID = 15
const Eq = ({ x, c, count = 3, w = 3, gap = 2, h0 = 15, mid, delays = [0, 0.18, 0.09, 0.27] }) => (
  <g>
    {Array.from({ length: count }, (_, i) => (
      <rect key={i} className="eq" x={x + i * (w + gap)} y={mid - h0 / 2} width={w} height={h0} rx={w / 2} fill={rgb(c)}
        style={{ animationDelay: `${delays[i] * -3}s`, animationDuration: `${0.8 + i * 0.13}s` }} />
    ))}
  </g>
)
export function CollapsedLeft({ time = '9:41' }) {
  const tw = measure(time, 600, 13)
  const mediaLeft = 14 + tw + 8
  return (
    <g>
      <T x={14} y={MID + 13 * 0.36} size={13} weight={600}>{time}</T>
      <Fill d={rrPath(mediaLeft, MID - 10, 20, 20, 5)} c={ART} />
      <Eq x={mediaLeft + 28} c={GREEN} mid={MID} />
    </g>
  )
}
export function CollapsedRight({ battery }) {
  const w = batteryW(13, battery.plugged)
  return (
    <g>
      <Device kind="headphones" cx={-14 - w - 16} cy={MID} o={0.9} />
      <Battery x={-14 - w} y={MID - 6.5} h={13} b={battery} />
    </g>
  )
}

// ---------- Alerts ----------
export function NowPlayingL({ title, artist, rightEdge }) {
  const mid = 34, art = 40
  const eqW = 4 * 3.5 + 3 * 3
  const max = rightEdge - 22 - eqW - 14 - (16 + art + 12)
  return (
    <g>
      <Fill d={rrPath(16, mid - art / 2, art, art, 10)} c={ART} />
      <T x={16 + art + 12} y={mid - 2} size={14} weight={600} max={max}>{title}</T>
      <T x={16 + art + 12} y={mid + 14} size={12.5} weight={400} c={GRAY} max={max}>{artist}</T>
    </g>
  )
}
export function NowPlayingR() {
  const mid = 34
  const eqW = 4 * 3.5 + 3 * 3
  return <Eq x={-22 - eqW} c={vivid(TINT)} count={4} w={3.5} gap={3} h0={22} mid={mid} />
}
export function BluetoothL({ name, battery, rightEdge }) {
  const mid = 20
  const bw = batteryW(14, false)
  const max = rightEdge - 20 - bw - 12 - 44
  return (
    <g>
      <Device kind="headphones" cx={27} cy={mid} />
      <T x={44} y={mid + 4.5} size={13.5} weight={600} max={max}>{name}</T>
    </g>
  )
}
export function BluetoothR({ battery }) {
  const mid = 20
  const bw = batteryW(14, false)
  return <Battery x={-20 - bw} y={mid - 7} h={14} b={{ percent: battery, plugged: false, charging: false }} />
}
export function VolumeL({ level }) {
  return <Speaker x={16} mid={16} level={level} muted={false} />
}
export function VolumeR({ level }) {
  const x1 = -18, x0 = x1 - 72, mid = 16
  return (
    <g>
      <Rect x={x0} y={mid - 2} w={72} h={4} r={2} o={0.25} />
      <Rect x={x0} y={mid - 2} w={72 * level} h={4} r={2} />
    </g>
  )
}
export function ToastL({ app, title, body, rightEdge, gradId, glowRef }) {
  const accent = vivid([37, 211, 102])
  const iconX = 20, iconY = 25, textX = iconX + 44 + 14
  const textRight = rightEdge - 22
  const width = textRight - textX
  const nowW = measure('now', 600, 11.5)
  const [line] = wrap(body, 400, 13, width, 1)
  return (
    <g>
      <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={rightEdge * 0.7} y2="0" ref={glowRef}>
        <stop offset="0" stopColor={rgb(accent)} stopOpacity="0.38" />
        <stop offset="0.45" stopColor={rgb(accent)} stopOpacity="0.12" />
        <stop offset="1" stopColor={rgb(accent)} stopOpacity="0" />
      </linearGradient>
      <rect x="0" y="0" width={rightEdge} height="80" fill={`url(#${gradId})`} />
      <Fill d={rrPath(iconX, iconY, 44, 44, 11)} c={accent} />
      <T x={iconX + 22} y={iconY + 22 + 7} size={19} weight={700} anchor="middle">{app[0].toUpperCase()}</T>
      <T x={textX} y={32} size={11.5} weight={600} c={DIM} max={width - nowW - 8}>{app}</T>
      <T x={textRight} y={32} size={11.5} weight={600} c={DIM} anchor="end">now</T>
      <T x={textX} y={49} size={14.5} weight={700} max={width}>{title}</T>
      <T x={textX} y={65} size={13} weight={400} c={[215, 215, 215]}>{line}</T>
    </g>
  )
}
export function ToastR() {
  return null
}

// ---------- Player page (Layout::new with the lyrics shown: player 250 wide, lyrics the rest) ----------
const LYRIC_LINES = ['Previous lyric line', 'The line being sung right now', 'Next line', 'A very long upcoming line that has to be cut off', '']
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
export const TRACK = 109

export function PlayerPage({ scroll, sung, elapsed, uid }) {
  const left = 40, player = 250, width = 520, height = 150
  const x0 = left + 76, x1 = left + player - 66
  const frac = elapsed / TRACK
  const track = rrPath(x0, 88, x1 - x0, 6, 3)
  const clip = `pc-${uid}`
  const panelLeft = left + player, textX = panelLeft + 18, maxW = left + width - textX - 18
  return (
    <g>
      <Fill d={rrPath(left + 22, 12, 62, 62, 10)} c={ART} />
      <T x={left + 106} y={50} size={14.5} weight={800} max={player - 106 - 14}>Pilih Mama Muda</T>
      <T x={left + 106} y={66} size={12.5} weight={800} c={GRAY} max={player - 106 - 14}>Maman Fvndy - Pilih Mama Muda</T>
      <T x={left + 24} y={95} size={12} weight={600} o={0.6}>{fmt(elapsed)}</T>
      <T x={left + player - 15} y={95} size={12} weight={600} o={0.6} anchor="end">{`-${fmt(TRACK - elapsed)}`}</T>
      <clipPath id={clip}><path d={track} /></clipPath>
      <Fill d={track} o={0.22} />
      <rect x={x0} y={88} width={(x1 - x0) * frac} height={6} fill="#fff" fillOpacity={0.9} clipPath={`url(#${clip})`} />
      <LyricsIcon cx={left + 53} cy={118} />
      <Skip cx={left + 92} cy={118} forward={false} />
      <Pause cx={left + 131} cy={118} />
      <Skip cx={left + 170} cy={118} forward />
      <OutputIcon cx={left + 2 * 131 - 53} cy={118} />
      <Rect x={panelLeft} y={22} w={1} h={height - 44} o={0.1} />
      {LYRIC_LINES.map((line, i) => {
        const d = i - scroll
        if (d < -3 || d > 4) return null
        const baseline = 62 + d * 22
        const focus = Math.max(0, 1 - Math.abs(d))
        const col = lerp(DIM, WHITE, focus)
        const edge = clamp01((baseline - 18) / 20) * clamp01((height - 8 - baseline) / 24)
        const a = edge * Math.max(1 - Math.abs(d) * 0.25, 0.35)
        const text = line === '' ? '• • •' : line
        if (sung && sung.idx === i && line !== '') {
          const shown = fit(text, 800, 13.5, maxW)
          const ahead = lerp(DIM, WHITE, focus * 0.3)
          let prev = 0
          return (
            <text key={i} x={textX} y={baseline} fontSize={13.5} fontWeight={800} fillOpacity={a} fontFamily={FONT} style={{ whiteSpace: 'pre' }}>
              {[...shown].map((ch, k) => {
                const t = clamp01((sung.chars - k) / 1.6)
                const lift = t
                const dy = -(lift - prev)
                prev = lift
                return <tspan key={k} dy={dy} fill={rgb(lerp(ahead, col, t))}>{ch}</tspan>
              })}
            </text>
          )
        }
        return <T key={i} x={textX} y={baseline} size={13.5} weight={800} c={col} o={a} max={maxW}>{text}</T>
      })}
    </g>
  )
}

// ---------- Control Center page (left = (canvas - 560) / 2) ----------
export function ControlsPage() {
  const L = 20, W = 560
  const TOP = 12, H = 126
  const a = 16 + 35 + L, b = 16 + 91 + L, top = TOP + 35, bottom = TOP + 91
  const toggles = [
    { cx: a, cy: top, color: ORANGE, on: 0, icon: 'air' },
    { cx: b, cy: top, color: RED, on: 0, icon: 'mute', scale: 0.88 },
    { cx: a, cy: bottom, color: BLUE, on: 1, icon: 'wifi' },
    { cx: b, cy: bottom, color: BLUE, on: 1, icon: 'bt' },
  ]
  const slider = (x, v, kind) => {
    const levelH = H * v
    const covered = levelH > 30
    const cx = x + 26, cy = TOP + H - 20
    const clip = `sl-${kind}`
    return (
      <g key={kind}>
        <Fill d={rrPath(x, TOP, 52, H, 24)} o={0.16} />
        <clipPath id={clip}><path d={rrPath(x, TOP, 52, H, 24)} /></clipPath>
        <rect x={x} y={TOP + H - levelH} width={52} height={levelH} fill="#fff" fillOpacity={0.95} clipPath={`url(#${clip})`} />
        {kind === 'b' ? <Sun cx={cx} cy={cy} dark={covered} o={covered ? 0.75 : 1} /> : <Speaker x={cx - 6} mid={cy} level={v} muted={false} c={covered ? [40, 40, 40] : WHITE} o={covered ? 0.75 : 1} />}
      </g>
    )
  }
  const mx = L + 286, mw = W - 286 - 16, mh = (H - 10) / 2, lower = TOP + mh + 10
  const mid = TOP + mh / 2
  const artX = mx + (mh - 38) / 2
  const textX = artX + 38 + 10
  const maxT = mx + mw - 44 - textX
  const cx = mx + mh / 2, cy = lower + mh / 2
  const btX = mx + mh + 10, btW = mw - mh - 10, btMid = lower + mh / 2
  return (
    <g>
      <Glass d={rrPath(L + 16, TOP, H, H, 28)} />
      {toggles.map((t) => {
        const r = 23 * (t.scale ?? 1)
        return (
          <g key={t.icon}>
            <Fill d={circlePath(t.cx, t.cy, r)} c={lerp(TOGGLE_OFF, t.color, t.on)} />
            {t.icon === 'air' && <Airplane cx={t.cx} cy={t.cy} />}
            {t.icon === 'wifi' && <Wifi cx={t.cx} cy={t.cy + 1} />}
            {t.icon === 'bt' && <Device kind="other" cx={t.cx} cy={t.cy} />}
            {t.icon === 'mute' && <Speaker x={t.cx - 6} mid={t.cy} level={1} muted={false} />}
          </g>
        )
      })}
      {slider(L + 156, 0.7, 'b')}
      {slider(L + 220, 0.45, 'v')}
      {/* Now Playing module */}
      <Glass d={rrPath(mx, TOP, mw, mh, 20)} />
      <Fill d={rrPath(artX, mid - 19, 38, 38, 9)} c={ART} />
      <Pause cx={mx + mw - 22} cy={mid} />
      <T x={textX} y={mid - 2} size={12.5} weight={600} max={maxT}>Pilih Mama Muda</T>
      <T x={textX} y={mid + 12} size={11} weight={400} c={GRAY} max={maxT}>Maman Fvndy</T>
      {/* Battery module: charging, 85% */}
      <Glass d={rrPath(mx, lower, mh, mh, 20)} />
      <Stroke d={circlePath(cx, cy, 18)} w={4} o={0.15} />
      <Stroke d={arcPath(cx, cy, 18, -90, 360 * 0.85)} w={4} c={GREEN} />
      <T x={cx} y={cy + 1.5} size={12} weight={600} anchor="middle">85</T>
      <Bolt x={cx - 3} y={cy + 4} s={0.5} c={GREEN} />
      {/* Bluetooth module: Galaxy Buds2 Pro */}
      <Glass d={rrPath(btX, lower, btW, mh, 20)} />
      <Fill d={circlePath(btX + 22, btMid, 14)} c={BLUE} />
      <Device kind="headphones" cx={btX + 22} cy={btMid} />
      <T x={btX + 44} y={btMid - 2} size={12.5} weight={600} max={btX + btW - 12 - (btX + 44)}>Galaxy Buds2 Pro</T>
      <T x={btX + 44} y={btMid + 12} size={11} weight={400} c={GRAY} max={btX + btW - 12 - (btX + 44)}>Connected · 72%</T>
    </g>
  )
}

// ---------- Shelf page (3 files: 400 wide, left = 100) ----------
const SHELF_FILES = [
  { name: 'Holiday photo.jpg', picture: true },
  { name: 'Quarterly report final v2.docx' },
  { name: 'notes.txt' },
]
export function ShelfPage() {
  const left = 100, width = 400
  const x0 = left + 18, x1 = left + width - 18
  const tiles = SHELF_FILES.length * 80 - 4
  const first = x0 + Math.max(0, (x1 - x0 - tiles) / 2)
  const clearX = left + width - 22 - 86
  const shareX = clearX - 8 - 13
  return (
    <g>
      <T x={left + 22} y={29.5} size={13} weight={600}>{`Shelf · ${SHELF_FILES.length} files`}</T>
      <Fill d={circlePath(shareX, 25, 13)} o={0.12} />
      <Stroke w={1.6} d={`M${shareX - 2.5} ${23}L${shareX - 5.5} ${23}L${shareX - 5.5} ${31}L${shareX + 5.5} ${31}L${shareX + 5.5} ${23}L${shareX + 2.5} ${23}M${shareX} ${27}L${shareX} ${18}M${shareX - 3} ${21}L${shareX} ${18}L${shareX + 3} ${21}`} />
      <Fill d={rrPath(clearX, 12, 86, 26, 13)} o={0.12} />
      <Bin cx={clearX + 16} cy={25} />
      <T x={clearX + 16 + 11} y={29} size={11.5} weight={600}>Clear All</T>
      {SHELF_FILES.map((f, i) => {
        const x = first + i * 80
        const cx = x + 38, cy = 50 + 22
        const lines = wrap(f.name, 400, 11, 72, 2)
        const hovered = i === 1
        return (
          <g key={f.name}>
            {hovered && <Fill d={rrPath(x, 44, 76, 88, 12)} o={0.09} />}
            {f.picture ? (
              <Fill d={rrPath(cx - 22, cy - 16.5, 44, 33, 0)} c={[70, 130, 180]} />
            ) : (
              <Fill d={`M${cx - 14} ${cy - 18}L${cx + 5} ${cy - 18}L${cx + 14} ${cy - 9}L${cx + 14} ${cy + 18}L${cx - 14} ${cy + 18}Z`} o={0.85} />
            )}
            {lines.map((l, r) => <T key={r} x={x + 38} y={50 + 44 + 14 + r * 13} size={11} weight={400} o={0.9} anchor="middle">{l}</T>)}
            {hovered && (
              <g>
                <Fill d={circlePath(x + 58, 52, 8)} c={[90, 90, 94]} />
                <Stroke w={1.5} d={`M${x + 58 - 2.8} ${52 - 2.8}L${x + 58 + 2.8} ${52 + 2.8}M${x + 58 + 2.8} ${52 - 2.8}L${x + 58 - 2.8} ${52 + 2.8}`} />
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}
const Bin = ({ cx, cy }) => {
  const at = (dx, dy) => [cx + dx, cy + dy]
  const poly = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')
  return (
    <Stroke w={1.5} d={
      poly([at(-6, -4), at(6, -4)]) + poly([at(-2, -4), at(-2, -6), at(2, -6), at(2, -4)]) +
      poly([at(-4.5, -4), at(-3.8, 6), at(3.8, 6), at(4.5, -4)]) + poly([at(-1.4, -1), at(-1.2, 3.5)]) + poly([at(1.4, -1), at(1.2, 3.5)])
    } />
  )
}

// ---------- Page dots (above everything, centered on the canvas) ----------
export function PageDots({ page }) {
  return (
    <g>
      {[291, 300, 309].map((x, i) => {
        const cur = i === 0 ? Math.max(0, -page) : i === 1 ? 1 - Math.abs(page) : Math.max(0, page)
        return <circle key={x} className="pdot" cx={x} cy={144} r={2.2} fill="#fff" fillOpacity={0.3 + 0.6 * cur} />
      })}
    </g>
  )
}
