import React, { useState } from 'react'
import type { SongEntity, WebSetlist, WebSetlistSongRef } from '../types/gtar'
import { generateUUID } from '../utils/uuid'

export interface SetlistManagerProps {
  setlists: WebSetlist[]
  allSongs: SongEntity[]
  onSaveSetlist: (setlist: WebSetlist) => Promise<void>
  onDeleteSetlist: (id: string) => Promise<void>
  onPlaySong: (songId: string) => void
}

export const SetlistManager: React.FC<SetlistManagerProps> = ({
  setlists,
  allSongs,
  onSaveSetlist,
  onDeleteSetlist,
  onPlaySong,
}) => {
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(
    setlists[0]?.id || null
  )
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [newSetName, setNewSetName] = useState<string>('')
  const [editingName, setEditingName] = useState<boolean>(false)
  const [nameInput, setNameInput] = useState<string>('')
  const [selectedSongToAdd, setSelectedSongToAdd] = useState<string>('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const currentSetlist = setlists.find((s) => s.id === selectedSetlistId) || null

  const handleCreateSetlist = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newSetName.trim() || 'New Setlist'
    const newSet: WebSetlist = {
      id: generateUUID(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      songs: [],
    }

    try {
      await onSaveSetlist(newSet)
      setNewSetName('')
      setIsCreating(false)
      setSelectedSetlistId(newSet.id)
    } catch (err: any) {
      alert(`Error creating setlist: ${err?.message}`)
    }
  }

  const handleRename = async () => {
    if (!currentSetlist) return
    const updatedName = nameInput.trim() || currentSetlist.name
    const updated: WebSetlist = {
      ...currentSetlist,
      name: updatedName,
      updatedAt: Date.now(),
    }
    await onSaveSetlist(updated)
    setEditingName(false)
  }

  const handleAddSong = async () => {
    if (!currentSetlist || !selectedSongToAdd) return
    const song = allSongs.find((s) => s.id === selectedSongToAdd)
    if (!song) return

    const newSongRef: WebSetlistSongRef = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      key: song.key,
      position: currentSetlist.songs.length,
    }

    const updated: WebSetlist = {
      ...currentSetlist,
      songs: [...currentSetlist.songs, newSongRef],
      updatedAt: Date.now(),
    }

    await onSaveSetlist(updated)
    setSelectedSongToAdd('')
    setStatusMessage(`Added "${song.title}" to setlist`)
    setTimeout(() => setStatusMessage(null), 2000)
  }

  const handleMoveSong = async (index: number, direction: 'UP' | 'DOWN') => {
    if (!currentSetlist) return
    const songs = [...currentSetlist.songs]
    const targetIndex = direction === 'UP' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= songs.length) return

    const temp = songs[index]
    songs[index] = songs[targetIndex]
    songs[targetIndex] = temp

    // Re-index positions
    const reindexed = songs.map((s, idx) => ({ ...s, position: idx }))
    const updated: WebSetlist = {
      ...currentSetlist,
      songs: reindexed,
      updatedAt: Date.now(),
    }

    await onSaveSetlist(updated)
  }

  const handleRemoveSong = async (index: number) => {
    if (!currentSetlist) return
    const songs = currentSetlist.songs.filter((_, idx) => idx !== index)
    const reindexed = songs.map((s, idx) => ({ ...s, position: idx }))
    const updated: WebSetlist = {
      ...currentSetlist,
      songs: reindexed,
      updatedAt: Date.now(),
    }
    await onSaveSetlist(updated)
  }

  const handleDeleteSetlist = async () => {
    if (!currentSetlist) return
    if (!confirm(`Are you sure you want to delete setlist "${currentSetlist.name}"?`)) return
    await onDeleteSetlist(currentSetlist.id)
    setSelectedSetlistId(setlists.find((s) => s.id !== currentSetlist.id)?.id || null)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Setlists Sidebar */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white">Setlists</h3>
            <button
              onClick={() => setIsCreating(true)}
              className="px-2.5 py-1 text-xs bg-sky-600 hover:bg-sky-500 rounded-lg text-white font-semibold transition-colors"
            >
              + New Setlist
            </button>
          </div>

          {isCreating && (
            <form onSubmit={handleCreateSetlist} className="mb-4 p-3 bg-slate-800 rounded-xl border border-slate-700">
              <input
                type="text"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="Setlist name..."
                autoFocus
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 mb-2"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1.5">
            {setlists.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-900/60 rounded-xl border border-slate-800">
                No setlists yet. Create one above!
              </div>
            ) : (
              setlists.map((sl) => (
                <button
                  key={sl.id}
                  onClick={() => {
                    setSelectedSetlistId(sl.id)
                    setEditingName(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                    selectedSetlistId === sl.id
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-slate-850 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span className="truncate">{sl.name}</span>
                  <span className="text-[11px] opacity-75 ml-2 font-mono">
                    {sl.songs.length}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Selected Setlist Detail */}
        <div className="flex-1 min-w-0">
          {currentSetlist ? (
            <div className="bg-slate-850 p-6 rounded-2xl border border-slate-800">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-800">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      autoFocus
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-base font-bold text-white focus:outline-none focus:border-sky-500"
                    />
                    <button
                      onClick={handleRename}
                      className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="px-2 py-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-white">{currentSetlist.name}</h2>
                    <button
                      onClick={() => {
                        setNameInput(currentSetlist.name)
                        setEditingName(true)
                      }}
                      className="text-xs text-slate-400 hover:text-sky-400"
                    >
                      Rename
                    </button>
                  </div>
                )}

                <button
                  onClick={handleDeleteSetlist}
                  className="px-3 py-1.5 text-xs text-red-300 hover:text-red-200 bg-red-950/40 hover:bg-red-950 border border-red-900/60 rounded-lg transition-colors"
                >
                  Delete Setlist
                </button>
              </div>

              {/* Add Song to Setlist */}
              <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-slate-900 rounded-xl border border-slate-800">
                <select
                  value={selectedSongToAdd}
                  onChange={(e) => setSelectedSongToAdd(e.target.value)}
                  className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="">Select a song from library...</option>
                  {allSongs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} {s.artist ? `— ${s.artist}` : ''} {s.key ? `(${s.key})` : ''}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleAddSong}
                  disabled={!selectedSongToAdd}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  + Add to Setlist
                </button>

                {statusMessage && (
                  <span className="text-xs text-emerald-400 font-medium ml-2">
                    {statusMessage}
                  </span>
                )}
              </div>

              {/* Setlist Songs List with Reordering */}
              {currentSetlist.songs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  This setlist is empty. Add songs from your songbook above.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentSetlist.songs.map((songRef, index) => (
                    <div
                      key={`${songRef.id}-${index}`}
                      className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 flex items-center justify-between gap-3 group transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 text-center text-xs font-mono font-bold text-slate-500">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <button
                            onClick={() => onPlaySong(songRef.id)}
                            className="text-left font-bold text-slate-100 hover:text-sky-300 text-sm truncate block"
                          >
                            {songRef.title}
                          </button>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            {songRef.artist && <span>{songRef.artist}</span>}
                            {songRef.key && (
                              <span className="font-mono text-amber-400">Key: {songRef.key}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Reorder & Action Controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleMoveSong(index, 'UP')}
                          disabled={index === 0}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-slate-700 rounded text-xs"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMoveSong(index, 'DOWN')}
                          disabled={index === currentSetlist.songs.length - 1}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-slate-700 rounded text-xs"
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => onPlaySong(songRef.id)}
                          className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition-colors ml-2"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleRemoveSong(index)}
                          className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded text-xs"
                          title="Remove from setlist"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-20 text-center text-slate-500 text-sm bg-slate-850 rounded-2xl border border-slate-800">
              Select or create a setlist to view songs.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
