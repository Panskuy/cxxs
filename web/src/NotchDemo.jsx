import { useEffect, useId, useRef, useState } from 'react'
import {
  CollapsedLeft, CollapsedRight, NowPlayingL, NowPlayingR, BluetoothL, BluetoothR, VolumeL, VolumeR, ToastL,
  PlayerPage, ControlsPage, ShelfPage, PageDots, TINT, TRACK,
} from './notchui'
import './notchdemo.css'

/*
 * A live notch-woy island. The shape and the motion follow the app's own source (anim.rs / render.rs):
 * width, height and corner radius are damped springs (stiffness 320, damping 26: a little overshoot, like the
 * iOS island); the pages sit side by side and slide as one (a critically damped spring) while the cover
 * gradient stays put behind them; alert content is revealed by the growing shape and swapped with the app's
 * outgoing / incoming phases. The content itself is drawn by notchui.jsx from the app's layout constants.
 * All sizes are the app's logical pixels; the canvas is scaled to fit.
 */

class Spring {
  constructor(value, stiffness = 320, damping = 26) {
    this.value = this.target = value
    this.velocity = 0
    this.k = stiffness
    this.c = damping
  }
  update(dt) {
    let rest = dt
    while (rest > 0) {
      const h = Math.min(rest, 1 / 240) // fixed step, stable at any frame rate
      this.velocity += (this.k * (this.target - this.value) - this.c * this.velocity) * h
      this.value += this.velocity * h
      rest -= h
    }
    if (this.settled()) { this.value = this.target; this.velocity = 0 }
  }
  settled() { return Math.abs(this.target - this.value) < 0.05 && Math.abs(this.velocity) < 0.05 }
  snap(v) { this.value = this.target = v; this.velocity = 0 }
}
const smooth = (v) => new Spring(v, 196, 28) // critically damped: pages settling after a swipe

export const SHAPES = {
  collapsed: { w: 230, h: 30, r: 12 },
  'now-playing': { w: 360, h: 64, r: 26 },
  player: { w: 520, h: 150, r: 24 },
  controls: { w: 560, h: 150, r: 24 },
  shelf: { w: 400, h: 150, r: 24 },
  toast: { w: 420, h: 80, r: 28 },
  volume: { w: 300, h: 32, r: 14 },
  bluetooth: { w: 340, h: 40, r: 18 },
}
const ALERT_IDS = ['now-playing', 'toast', 'volume', 'bluetooth']
const ALERTS = new Set(ALERT_IDS)
const PAGE_ORDER = ['shelf', 'player', 'controls'] // left, middle, right
const isOpenId = (id) => PAGE_ORDER.includes(id)
const REST = SHAPES.collapsed
const OPEN_H = 150
const CW = 600
const CH = 176
const SHOULDER = 8
const KAPPA = 0.5522848
const ALERT_TRANSITION = 0.45
const SIDE_PAGE_TINT = 0.6
const BATTERY = { percent: 18, plugged: false, charging: false }

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const f = (n) => n.toFixed(2)

// The notch outline: flush with the screen top, small concave shoulders at the top corners, rounded bottom corners.
function notchPath(w, h, radius) {
  const s = Math.min(SHOULDER, h * 0.4)
  if (w <= 0 || h <= s) return ''
  const r = Math.max(0, Math.min(radius, w / 2, h - s))
  const k = r * KAPPA
  const x = (CW - w) / 2
  return `M${f(x - s)} 0Q${f(x)} 0 ${f(x)} ${f(s)}L${f(x)} ${f(h - r)}C${f(x)} ${f(h - r + k)} ${f(x + r - k)} ${f(h)} ${f(x + r)} ${f(h)}L${f(x + w - r)} ${f(h)}C${f(x + w - r + k)} ${f(h)} ${f(x + w)} ${f(h - r + k)} ${f(x + w)} ${f(h - r)}L${f(x + w)} ${f(s)}Q${f(x + w)} 0 ${f(x + w + s)} 0Z`
}

// The open notch's width for a page position (render.rs open_width)
const openWidth = (page) => {
  const p = clamp(page, -1, 1)
  const mid = SHAPES.player.w
  const side = p >= 0 ? SHAPES.controls.w : SHAPES.shelf.w
  return mid + (side - mid) * Math.abs(p)
}

