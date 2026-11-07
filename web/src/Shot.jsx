import './notchdemo.css'
import NotchDemo, { SHAPES } from './NotchDemo'

// A still frame of the notch in one state, drawn with the same code as the live one (no image).
export default function Shot({ id, alt = '', pad = 26, className = '' }) {
  return (
    <div className={`nshot ${className}`}>
      <NotchDemo state={id} still height={SHAPES[id].h + pad} label={alt || undefined} />
    </div>
  )
}
