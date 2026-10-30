import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import type { ActiveTab } from '../components/Header'
import type { ExplorerNavTarget } from '../components/ExplorerNavigation'

/** Session history contains identities only. Canonical content always comes from IndexedDB. */
export interface NavigationState {
  version: 1
  tab: ActiveTab
  songId?: string
  transposeOffset?: number
  setlistId?: string
  nav?: ExplorerNavTarget
  stage?: { songId: string; entryId?: string; index: number; returnTab: 'SONGS' | 'SETLISTS' | 'VIEWER' }
}

export function resolveNavigation(value: unknown, songs: SongEntity[], setlists: WebSetlist[], folders: SetlistFolder[]) {
  const home: NavigationState = { version: 1, tab: 'SONGS' }
  const raw = value as Partial<NavigationState> | null
  if (!raw || raw.version !== 1 || !['SONGS', 'VIEWER', 'EDITOR', 'SETLISTS', 'STAGE'].includes(raw.tab || '')) return { state: home, queue: [] }
  const state: NavigationState = { version: 1, tab: raw.tab! }
  const song = songs.find(s => s.id === raw.songId)
  const setlist = setlists.find(s => s.id === raw.setlistId)
  if (raw.setlistId !== undefined && !setlist) return { state: home, queue: [] }
  if (setlist) state.setlistId = setlist.id
  const nav = raw.nav
  if (nav?.type === 'SETLIST') {
    if (!setlists.some(s => s.id === nav.setlistId)) return { state: home, queue: [] }
    state.nav = { type: 'SETLIST', setlistId: nav.setlistId }
  } else if (nav?.type === 'FOLDER') {
    if (!folders.some(f => f.id === nav.folderId)) return { state: home, queue: [] }
    state.nav = { type: 'FOLDER', folderId: nav.folderId }
  } else if (nav && ['ALL_SONGS', 'ALL_SETLISTS', 'UNFILED_SETLISTS'].includes(nav.type)) {
    state.nav = { type: nav.type } as ExplorerNavTarget
  }
  if (state.tab === 'VIEWER' || state.tab === 'EDITOR') {
    if (!song) return { state: home, queue: [] }
    state.songId = song.id
    if (typeof raw.transposeOffset === 'number' && Number.isFinite(raw.transposeOffset) && Math.abs(raw.transposeOffset) <= 24) state.transposeOffset = raw.transposeOffset
  }
  if (state.tab !== 'STAGE') return { state, song, setlist, queue: [] }
  const stage = raw.stage
  if (!stage || !Number.isSafeInteger(stage.index) || stage.index < 0 || !['SONGS', 'SETLISTS', 'VIEWER'].includes(stage.returnTab)) return { state: home, queue: [] }
  const queue = setlist ? setlist.songs.flatMap(ref => {
    const master = songs.find(s => s.id === ref.id)
    return master ? [{ song: master, transposeOffset: ref.transposeOffset ?? master.transposeOffset ?? 0, entryId: ref.entryId }] : []
  }) : songs.filter(s => s.id === stage.songId).map(song => ({ song, transposeOffset: song.transposeOffset ?? 0, entryId: undefined as string | undefined }))
  // Resolve duplicate song occurrences by stable entry identity before falling back to position.
  const index = stage.entryId ? queue.findIndex(item => item.entryId === stage.entryId && item.song.id === stage.songId)
    : queue[stage.index]?.song.id === stage.songId ? stage.index : queue.findIndex(item => item.song.id === stage.songId)
  if (index < 0 || !queue[index]) return { state: home, queue: [] }
  state.songId = queue[index].song.id
  state.stage = { songId: state.songId, entryId: queue[index].entryId, index, returnTab: stage.returnTab }
  return { state, song: queue[index].song, setlist, queue }
}
