// Single registry for external search, curated cards and retrieval policy.
// Capabilities describe GTAR1 integrations, not features offered on provider websites.
// Providers without a verified query URL use their homepage; never guess parameters.
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
  capabilities: Readonly<{ externalSearch: boolean; nativeSearch: boolean; preview: boolean; import: boolean }>
  searchUrl?: (query: string) => string
  matchUrl: (url: string) => boolean
}

export const SONG_SOURCE_PROVIDERS: readonly SourceProviderMetadata[] = [
  {
    id: 'songselect',
    capabilities: { externalSearch: false, nativeSearch: false, preview: false, import: false },
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
    capabilities: { externalSearch: true, nativeSearch: false, preview: false, import: false },
    // Verified against the public search page on 2026-10-30; website navigation only.
    searchUrl: query => `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`,
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
    capabilities: { externalSearch: true, nativeSearch: false, preview: false, import: false },
    // Public homepage GET form: action=/result.php, input name=q (2026-10-30).
    searchUrl: query => `https://www.chordie.com/result.php?q=${encodeURIComponent(query)}`,
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
    capabilities: { externalSearch: false, nativeSearch: false, preview: false, import: false },
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


export const DEFAULT_SONG_SOURCE_PROVIDER = 'ultimate_guitar'
export const MAX_SOURCE_QUERY_LENGTH = 200

export function resolveSongSourceProvider(id: unknown): SourceProviderMetadata {
  return SONG_SOURCE_PROVIDERS.find(provider => provider.id === id)
    || SONG_SOURCE_PROVIDERS.find(provider => provider.id === DEFAULT_SONG_SOURCE_PROVIDER)!
}

export function getExternalSongSearch(id: unknown, rawQuery: string):
  { success: true; url: string; homepageFallback: boolean } | { success: false; error: string } {
  const query = rawQuery.trim()
  if (!query) return { success: false, error: 'Enter a song or artist to search.' }
  if (query.length > MAX_SOURCE_QUERY_LENGTH || /[\x00-\x1F\x7F]/.test(query)) {
    return { success: false, error: 'Use a song or artist name of up to 200 characters without control characters.' }
  }
  const provider = resolveSongSourceProvider(id)
  const direct = provider.capabilities.externalSearch && !!provider.searchUrl
  return { success: true, url: direct ? provider.searchUrl!(query) : provider.homepageUrl, homepageFallback: !direct }
}
