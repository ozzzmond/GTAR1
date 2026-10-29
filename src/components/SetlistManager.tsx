import React, { useState } from 'react'
import type { SongEntity, WebSetlist, WebSetlistSongRef, SetlistFolder } from '../types/gtar'
import { generateUUID } from '../utils/uuid'
import { validateFolderParentChange } from '../utils/folders'

export interface SetlistManagerProps {
  setlists: WebSetlist[]
  folders: SetlistFolder[]
  allSongs: SongEntity[]
  initialSelectedSetlistId?: string
  onSaveSetlist: (setlist: WebSetlist) => Promise<void>
  onDeleteSetlist: (id: string) => Promise<void>
  onSaveFolder: (folder: SetlistFolder) => Promise<void>
  onDeleteFolder: (id: string) => Promise<void>
  onPlaySong: (songId: string, transposeOffset?: number) => void
  onEnterStageSetlist?: (setlist: WebSetlist, startIndex?: number) => void
}

export const SetlistManager: React.FC<SetlistManagerProps> = ({
  setlists,
  folders,
  allSongs,
  initialSelectedSetlistId,
  onSaveSetlist,
  onDeleteSetlist,
  onSaveFolder,
  onDeleteFolder,
  onPlaySong,
  onEnterStageSetlist,
}) => {
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(
    initialSelectedSetlistId || setlists[0]?.id || null
  )
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string | 'ALL' | 'UNFILED'>('ALL')
  const [isCreatingSetlist, setIsCreatingSetlist] = useState<boolean>(false)
  const [newSetName, setNewSetName] = useState<string>('')
  const [newSetFolderId, setNewSetFolderId] = useState<string>('')

  // Folder management state
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false)
  const [newFolderName, setNewFolderName] = useState<string>('')
  const [newFolderParentId, setNewFolderParentId] = useState<string>('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState<string>('')
  const [editFolderParentId, setEditFolderParentId] = useState<string>('')

  // Setlist detail state
  const [editingName, setEditingName] = useState<boolean>(false)
  const [nameInput, setNameInput] = useState<string>('')
  const [selectedSongToAdd, setSelectedSongToAdd] = useState<string>('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const currentSetlist = setlists.find((s) => s.id === selectedSetlistId) || null

  // Fast song lookup map
  const songMap = new Map<string, SongEntity>()
  for (const s of allSongs) {
    songMap.set(s.id, s)
  }

  // Filter setlists according to selected folder
  const displayedSetlists = setlists.filter((sl) => {
    if (selectedFolderFilter === 'ALL') return true
    if (selectedFolderFilter === 'UNFILED') return !sl.folderId
    return sl.folderId === selectedFolderFilter
  })

  // Folder Creation
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newFolderName.trim() || 'New Folder'
    const newFolder: SetlistFolder = {
      id: generateUUID(),
      name,
      parentId: newFolderParentId.trim() ? newFolderParentId.trim() : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    try {
      await onSaveFolder(newFolder)
      setNewFolderName('')
      setNewFolderParentId('')
      setIsCreatingFolder(false)
    } catch (err: any) {
      alert(`Error creating folder: ${err?.message}`)
    }
  }

  // Folder Edit / Move
  const handleSaveEditFolder = async () => {
    if (!editingFolderId) return
    const folder = folders.find((f) => f.id === editingFolderId)
    if (!folder) return

    const targetParent = editFolderParentId.trim() ? editFolderParentId.trim() : null
    if (!validateFolderParentChange(folders, editingFolderId, targetParent)) {
      alert('Cannot move folder: operation would create a circular dependency loop.')
      return
    }

    const updated: SetlistFolder = {
      ...folder,
      name: editFolderName.trim() || folder.name,
      parentId: targetParent,
      updatedAt: Date.now(),
    }

    try {
      await onSaveFolder(updated)
      setEditingFolderId(null)
    } catch (err: any) {
      alert(`Error updating folder: ${err?.message}`)
    }
  }

  // Folder Deletion
  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return
    if (!confirm(`Delete folder "${folder.name}"? Setlists inside will become unfiled.`)) {
      return
    }

    // Unfile setlists inside this folder
    const affectedSetlists = setlists.filter((sl) => sl.folderId === folderId)
    for (const sl of affectedSetlists) {
      await onSaveSetlist({
        ...sl,
        folderId: null,
        updatedAt: Date.now(),
      })
    }

    // Re-parent subfolders to parent of deleted folder
    const childFolders = folders.filter((f) => f.parentId === folderId)
    for (const child of childFolders) {
      await onSaveFolder({
        ...child,
        parentId: folder.parentId ?? null,
        updatedAt: Date.now(),
      })
    }

    await onDeleteFolder(folderId)
    if (selectedFolderFilter === folderId) {
      setSelectedFolderFilter('ALL')
    }
  }

  // Setlist Creation
  const handleCreateSetlist = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newSetName.trim() || 'New Setlist'
    const newSet: WebSetlist = {
      id: generateUUID(),
      name,
      folderId: newSetFolderId.trim() ? newSetFolderId.trim() : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      songs: [],
    }

    try {
      await onSaveSetlist(newSet)
      setNewSetName('')
      setNewSetFolderId('')
      setIsCreatingSetlist(false)
      setSelectedSetlistId(newSet.id)
    } catch (err: any) {
      alert(`Error creating setlist: ${err?.message}`)
    }
  }

  // Setlist Rename & Folder Assignment
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

  const handleChangeSetlistFolder = async (folderIdVal: string) => {
    if (!currentSetlist) return
    const folderId = folderIdVal === '__UNFILED__' ? null : folderIdVal
    const updated: WebSetlist = {
      ...currentSetlist,
      folderId,
      updatedAt: Date.now(),
    }
    await onSaveSetlist(updated)
  }

  // Add Song Reference (Shortcut) to Setlist
  const handleAddSong = async () => {
    if (!currentSetlist || !selectedSongToAdd) return
    const song = songMap.get(selectedSongToAdd)
    if (!song) return

    const newSongRef: WebSetlistSongRef = {
      entryId: generateUUID(), // Stable per-occurrence entry ID
      id: song.id,             // Canonical master song ID
      title: song.title,
      artist: song.artist,
      key: song.key,
      position: currentSetlist.songs.length,
      transposeOffset: 0,
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

  // Move Song Reference Position
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

  // Per-entry Transpose Adjustment
  const handleAdjustTranspose = async (index: number, delta: number) => {
    if (!currentSetlist) return
    const songs = [...currentSetlist.songs]
    const currentRef = songs[index]
    const currentOffset = currentRef.transposeOffset || 0
    const newOffset = currentOffset + delta

    songs[index] = {
      ...currentRef,
      transposeOffset: newOffset,
    }

    const updated: WebSetlist = {
      ...currentSetlist,
      songs,
      updatedAt: Date.now(),
    }

    await onSaveSetlist(updated)
  }

  // Remove Shortcut from Setlist
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

  // Delete Setlist
  const handleDeleteSetlist = async () => {
    if (!currentSetlist) return
    if (!confirm(`Are you sure you want to delete setlist "${currentSetlist.name}"?`)) return
    await onDeleteSetlist(currentSetlist.id)
    setSelectedSetlistId(setlists.find((s) => s.id !== currentSetlist.id)?.id || null)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Sidebar: Folders & Setlists */}
        <div className="w-full md:w-72 flex-shrink-0 space-y-4">
          {/* Folders Section */}
          <div className="bg-slate-850 p-3 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Folders ({folders.length})
              </h4>
              <button
                onClick={() => setIsCreatingFolder(true)}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold"
              >
                + New Folder
              </button>
            </div>

            {isCreatingFolder && (
              <form onSubmit={handleCreateFolder} className="mb-3 p-2 bg-slate-900 rounded-xl border border-slate-700">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name..."
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white mb-1.5 focus:outline-none focus:border-sky-500"
                />
                {folders.length > 0 && (
                  <select
                    value={newFolderParentId}
                    onChange={(e) => setNewFolderParentId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 mb-2 focus:outline-none"
                  >
                    <option value="">Top Level (Root)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        Inside: {f.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setIsCreatingFolder(false)}
                    className="px-2 py-0.5 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2 py-0.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {/* Folder Edit Modal/Row */}
            {editingFolderId && (
              <div className="mb-3 p-2 bg-slate-900 rounded-xl border border-sky-500">
                <div className="text-[11px] font-semibold text-slate-300 mb-1">Edit / Move Folder</div>
                <input
                  type="text"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white mb-1.5 focus:outline-none"
                />
                <select
                  value={editFolderParentId}
                  onChange={(e) => setEditFolderParentId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 mb-2 focus:outline-none"
                >
                  <option value="">Top Level (Root)</option>
                  {folders
                    .filter((f) => f.id !== editingFolderId)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        Inside: {f.name}
                      </option>
                    ))}
                </select>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingFolderId(null)}
                    className="px-2 py-0.5 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditFolder}
                    className="px-2 py-0.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Folder Navigation Filter Pills */}
            <div className="space-y-1 text-xs">
              <button
                onClick={() => setSelectedFolderFilter('ALL')}
                className={`w-full text-left px-2 py-1.5 rounded-lg font-medium flex items-center justify-between ${
                  selectedFolderFilter === 'ALL'
                    ? 'bg-sky-600/30 text-sky-300 border border-sky-600/50'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span>📁 All Setlists</span>
                <span className="font-mono text-[10px]">{setlists.length}</span>
              </button>

              <button
                onClick={() => setSelectedFolderFilter('UNFILED')}
                className={`w-full text-left px-2 py-1.5 rounded-lg font-medium flex items-center justify-between ${
                  selectedFolderFilter === 'UNFILED'
                    ? 'bg-sky-600/30 text-sky-300 border border-sky-600/50'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span>📄 Unfiled</span>
                <span className="font-mono text-[10px]">
                  {setlists.filter((sl) => !sl.folderId).length}
                </span>
              </button>

              {folders.map((folder) => {
                const count = setlists.filter((sl) => sl.folderId === folder.id).length
                const isSelected = selectedFolderFilter === folder.id
                return (
                  <div
                    key={folder.id}
                    className={`flex items-center justify-between px-2 py-1 rounded-lg group ${
                      isSelected
                        ? 'bg-sky-600/30 text-sky-300 border border-sky-600/50'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedFolderFilter(folder.id)}
                      className="flex-1 text-left truncate flex items-center gap-1.5 py-0.5"
                    >
                      <span>📁 {folder.parentId ? '↳ ' : ''}{folder.name}</span>
                      <span className="font-mono text-[10px] opacity-75">({count})</span>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingFolderId(folder.id)
                          setEditFolderName(folder.name)
                          setEditFolderParentId(folder.parentId || '')
                        }}
                        className="text-[10px] text-slate-400 hover:text-white px-1"
                        title="Edit / Move"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="text-[10px] text-slate-400 hover:text-red-300 px-1"
                        title="Delete folder"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Setlists List Section */}
          <div className="bg-slate-850 p-3 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">Setlists</h3>
              <button
                onClick={() => setIsCreatingSetlist(true)}
                className="px-2.5 py-1 text-xs bg-sky-600 hover:bg-sky-500 rounded-lg text-white font-semibold transition-colors"
              >
                + New Setlist
              </button>
            </div>

            {isCreatingSetlist && (
              <form onSubmit={handleCreateSetlist} className="mb-4 p-3 bg-slate-900 rounded-xl border border-slate-700">
                <input
                  type="text"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="Setlist name..."
                  autoFocus
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 mb-2"
                />
                {folders.length > 0 && (
                  <select
                    value={newSetFolderId}
                    onChange={(e) => setNewSetFolderId(e.target.value)}
                    className="w-full bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none mb-2"
                  >
                    <option value="">Folder: Unfiled</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        Folder: {f.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSetlist(false)}
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
              {displayedSetlists.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-900/60 rounded-xl border border-slate-800">
                  {setlists.length === 0
                    ? 'No setlists yet. Create one above!'
                    : 'No setlists in this folder.'}
                </div>
              ) : (
                displayedSetlists.map((sl) => (
                  <button
                    key={sl.id}
                    onClick={() => {
                      setSelectedSetlistId(sl.id)
                      setEditingName(false)
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                      selectedSetlistId === sl.id
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
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
        </div>

        {/* Right Main Pane: Selected Setlist Detail */}
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

                <div className="flex items-center gap-3">
                  {/* Folder Assignment Selector */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>Folder:</span>
                    <select
                      value={currentSetlist.folderId || '__UNFILED__'}
                      onChange={(e) => handleChangeSetlistFolder(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="__UNFILED__">Unfiled</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {onEnterStageSetlist && currentSetlist.songs?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onEnterStageSetlist(currentSetlist, 0)}
                      className="px-3 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      ▶ Play Setlist in Stage
                    </button>
                  )}

                  <button
                    onClick={handleDeleteSetlist}
                    className="px-3 py-1.5 text-xs text-red-300 hover:text-red-200 bg-red-950/40 hover:bg-red-950 border border-red-900/60 rounded-lg transition-colors"
                  >
                    Delete Setlist
                  </button>
                </div>
              </div>

              {/* Add Song Shortcut to Setlist */}
              <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-slate-900 rounded-xl border border-slate-800">
                <select
                  value={selectedSongToAdd}
                  onChange={(e) => setSelectedSongToAdd(e.target.value)}
                  className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="">Select a canonical song to add shortcut...</option>
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
                  + Add Shortcut
                </button>

                {statusMessage && (
                  <span className="text-xs text-emerald-400 font-medium ml-2">
                    {statusMessage}
                  </span>
                )}
              </div>

              {/* Setlist Song Shortcuts List with Reordering & Per-entry Transpose */}
              {currentSetlist.songs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  This setlist has no songs. Add song shortcuts above.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentSetlist.songs.map((songRef, index) => {
                    const masterSong = songMap.get(songRef.id)
                    const isMissing = !masterSong

                    return (
                      <div
                        key={songRef.entryId || `${songRef.id}-${index}`}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 group transition-colors ${
                          isMissing
                            ? 'bg-red-950/20 border-red-900/50 hover:bg-red-950/30'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 text-center text-xs font-mono font-bold text-slate-500">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            {isMissing ? (
                              <div>
                                <span className="font-bold text-red-300 text-sm line-through block truncate">
                                  {songRef.title} (Deleted from Songbook)
                                </span>
                                <span className="text-[11px] text-red-400">
                                  Source song ID {songRef.id} not found in canonical library
                                </span>
                              </div>
                            ) : (
                              <div>
                                <button
                                  onClick={() => onPlaySong(songRef.id, songRef.transposeOffset)}
                                  className="text-left font-bold text-slate-100 hover:text-sky-300 text-sm truncate block"
                                >
                                  {songRef.title}
                                </button>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                  {songRef.artist && <span>{songRef.artist}</span>}
                                  {songRef.key && (
                                    <span className="font-mono text-amber-400">
                                      Key: {songRef.key}
                                    </span>
                                  )}
                                  {typeof songRef.transposeOffset === 'number' && songRef.transposeOffset !== 0 && (
                                    <span className="bg-amber-950/70 border border-amber-700/60 text-amber-300 px-1.5 py-0.2 rounded font-mono text-[10px]">
                                      {songRef.transposeOffset > 0 ? `+${songRef.transposeOffset}` : songRef.transposeOffset}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reorder & Action Controls */}
                        <div className="flex items-center gap-1.5">
                          {/* Transpose +/- Controls */}
                          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 mr-2 text-[11px]">
                            <button
                              onClick={() => handleAdjustTranspose(index, -1)}
                              className="px-1.5 py-0.5 text-slate-400 hover:text-white"
                              title="Transpose -1 half-step"
                            >
                              ♭-
                            </button>
                            <span className="px-1 font-mono text-slate-300">
                              {songRef.transposeOffset || 0}
                            </span>
                            <button
                              onClick={() => handleAdjustTranspose(index, 1)}
                              className="px-1.5 py-0.5 text-slate-400 hover:text-white"
                              title="Transpose +1 half-step"
                            >
                              ♯+
                            </button>
                          </div>

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
                          {!isMissing && (
                            <button
                              onClick={() => onPlaySong(songRef.id, songRef.transposeOffset)}
                              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition-colors ml-2"
                            >
                              View
                            </button>
                          )}
                          {!isMissing && onEnterStageSetlist && (
                            <button
                              onClick={() => onEnterStageSetlist(currentSetlist, index)}
                              className="px-2.5 py-1 text-xs bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg transition-colors ml-1 font-semibold"
                              title="Play in Stage Performance"
                            >
                              Stage
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveSong(index)}
                            className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded text-xs ml-1"
                            title="Remove shortcut from setlist"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="py-20 text-center text-slate-500 text-sm bg-slate-850 rounded-2xl border border-slate-800">
              Select or create a setlist to view song shortcuts.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
