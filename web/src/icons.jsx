// Small line icons on a 24px grid, drawn in currentColor.
const base = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false }
const I = ({ children, className = '', ...rest }) => <svg {...base} className={`ic ${className}`} {...rest}>{children}</svg>

// The notch-woy lyrics button, exactly as the app draws it: a speech bubble with two quote holes
export const LyricsIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" className={`ic ${className ?? ''}`} aria-hidden="true" focusable="false" fill="currentColor" fillRule="evenodd">
    <path transform="translate(12 11.2)" d="M-4.5-7H4.5A3.5 3.5 0 0 1 8-3.5V1.5A3.5 3.5 0 0 1 4.5 5H-0.5L-4.5 8.5V5H-4.5A3.5 3.5 0 0 1-8 1.5V-3.5A3.5 3.5 0 0 1-4.5-7ZM-2.6-2.8a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6ZM2.6-2.8a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6Z" />
  </svg>
)
// Pointer arrow
export const HoverIcon = (p) => <I {...p}><path d="M6 4l5.2 14 2.2-5.6L19 10.2 6 4Z" /><path d="M13.6 13.6L18 18" /></I>
// Sideways swipe
export const SwipeIcon = (p) => <I {...p}><path d="M4 12h16" /><path d="M7.5 8.5L4 12l3.5 3.5" /><path d="M16.5 8.5L20 12l-3.5 3.5" /></I>
// A file dropping onto a tray
export const DropIcon = (p) => <I {...p}><path d="M5 15v3.2A1.8 1.8 0 0 0 6.8 20h10.4a1.8 1.8 0 0 0 1.8-1.8V15" /><path d="M12 4v10" /><path d="M8.2 10.4L12 14.2l3.8-3.8" /></I>
// Seek bar with a playhead
export const SeekIcon = (p) => <I {...p}><path d="M3.5 12h17" strokeOpacity=".45" /><path d="M3.5 12h9" strokeWidth="3" /><circle cx="14" cy="12" r="2.4" fill="currentColor" stroke="none" /></I>
// Notification bell
export const BellIcon = (p) => <I {...p}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.9H4.4L6 16.5Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></I>
// Devices (session list)
export const PhoneIcon = (p) => <I {...p}><rect x="7" y="3" width="10" height="18" rx="2.4" /><path d="M10.6 17.8h2.8" /></I>
export const TabletIcon = (p) => <I {...p}><rect x="4.5" y="3.5" width="15" height="17" rx="2.4" /><path d="M10.8 17.5h2.4" /></I>
export const LaptopIcon = (p) => <I {...p}><rect x="5" y="5" width="14" height="10" rx="2" /><path d="M2.8 18.5h18.4" /></I>
export const UnknownDeviceIcon = (p) => <I {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5" /><path d="M12 16.6v.1" /></I>
export const LockIcon = (p) => <I {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.4" /><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" /><path d="M12 14.6v2.2" /></I>
export const CloseIcon = (p) => <I {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></I>
export const CheckIcon = (p) => <I {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></I>
export const UserIcon = (p) => <I {...p}><circle cx="12" cy="8.2" r="3.7" /><path d="M4.8 20c.7-3.7 3.5-5.7 7.2-5.7s6.5 2 7.2 5.7" /></I>
export const ShieldIcon = (p) => <I {...p}><path d="M12 3.2l7 2.6v5.6c0 4.4-2.9 7.7-7 9.4-4.1-1.7-7-5-7-9.4V5.8l7-2.6Z" /><path d="M9 12l2.2 2.2L15.2 10" /></I>
export const KeyIcon = (p) => <I {...p}><circle cx="8.5" cy="14.5" r="3.8" /><path d="M11.3 11.7 19 4M16.2 6.8l2.5 2.5M14 9l1.8 1.8" /></I>
export const DevicesIcon = (p) => <I {...p}><rect x="3" y="5" width="13" height="9" rx="1.8" /><path d="M1.8 17.5h15.4" /><rect x="17.5" y="9" width="3.7" height="8" rx="1.2" /></I>
export const DownloadIcon = (p) => <I {...p}><path d="M12 4v10.5" /><path d="M8 10.8l4 4 4-4" /><path d="M5 19.5h14" /></I>
export const TrashIcon = (p) => <I {...p}><path d="M5 7h14" /><path d="M9.5 7V4.8h5V7" /><path d="M6.6 7l.8 12.2h9.2L17.4 7" /><path d="M10 10.5v5.5M14 10.5v5.5" /></I>
export const MailIcon = (p) => <I {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2.2" /><path d="M4 7.5l8 6 8-6" /></I>
export const SearchIcon = (p) => <I {...p}><circle cx="11" cy="11" r="6.2" /><path d="M20 20l-4.3-4.3" /></I>
export const MenuIcon = (p) => <I {...p}><path d="M4 7h16M4 12h16M4 17h16" /></I>
export const ChevronIcon = (p) => <I {...p}><path d="M6.5 9.5L12 15l5.5-5.5" /></I>
export const ArrowIcon = (p) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6" /></I>
export const BoltIcon = (p) => <I {...p}><path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" /></I>
export const EyeOffIcon = (p) => <I {...p}><path d="M3.5 12S7 6 12 6s8.5 6 8.5 6-3.5 6-8.5 6S3.5 12 3.5 12Z" /><circle cx="12" cy="12" r="2.6" /><path d="M4 4l16 16" /></I>
export const CodeIcon = (p) => <I {...p}><path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 5l-3 14" /></I>
export const GiftIcon = (p) => <I {...p}><rect x="3.5" y="9" width="17" height="11" rx="1.8" /><path d="M12 9v11M3.5 13h17M12 9c-2.5 0-4.5-.8-4.5-2.6S10 3.6 12 9c2-5.4 4.5-4.6 4.5-2.6S14.5 9 12 9Z" /></I>
export const WindowsIcon = (p) => <I {...p} fill="currentColor" stroke="none"><path d="M3 5.6l7.6-1v7H3v-6Zm8.6-1.2L21 3v8.6h-9.4V4.4ZM3 12.8h7.6v7l-7.6-1v-6Zm8.6 0H21V21l-9.4-1.3v-6.9Z" /></I>
export const PackageIcon = (p) => <I {...p}><path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z" /><path d="M4.4 7.4L12 11.6l7.6-4.2M12 11.6V21" /></I>
export const StarIcon = (p) => <I {...p} fill="currentColor" stroke="none"><path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4 6 20.7l1.3-6.6L2.4 9.5l6.7-.8z" /></I>
