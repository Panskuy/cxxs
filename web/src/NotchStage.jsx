import './notchdemo.css'
import './nstage.css'
import { useEffect, useRef, useState } from 'react'
import NotchDemo from './NotchDemo'

export const STATES = [
  { id: 'collapsed', label: 'Resting', title: 'Always there, never in the way', text: 'A small black notch with your clock, an equalizer that moves to the music, your battery level and a connected Bluetooth device.' },
  { id: 'now-playing', label: 'New track', title: 'Alerts grow out of the notch', text: 'A new track slides out with its cover and an equalizer in the cover’s color.' },
  { id: 'player', label: 'Player', title: 'Player and synced lyrics', text: 'Cover art, a draggable progress bar, transport controls and lyrics that light up word by word.' },
  { id: 'controls', label: 'Control Center', title: 'A Control Center in the notch', text: 'Wi‑Fi, Bluetooth, airplane mode and mute toggles, brightness and volume sliders, plus live modules.' },
  { id: 'shelf', label: 'Shelf', title: 'A file shelf', text: 'Drop files on the notch to keep them at hand, then drag them out where they belong.' },
  { id: 'toast', label: 'Notification', title: 'App notifications', text: 'Notifications from apps like WhatsApp or mail appear in the notch. Click one to open the app.' },
  { id: 'volume', label: 'Volume', title: 'Volume, replaced', text: 'Volume and mute changes show in the notch and replace Windows’ own pop-up.' },
  { id: 'bluetooth', label: 'Bluetooth', title: 'Bluetooth, at a glance', text: 'Connecting devices appear with their battery level, when Windows reports one.' },
]

/** A live replica of the notch (drawn with code, not images) that cycles through its states. Point at it to open it. */
export default function NotchStage({ caption = true, tabs = true }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const wrap = useRef(null)
  const hovered = useRef(false)
  const leave = useRef(0)
  const PLAYER = STATES.findIndex((x) => x.id === 'player')

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 })
    io.observe(wrap.current)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (paused || !visible) return
    const id = setTimeout(() => setI((x) => (x + 1) % STATES.length), 4200)
    return () => clearTimeout(id)
  }, [i, paused, visible])

  const onHover = (inside) => {
    clearTimeout(leave.current)
    if (inside) { if (i === 0) { hovered.current = true; setI(PLAYER) } }
    else if (hovered.current) leave.current = setTimeout(() => { hovered.current = false; setI(0) }, 350)
  }
  const pick = (k) => { hovered.current = false; clearTimeout(leave.current); setI(k) }
  const s = STATES[i]
  return (
    <div className="nstage" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="nstage__screen" ref={wrap}>
        <NotchDemo state={s.id} onHover={onHover} />
        <span className="nstage__hint">Point at the notch to open it</span>
      </div>
      {caption && <div className="nstage__cap" key={s.id}><h3>{s.title}</h3><p>{s.text}</p></div>}
      {tabs && (
        <div className="nstage__tabs" role="tablist" aria-label="Notch states">
          {STATES.map((st, k) => <button key={st.id} role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => pick(k)}>{st.label}</button>)}
        </div>
      )}
    </div>
  )
}
