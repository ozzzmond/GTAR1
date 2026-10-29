import React, { useState } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import {
  Folder,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Music,
  Tag,
  ListMusic,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { validateFolderParentChange } from '../utils/folders'

export type ExplorerNavTarget =
  | { type: 'ALL_SONGS' }
  | { type: 'TAG'; tag: string }
  | { type: 'FOLDER'; folderId: string }
  | { type: 'UNFILED_SETLISTS' }
  | { type: 'ALL_SETLISTS' }
  | { type: 'SETLIST'; setlistId: string }

export interface ExplorerNavigationProps {
  currentSelection: ExplorerNavTarget
  onSelectTarget: (target: ExplorerNavTarget) => void
  songs: SongEntity[]
  setlists: WebSetlist[]
  folders: SetlistFolder[]
  allTags: string[]
  onSaveFolder: (folder: SetlistFolder) => Promise<void>
  onDeleteFolder: (folderId: string) => Promise<void>
  onNewSong: () => void
  onNewSetlist: () => void
  onSelectSetlist?: (setlistId: string) => void
  onCloseMobileDrawer?: () => void
}

export const ExplorerNavigation: React.FC<ExplorerNavigationProps> = ({
  currentSelection,
  onSelectTarget,
  songs,
  setlists,
  folders,
  allTags,
  onSaveFolder,
  onDeleteFolder,
  onNewSong,
  onNewSetlist,
  onSelectSetlist,
  onCloseMobileDrawer,
}) => {
  // Collapsible section toggles
  const [songbookExpanded, setSongbookExpanded] = useState(true)
  const [tagsExpanded, setTagsExpanded] = useState(true)
  const [setlistsExpanded, setSetlistsExpanded] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())

  // Inline folder create/edit state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null)
  const [moveFolderTargetParentId, setMoveFolderTargetParentId] = useState<string>('')

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  // Count helper functions
  const countSongsForTag = (tag: string) => {
    const target = tag.toLowerCase()
    return songs.filter((s) => s.tags?.some((t) => t.toLowerCase() === target)).length
  }

  const unfiledSetlists = setlists.filter((sl) => !sl.folderId)
  const getSetlistsInFolder = (folderId: string) => setlists.filter((sl) => sl.folderId === folderId)

  // Subfolders helper
  const getSubfolders = (parentId: string | null) =>
    folders.filter((f) => (parentId === null ? !f.parentId : f.parentId === parentId))

  const handleStartCreateFolder = (parentId: string | null = null) => {
    setNewFolderParentId(parentId)
    setNewFolderName('')
    setIsCreatingFolder(true)
  }

  const handleConfirmCreateFolder = async () => {
    const trimmed = newFolderName.trim()
    if (!trimmed) {
      setIsCreatingFolder(false)
      return
    }

    const newFolder: SetlistFolder = {
      id: 'folder_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: trimmed,
      parentId: newFolderParentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await onSaveFolder(newFolder)
    if (newFolderParentId) {
      setExpandedFolders((prev) => new Set(prev).add(newFolderParentId))
    }
    setIsCreatingFolder(false)
    setNewFolderName('')
  }

  const handleStartRenameFolder = (folder: SetlistFolder) => {
    setEditingFolderId(folder.id)
    setEditFolderName(folder.name)
  }

  const handleConfirmRenameFolder = async (folder: SetlistFolder) => {
    const trimmed = editFolderName.trim()
    if (!trimmed || trimmed === folder.name) {
      setEditingFolderId(null)
      return
    }

    const updated: SetlistFolder = {
      ...folder,
      name: trimmed,
      updatedAt: Date.now(),
    }
    await onSaveFolder(updated)
    setEditingFolderId(null)
  }

  const handleStartMoveFolder = (folder: SetlistFolder) => {
    setMovingFolderId(folder.id)
    setMoveFolderTargetParentId(folder.parentId || '')
  }

  const handleConfirmMoveFolder = async (folder: SetlistFolder) => {
    const targetParent = moveFolderTargetParentId ? moveFolderTargetParentId : null
    if (!validateFolderParentChange(folders, folder.id, targetParent)) {
      alert('Cannot move folder: operation would create a circular hierarchy loop.')
      return
    }

    const updated: SetlistFolder = {
      ...folder,
      parentId: targetParent,
      updatedAt: Date.now(),
    }
    await onSaveFolder(updated)
    setMovingFolderId(null)
  }

  const handleDeleteFolderSafe = async (folder: SetlistFolder) => {
    const childFolders = folders.filter((f) => f.parentId === folder.id)
    const setlistsInside = setlists.filter((sl) => sl.folderId === folder.id)

    if (
      !confirm(
        `Delete folder "${folder.name}"? Setlists inside will become unfiled; subfolders will be moved to root.`
      )
    ) {
      return
    }

    // Re-parent subfolders and unfile setlists safely handled by deleteFolder or explicit saves
    await onDeleteFolder(folder.id)
    if (currentSelection.type === 'FOLDER' && currentSelection.folderId === folder.id) {
      onSelectTarget({ type: 'ALL_SETLISTS' })
    }
  }

  const isSelected = (target: ExplorerNavTarget) => {
    if (target.type !== currentSelection.type) return false
    if (target.type === 'TAG' && currentSelection.type === 'TAG') {
      return target.tag.toLowerCase() === currentSelection.tag.toLowerCase()
    }
    if (target.type === 'FOLDER' && currentSelection.type === 'FOLDER') {
      return target.folderId === currentSelection.folderId
    }
    if (target.type === 'SETLIST' && currentSelection.type === 'SETLIST') {
      return target.setlistId === currentSelection.setlistId
    }
    return true
  }

  const selectAndCloseDrawer = (target: ExplorerNavTarget) => {
    onSelectTarget(target)
    onCloseMobileDrawer?.()
  }

  // Recursive folder node renderer
  const renderFolderNode = (folder: SetlistFolder, depth: number = 0) => {
    const subfolders = getSubfolders(folder.id)
    const folderSetlists = getSetlistsInFolder(folder.id)
    const isExpanded = expandedFolders.has(folder.id)
    const folderIsSelected = isSelected({ type: 'FOLDER', folderId: folder.id })
    const isEditing = editingFolderId === folder.id
    const isMoving = movingFolderId === folder.id

    return (
      <div key={folder.id} className="select-none text-xs">
        {/* Folder header row */}
        <div
          className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
            folderIsSelected
              ? 'bg-sky-600/30 text-sky-200 border border-sky-500/40 font-semibold'
              : 'hover:bg-slate-800/80 text-slate-300'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            selectAndCloseDrawer({ type: 'FOLDER', folderId: folder.id })
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleFolderExpanded(folder.id)
              }}
              className="p-0.5 text-slate-400 hover:text-white rounded"
              aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}

            {isEditing ? (
              <div
                className="flex items-center gap-1 flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRenameFolder(folder)
                    if (e.key === 'Escape') setEditingFolderId(null)
                  }}
                  autoFocus
                  className="w-full bg-slate-900 border border-sky-500 px-1.5 py-0.5 rounded text-white text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleConfirmRenameFolder(folder)}
                  className="p-0.5 text-emerald-400 hover:text-emerald-300"
                  aria-label="Confirm folder rename"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingFolderId(null)}
                  className="p-0.5 text-slate-400 hover:text-white"
                  aria-label="Cancel folder rename"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="truncate flex-1">{folder.name}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-slate-400 px-1.5 py-0.2 rounded-full bg-slate-800">
              {folderSetlists.length}
            </span>

            {/* Hover actions */}
            {!isEditing && (
              <div
                className="hidden group-hover:flex items-center gap-0.5 ml-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => handleStartCreateFolder(folder.id)}
                  title="Create subfolder"
                  aria-label="Create subfolder"
                  className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-sky-300"
                >
                  <FolderPlus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStartRenameFolder(folder)}
                  title="Rename folder"
                  aria-label="Rename folder"
                  className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-sky-300"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStartMoveFolder(folder)}
                  title="Move folder"
                  aria-label="Move folder"
                  className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-sky-300"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFolderSafe(folder)}
                  title="Delete folder"
                  aria-label="Delete folder"
                  className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Move folder select popover/inline row */}
        {isMoving && (
          <div
            className="my-1.5 p-2 bg-slate-800 rounded-lg border border-slate-700 flex flex-col gap-1.5"
            style={{ marginLeft: `${8 + depth * 14}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[11px] font-semibold text-slate-300">
              Move "{folder.name}" to parent:
            </div>
            <select
              value={moveFolderTargetParentId}
              onChange={(e) => setMoveFolderTargetParentId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-sky-500"
            >
              <option value="">(Root / No Parent)</option>
              {folders
                .filter(
                  (f) =>
                    f.id !== folder.id &&
                    validateFolderParentChange(folders, folder.id, f.id)
                )
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setMovingFolderId(null)}
                className="px-2 py-0.5 bg-slate-700 rounded text-slate-300 text-[10px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmMoveFolder(folder)}
                className="px-2 py-0.5 bg-sky-600 rounded text-white text-[10px] font-semibold"
              >
                Save Move
              </button>
            </div>
          </div>
        )}

        {/* Subfolder and Setlists list if expanded */}
        {isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {subfolders.map((sub) => renderFolderNode(sub, depth + 1))}

            {folderSetlists.map((sl) => {
              const slSelected = isSelected({ type: 'SETLIST', setlistId: sl.id })
              return (
                <div
                  key={sl.id}
                  className={`group flex items-center justify-between px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                    slSelected
                      ? 'bg-sky-600/25 text-sky-200 border border-sky-500/30 font-medium'
                      : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
                  }`}
                  style={{ paddingLeft: `${22 + depth * 14}px` }}
                  onClick={() => {
                    selectAndCloseDrawer({ type: 'SETLIST', setlistId: sl.id })
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ListMusic className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="truncate">{sl.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 px-1 py-0.2">
                    {sl.songs?.length || 0}
                  </span>
                </div>
              )
            })}

            {subfolders.length === 0 && folderSetlists.length === 0 && (
              <div
                className="py-1 text-[11px] text-slate-500 italic"
                style={{ paddingLeft: `${24 + depth * 14}px` }}
              >
                Folder is empty
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav
      aria-label="Music Explorer Navigation"
      className="h-full flex flex-col bg-slate-900 border-r border-slate-800 select-none overflow-y-auto p-3 text-slate-200"
    >
      {/* Quick Action Buttons */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={onNewSong}
          className="flex-1 py-1.5 px-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors shadow-sm flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Song</span>
        </button>
        <button
          type="button"
          onClick={onNewSetlist}
          className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1"
        >
          <ListMusic className="w-3.5 h-3.5 text-purple-400" />
          <span>New Set</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: MASTER SONGBOOK & TAGS                                         */}
      {/* ========================================================================= */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">
          <button
            type="button"
            onClick={() => setSongbookExpanded(!songbookExpanded)}
            className="flex items-center gap-1 hover:text-white"
          >
            {songbookExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span>Songbook</span>
          </button>
          <span className="text-[10px] text-slate-500 font-normal">
            {songs.length} master {songs.length === 1 ? 'song' : 'songs'}
          </span>
        </div>

        {songbookExpanded && (
          <div className="space-y-0.5 pl-1">
            {/* All Songs Link */}
            <div
              onClick={() => selectAndCloseDrawer({ type: 'ALL_SONGS' })}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                isSelected({ type: 'ALL_SONGS' })
                  ? 'bg-sky-600 text-white font-semibold shadow-sm'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-sky-400" />
                <span>All Songs</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected({ type: 'ALL_SONGS' })
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {songs.length}
              </span>
            </div>

            {/* Tags Sub-header */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-2 py-1">
                <button
                  type="button"
                  onClick={() => setTagsExpanded(!tagsExpanded)}
                  className="flex items-center gap-1 hover:text-slate-200"
                >
                  {tagsExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <Tag className="w-3 h-3 text-emerald-400" />
                  <span>Tags ({allTags.length})</span>
                </button>
              </div>

              {tagsExpanded && (
                <div className="space-y-0.5 pl-3">
                  {allTags.length === 0 ? (
                    <div className="text-[11px] text-slate-500 py-1 pl-2 italic">
                      No tags assigned yet
                    </div>
                  ) : (
                    allTags.map((t) => {
                      const tagSelected = isSelected({ type: 'TAG', tag: t })
                      const count = countSongsForTag(t)
                      return (
                        <div
                          key={t}
                          onClick={() => selectAndCloseDrawer({ type: 'TAG', tag: t })}
                          className={`flex items-center justify-between px-2 py-1 rounded-lg cursor-pointer text-xs transition-colors ${
                            tagSelected
                              ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 font-semibold'
                              : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span className="truncate">#{t}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 px-1.5 py-0.2 rounded-full bg-slate-800">
                            {count}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: SETLISTS & FOLDER HIERARCHY                                    */}
      {/* ========================================================================= */}
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">
          <button
            type="button"
            onClick={() => setSetlistsExpanded(!setlistsExpanded)}
            className="flex items-center gap-1 hover:text-white"
          >
            {setlistsExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span>Setlists & Folders</span>
          </button>
          <button
            type="button"
            onClick={() => handleStartCreateFolder(null)}
            title="Create root folder"
            aria-label="Create root folder"
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        {setlistsExpanded && (
          <div className="space-y-0.5 pl-1">
            {/* View All Setlists option */}
            <div
              onClick={() => selectAndCloseDrawer({ type: 'ALL_SETLISTS' })}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                isSelected({ type: 'ALL_SETLISTS' })
                  ? 'bg-sky-600 text-white font-semibold shadow-sm'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>All Setlists</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected({ type: 'ALL_SETLISTS' })
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {setlists.length}
              </span>
            </div>

            {/* Unfiled Setlists option */}
            <div
              onClick={() => selectAndCloseDrawer({ type: 'UNFILED_SETLISTS' })}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                isSelected({ type: 'UNFILED_SETLISTS' })
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-semibold'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-purple-400" />
                <span>Unfiled Setlists</span>
              </div>
              <span className="text-[10px] text-slate-400 px-1.5 py-0.2 rounded-full bg-slate-800">
                {unfiledSetlists.length}
              </span>
            </div>

            {/* Inline Root Folder Creation */}
            {isCreatingFolder && newFolderParentId === null && (
              <div
                className="p-2 my-1 bg-slate-800 rounded-lg border border-slate-700 flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <input
                  type="text"
                  placeholder="New folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreateFolder()
                    if (e.key === 'Escape') setIsCreatingFolder(false)
                  }}
                  autoFocus
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-1.5 py-0.5 outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={handleConfirmCreateFolder}
                  className="p-1 text-emerald-400 hover:text-emerald-300"
                  aria-label="Confirm folder creation"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className="p-1 text-slate-400 hover:text-white"
                  aria-label="Cancel folder creation"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Folder Hierarchy Tree */}
            <div className="pt-1 space-y-0.5">
              {getSubfolders(null).map((rootFolder) => renderFolderNode(rootFolder, 0))}
            </div>

            {/* Inline Subfolder Creation (if child) */}
            {isCreatingFolder && newFolderParentId !== null && (
              <div
                className="p-2 my-1 bg-slate-800 rounded-lg border border-slate-700 flex items-center gap-1.5 ml-4"
                onClick={(e) => e.stopPropagation()}
              >
                <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <input
                  type="text"
                  placeholder="New subfolder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreateFolder()
                    if (e.key === 'Escape') setIsCreatingFolder(false)
                  }}
                  autoFocus
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded px-1.5 py-0.5 outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={handleConfirmCreateFolder}
                  className="p-1 text-emerald-400 hover:text-emerald-300"
                  aria-label="Confirm subfolder creation"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className="p-1 text-slate-400 hover:text-white"
                  aria-label="Cancel subfolder creation"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
