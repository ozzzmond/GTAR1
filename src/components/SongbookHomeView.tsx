import React, { useState, useMemo } from 'react'
import type { SongEntity } from '../types/gtar'

export interface SongbookHomeViewProps {
  songs: SongEntity[]
  onSelectSong: (song: SongEntity) => void
  onEditSong: (song: SongEntity) => void
  onNewSong: () => void
  onOpenBackup: () => void
}

export const SongbookHomeView: React.FC<SongbookHomeViewProps> = ({
  songs,
  onSelectSong,
  onEditSong,
  onNewSong,
  onOpenBackup,
}) => {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredSongs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return songs

    return songs.filter((s) => {
      const matchTitle = s.title.toLowerCase().includes(q)
      const matchArtist = s.artist ? s.artist.toLowerCase().includes(q) : false
      const matchKey = s.key ? s.key.toLowerCase().includes(q) : false
      return matchTitle || matchArtist || matchKey
    })
  }, [songs, searchTerm])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search songs by title, artist, or key..."
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

      {/* Song Count Subtitle */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-4 px-1">
        <span>
          {songs.length === 0
            ? '0 songs'
            : `${filteredSongs.length} of ${songs.length} song${songs.length === 1 ? '' : 's'}`}
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
          No songs found matching "{searchTerm}"
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
                <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                  {song.key && (
                    <span className="bg-slate-800 px-2 py-0.5 rounded font-mono font-bold text-amber-400">
                      Key: {song.key}
                    </span>
                  )}
                  {song.bpm && <span>{song.bpm} BPM</span>}
                  {song.time && <span>{song.time}</span>}
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
