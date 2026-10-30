// Accept only developer-authored event keys, never error objects or metadata.
const EVENTS = {
  SESSION_STARTED: ['info', 'app', 'DEV diagnostics session started.'],
  INITIAL_LOAD_FAILED: ['error', 'storage', 'Library load failed. Check browser storage availability.'],
  METRONOME_START_FAILED: ['error', 'audio', 'Metronome could not start. Check audio permissions.'],
  TUNER_START_FAILED: ['error', 'audio', 'Reference tone could not start. Check audio permissions.'],
  BROWSER_OFFLINE: ['info', 'browser', 'Browser reports offline. Local operation remains available.'],
  BROWSER_ONLINE: ['info', 'browser', 'Browser reports online. No diagnostics upload occurs.'],
  EXPORT_FAILED: ['warn', 'diagnostics', 'Local download could not start. Check browser download support.'],
} as const

export type DiagnosticCode = keyof typeof EVENTS
export type DiagnosticEntry = Readonly<{
  timestamp: string
  severity: 'info' | 'warn' | 'error'
  area: string
  code: DiagnosticCode
  message: string
}>
export const MAX_ENTRIES = 20
export const MAX_EXPORT_BYTES = 16 * 1024

export function createDiagnosticBuffer() {
  let entries: readonly DiagnosticEntry[] = Object.freeze([])
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(listener => listener())
  return {
    record(code: unknown) {
      // Do not evaluate caller-controlled getters, toString, or exception fields.
      if (typeof code !== 'string' || !Object.hasOwn(EVENTS, code)) return
      const key = code as DiagnosticCode
      const [severity, area, message] = EVENTS[key]
      entries = Object.freeze([...entries.slice(-(MAX_ENTRIES - 1)), Object.freeze({
        timestamp: new Date().toISOString(), severity, area, code: key, message,
      })])
      notify()
    },
    getSnapshot: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    clear() { entries = Object.freeze([]); notify() },
  }
}

export function browserProfile(userAgent: unknown) {
  const ua = typeof userAgent === 'string' && userAgent.length <= 4096 ? userAgent : ''
  const platform = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows NT/.test(ua) ? 'Windows'
      : /Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown'
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? 'Edge'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
      : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
        : /Version\/[^ ]+.*Safari\//.test(ua) ? 'Safari' : 'unknown'
  const device = /iPad/.test(ua) || (platform === 'Android' && !/Mobile/.test(ua)) ? 'Tablet'
    : /iPhone|Mobile/.test(ua) ? 'Mobile'
      : ['Windows', 'macOS', 'Linux'].includes(platform) ? 'Desktop' : 'unknown'
  return { platform, browser, device }
}

let exportSequence = 0
function uniqueSuffix() {
  const bytes = new Uint8Array(16)
  try {
    globalThis.crypto.getRandomValues(bytes)
  } catch {
    // Old/insecure contexts: no stored identifier. Counter prevents same-session
    // collisions with a frozen clock/random source; random bytes span sessions.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  exportSequence = (exportSequence + 1) % Number.MAX_SAFE_INTEGER
  return `${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}-${exportSequence.toString(36)}`
}

// Export snapshots from this buffer only, never caller-supplied entries.
export function createDiagnosticSession(version: string) {
  const buffer = createDiagnosticBuffer()
  const captureStarted = new Date().toISOString()
  const safeVersion = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-(?:dev|rc\.\d{1,3}))?$/.test(version) ? version : 'unknown'
  return {
    ...buffer,
    exportLog(userAgent: unknown) {
      const profile = browserProfile(userAgent)
      const exportedAt = new Date().toISOString()
      const timestamp = exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
      const filename = `GTAR1_DEV_${profile.platform}_${profile.browser}_${profile.device}_${timestamp}_${uniqueSuffix()}.log`
      const entries = buffer.getSnapshot()
      const text = [
        'GTAR1 DEV diagnostics | schema: 1',
        `Environment: DEV | App version: ${safeVersion}`,
        `Capture started (UTC): ${captureStarted}`,
        `Exported (UTC): ${exportedAt}`,
        `Browser-reported profile: ${profile.platform} / ${profile.browser} / ${profile.device}`,
        'Profile is a coarse estimate, not verified device identity.',
        'Retention: memory only, current tab session; reload closes this session.',
        'Collection: fixed event codes only; no error content, console or network capture.',
        `Entries: ${entries.length}/${MAX_ENTRIES} (oldest first)`,
        '',
        ...entries.map(entry => `${entry.timestamp} | ${entry.severity} | ${entry.area} | ${entry.code} | ${entry.message}`),
        '',
      ].join('\n')
      // All output fields are fixed ASCII, ISO timestamps, or strict version tokens.
      if (text.length > MAX_EXPORT_BYTES) throw new Error('Diagnostic export size limit')
      return { filename, text }
    },
  }
}
