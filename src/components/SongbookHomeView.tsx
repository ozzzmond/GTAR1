import React, { useState, useMemo } from 'react'
import type { SongEntity } from '../types/gtar'
import { normalizeTags, removeTagFromList, renameTagInList } from '../utils/tags'

export interface SongbookHomeViewProps {
  songs: SongEntity[]
  onSelectSong: (song: SongEntity) => void
  onEditSong: (song: SongEntity) => void
  onNewSong: () => void
  onOpenBackup: () => void
  onBulkUpdateSongs?: (updated: SongEntity[]) => Promise<void>
}

export const SongbookHomeView: React.FC<SongbookHomeViewProps> = ({
  songs,
  onSelectSong,
  onEditSong,
  onNewSong,
  onOpenBackup,
  onBulkUpdateSongs,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [renameTagInput, setRenameTagInput] = useState<string>('')

  // Derive unique tags across all songs
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const s of songs) {
      if (Array.isArray(s.tags)) {
        for (const t of s.tags) {
          tagSet.add(t)
        }
      }
    }
    return Array.from(tagSet).sort()
  }, [songs])

  // Filter songs by search term and selected tag
  const filteredSongs = useMemo(() => {
    let result = songs

    if (selectedTag) {
      const target = selectedTag.toLowerCase()
      result = result.filter(
        (s) => Array.isArray(s.tags) && s.tags.some((t) => t.toLowerCase() === target)
      )
    }

    const q = searchTerm.trim().toLowerCase()
    if (q) {
      result = result.filter((s) => {
        const matchTitle = s.title.toLowerCase().includes(q)
        const matchArtist = s.artist ? s.artist.toLowerCase().includes(q) : false
        const matchKey = s.key ? s.key.toLowerCase().includes(q) : false
        const matchTags = s.tags ? s.tags.some((t) => t.toLowerCase().includes(q)) : false
        return matchTitle || matchArtist || matchKey || matchTags
      })
    }

    return result
  }, [songs, searchTerm, selectedTag])

  // Safe tag rename across songbook
  const handleRenameTag = async (oldTag: string) => {
    const newTag = renameTagInput.trim().toLowerCase()
    if (!newTag || newTag === oldTag.toLowerCase()) {
      setEditingTag(null)
      return
    }

    if (onBulkUpdateSongs) {
      const affectedSongs = songs.filter((s) =>
        s.tags?.some((t) => t.toLowerCase() === oldTag.toLowerCase())
      )
      const updatedSongs = affectedSongs.map((s) => ({
        ...s,
        tags: renameTagInList(s.tags, oldTag, newTag),
        updatedAt: Date.now(),
      }))
      await onBulkUpdateSongs(updatedSongs)
    }

    if (selectedTag?.toLowerCase() === oldTag.toLowerCase()) {
      setSelectedTag(newTag)
    }
    setEditingTag(null)
  }

  // Safe tag deletion across songbook
  const handleDeleteTag = async (tagToDelete: string) => {
    if (
      !confirm(
        `Remove tag "${tagToDelete}" from all songs? Master songs and content will not be deleted.`
      )
    ) {
      return
    }

    if (onBulkUpdateSongs) {
      const affectedSongs = songs.filter((s) =>
        s.tags?.some((t) => t.toLowerCase() === tagToDelete.toLowerCase())
      )
      const updatedSongs = affectedSongs.map((s) => ({
        ...s,
        tags: removeTagFromList(s.tags, tagToDelete),
        updatedAt: Date.now(),
      }))
      await onBulkUpdateSongs(updatedSongs)
    }

    if (selectedTag?.toLowerCase() === tagToDelete.toLowerCase()) {
      setSelectedTag(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search songs by title, artist, key, or tag..."
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500 text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onNewSong}
            className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition-colors shadow-sm flex items-center gap-1.5"
          >
            + New Song
          </button>
        </div>
      </div>

      {/* Lightweight Tag Filter Pills Bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-5 p-2 bg-slate-900/50 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2">
            Tags:
          </span>
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              selectedTag === null
                ? 'bg-sky-600 text-white font-semibold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All Songs ({songs.length})
          </button>

          {allTags.map((tag) => {
            const count = songs.filter((s) => s.tags?.includes(tag)).length
            const isSelected = selectedTag === tag

            if (editingTag === tag) {
              return (
                <div key={tag} className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-sky-500">
                  <input
                    type="text"
                    value={renameTagInput}
                    onChange={(e) => setRenameTagInput(e.target.value)}
                    autoFocus
                    className="bg-slate-900 px-2 py-0.5 text-xs text-white rounded focus:outline-none w-24"
                  />
                  <button
                    onClick={() => handleRenameTag(tag)}
                    className="px-1.5 py-0.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingTag(null)}
                    className="px-1 py-0.5 text-[11px] text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              )
            }

            return (
              <div
                key={tag}
                className={`inline-flex items-center rounded-lg text-xs transition-colors group ${
                  isSelected ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                }`}
              >
                <button
                  onClick={() => setSelectedTag(isSelected ? null : tag)}
                  className="px-2.5 py-1 font-medium flex items-center gap-1.5"
                >
                  <span>#{tag}</span>
                  <span className="text-[10px] opacity-75 font-mono">({count})</span>
                </button>
                {onBulkUpdateSongs && (
                  <div className="flex items-center pr-1.5 gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameTagInput(tag)
                        setEditingTag(tag)
                      }}
                      className="text-[10px] text-slate-300 hover:text-white px-1 hover:bg-black/20 rounded"
                      title="Rename tag"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteTag(tag)
                      }}
                      className="text-[10px] text-slate-300 hover:text-red-300 px-1 hover:bg-black/20 rounded"
                      title="Remove tag from all songs"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Song Count Subtitle */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-4 px-1">
        <span>
          {songs.length === 0
            ? '0 songs'
            : `${filteredSongs.length} of ${songs.length} song${songs.length === 1 ? '' : 's'}${
                selectedTag ? ` (tagged #${selectedTag})` : ''
              }`}
        </span>
      </div>

      {/* Blank Initial State */}
      {songs.length === 0 ? (
        <div className="text-center py-16 px-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 text-2xl font-bold">
            ♪
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Blank Initial Songbook</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Your local songbook is completely blank. Create your first song or import an existing JSON backup.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={onNewSong}
              className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors shadow"
            >
              + Create First Song
            </button>
            <button
              onClick={onOpenBackup}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors border border-slate-700"
            >
              Import JSON Backup
            </button>
          </div>
        </div>
      ) : filteredSongs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No songs found matching "{searchTerm}"{selectedTag ? ` with tag #${selectedTag}` : ''}
        </div>
      ) : (
        /* Song Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredSongs.map((song) => (
            <div
              key={song.id}
              onClick={() => onSelectSong(song)}
              className="p-4 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700/80 transition-all cursor-pointer flex items-center justify-between group shadow-sm"
            >
              <div className="min-w-0 flex-1 pr-3">
                <h4 className="text-base font-bold text-slate-100 group-hover:text-sky-300 truncate transition-colors">
                  {song.title}
                </h4>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {song.artist || 'Unknown Artist'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-400">
                  {song.key && (
                    <span className="bg-slate-800 px-2 py-0.5 rounded font-mono font-bold text-amber-400">
                      Key: {song.key}
                    </span>
                  )}
                  {song.bpm && <span>{song.bpm} BPM</span>}
                  {song.time && <span>{song.time}</span>}
                  {Array.isArray(song.tags) && song.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      {song.tags.map((t) => (
                        <span
                          key={t}
                          className="bg-slate-800/90 text-sky-300 px-1.5 py-0.5 rounded text-[10px]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditSong(song)
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
