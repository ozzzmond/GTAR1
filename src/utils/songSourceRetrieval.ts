/**
 * Song Source Retrieval and ChordPro Import Adapter
 * GTAR1 Phase B: Safe, user-triggered source retrieval and ChordPro import preview.
 * 
 * Strict Security Guarantees:
 * - No unauthorized scraping or Terms of Service violations
 * - Explicit provider classification (SongSelect, Ultimate Guitar, Chordie, OPMTunes verified restricted/unsupported)
 * - Safe manual paste & file import fallback when automated retrieval is disallowed
 * - SSRF protection: rejects localhost, private IPs, and local domain names
 * - Strict protocol validation: only HTTP and HTTPS allowed
 * - Bounded payload sizes (max 256KB) and request timeouts (8000ms default)
 * - Safe metadata sanitization and fail-closed error handling
 * - Zero background fetching or credentials in client code
 */

import { parseChordProDirectives, syncCanonicalDirectives } from './chordProMetadata'
import { validateAndNormalizeWebsiteUrl } from './songSources'

export const MAX_IMPORT_BYTES = 256 * 1024 // 256 KB
export const DEFAULT_RETRIEVAL_TIMEOUT_MS = 8000

export type ProviderClassification = 'RESTRICTED' | 'UNSUPPORTED' | 'PERMITTED'

export interface SourceProviderMetadata {
  id: string
  name: string
  classification: ProviderClassification
  description: string
  restrictionReason: string
  requiresAuth: boolean
  corsSupported: boolean
  homepageUrl: string
  matchUrl: (url: string) => boolean
}

export const KNOWN_SOURCE_PROVIDERS: readonly SourceProviderMetadata[] = [
  {
    id: 'songselect',
    name: 'SongSelect (CCLI)',
    classification: 'RESTRICTED',
    description: 'Praise & worship chords and lead sheets',
    restrictionReason: 'SongSelect requires a paid CCLI license and authenticated session. Automated retrieval is prohibited by CCLI Terms of Service.',
    requiresAuth: true,
    corsSupported: false,
    homepageUrl: 'https://songselect.ccli.com',
    matchUrl: (url: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase()
        return host === 'songselect.ccli.com' || host.endsWith('.ccli.com')
      } catch {
        return false
      }
    },
  },
  {
    id: 'ultimate_guitar',
    name: 'Ultimate Guitar',
    classification: 'RESTRICTED',
    description: 'Guitar tabs, chords, and bass tabs repository',
    restrictionReason: 'Ultimate Guitar Terms of Service prohibit scraping and automated extraction. Client-side requests are blocked by CORS and anti-bot protection.',
    requiresAuth: false,
    corsSupported: false,
    homepageUrl: 'https://www.ultimate-guitar.com',
    matchUrl: (url: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase()
        return host === 'ultimate-guitar.com' || host.endsWith('.ultimate-guitar.com')
      } catch {
        return false
      }
    },
  },
  {
    id: 'chordie',
    name: 'Chordie',
    classification: 'UNSUPPORTED',
    description: 'Public chord and guitar tab index',
    restrictionReason: 'Chordie does not offer a public CORS-enabled API for web applications.',
    requiresAuth: false,
    corsSupported: false,
    homepageUrl: 'https://www.chordie.com',
    matchUrl: (url: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase()
        return host === 'chordie.com' || host.endsWith('.chordie.com')
      } catch {
        return false
      }
    },
  },
  {
    id: 'opmtunes',
    name: 'OPMTunes',
    classification: 'UNSUPPORTED',
    description: 'Original Pilipino Music chords and tabs',
    restrictionReason: 'OPMTunes does not offer a public CORS-enabled API for web applications.',
    requiresAuth: false,
    corsSupported: false,
    homepageUrl: 'https://www.opmtunes.com',
    matchUrl: (url: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase()
        return host === 'opmtunes.com' || host.endsWith('.opmtunes.com')
      } catch {
        return false
      }
    },
  },
]

/**
 * Finds known provider metadata for a given URL.
 */
export function getProviderForUrl(url: string): SourceProviderMetadata | null {
  for (const provider of KNOWN_SOURCE_PROVIDERS) {
    if (provider.matchUrl(url)) {
      return provider
    }
  }
  return null
}

/**
 * Validates a retrieval URL for protocol safety and SSRF prevention.
 */
