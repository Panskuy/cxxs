export type DeviceInfo = { device: 'mobile' | 'tablet' | 'desktop' | 'unknown'; label: string }

/** Coarse, display-only classification of a browser User-Agent. Never used for access decisions. */
export function describeUa(ua: string | null | undefined): DeviceInfo {
  const s = (ua ?? '').slice(0, 400)
  if (!s) return { device: 'unknown', label: 'Unknown device' }
  const device = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(s)
    ? 'tablet'
    : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(s)
      ? 'mobile'
      : 'desktop'
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser'
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : 'Unknown OS'
  return { device, label: `${browser} on ${os}` }
}

/** Show only a coarse part of an IP in the session list. */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return 'unknown'
  if (ip.includes(':')) return ip.split(':').slice(0, 2).join(':') + ':…'
  const p = ip.split('.')
  return p.length === 4 ? `${p[0]}.${p[1]}.*.*` : 'unknown'
}
