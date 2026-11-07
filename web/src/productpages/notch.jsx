// Rich, notch-woy-only content for its product page: a live replica of the notch and its gestures.
import NotchStage from '../NotchStage'
import Shot from '../Shot'
import { LyricsIcon, HoverIcon, SwipeIcon, DropIcon, SeekIcon, BellIcon, CheckIcon } from '../icons'

const PAGES = [
  { img: 'shelf', t: 'Shelf', side: 'Swipe right', d: 'Drag files onto the notch to keep them at hand, then drag them out where they should go. Explorer moves them within a drive and copies across. The shelf only points at the files: nothing is copied until you drag one out.' },
  { img: 'player', t: 'Now Playing', side: 'Opens first', d: 'Whatever is playing in Spotify, your browser or Media Player: cover art, title, artist, a draggable progress bar and transport controls. Pick the speakers, headphones or monitor to play through without opening Windows’ sound settings.' },
  { img: 'controls', t: 'Control Center', side: 'Swipe left', d: 'Wi‑Fi, Bluetooth, airplane mode and mute toggles, brightness and volume sliders, and modules for Now Playing, battery and Bluetooth. Brightness also drives external monitors that support DDC/CI.' },
]
const GESTURES = [
  [HoverIcon, 'Hover the notch', 'Open it.'],
  [SwipeIcon, 'Swipe sideways, or turn the wheel', 'Switch between the shelf, the player and Control Center.'],
  [DropIcon, 'Drag files onto it', 'Put them on the shelf. It opens as a drop zone.'],
  [SeekIcon, 'Click or drag the progress bar', 'Seek anywhere in the track.'],
  [LyricsIcon, 'Click the lyrics button', 'Show or hide the synced lyrics.'],
  [BellIcon, 'Click a notification', 'Open the app that sent it.'],
]
const ALERTS = [
  'A new track, with an equalizer in the cover’s color',
  'Charger plugged in or out, low battery at 20% and 10%, fully charged',
  'Volume and mute changes',
  'Bluetooth devices connecting (with battery level) and disconnecting',
  'App notifications such as WhatsApp or mail',
]

export const Visual = () => <NotchStage />

export const Overview = () => (
  <div className="pages">
    {PAGES.map((p) => (
      <article key={p.t} className="page">
        <div className="page__vis"><Shot id={p.img} alt={p.t} /></div>
        <span className="tag">{p.side}</span>
        <h3>{p.t}</h3><p>{p.d}</p>
      </article>
    ))}
  </div>
)

export const Features = () => (
  <>
    <div className="gest">{GESTURES.map(([Icon, t, d]) => <div key={t}><span><Icon /></span><b>{t}</b><p>{d}</p></div>)}</div>
    <h3 className="sub">Alerts that grow out of the notch</h3>
    <ul className="ticks">{ALERTS.map((a) => <li key={a}><CheckIcon />{a}</li>)}</ul>
  </>
)

// Shown on the home page under "Spotlight".
export const Spotlight = () => <NotchStage />
