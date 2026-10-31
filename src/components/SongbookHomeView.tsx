import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import type { ExplorerNavTarget } from './ExplorerNavigation'
import {
  Music,
  Plus,
  Edit2,
  Trash2,
  ListPlus,
  Play,
  ArrowUpDown,
  Filter,
  CheckSquare,
  Square,
  MoreVertical,
  X,
  Tag,
  Folder,
  Layers,
  ChevronRight,
  ListMusic,
  ExternalLink,
  Globe,
} from 'lucide-react'
import { generateUUID } from '../utils/uuid'
import { normalizeTags } from '../utils/tags'

export interface SongbookHomeViewProps {
  songs: SongEntity[]
  setlists: WebSetlist[]
  folders: SetlistFolder[]
  currentNavTarget: ExplorerNavTarget
  onSelectNavTarget: (target: ExplorerNavTarget) => void
  onSelectSong: (song: SongEntity) => void
  onEditSong: (song: SongEntity) => void
  onNewSong: () => void
  onOpenSources?: () => void
  onDeleteSong: (songId: string) => Promise<void>
  onSaveSong: (song: SongEntity) => Promise<void>
  onBulkUpdateSongs?: (updated: SongEntity[]) => Promise<void>
  onBulkDeleteSongs?: (songIds: string[]) => Promise<void>
  onSaveSetlist: (setlist: WebSetlist) => Promise<void>
  onDeleteSetlist: (setlistId: string) => Promise<void>
  onPlaySetlistSong: (songId: string, transposeOffset?: number) => void
  onOpenSetlistManager: (setlistId?: string) => void
  searchQuery: string
  onClearSearch: () => void
  onEnterStageSong?: (song: SongEntity) => void
  onEnterStageSetlist?: (setlist: WebSetlist, startIndex?: number) => void
}

type SortField = 'title' | 'artist' | 'date'
type MetadataFilter = 'ALL' | 'HAS_KEY' | 'HAS_BPM'