export function validateRetrievalUrl(rawUrl: string): {
  valid: boolean
  normalizedUrl?: string
  error?: string
  isPrivateOrLocal?: boolean
} {
  const baseCheck = validateAndNormalizeWebsiteUrl(rawUrl)
  if (!baseCheck.valid || !baseCheck.url) {
    return { valid: false, error: baseCheck.error || 'Invalid URL' }
  }

  try {
    const parsed = new URL(baseCheck.url)
    const host = parsed.hostname.toLowerCase()

    // SSRF Prevention: Check for local / loopback / private IP ranges
    const isLocalhost =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan')

    // IPv4 private ranges
    const isIPv4Loopback = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
    const isIPv4Zero = /^0\.0\.0\.0$/.test(host)
    const isIPv4Private10 = /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
    const isIPv4Private172 = /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
    const isIPv4Private192 = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
    const isIPv4LinkLocal = /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)

    // IPv6 loopback / private
    const isIPv6Loopback = host === '::1' || host === '[::1]'
    const isIPv6Private = host.startsWith('fc00:') || host.startsWith('fd00:') || host.startsWith('fe80:')

    if (
      isLocalhost ||
      isIPv4Loopback ||
      isIPv4Zero ||
      isIPv4Private10 ||
      isIPv4Private172 ||
      isIPv4Private192 ||
      isIPv4LinkLocal ||
      isIPv6Loopback ||
      isIPv6Private
    ) {
      return {
        valid: false,
        error: 'Security violation: Local and private network addresses are disallowed (SSRF protection).',
        isPrivateOrLocal: true,
      }
    }

    return { valid: true, normalizedUrl: parsed.href }
  } catch {
    return { valid: false, error: 'Malformed URL structure' }
  }
}

export type RetrievalErrorCode =
  | 'RESTRICTED_PROVIDER'
  | 'UNSUPPORTED_PROVIDER'
  | 'INVALID_URL'
  | 'SSRF_BLOCKED'
  | 'OVERSIZED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_CONTENT_TYPE'
  | 'ABORTED'

export interface RetrievalResult {
  success: boolean
  content?: string
  contentType?: string
  provider?: SourceProviderMetadata | null
  error?: string
  errorCode?: RetrievalErrorCode
}

export interface RetrievalOptions {
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
}

/**
 * Attempts user-initiated retrieval of a song source URL with strict guardrails.
 * Fails closed on restricted/unsupported providers (SongSelect, UG, Chordie, OPMTunes).
 */
export async function retrieveSongSource(
  rawUrl: string,
  options?: RetrievalOptions
): Promise<RetrievalResult> {
  const validation = validateRetrievalUrl(rawUrl)
  if (!validation.valid || !validation.normalizedUrl) {
    return {
      success: false,
      error: validation.error || 'Invalid retrieval URL',
      errorCode: validation.isPrivateOrLocal ? 'SSRF_BLOCKED' : 'INVALID_URL',
    }
  }

  const normalizedUrl = validation.normalizedUrl
  const provider = getProviderForUrl(normalizedUrl)

  // Scope Gate: Check provider policy before network activity
  if (provider) {
    if (provider.classification === 'RESTRICTED') {
      return {
        success: false,
        provider,
        error: `Direct retrieval from ${provider.name} is restricted. ${provider.restrictionReason}`,
        errorCode: 'RESTRICTED_PROVIDER',
      }
    }
    if (provider.classification === 'UNSUPPORTED') {
      return {
        success: false,
        provider,
        error: `Direct retrieval from ${provider.name} is not supported. ${provider.restrictionReason}`,
        errorCode: 'UNSUPPORTED_PROVIDER',
      }
    }
  } else {
    // Unverified external URL: fail closed by default to protect user security
    return {
      success: false,
      error: 'Direct retrieval from unverified web domains is not supported. Use manual ChordPro paste or file import.',
      errorCode: 'UNSUPPORTED_PROVIDER',
    }
  }

  // Permitted provider execution (for verified endpoints or authorized test mock providers)
  const timeoutMs = options?.timeoutMs ?? DEFAULT_RETRIEVAL_TIMEOUT_MS
  const maxBytes = options?.maxBytes ?? MAX_IMPORT_BYTES

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      headers: {
        Accept: 'text/plain, text/x-chordpro, text/*;q=0.9, */*;q=0.1',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        success: false,
        error: `Server returned error status ${response.status} (${response.statusText})`,
        errorCode: 'NETWORK_ERROR',
      }
    }

    const contentType = response.headers.get('content-type') || ''
    // Reject HTML pages (login screens, paywalls, challenge captchas)
    if (contentType.toLowerCase().includes('text/html')) {
      return {
        success: false,
        error: 'Destination returned an HTML web page instead of plain ChordPro or text chart.',
        errorCode: 'INVALID_CONTENT_TYPE',
      }
    }

    const text = await response.text()
    if (text.length > maxBytes) {
      return {
        success: false,
        error: `Response size exceeds limit of ${Math.round(maxBytes / 1024)} KB.`,
        errorCode: 'OVERSIZED',
      }
    }

    return {
      success: true,
      content: text,
      contentType,
      provider,
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError' || controller.signal.aborted) {
      const isTimeout = !options?.signal?.aborted
      return {
        success: false,
        error: isTimeout ? `Request timed out after ${timeoutMs}ms.` : 'Retrieval cancelled by user.',
        errorCode: isTimeout ? 'TIMEOUT' : 'ABORTED',
      }
    }
    return {
      success: false,
      error: err?.message || 'Network request failed. Device may be offline or site unreachable.',
      errorCode: 'NETWORK_ERROR',
    }
  }
}

