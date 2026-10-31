import type { SongEntity, WebSetlist } from '../types/gtar'
import { findLocalSearchResults, nativeSongSearch } from '../utils/nativeSongSearch'

interface SearchResultsProps {
  query: string
  songs: SongEntity[]
  setlists: WebSetlist[]
  onSelectSong?: (song: SongEntity) => void
  onSelectSetlist?: (setlist: WebSetlist) => void
  onOpenSources?: () => void
  onOpenImport?: () => void
}

export function SearchResults({ query, songs, setlists, onSelectSong, onSelectSetlist, onOpenSources, onOpenImport }: SearchResultsProps) {
  const results = findLocalSearchResults(query, songs, setlists)
  const actionClass = 'block w-full min-h-[44px] rounded-lg px-3 py-2 text-left text-xs text-app-text hover:bg-app-base focus-visible:outline-2 focus-visible:outline-app-action'
  return <section id="global-search-results" aria-label="Search results" className="rounded-xl border border-app-border bg-app-surface text-app-text shadow-2xl p-2 max-h-[min(70dvh,32rem)] overflow-y-auto overscroll-contain">
    <p role="status" className="px-3 py-1 text-xs text-app-muted">{results.total} local matches · Songs and setlists</p>
    {results.songs.length > 0 && <h2 className="px-3 pt-2 text-xs font-bold text-app-heading">Songs</h2>}
    {results.songs.map(song => <button type="button" key={song.id} className={actionClass} onClick={() => onSelectSong?.(song)}>
      <span className="block font-semibold break-words">{song.title}</span><span className="text-app-muted break-words">{song.artist}</span>
    </button>)}
    {results.setlists.length > 0 && <h2 className="px-3 pt-2 text-xs font-bold text-app-heading">Setlists</h2>}
    {results.setlists.map(setlist => <button type="button" key={setlist.id} className={actionClass} onClick={() => onSelectSetlist?.(setlist)}>
      <span className="block font-semibold break-words">{setlist.name}</span><span className="text-app-muted">{setlist.songs.length} songs</span>
    </button>)}
    {results.total > results.songs.length + results.setlists.length && <p className="px-3 py-1 text-xs text-app-muted">Showing up to 8 of each. Refine your search for more.</p>}
    <div className="mt-2 border-t border-app-border pt-2">
      <button type="button" disabled className={`${actionClass} opacity-60`} aria-describedby="native-search-unavailable">Native online search unavailable</button>
      <p id="native-search-unavailable" className="px-3 pb-2 text-xs text-app-muted">{nativeSongSearch.unavailableReason}</p>
      {onOpenImport && <button type="button" className={actionClass} onClick={onOpenImport}>Preview &amp; Import a chart</button>}
      {onOpenSources && <button type="button" className={actionClass} onClick={onOpenSources}>Browse external song sources</button>}
    </div>
  </section>
}
