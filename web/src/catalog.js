// Everything the store sells lives here. Add an entry and it appears in the catalog, on the home page,
// in the footer and gets its own page at /products/<slug>/ (see ADD-PRODUCT.md).
// This file is plain data on purpose: the build reads it too.
//
// status: 'available' (can be downloaded) | 'soon' (listed, no download yet)
export const PRODUCTS = [
  {
    slug: 'notch',
    name: 'notch-woy',
    tagline: 'A Dynamic Island for Windows',
    summary: 'A small notch at the top of your screen that shows what is playing and your battery, and opens into a media player with synced lyrics, a Control Center and a file shelf.',
    category: 'Utilities',
    platform: 'Windows',
    version: 'v0.3.0',
    size: '1.5 MB',
    license: 'MIT',
    price: 'Free',
    status: 'available',
    featured: true,
    file: 'notch-woy-v0.3.0-windows-x64.zip',
    repo: 'https://github.com/Panskuy/notch-woy',
    requirements: 'Windows 10 or 11, 64-bit',
    specs: [['Built with', 'Rust'], ['Lyrics source', 'lrclib.net']],
    features: [
      ['Now Playing', 'Cover art, a draggable progress bar and transport controls for whatever is playing.'],
      ['Synced lyrics', 'Lyrics that light up word by word as each one is sung.'],
      ['Control Center', 'Wi‑Fi, Bluetooth, airplane mode and mute toggles with brightness and volume sliders.'],
      ['File shelf', 'Drop files on the notch to keep them at hand, then drag them out where they belong.'],
      ['App notifications', 'Notifications from apps like WhatsApp or mail appear in the notch.'],
      ['Volume and Bluetooth', 'Volume changes and connecting devices (with battery level) show in the notch.'],
    ],
    install: [
      ['Download', 'Sign in, confirm your email, then get the .zip.'],
      ['Unzip and run', 'Unzip it anywhere and run `notch-woy.exe`. It starts at login from then on.'],
      ['Tweak', 'Use the tray icon for Settings, autostart, or to quit.'],
    ],
    notes: [
      ['Requirements', 'Windows 10 or 11, 64-bit.'],
      ['First run', 'Windows may warn about an unrecognized app because the exe is not code-signed: choose **More info → Run anyway**.'],
      ['Privacy', 'To find lyrics, the title, artist, album and length of the playing track are sent to lrclib.net. Notification contents are read and shown locally and never leave your machine.'],
    ],
    faq: [
      ['Does it work on Mac or Linux?', 'Not yet. notch-woy needs Windows 10 or 11 (64-bit) because it is built on Windows-only features such as media controls, notifications and Bluetooth.'],
      ['Windows warns about an unrecognized app. Is it safe?', 'The executable is not code-signed yet, so Windows SmartScreen may show a warning. Choose “More info”, then “Run anyway”. Every download is verified against its SHA-256 fingerprint, and the source is public.'],
      ['What data does it send?', 'To find lyrics, the title, artist, album and length of the playing track are sent to lrclib.net. Notification contents stay on your computer.'],
    ],
  },
]

// Our own apps live at /products/<slug>/, collaborator apps at /apps/<slug>/ (one shared page).
export const productUrl = (p) => (p.community ? `/apps/${p.slug}/` : `/products/${p.slug}/`)
export const CATEGORIES = ['All', ...new Set(PRODUCTS.map((p) => p.category))]
export const PLATFORMS = [...new Set(PRODUCTS.map((p) => p.platform))]
export const FEATURED = PRODUCTS.filter((p) => p.featured && p.status === 'available')
export const LATEST = PRODUCTS.find((p) => p.status === 'available') ?? PRODUCTS[0]
export const bySlug = (slug) => PRODUCTS.find((p) => p.slug === slug)