export interface ParsedImportSong {
  title: string
  artist: string
  key: string
  originalKey?: string
  capo?: string
  bpm?: string
  time?: string
  year?: string
  tags: string[]
  format: 'CHORD_PRO' | 'TWO_LINE'
  rawContent: string
}

export interface ImportParseResult {
  success: boolean
  song?: ParsedImportSong
  error?: string
}

/**
 * Sanitizes untrusted string fields to prevent control characters and excessive length.
 */
function sanitizeField(value: string | undefined | null, maxLength = 150): string {
  if (!value) return ''
  return String(value)
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .trim()
    .slice(0, maxLength)
}

/**
 * Parses raw text or ChordPro into a validated, sanitized import song structure.
 */
export function parseImportedChordContent(
  rawText: string,
  options?: { sourceUrl?: string; defaultTitle?: string }
): ImportParseResult {
  if (!rawText || !rawText.trim()) {
    return {
      success: false,
      error: 'Cannot import empty song content.',
    }
  }

  // Reject oversized input
  if (rawText.length > MAX_IMPORT_BYTES) {
    return {
      success: false,
      error: `Input content exceeds maximum allowed size of ${Math.round(MAX_IMPORT_BYTES / 1024)} KB.`,
    }
  }

  // Strip dangerous control characters while preserving newlines and tabs
  const cleaned = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // Extract canonical directives
  const { metadata, legacyDirectives } = parseChordProDirectives(cleaned)

  let title = sanitizeField(metadata.title, 150)
  const artist = sanitizeField(metadata.artist, 150)
  const key = sanitizeField(metadata.key, 20)
  const originalKey = sanitizeField(metadata.originalKey || metadata.key, 20) || undefined
  const capo = sanitizeField(legacyDirectives?.capo, 50) || undefined
  const bpm = sanitizeField(
    metadata.bpm !== undefined
      ? String(metadata.bpm)
      : metadata.tempo !== undefined
      ? String(metadata.tempo)
      : undefined,
    20
  ) || undefined
  const time = sanitizeField(metadata.time, 20) || undefined
  const year = sanitizeField(
    metadata.year !== undefined ? String(metadata.year) : undefined,
    10
  ) || undefined

  // Detect format
  const hasDirectives = /\{[a-zA-Z_]+(?::\s*.*?)?\}/.test(cleaned)
  const hasInlineChords = /\[[A-G][b#]?[a-zA-Z0-9#+/\-_]*\]/.test(cleaned)
  const format: 'CHORD_PRO' | 'TWO_LINE' = hasDirectives || hasInlineChords ? 'CHORD_PRO' : 'TWO_LINE'

  // If title was not in directives, attempt to detect from first non-empty line
  if (!title) {
    const lines = cleaned.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) continue
      // Use clean first text line without brackets
      const candidate = trimmed.replace(/\[[^\]]*\]/g, '').trim()
      if (candidate.length > 0) {
        title = sanitizeField(candidate, 150)
        break
      }
    }
  }

  if (!title) {
    title = options?.defaultTitle || 'Untitled Imported Song'
  }

  // Sync canonical updates to ensure directives reflect extracted title and artist
  let synchronizedContent = cleaned
  if (format === 'CHORD_PRO') {
    synchronizedContent = syncCanonicalDirectives(cleaned, {
      title,
      artist: artist || undefined,
      key: key || undefined,
      tempo: bpm || undefined,
      time: time || undefined,
      year: year || undefined,
    })
  }

  const tags = ['Imported']
  if (options?.sourceUrl) {
    try {
      const host = new URL(options.sourceUrl).hostname.replace(/^www\./, '')
      if (host) tags.push(host)
    } catch {
      // Ignore URL parsing failure
    }
  }

  return {
    success: true,
    song: {
      title,
      artist,
      key,
      originalKey,
      capo,
      bpm,
      time,
      year,
      tags,
      format,
      rawContent: synchronizedContent,
    },
  }
}
