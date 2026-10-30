/**
 * Browse Song Sources - Data & Utilities
 * Local-only external website shortcuts and URL validation for GTAR1.
 * 
 * Strict Security Guarantees:
 * - Only http: and https: protocols permitted
 * - Dangerous schemes (javascript:, data:, file:, blob:, etc.) rejected
 * - Safe external navigation with rel="noopener noreferrer"
 * - Zero automatic scraping, remote content importing, or background requests
 * - Local-only persistence in localStorage ('gtar1_custom_song_sources')
 */

import { generateUUID } from './uuid'
import { SONG_SOURCE_PROVIDERS, resolveSongSourceProvider, getExternalSongSearch } from './songSourceProviders'
export * from './songSourceRetrieval'

export interface SongSource {
  id: string
  name: string
  url: string
  desc: string
  isCurated?: boolean
  createdAt?: number
  updatedAt?: number
}

export const CURATED_SONG_SOURCES: readonly SongSource[] = SONG_SOURCE_PROVIDERS.map(provider => ({
  id: `curated_${provider.id}`,
  name: provider.name,
  url: provider.homepageUrl,
  desc: provider.description,
  isCurated: true,
}))

// A separate preference key avoids modifying appearance, library or shortcut data.
export const SONG_SOURCE_PROVIDER_KEY = 'gtar1_song_source_provider'

export function loadSongSourceProvider(): string {
  try { return resolveSongSourceProvider(localStorage.getItem(SONG_SOURCE_PROVIDER_KEY)).id }
  catch { return resolveSongSourceProvider(null).id }
}

export function saveSongSourceProvider(id: string): boolean {
  try {
    localStorage.setItem(SONG_SOURCE_PROVIDER_KEY, resolveSongSourceProvider(id).id)
    return true
  } catch { return false }
}

export const SONG_SOURCES_STORAGE_KEY = 'gtar1_custom_song_sources'

export interface UrlValidationResult {
  valid: boolean
  url?: string
  error?: string
}

/**
 * Validates and normalizes website URLs for external navigation.
 * Only HTTP and HTTPS schemes are allowed.
 * Automatically adds https:// prefix when a protocol is omitted.
 */
export function validateAndNormalizeWebsiteUrl(rawUrl: string): UrlValidationResult {
  const trimmed = (rawUrl || '').trim()
  if (!trimmed) {
    return { valid: false, error: 'URL cannot be empty' }
  }

  // Reject control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, error: 'Invalid URL format' }
  }

  // Pre-filter dangerous schemes case-insensitively
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('about:')
  ) {
    return { valid: false, error: 'Forbidden protocol: Only HTTP and HTTPS URLs are permitted' }
  }

  let formatted = trimmed
  // If protocol scheme is missing, prefix with https://
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(formatted)) {
    if (formatted.startsWith('//')) {
      formatted = `https:${formatted}`
    } else {
      formatted = `https://${formatted}`
    }
  }

  try {
    const parsed = new URL(formatted)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Forbidden protocol: Only HTTP and HTTPS URLs are permitted' }
    }

    if (!parsed.hostname || parsed.hostname.trim().length === 0) {
      return { valid: false, error: 'Invalid URL format: Missing host name' }
    }

    return { valid: true, url: parsed.href }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

/**
 * Safely opens a validated website URL in a new browser tab.
 * Explicitly sets rel="noopener noreferrer" and cleans the window.opener reference.
 */
export function openExternalSongSource(rawUrl: string): { success: boolean; url?: string; error?: string } {
  const check = validateAndNormalizeWebsiteUrl(rawUrl)
  if (!check.valid || !check.url) {
    return { success: false, error: check.error || 'Invalid URL' }
  }

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    const win = window.open(check.url, '_blank', 'noopener,noreferrer')
    if (win) {
      win.opener = null
    }
  }

  return { success: true, url: check.url }
}

/** User-triggered website navigation only; never fetch provider content. */
export function searchOnlineSongSource(providerId: string, query: string): { success: boolean; message: string } {
  const target = getExternalSongSearch(providerId, query)
  if (!target.success) return { success: false, message: target.error }
  if (navigator.onLine === false) return { success: false, message: 'You are offline. Connect to search online; your query is kept.' }
  try {
    const result = openExternalSongSource(target.url)
    if (!result.success) return { success: false, message: result.error || 'Could not open the source website.' }
    const provider = resolveSongSourceProvider(providerId)
    return { success: true, message: target.homepageFallback
      ? `Opening ${provider.name} website. Search or browse there; your query is kept here.`
      : `Opening ${provider.name} search in a new tab.` }
  } catch { return { success: false, message: 'Could not open the source website. Check browser popup settings.' } }
}

/**
 * Loads custom website shortcuts from local storage.
 * Malformed or unsafe records are isolated and filtered out safely.
 */
export function loadCustomSongSources(): SongSource[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(SONG_SOURCES_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item): item is SongSource => {
      if (!item || typeof item !== 'object') return false
      if (typeof item.id !== 'string' || !item.id.trim()) return false
      if (typeof item.name !== 'string' || !item.name.trim()) return false
      if (typeof item.url !== 'string') return false
      const validation = validateAndNormalizeWebsiteUrl(item.url)
      return validation.valid
    }).map((item) => ({
      id: item.id,
      name: item.name.trim(),
      url: validateAndNormalizeWebsiteUrl(item.url).url || item.url,
      desc: typeof item.desc === 'string' ? item.desc.trim() : '',
      isCurated: false,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    }))
  } catch (err) {
    console.warn('Failed to load custom song sources from localStorage', err)
    return []
  }
}

/**
 * Persists custom website shortcuts to local storage.
 */
export function saveCustomSongSources(sources: SongSource[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    const sanitized = sources.map((s) => ({
      id: s.id || generateUUID(),
      name: s.name.trim(),
      url: validateAndNormalizeWebsiteUrl(s.url).url || s.url.trim(),
      desc: (s.desc || '').trim(),
      isCurated: false,
      createdAt: s.createdAt || Date.now(),
      updatedAt: Date.now(),
    }))
    localStorage.setItem(SONG_SOURCES_STORAGE_KEY, JSON.stringify(sanitized))
  } catch (err) {
    console.warn('Failed to persist custom song sources to localStorage', err)
  }
}

/**
 * Extracts a friendly fallback display name from a website URL.
 */
export function getHostnameFallback(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./i, '') || 'Website Source'
  } catch {
    return 'Website Source'
  }
}
