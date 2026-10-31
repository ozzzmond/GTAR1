import type { SongEntity, WebSetlist } from '../types/gtar'
import type { ParsedImportSong } from './songSourceRetrieval'

// DEV.17 provider separation, without the legacy default scraper or demo catalog.
// A future implementation requires a separate upstream permission/security review.
export interface NativeSongSearchTransport {
  readonly available: boolean
  readonly unavailableReason?: string
  search(query: string, signal: AbortSignal): Promise<readonly NativeSongResult[]>
  preview(result: NativeSongResult, signal: AbortSignal): Promise<ParsedImportSong>
}

export interface NativeSongResult {
  id: string
  title: string
  artist: string
  sourceUrl: string
}

export const nativeSongSearch: NativeSongSearchTransport = Object.freeze({
  available: false,
  unavailableReason: 'Native online search is unavailable. Browse Song Sources or preview a chart you have permission to import.',
  async search() { throw new Error('Native online search transport is disabled.') },
  async preview() { throw new Error('Native online search transport is disabled.') },
})

export function findLocalSearchResults(query: string, songs: SongEntity[], setlists: WebSetlist[]) {
  const terms = query.trim().toLocaleLowerCase().slice(0, 200).split(/\s+/).filter(Boolean)
  const matches = (value: string) => terms.length > 0 && terms.every(term => value.toLocaleLowerCase().includes(term))
  const matchedSongs = songs.filter(song => matches(`${song.title} ${song.artist || ''} ${(song.tags || []).join(' ')}`))
  const matchedSetlists = setlists.filter(setlist => matches(setlist.name))
  return {
    songs: matchedSongs.slice(0, 8),
    setlists: matchedSetlists.slice(0, 8),
    total: matchedSongs.length + matchedSetlists.length,
  }
}
