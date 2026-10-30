import React, { useState, useEffect } from 'react'
import type { SongEntity, WebSetlist, WebSetlistSongRef, SetlistFolder } from '../types/gtar'
import { generateUUID } from '../utils/uuid'
import { validateFolderParentChange } from '../utils/folders'

export interface SetlistManagerProps {
  setlists: WebSetlist[]
  folders: SetlistFolder[]
  allSongs: SongEntity[]
  initialSelectedSetlistId?: string
  onSelectedSetlistChange?: (id: string | undefined) => void
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
  onSelectedSetlistChange,
  onSaveSetlist,
  onDeleteSetlist,
  onSaveFolder,
  onDeleteFolder,
  onPlaySong,
  onEnterStageSetlist,
}) => {
  const [localSelectedSetlistId, setLocalSelectedSetlistId] = useState<string | null>(
    initialSelectedSetlistId || setlists[0]?.id || null
  )
  const selectedSetlistId = initialSelectedSetlistId ?? localSelectedSetlistId
  const setSelectedSetlistId = (id: string | null) => {
    setLocalSelectedSetlistId(id)
    onSelectedSetlistChange?.(id || undefined)
  }
  useEffect(() => {
    if (!initialSelectedSetlistId && localSelectedSetlistId) onSelectedSetlistChange?.(localSelectedSetlistId)
  }, [initialSelectedSetlistId, localSelectedSetlistId, onSelectedSetlistChange])
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
          <div className="bg-app-surface p-3 rounded-2xl border border-app-border text-app-text">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-app-heading uppercase tracking-wider">
                Folders ({folders.length})
              </h4>
              <button
                onClick={() => setIsCreatingFolder(true)}
                className="text-[11px] text-app-action hover:underline font-semibold"
              >
                + New Folder
              </button>
            </div>

            {isCreatingFolder && (
              <form onSubmit={handleCreateFolder} className="mb-3 p-2 bg-app-base rounded-xl border border-app-border">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name..."
                  autoFocus
                  className="w-full bg-app-surface border border-app-border rounded px-2 py-1 text-xs text-app-text mb-1.5 focus:outline-none focus:border-app-accent"
                />
                {folders.length > 0 && (
                  <select
                    value={newFolderParentId}
                    onChange={(e) => setNewFolderParentId(e.target.value)}
                    className="w-full bg-app-surface border border-app-border rounded px-2 py-1 text-[11px] text-app-text mb-2 focus:outline-none"
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
                    className="px-2 py-0.5 text-xs text-app-muted hover:text-app-heading"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2 py-0.5 text-xs bg-app-action hover:brightness-110 text-app-on-action rounded font-medium"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {/* Folder Edit Modal/Row */}
            {editingFolderId && (
              <div className="mb-3 p-2 bg-app-base rounded-xl border border-app-accent">
                <div className="text-[11px] font-semibold text-app-heading mb-1">Edit / Move Folder</div>
                <input
                  type="text"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  className="w-full bg-app-surface border border-app-border rounded px-2 py-1 text-xs text-app-text mb-1.5 focus:outline-none"
                />
                <select
                  value={editFolderParentId}
                  onChange={(e) => setEditFolderParentId(e.target.value)}
                  className="w-full bg-app-surface border border-app-border rounded px-2 py-1 text-[11px] text-app-text mb-2 focus:outline-none"
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
                    className="px-2 py-0.5 text-xs text-app-muted hover:text-app-heading"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditFolder}
                    className="px-2 py-0.5 text-xs bg-app-action hover:brightness-110 text-app-on-action rounded font-medium"
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
                    ? 'bg-app-action/20 text-app-action border border-app-action/50'
                    : 'text-app-muted hover:bg-app-base hover:text-app-text'
                }`}
              >
                <span>📁 All Setlists</span>
                <span className="font-mono text-[10px]">{setlists.length}</span>
              </button>

              <button
                onClick={() => setSelectedFolderFilter('UNFILED')}
                className={`w-full text-left px-2 py-1.5 rounded-lg font-medium flex items-center justify-between ${
                  selectedFolderFilter === 'UNFILED'
                    ? 'bg-app-action/20 text-app-action border border-app-action/50'
                    : 'text-app-muted hover:bg-app-base hover:text-app-text'
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
                        ? 'bg-app-action/20 text-app-action border border-app-action/50'
                        : 'text-app-text hover:bg-app-base'
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
                        className="text-[10px] text-app-muted hover:text-app-heading px-1"
                        title="Edit / Move"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="text-[10px] text-app-muted hover:text-status-error px-1"
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
          <div className="bg-app-surface p-3 rounded-2xl border border-app-border text-app-text">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-app-heading">Setlists</h3>
              <button
                onClick={() => setIsCreatingSetlist(true)}
                className="px-2.5 py-1 text-xs bg-app-action hover:brightness-110 rounded-lg text-app-on-action font-semibold transition-colors"
              >
                + New Setlist
              </button>
            </div>

            {isCreatingSetlist && (
              <form onSubmit={handleCreateSetlist} className="mb-4 p-3 bg-app-base rounded-xl border border-app-border">
                <input
                  type="text"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="Setlist name..."
                  autoFocus
                  className="w-full bg-app-surface border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-text focus:outline-none focus:border-app-accent mb-2"
                />
                {folders.length > 0 && (
                  <select
                    value={newSetFolderId}
                    onChange={(e) => setNewSetFolderId(e.target.value)}
                    className="w-full bg-app-surface border border-app-border rounded-lg px-2 py-1 text-xs text-app-text focus:outline-none mb-2"
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
                    className="px-2 py-1 text-xs text-app-muted hover:text-app-heading"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs bg-app-action hover:brightness-110 text-app-on-action rounded font-medium"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1.5">
              {displayedSetlists.length === 0 ? (
                <div className="p-4 text-center text-xs text-app-muted bg-app-base/60 rounded-xl border border-app-border">
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
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-between border ${
                      selectedSetlistId === sl.id
                        ? 'bg-app-action text-app-on-action border-app-action shadow-sm'
                        : 'bg-app-base hover:bg-app-surface text-app-text border-app-border/40'
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
            <div className="ui-setlist-card bg-app-surface p-6 rounded-2xl border border-app-border text-app-text">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-app-border">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      autoFocus
                      className="bg-app-base border border-app-border rounded-lg px-3 py-1.5 text-base font-bold text-app-heading focus:outline-none focus:border-app-accent"
                    />
                    <button
                      onClick={handleRename}
                      className="px-3 py-1.5 text-xs bg-app-action text-app-on-action rounded-lg font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="px-2 py-1.5 text-xs text-app-muted hover:text-app-heading"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <h2 className="ui-primary-text text-xl font-bold text-app-heading">{currentSetlist.name}</h2>
                    <button
                      onClick={() => {
                        setNameInput(currentSetlist.name)
                        setEditingName(true)
                      }}
                      className="text-xs text-app-muted hover:text-app-action"
                    >
                      Rename
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {/* Folder Assignment Selector */}
                  <div className="flex items-center gap-1.5 text-xs text-app-muted">
                    <span>Folder:</span>
                    <select
                      value={currentSetlist.folderId || '__UNFILED__'}
                      onChange={(e) => handleChangeSetlistFolder(e.target.value)}
                      className="bg-app-base border border-app-border rounded-lg px-2.5 py-1 text-xs text-app-text focus:outline-none"
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
                      className="px-3 py-1.5 text-xs text-app-on-action bg-app-action hover:brightness-110 rounded-lg font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      ▶ Play Setlist in Stage
                    </button>
                  )}

                  <button
                    onClick={handleDeleteSetlist}
                    className="px-3 py-1.5 text-xs text-status-error hover:bg-status-error/20 bg-status-error/10 border border-status-error/30 rounded-lg transition-colors"
                  >
                    Delete Setlist
                  </button>
                </div>
              </div>

              {/* Add Song Shortcut to Setlist */}
              <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-app-base rounded-xl border border-app-border">
                <select
                  value={selectedSongToAdd}
                  onChange={(e) => setSelectedSongToAdd(e.target.value)}
                  className="flex-1 min-w-[200px] bg-app-surface border border-app-border rounded-lg px-3 py-1.5 text-xs text-app-text focus:outline-none focus:border-app-accent"
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
                  className="px-4 py-1.5 bg-app-action hover:brightness-110 disabled:opacity-40 text-app-on-action text-xs font-semibold rounded-lg transition-colors"
                >
                  + Add Shortcut
                </button>

                {statusMessage && (
                  <span className="text-xs text-status-success font-medium ml-2">
                    {statusMessage}
                  </span>
                )}
              </div>

              {/* Setlist Song Shortcuts List with Reordering & Per-entry Transpose */}
              {currentSetlist.songs.length === 0 ? (
                <div className="py-12 text-center text-app-muted text-sm">
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
                            ? 'bg-status-error/10 border-status-error/30 hover:bg-status-error/20'
                            : 'bg-app-base hover:bg-app-surface border-app-border'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 text-center text-xs font-mono font-bold text-app-muted">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            {isMissing ? (
                              <div>
                                <span className="font-bold text-status-error text-sm line-through block truncate">
                                  {songRef.title} (Deleted from Songbook)
                                </span>
                                <span className="text-[11px] text-status-error/80">
                                  Source song ID {songRef.id} not found in canonical library
                                </span>
                              </div>
                            ) : (
                              <div>
                                <button
                                  onClick={() => onPlaySong(songRef.id, songRef.transposeOffset)}
                                  className="text-left font-bold text-app-heading hover:text-app-link text-sm truncate block"
                                >
                                  {songRef.title}
                                </button>
                                <div className="text-[11px] text-app-muted flex items-center gap-2">
                                  {songRef.artist && <span>{songRef.artist}</span>}
                                  {songRef.key && (
                                    <span className="font-mono text-app-accent">
                                      Key: {songRef.key}
                                    </span>
                                  )}
                                  {typeof songRef.transposeOffset === 'number' && songRef.transposeOffset !== 0 && (
                                    <span className="bg-app-surface border border-app-border text-app-accent px-1.5 py-0.2 rounded font-mono text-[10px]">
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
                          <div className="flex items-center bg-app-surface rounded-lg p-0.5 border border-app-border mr-2 text-[11px]">
                            <button
                              onClick={() => handleAdjustTranspose(index, -1)}
                              className="px-1.5 py-0.5 text-app-muted hover:text-app-heading"
                              title="Transpose -1 half-step"
                            >
                              ♭-
                            </button>
                            <span className="px-1 font-mono text-app-text">
                              {songRef.transposeOffset || 0}
                            </span>
                            <button
                              onClick={() => handleAdjustTranspose(index, 1)}
                              className="px-1.5 py-0.5 text-app-muted hover:text-app-heading"
                              title="Transpose +1 half-step"
                            >
                              ♯+
                            </button>
                          </div>

                          <button
                            onClick={() => handleMoveSong(index, 'UP')}
                            disabled={index === 0}
                            className="p-1 text-app-muted hover:text-app-heading disabled:opacity-20 hover:bg-app-base rounded text-xs"
                            title="Move Up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => handleMoveSong(index, 'DOWN')}
                            disabled={index === currentSetlist.songs.length - 1}
                            className="p-1 text-app-muted hover:text-app-heading disabled:opacity-20 hover:bg-app-base rounded text-xs"
                            title="Move Down"
                          >
                            ▼
                          </button>
                          {!isMissing && (
                            <button
                              onClick={() => onPlaySong(songRef.id, songRef.transposeOffset)}
                              className="ui-button px-2.5 py-1 text-xs bg-app-button hover:brightness-110 text-app-button-text border border-app-border rounded-lg transition-colors ml-2"
                            >
                              View
                            </button>
                          )}
                          {!isMissing && onEnterStageSetlist && (
                            <button
                              onClick={() => onEnterStageSetlist(currentSetlist, index)}
                              className="px-2.5 py-1 text-xs bg-app-action hover:brightness-110 text-app-on-action rounded-lg transition-colors ml-1 font-semibold"
                              title="Play in Stage Performance"
                            >
                              Stage
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveSong(index)}
                            className="p-1 text-app-muted hover:text-status-error hover:bg-app-base rounded text-xs ml-1"
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
            <div className="py-20 text-center text-app-muted text-sm bg-app-surface rounded-2xl border border-app-border">
              Select or create a setlist to view song shortcuts.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