// Synced lyrics and the progress bar keep playing while the player page is on screen.
const LYRIC_LEN = [19, 29, 9, 47]
function PlayerLive({ active, still, uid }) {
  const [v, setV] = useState({ scroll: 1, sung: { idx: 1, chars: 9.5 }, elapsed: 4 })
  useEffect(() => {
    if (!active || still) return
    const sim = { idx: 1, chars: 0, elapsed: 4, scroll: new Spring(1) }
    let raf, last = performance.now()
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      sim.chars += dt * 9
      sim.elapsed += dt
      if (sim.chars > LYRIC_LEN[sim.idx] + 4) { sim.idx = sim.idx === 3 ? 1 : sim.idx + 1; sim.chars = 0; if (sim.idx === 1) sim.elapsed = 4 }
      sim.scroll.target = sim.idx
      sim.scroll.update(dt)
      setV({ scroll: sim.scroll.value, sung: { idx: sim.idx, chars: sim.chars }, elapsed: Math.min(TRACK - 1, Math.floor(sim.elapsed)) })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, still])
  return <PlayerPage scroll={v.scroll} sung={v.sung} elapsed={v.elapsed} uid={uid} />
}

export default function NotchDemo({ state, onHover, still = false, height = CH, label }) {
  const uid = useId().replace(/:/g, '')
  const box = useRef(null)
  const canvas = useRef(null)
  const shell = useRef(null)
  const clipPathEl = useRef(null)
  const shadow = useRef(null)
  const hit = useRef(null)
  const grad = useRef(null)
  const backdrop = useRef(null)
  const dots = useRef(null)
  const L = useRef({}) // id -> { root, l, r }
  const sim = useRef(null)
  const raf = useRef(0)
  const [, setFontsVersion] = useState(0)
  const show = (id) => !still || id === state

  // Re-measure text once Inter has loaded.
  useEffect(() => {
    let live = true
    Promise.all(['400', '600', '700', '800'].map((w) => document.fonts?.load(`${w} 13px Inter`))).then(() => live && setFontsVersion((n) => n + 1)).catch(() => {})
    return () => { live = false }
  }, [])

  // One-time setup: simulation state, scale-to-fit, first frame.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const s = (sim.current = {
      w: new Spring(REST.w), h: new Spring(REST.h), r: new Spring(REST.r),
      page: smooth(0),
      target: 'collapsed', alertId: null, alertFrom: null, phaseStart: 0, keep: 0,
      last: 0, reduce: reduce || still,
    })
    const set = (el, name, val) => el && el.setAttribute(name, val)
    const vis = (el, alpha) => { if (!el) return; el.style.opacity = alpha > 0.002 ? String(alpha) : '0'; el.style.display = alpha > 0.002 ? '' : 'none' }

    const draw = (now) => {
      const dt = clamp((now - s.last) / 1000, 0, 0.05)
      s.last = now
      const isOpen = isOpenId(s.target)
      s.w.update(dt); s.h.update(dt); s.r.update(dt); s.page.update(dt)
      if (isOpen) s.w.target = openWidth(s.page.value) // width follows the page position
      s.keep = ALERTS.has(s.target) ? 1 : Math.max(0, s.keep - dt / 0.25)

      const shape = { w: s.w.value, h: s.h.value, r: s.r.value }
      const d = notchPath(shape.w, shape.h, shape.r)
      shell.current.setAttribute('d', d)
      clipPathEl.current.setAttribute('d', d)
      const left = (CW - shape.w) / 2
      const right = (CW + shape.w) / 2

      // How far the notch is between resting (0) and open (1).
      const t = clamp((shape.h - REST.h) / (OPEN_H - REST.h))

      // Alert content shows as the notch grows into the alert shape and fades as it grows past it.
      const alertAlphaFor = (id) => {
        const tg = SHAPES[id]
        const prog = (v, from, to) => (Math.abs(to - from) > 1 ? (v - from) / (to - from) : 1)
        const grown = Math.min(prog(shape.w, REST.w, tg.w), prog(shape.h, REST.h, tg.h))
        return clamp(grown) * (1 - clamp((shape.h - tg.h) / 20))
      }
      const alertAlpha = s.alertId ? alertAlphaFor(s.alertId) * s.keep : 0
      // The alert being replaced is judged against its own size, so it stays until the notch has shrunk past it.
      const fromAlpha = s.alertFrom ? alertAlphaFor(s.alertFrom) : 0
      const expandedAlpha = clamp((t - 0.35) / 0.65) * (1 - alertAlpha)
      const collapsedAlpha = s.alertFrom ? 0 : clamp(1 - t * 3) * (1 - alertAlpha)

      const edges = (g, dy = 0) => {
        if (!g) return
        set(g.l, 'transform', `translate(${f(left)} 0)`)
        set(g.r, 'transform', `translate(${f(right)} 0)`)
        set(g.root, 'transform', `translate(0 ${f(dy)})`)
      }

      // Resting content
      const cg = L.current.collapsed
      edges(cg); vis(cg?.root, collapsedAlpha)

      // Alerts, with the app's Phase.outgoing / Phase.incoming when one replaces another
      const phaseP = s.alertFrom ? clamp((now / 1000 - s.phaseStart) / ALERT_TRANSITION) : 1
      for (const id of ALERT_IDS) {
        const g = L.current[id]
        if (!g) continue
        if (id === s.alertId) {
          if (phaseP < 1) {
            const e = easeOutCubic(clamp((phaseP - 0.2) / 0.8))
            edges(g, 10 * (1 - e)); vis(g.root, alertAlpha * e)
          } else { edges(g); vis(g.root, alertAlpha) }
        } else if (id === s.alertFrom && phaseP < 1) {
          const e = easeOutCubic(clamp(phaseP / 0.45))
          edges(g, -8 * e); vis(g.root, fromAlpha * (1 - e))
        } else vis(g.root, 0)
      }
      if (phaseP >= 1) s.alertFrom = null

      // Pages sit side by side, edge to edge, and slide as one; the notch edge cuts them off. No fading.
      const raw = s.page.value
      const widths = PAGE_ORDER.map((p) => SHAPES[p].w)
      const centers = [-(widths[0] + widths[1]) / 2, 0, (widths[1] + widths[2]) / 2]
      const view = raw >= 0 ? raw * centers[2] : -raw * centers[0]
      PAGE_ORDER.forEach((id, slot) => {
        const g = L.current[id]
        if (!g) return
        const shown = Math.abs(raw - (slot - 1)) < 1
        set(g.root, 'transform', `translate(${f(centers[slot] - view)} 0)`)
        vis(g.root, shown ? expandedAlpha : 0)
      })

      // The cover gradient is the backdrop of the whole open notch: it stays put while the pages slide over it,
      // a little dimmer behind the side pages.
      const side = Math.min(Math.abs(raw), 1)
      const gradientAlpha = expandedAlpha * (1 - (1 - SIDE_PAGE_TINT) * side)
      set(grad.current, 'y2', f(shape.h))
      set(backdrop.current, 'height', f(shape.h))
      vis(backdrop.current, gradientAlpha)
      vis(dots.current, expandedAlpha)
      if (dots.current) {
        const page = clamp(raw, -1, 1)
        ;[...dots.current.querySelectorAll('.pdot')].forEach((c, i) => {
          const cur = i === 0 ? Math.max(0, -page) : i === 1 ? 1 - Math.abs(page) : Math.max(0, page)
          c.setAttribute('fill-opacity', f(0.3 + 0.6 * cur))
        })
      }

      // Shadow deepens as the notch opens
      const sh = shadow.current
      sh.style.left = `${f((CW - shape.w) / 2)}px`
      sh.style.top = `${f(-shape.r)}px`
      sh.style.width = `${f(shape.w)}px`
      sh.style.height = `${f(shape.h + shape.r)}px`
      sh.style.borderRadius = `${f(shape.r)}px`
      sh.style.boxShadow = `0 8px 60px 6px rgba(0,0,0,${f(0.4 * t)})`

      // Hover target follows the notch
      const ht = hit.current
      ht.style.left = `${f((CW - shape.w) / 2 - 14)}px`
      ht.style.width = `${f(shape.w + 28)}px`
      ht.style.height = `${f(Math.max(shape.h, 34) + 14)}px`

      const settling = !(s.w.settled() && s.h.settled() && s.r.settled() && s.page.settled()) || phaseP < 1 || (!ALERTS.has(s.target) && s.keep > 0)
      raf.current = settling ? requestAnimationFrame(draw) : 0
    }
    s.draw = draw
    s.kick = () => { if (!raf.current) { s.last = performance.now(); raf.current = requestAnimationFrame(draw) } }
    s.last = performance.now()
    draw(s.last)

    // Scale the logical canvas to the container.
    const ro = new ResizeObserver(() => {
      const w = box.current.clientWidth
      if (w) canvas.current.style.transform = `scale(${w / CW})`
    })
    ro.observe(box.current)
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); raf.current = 0 }
  }, [still])

  // Retarget the springs when the requested state changes.
  useEffect(() => {
    const s = sim.current
    if (!s || !state) return
    const prev = s.target
    if (prev === state) return
    const shape = SHAPES[state]
    const wasOpen = isOpenId(prev)
    s.target = state

    if (ALERTS.has(state)) {
      if (ALERTS.has(prev) && s.alertId && s.alertId !== state) { s.alertFrom = s.alertId; s.phaseStart = performance.now() / 1000 }
      s.alertId = state
      s.keep = 1
      s.w.target = shape.w; s.h.target = shape.h; s.r.target = shape.r
    } else if (state === 'collapsed') {
      s.w.target = REST.w; s.h.target = REST.h; s.r.target = REST.r
    } else {
      const slot = PAGE_ORDER.indexOf(state) - 1
      if (!wasOpen) s.page.snap(slot) // closed: nothing to slide from
      else s.page.target = slot
      s.w.target = openWidth(s.page.target); s.h.target = OPEN_H; s.r.target = SHAPES.player.r
    }

    if (s.reduce) {
      s.w.snap(s.w.target); s.h.snap(s.h.target); s.r.snap(s.r.target); s.page.snap(s.page.target)
      s.keep = ALERTS.has(state) ? 1 : 0; s.alertFrom = null
      s.draw(performance.now())
    } else s.kick()
  }, [state, still])

  const reg = (id, part) => (n) => { (L.current[id] ??= {})[part] = n }
  const layer = (id, left, right) => show(id) && (
    <g ref={reg(id, 'root')} style={{ display: 'none' }}>
      <g ref={reg(id, 'l')}>{left}</g>
      {right && <g ref={reg(id, 'r')}>{right}</g>}
    </g>
  )
  const page = (id, content) => show(id) && <g ref={reg(id, 'root')} style={{ display: 'none' }}>{content}</g>
  const playing = !still && isOpenId(state)

  return (
    <div className="nd" ref={box} style={{ aspectRatio: `${CW} / ${height}` }} role={label ? 'img' : undefined} aria-label={label}>
      <div className="nd__wall" />
      <div className="nd__canvas" ref={canvas} style={{ width: CW, height }}>
        <div className="nd__shadow" ref={shadow} />
        <svg className="nd__svg" width={CW} height={height} viewBox={`0 0 ${CW} ${height}`} aria-hidden="true">
          <defs>
            <clipPath id={`nc-${uid}`}><path ref={clipPathEl} /></clipPath>
            <linearGradient id={`ng-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={OPEN_H} ref={grad}>
              <stop offset="0" stopColor="#000" />
              <stop offset="0.3" stopColor="#000" />
              <stop offset="1" stopColor={`rgb(${TINT.join(',')})`} />
            </linearGradient>
          </defs>
          <path ref={shell} fill="#000" />
          <g clipPath={`url(#nc-${uid})`}>
            <rect ref={backdrop} x="0" y="0" width={CW} height={OPEN_H} fill={`url(#ng-${uid})`} style={{ display: 'none' }} />
            {layer('collapsed', <CollapsedLeft />, <CollapsedRight battery={BATTERY} />)}
            {layer('now-playing', <NowPlayingL title="A Rather Long Song Title (Extended Version)" artist="Maman Fvndy" rightEdge={SHAPES['now-playing'].w} />, <NowPlayingR />)}
            {layer('toast', <ToastL app="WhatsApp" title="Budi" rightEdge={SHAPES.toast.w} gradId={`nt-${uid}`}
              body="Bro nanti malam jadi main futsal kan? Lapangannya udah aku booking jam 8, jangan telat ya soalnya cuma dapet dua jam" />)}
            {layer('volume', <VolumeL level={0.6} />, <VolumeR level={0.6} />)}
            {layer('bluetooth', <BluetoothL name="Galaxy Buds2 Pro" rightEdge={SHAPES.bluetooth.w} />, <BluetoothR battery={72} />)}
            {page('shelf', <ShelfPage />)}
            {page('player', <PlayerLive active={playing} still={still} uid={uid} />)}
            {page('controls', <ControlsPage />)}
            <g ref={dots} style={{ display: 'none' }}><PageDots page={0} /></g>
          </g>
        </svg>
        <div className="nd__hit" ref={hit} onPointerEnter={() => onHover?.(true)} onPointerLeave={() => onHover?.(false)} />
      </div>
    </div>
  )
}