export const SongbookHomeView: React.FC<SongbookHomeViewProps> = ({
  songs,
  setlists,
  folders,
  currentNavTarget,
  onSelectNavTarget,
  onSelectSong,
  onEditSong,
  onNewSong,
  onOpenSources,
  onDeleteSong,
  onSaveSong,
  onBulkUpdateSongs,
  onBulkDeleteSongs,
  onSaveSetlist,
  onDeleteSetlist,
  onPlaySetlistSong,
  onOpenSetlistManager,
  searchQuery,
  onClearSearch,
  onEnterStageSong,
  onEnterStageSetlist,
}) => {
  // Sort and filter states
  const [sortField, setSortField] = useState<SortField>(() => {
    try {
      const saved = localStorage.getItem('gtar1_song_sort')
      if (saved === 'title' || saved === 'artist' || saved === 'date') return saved
    } catch {}
    return 'title'
  })
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [metadataFilter, setMetadataFilter] = useState<MetadataFilter>('ALL')

  // Multi-selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set())
  const [showAddToSetlistModal, setShowAddToSetlistModal] = useState(false)
  const [targetSetlistId, setTargetSetlistId] = useState<string>('')
  const [newSetlistNameInput, setNewSetlistNameInput] = useState<string>('')

  // Quick Action Menu state for song card
  const [activeMenuSongId, setActiveMenuSongId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Persist sort preference
  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
      try {
        localStorage.setItem('gtar1_song_sort', field)
      } catch {}
    }
  }

  // Close card menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuSongId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fast map lookups
  const songMap = useMemo(() => {
    const map = new Map<string, SongEntity>()
    for (const s of songs) map.set(s.id, s)
    return map
  }, [songs])

  const folderMap = useMemo(() => {
    const map = new Map<string, SetlistFolder>()
    for (const f of folders) map.set(f.id, f)
    return map
  }, [folders])

  // Scope determination
  const isSetlistContext =
    currentNavTarget.type === 'ALL_SETLISTS' ||
    currentNavTarget.type === 'UNFILED_SETLISTS' ||
    currentNavTarget.type === 'FOLDER' ||
    currentNavTarget.type === 'SETLIST'

  // Breadcrumbs text helper
  const breadcrumbItems = useMemo(() => {
    switch (currentNavTarget.type) {
      case 'ALL_SONGS':
        return [{ label: 'Songbook', target: { type: 'ALL_SONGS' } as ExplorerNavTarget }, { label: 'All Songs' }]
      case 'TAG':
        return [
          { label: 'Songbook', target: { type: 'ALL_SONGS' } as ExplorerNavTarget },
          { label: 'Tags' },
          { label: `#${currentNavTarget.tag}` },
        ]
      case 'ALL_SETLISTS':
        return [{ label: 'Setlists', target: { type: 'ALL_SETLISTS' } as ExplorerNavTarget }, { label: 'All Setlists' }]
      case 'UNFILED_SETLISTS':
        return [
          { label: 'Setlists', target: { type: 'ALL_SETLISTS' } as ExplorerNavTarget },
          { label: 'Unfiled' },
        ]
      case 'FOLDER': {
        const trail: { label: string; target?: ExplorerNavTarget }[] = [
          { label: 'Setlists', target: { type: 'ALL_SETLISTS' } as ExplorerNavTarget },
        ]
        let curId: string | null = currentNavTarget.folderId
        const chain: SetlistFolder[] = []
        while (curId) {
          const f = folderMap.get(curId)
          if (!f) break
          chain.unshift(f)
          curId = f.parentId
        }
        for (const item of chain) {
          trail.push({ label: item.name, target: { type: 'FOLDER', folderId: item.id } as ExplorerNavTarget })
        }
        return trail
      }
      case 'SETLIST': {
        const sl = setlists.find((s) => s.id === currentNavTarget.setlistId)
        return [
          { label: 'Setlists', target: { type: 'ALL_SETLISTS' } as ExplorerNavTarget },
          { label: sl?.name || 'Setlist' },
        ]
      }
      default:
        return [{ label: 'Songbook' }]
    }
  }, [currentNavTarget, folderMap, setlists])

  // Filter songs by explorer target scope
  const scopedSongs = useMemo(() => {
    if (currentNavTarget.type === 'ALL_SONGS') {
      return songs
    }
    if (currentNavTarget.type === 'TAG') {
      const targetTag = currentNavTarget.tag.toLowerCase()
      return songs.filter((s) => s.tags?.some((t) => t.toLowerCase() === targetTag))
    }
    return songs
  }, [songs, currentNavTarget])

  // Apply Search, Filters, and Sort to songs
  const processedSongs = useMemo(() => {
    let result = scopedSongs

    // 1. Search Query
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter((s) => {
        const matchTitle = s.title.toLowerCase().includes(q)
        const matchArtist = s.artist ? s.artist.toLowerCase().includes(q) : false
        const matchKey = s.key ? s.key.toLowerCase().includes(q) : false
        const matchTags = s.tags ? s.tags.some((t) => t.toLowerCase().includes(q)) : false
        return matchTitle || matchArtist || matchKey || matchTags
      })
    }

    // 2. Metadata Filter
    if (metadataFilter === 'HAS_KEY') {
      result = result.filter((s) => Boolean(s.key || s.originalKey || s.confirmedChartKey))
    } else if (metadataFilter === 'HAS_BPM') {
      result = result.filter((s) => Boolean(s.bpm))
    }

    // 3. Sorting
    return [...result].sort((a, b) => {
      let comparison = 0
      if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title)
      } else if (sortField === 'artist') {
        comparison = (a.artist || '').localeCompare(b.artist || '')
      } else if (sortField === 'date') {
        comparison = (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [scopedSongs, searchQuery, metadataFilter, sortField, sortDirection])

  // Filtered Setlists when in Setlist explorer modes
  const filteredSetlists = useMemo(() => {
    let list = setlists

    if (currentNavTarget.type === 'FOLDER') {
      list = list.filter((sl) => sl.folderId === currentNavTarget.folderId)
    } else if (currentNavTarget.type === 'UNFILED_SETLISTS') {
      list = list.filter((sl) => !sl.folderId)
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((sl) => {
        const matchName = sl.name.toLowerCase().includes(q)
        const matchSong = sl.songs.some((ref) => {
          const s = songMap.get(ref.id)
          const title = s?.title || ref.title || ''
          const artist = s?.artist || ref.artist || ''
          return title.toLowerCase().includes(q) || artist.toLowerCase().includes(q)
        })
        return matchName || matchSong
      })
    }

    return list
  }, [setlists, currentNavTarget, searchQuery, songMap])

  // Single active setlist detail when NavTarget is 'SETLIST'
  const activeSetlist = useMemo(() => {
    if (currentNavTarget.type === 'SETLIST') {
      return setlists.find((s) => s.id === currentNavTarget.setlistId) || null
    }
    return null
  }, [currentNavTarget, setlists])

  // Multi-selection handlers
  const handleToggleSelectSong = (id: string) => {
    setSelectedSongIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedSongIds(new Set(processedSongs.map((s) => s.id)))
  }

  const handleDeselectAll = () => {
    setSelectedSongIds(new Set())
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedSongIds)
    if (ids.length === 0) return
    if (!confirm(`Permanently delete ${ids.length} selected master songs? Setlist shortcuts referencing them will show missing source status.`)) {
      return
    }

    if (onBulkDeleteSongs) {
      await onBulkDeleteSongs(ids)
    } else {
      for (const id of ids) {
        await onDeleteSong(id)
      }
    }
    setSelectedSongIds(new Set())
    setIsSelectionMode(false)
  }

  const handleConfirmAddToSetlist = async () => {
    const songIds = Array.from(selectedSongIds)
    if (songIds.length === 0) return

    let setlistToUpdate: WebSetlist | undefined

    if (targetSetlistId === '__NEW__') {
      const name = newSetlistNameInput.trim() || 'New Setlist'
      setlistToUpdate = {
        id: 'setlist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name,
        folderId: currentNavTarget.type === 'FOLDER' ? currentNavTarget.folderId : null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        songs: [],
      }
    } else {
      setlistToUpdate = setlists.find((sl) => sl.id === targetSetlistId)
    }

    if (!setlistToUpdate) return

    const existingSongs = [...(setlistToUpdate.songs || [])]
    let pos = existingSongs.length

    for (const songId of songIds) {
      const s = songMap.get(songId)
      if (s) {
        existingSongs.push({
          entryId: generateUUID(),
          id: s.id,
          title: s.title,
          artist: s.artist,
          key: s.key,
          position: pos++,
          transposeOffset: s.transposeOffset || 0,
        })
      }
    }

    await onSaveSetlist({
      ...setlistToUpdate,
      songs: existingSongs,
      updatedAt: Date.now(),
    })

    setShowAddToSetlistModal(false)
    setSelectedSongIds(new Set())
    setIsSelectionMode(false)
    setNewSetlistNameInput('')
    setTargetSetlistId('')
  }

  return (
    <div data-explorer-canvas="true" className="explorer-canvas flex-1 flex flex-col min-w-0 bg-app-base overflow-y-auto">
      {/* ========================================================================= */}
      {/* 1. Breadcrumbs & Scope Bar                                               */}
      {/* ========================================================================= */}
      <div className="ui-filter-bar bg-app-filter border-b border-app-border px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-app-muted">
          {breadcrumbItems.map((item, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-app-muted/70 shrink-0" />}
              {item.target ? (
                <button
                  type="button"
                  onClick={() => onSelectNavTarget(item.target!)}
                  className="text-app-muted hover:text-app-link font-medium transition-colors"
                >
                  {item.label}
                </button>
              ) : (
                <span className="ui-primary-text text-app-heading font-semibold">{item.label}</span>
              )}
            </React.Fragment>
          ))}
          {searchQuery && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-app-surface border border-app-border text-app-accent text-[11px] flex items-center gap-1">
              <span>Filter: "{searchQuery}"</span>
              <button
                type="button"
                onClick={onClearSearch}
                aria-label="Clear active filter"
                className="hover:text-app-heading"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </nav>

        {/* Action Controls: Selection, Sort, and Filters */}
        <div className="flex items-center gap-2">
          {!isSetlistContext && (
            <>
              {/* Metadata Filter */}
              <select
                aria-label="Filter songs by metadata"
                value={metadataFilter}
                onChange={(e) => setMetadataFilter(e.target.value as MetadataFilter)}
                className="bg-app-surface border border-app-border text-app-text text-xs rounded-xl px-2.5 py-1 outline-none"
              >
                <option value="ALL">All Metadata</option>
                <option value="HAS_KEY">Has Musical Key</option>
                <option value="HAS_BPM">Has Tempo/BPM</option>
              </select>

              {/* Sort Switcher */}
              <div className="flex items-center bg-app-surface border border-app-border rounded-xl p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleSortChange('title')}
                  className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                    sortField === 'title' ? 'bg-app-action text-app-on-action' : 'text-app-muted hover:text-app-text'
                  }`}
                >
                  Title {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  type="button"
                  onClick={() => handleSortChange('artist')}
                  className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                    sortField === 'artist' ? 'bg-app-action text-app-on-action' : 'text-app-muted hover:text-app-text'
                  }`}
                >
                  Artist {sortField === 'artist' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  type="button"
                  onClick={() => handleSortChange('date')}
                  className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                    sortField === 'date' ? 'bg-app-action text-app-on-action' : 'text-app-muted hover:text-app-text'
                  }`}
                >
                  Date {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </div>

              {/* Multi-Select Toggle */}
              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode)
                  setSelectedSongIds(new Set())
                }}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                  isSelectionMode
                    ? 'bg-amber-600/20 border-amber-500/60 text-amber-300'
                    : 'ui-button bg-app-button border-app-border text-app-button-text hover:brightness-110'
                }`}
              >
                {isSelectionMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                <span>Select</span>
              </button>
            </>
          )}

          {isSetlistContext && currentNavTarget.type !== 'SETLIST' && (
            <button
              type="button"
              onClick={() => onOpenSetlistManager()}
              className="ui-button px-3 py-1 bg-app-button hover:brightness-110 border border-app-border rounded-xl text-xs text-app-button-text font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Manage Setlists</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-selection Bar */}
      {isSelectionMode && (
        <div className="bg-app-surface/90 border-b border-app-border px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-app-text">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-amber-200">
              {selectedSongIds.size} {selectedSongIds.size === 1 ? 'song' : 'songs'} selected
            </span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-amber-400 hover:underline"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-amber-400 hover:underline"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedSongIds.size === 0}
              onClick={() => setShowAddToSetlistModal(true)}
              className="px-3 py-1 rounded-xl bg-app-action hover:brightness-110 disabled:opacity-50 text-app-on-action font-semibold flex items-center gap-1 shadow-sm transition-colors"
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>Add to Setlist</span>
            </button>
            <button
              type="button"
              disabled={selectedSongIds.size === 0}
              onClick={handleBulkDelete}
              className="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1 shadow-sm transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Main Content Canvas                                                    */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full">
        {/* CASE A: Single Setlist View */}
        {currentNavTarget.type === 'SETLIST' && activeSetlist && (
          <div className="space-y-4">
            <div className="ui-setlist-card flex flex-wrap items-center justify-between gap-3 p-4 bg-app-setlist border border-app-border rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
                  <ListMusic className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="ui-primary-text text-lg font-bold text-app-heading">{activeSetlist.name}</h1>
                  <p className="text-xs text-app-muted">
                    {activeSetlist.songs?.length || 0} performance entries • Canonical reference links preserved
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onEnterStageSetlist && activeSetlist.songs?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onEnterStageSetlist(activeSetlist, 0)}
                    className="px-3.5 py-1.5 rounded-xl bg-app-action hover:brightness-110 text-app-on-action text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Play in Stage</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenSetlistManager(activeSetlist.id)}
                  className="ui-button px-3.5 py-1.5 rounded-xl bg-app-button hover:brightness-110 text-app-button-text text-xs font-semibold border border-app-border transition-colors flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit in Setlist Manager</span>
                </button>
              </div>
            </div>

            {/* Setlist Song List */}
            {activeSetlist.songs?.length === 0 ? (
              <div className="text-center py-12 bg-app-surface/40 rounded-2xl border border-dashed border-app-border">
                <Music className="w-8 h-8 text-app-muted mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-app-heading">This setlist has no songs yet</h3>
                <p className="text-xs text-app-muted mt-1">
                  Add canonical songs from the Songbook using the "Add to Setlist" menu.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeSetlist.songs.map((ref, idx) => {
                  const master = songMap.get(ref.id)
                  const title = master?.title || ref.title || 'Untitled Song'
                  const artist = master?.artist || ref.artist || 'Unknown Artist'
                  const key = master?.key || ref.key || 'C'
                  const transpose = ref.transposeOffset ?? master?.transposeOffset ?? 0

                  return (
                    <div
                      key={ref.entryId || `${ref.id}_${idx}`}
                      onClick={() => onPlaySetlistSong(ref.id, transpose)}
                      className="ui-song-card group flex items-center justify-between p-3 rounded-xl bg-app-song hover:brightness-95 border border-app-border cursor-pointer transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 text-center text-xs font-bold text-app-muted group-hover:text-app-link">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="ui-primary-text text-sm font-bold text-app-heading group-hover:text-app-link transition-colors truncate">
                            {title}
                          </div>
                          <div className="ui-secondary-text text-xs text-app-muted truncate">{artist}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded-md bg-app-base border border-app-border text-app-accent text-xs font-mono font-bold">
                          {key}
                          {transpose !== 0 && (
                            <span className="text-[10px] text-purple-400 ml-1">
                              ({transpose > 0 ? `+${transpose}` : transpose})
                            </span>
                          )}
                        </span>
                        {onEnterStageSetlist && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onEnterStageSetlist(activeSetlist, idx)
                            }}
                            className="p-1.5 rounded-lg bg-app-action hover:brightness-110 text-app-on-action transition-colors"
                            title="Play in Stage"
                            aria-label="Play in Stage"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPlaySetlistSong(ref.id, transpose)
                          }}
                          className="ui-button p-1.5 rounded-lg bg-app-button hover:brightness-110 text-app-button-text border border-app-border transition-colors"
                          title="Open in Viewer"
                          aria-label="Open in Viewer"
                        >
                          <Music className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* CASE B: Setlist Library / Folder View */}
        {isSetlistContext && currentNavTarget.type !== 'SETLIST' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="ui-primary-text text-base font-bold text-app-heading flex items-center gap-2">
                <ListMusic className="ui-section-icon w-4 h-4 text-app-section" />
                <span>
                  {currentNavTarget.type === 'FOLDER'
                    ? folderMap.get(currentNavTarget.folderId)?.name || 'Folder Setlists'
                    : currentNavTarget.type === 'UNFILED_SETLISTS'
                    ? 'Unfiled Setlists'
                    : 'All Setlists'}
                </span>
                <span className="text-xs font-normal text-app-muted">
                  ({filteredSetlists.length})
                </span>
              </h2>
            </div>

            {filteredSetlists.length === 0 ? (
              <div className="text-center py-12 bg-app-surface/40 rounded-2xl border border-dashed border-app-border">
                <ListMusic className="w-8 h-8 text-app-muted mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-app-heading">No setlists in this scope</h3>
                <p className="text-xs text-app-muted mt-1">
                  Create a new setlist or drag existing ones into this folder.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSetlists.map((sl) => (
                  <div
                    key={sl.id}
                    onClick={() => onSelectNavTarget({ type: 'SETLIST', setlistId: sl.id })}
                    className="ui-setlist-card group p-4 rounded-2xl bg-app-setlist hover:brightness-95 border border-app-border cursor-pointer transition-all shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ListMusic className="ui-section-icon w-4 h-4 text-app-section" />
                          <h3 className="ui-primary-text text-sm font-bold text-app-heading group-hover:text-app-link transition-colors">
                            {sl.name}
                          </h3>
                        </div>
                        <span className="text-[10px] text-app-muted px-2 py-0.5 rounded-full bg-app-base border border-app-border">
                          {sl.songs?.length || 0} songs
                        </span>
                      </div>

                      {sl.folderId && folderMap.has(sl.folderId) && (
                        <div className="mt-2 text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                          <Folder className="w-3 h-3" />
                          <span>{folderMap.get(sl.folderId)?.name}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-app-border flex items-center justify-between text-xs text-app-muted">
                      <span>Updated {new Date(sl.updatedAt || sl.createdAt).toLocaleDateString()}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenSetlistManager(sl.id)
                        }}
                        className="text-app-link hover:underline font-semibold"
                      >
                        Manage →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CASE C: Master Songbook Songs Grid */}
        {!isSetlistContext && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="ui-primary-text text-base font-bold text-app-heading flex items-center gap-2">
                <Music className="ui-section-icon w-4 h-4 text-app-section" />
                <span>
                  {currentNavTarget.type === 'TAG' ? `Songs tagged #${currentNavTarget.tag}` : 'All Songs'}
                </span>
                <span className="text-xs font-normal text-app-muted">
                  ({processedSongs.length} {processedSongs.length === 1 ? 'song' : 'songs'})
                </span>
              </h2>

              <div className="flex items-center gap-2">
                {onOpenSources && (
                  <button
                    type="button"
                    onClick={onOpenSources}
                    className="ui-button px-3 py-1.5 rounded-xl bg-app-button hover:brightness-110 border border-app-border text-app-button-text font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                    title="Browse External Song Sources"
                  >
                    <Globe className="w-3.5 h-3.5 text-sky-400" />
                    <span>Browse Sources</span>
                  </button>
                )}
              <button
                type="button"
                onClick={onNewSong}
                className="px-3 py-1.5 rounded-xl bg-app-action hover:brightness-110 text-app-on-action font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Song</span>
              </button>
              </div>
            </div>

            {/* Empty State */}
            {processedSongs.length === 0 ? (
              <div className="text-center py-16 bg-app-surface/40 rounded-2xl border border-dashed border-app-border p-6">
                <Music className="w-10 h-10 text-app-muted mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-app-heading">No songs match your criteria</h3>
                <p className="text-xs text-app-muted max-w-sm mx-auto mt-1 mb-4">
                  {searchQuery
                    ? `No songs found matching "${searchQuery}". Clear your search query or add a new song.`
                    : 'Your songbook library is currently empty. Add your first chord chart or restore from backup.'}
                </p>
                <div className="flex justify-center gap-2 flex-wrap">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={onClearSearch}
                      className="ui-button px-3 py-1.5 bg-app-button hover:brightness-110 rounded-xl text-xs text-app-button-text font-semibold border border-app-border"
                    >
                      Clear Search
                    </button>
                  )}
                  {onOpenSources && (
                    <button
                      type="button"
                      onClick={onOpenSources}
                      className="ui-button px-3.5 py-1.5 bg-app-button hover:brightness-110 rounded-xl text-xs text-app-button-text font-semibold flex items-center gap-1 border border-app-border shadow-sm"
                    >
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      <span>Browse Sources</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onNewSong}
                    className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-xl text-xs text-white font-semibold flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Song</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Song Cards Grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {processedSongs.map((song) => {
                  const isSelected = selectedSongIds.has(song.id)
                  const isMenuOpen = activeMenuSongId === song.id

                  return (
                    <div
                      key={song.id}
                      onClick={() => {
                        if (isSelectionMode) {
                          handleToggleSelectSong(song.id)
                        } else {
                          onSelectSong(song)
                        }
                      }}
                      className={`ui-song-card group relative p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between shadow-sm ${
                        isSelected
                          ? 'ui-selection-card bg-app-selected border-app-selected-border'
                          : 'bg-app-song hover:brightness-95 border-app-border'
                      }`}
                    >
                      <div>
                        {/* Top Card Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            {isSelectionMode ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleSelectSong(song.id)
                                }}
                                className="mt-0.5 text-amber-400"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4 text-app-muted" />
                                )}
                              </button>
                            ) : (
                              <div className="w-7 h-7 rounded-lg bg-sky-600/20 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                                <Music className="w-3.5 h-3.5" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <h3 className="ui-primary-text text-sm font-bold text-app-heading group-hover:text-app-link transition-colors truncate">
                                {song.title}
                              </h3>
                              <p className="ui-secondary-text text-xs text-app-muted truncate">
                                {song.artist || 'Unknown Artist'}
                              </p>
                            </div>
                          </div>

                          {/* Quick Action Three-dot Menu */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveMenuSongId(isMenuOpen ? null : song.id)
                              }}
                              className="p-1 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-hover transition-colors"
                              title="Song actions"
                              aria-label="Song actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                              <div
                                ref={menuRef}
                                className="absolute right-0 mt-1 w-44 bg-app-surface border border-app-border rounded-xl p-1.5 shadow-2xl z-20 text-xs text-app-text"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {onEnterStageSong && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveMenuSongId(null)
                                      onEnterStageSong(song)
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-app-hover text-app-action flex items-center gap-2"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>Play in Stage</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuSongId(null)
                                    onSelectSong(song)
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-app-hover text-app-text flex items-center gap-2"
                                >
                                  <Music className="w-3.5 h-3.5 text-sky-400" />
                                  <span>View Chart</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuSongId(null)
                                    onEditSong(song)
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-app-hover text-app-text flex items-center gap-2"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-sky-400" />
                                  <span>Edit Chart</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuSongId(null)
                                    setSelectedSongIds(new Set([song.id]))
                                    setShowAddToSetlistModal(true)
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-app-hover text-app-text flex items-center gap-2"
                                >
                                  <ListPlus className="w-3.5 h-3.5 text-purple-400" />
                                  <span>Add to Setlist</span>
                                </button>
                                <div className="border-t border-app-border my-1"></div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setActiveMenuSongId(null)
                                    if (confirm(`Delete song "${song.title}"? Setlists referencing it will retain their shortcut entries.`)) {
                                      await onDeleteSong(song.id)
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-red-950/40 text-red-400 flex items-center gap-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete Song</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Song Tags Pill Row */}
                        {song.tags && song.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {song.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onSelectNavTarget({ type: 'TAG', tag: t })
                                }}
                                className="px-1.5 py-0.5 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 text-[10px] font-medium hover:border-emerald-600 transition-colors"
                              >
                                #{t}
                              </span>
                            ))}
                            {song.tags.length > 3 && (
                              <span className="text-[10px] text-app-muted font-mono">
                                +{song.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Footer: Metadata Badges */}
                      <div className="mt-3 pt-2.5 border-t border-app-border flex items-center justify-between text-xs text-app-muted">
                        <div className="flex items-center gap-1.5">
                          {song.key && (
                            <span className="px-1.5 py-0.2 rounded bg-app-base border border-app-border text-app-accent font-mono font-bold text-[11px]">
                              {song.key}
                            </span>
                          )}
                          {song.bpm && (
                            <span className="text-[10px] text-app-muted font-mono">
                              {song.bpm} BPM
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {onEnterStageSong && !isSelectionMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onEnterStageSong(song)
                              }}
                              title="Play in Stage"
                              aria-label={`Play ${song.title} in Stage`}
                              className="px-2 py-0.5 rounded-md bg-app-action hover:brightness-110 text-app-on-action font-semibold text-[11px] transition-colors flex items-center gap-1"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Stage</span>
                            </button>
                          )}
                          <span className="text-[10px] text-app-muted">
                            {new Date(song.updatedAt || song.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. Add to Setlist Modal Dialog                                            */}
      {/* ========================================================================= */}
      {showAddToSetlistModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-to-setlist-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowAddToSetlistModal(false)}
        >
          <div
            className="bg-app-surface border border-app-border rounded-2xl w-full max-w-md p-5 text-app-text shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-app-border">
              <div className="flex items-center gap-2">
                <ListPlus className="w-5 h-5 text-purple-400" />
                <h3 id="add-to-setlist-title" className="ui-primary-text text-base font-bold text-app-heading">
                  Add to Setlist
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddToSetlistModal(false)}
                className="p-1 rounded-lg text-app-muted hover:text-app-heading"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-app-muted">
              Add {selectedSongIds.size} selected {selectedSongIds.size === 1 ? 'song' : 'songs'} as performance shortcuts:
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-app-heading mb-1.5">
                  Select Target Setlist
                </label>
                <select
                  value={targetSetlistId}
                  onChange={(e) => setTargetSetlistId(e.target.value)}
                  className="w-full bg-app-base border border-app-border text-app-text text-xs rounded-xl px-3 py-2 outline-none"
                >
                  <option value="">-- Choose Setlist --</option>
                  <option value="__NEW__">+ Create Brand New Setlist...</option>
                  {setlists.map((sl) => (
                    <option key={sl.id} value={sl.id}>
                      {sl.name} ({sl.songs?.length || 0} songs)
                    </option>
                  ))}
                </select>
              </div>

              {targetSetlistId === '__NEW__' && (
                <div>
                  <label className="block text-xs font-semibold text-app-heading mb-1.5">
                    New Setlist Name
                  </label>
                  <input
                    type="text"
                    value={newSetlistNameInput}
                    onChange={(e) => setNewSetlistNameInput(e.target.value)}
                    placeholder="e.g. Friday Gig 1st Set"
                    className="w-full bg-app-base border border-app-border text-app-text text-xs rounded-xl px-3 py-2 outline-none focus:border-sky-500"
                  />
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-app-border flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddToSetlistModal(false)}
                className="ui-button px-3.5 py-1.5 rounded-xl bg-app-button hover:brightness-110 text-app-button-text text-xs font-semibold border border-app-border"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!targetSetlistId || (targetSetlistId === '__NEW__' && !newSetlistNameInput.trim())}
                onClick={handleConfirmAddToSetlist}
                className="px-4 py-1.5 rounded-xl bg-app-action hover:brightness-110 disabled:opacity-50 text-app-on-action text-xs font-semibold shadow-sm transition-colors"
              >
                Add Entries
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
