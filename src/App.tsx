import React, { useState, useEffect, useMemo } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder, ActiveSongState } from './types/gtar'
import {
  loadAllSongs,
  loadAllSetlists,
  loadAllFolders,
  saveSong,
  deleteSong,
  saveSetlist,
  deleteSetlist,
  saveFolder,
  deleteFolder,
  saveAllSongs,
  saveAllSetlists,
  saveAllFolders,
} from './utils/storage'
import { Header, type ActiveTab } from './components/Header'
import { SongbookHomeView } from './components/SongbookHomeView'
import { SongViewer } from './components/SongViewer'
import { DesktopEditor } from './components/DesktopEditor'
import { SetlistManager } from './components/SetlistManager'
import { BackupModal } from './components/BackupModal'
import { LocalProfileModal } from './components/LocalProfileModal'
import {
  ExplorerNavigation,
  type ExplorerNavTarget,
} from './components/ExplorerNavigation'
import { loadLocalProfile, type LocalUserProfile } from './utils/localProfile'
import { generateUUID } from './utils/uuid'

export const App: React.FC = () => {
  const [songs, setSongs] = useState<SongEntity[]>([])
  const [setlists, setSetlists] = useState<WebSetlist[]>([])
  const [folders, setFolders] = useState<SetlistFolder[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('SONGS')
  const [selectedSong, setSelectedSong] = useState<SongEntity | null>(null)
  const [viewerTransposeOffset, setViewerTransposeOffset] = useState<number>(0)
  const [editingSong, setEditingSong] = useState<Partial<SongEntity> | null>(null)
  const [activeSetlistManagerId, setActiveSetlistManagerId] = useState<string | undefined>(undefined)

  // Navigation & Explorer State
  const [currentNavTarget, setCurrentNavTarget] = useState<ExplorerNavTarget>({
    type: 'ALL_SONGS',
  })
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [isBackupOpen, setIsBackupOpen] = useState<boolean>(false)
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false)
  const [userProfile, setUserProfile] = useState<LocalUserProfile>(loadLocalProfile)

  // Initialization State
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Initial load from isolated IndexedDB
  useEffect(() => {
    let isMounted = true

    async function initStorage() {
      try {
        const [loadedSongs, loadedSetlists, loadedFolders] = await Promise.all([
          loadAllSongs(),
          loadAllSetlists(),
          loadAllFolders(),
        ])
        if (isMounted) {
          setSongs(loadedSongs)
          setSetlists(loadedSetlists)
          setFolders(loadedFolders)
          setIsLoading(false)
        }
      } catch (err: any) {
        if (isMounted) {
          setLoadError(err?.message || 'Failed to initialize local IndexedDB storage')
          setIsLoading(false)
        }
      }
    }

    initStorage()
    return () => {
      isMounted = false
    }
  }, [])

  // Derived unique tags
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

  // Derive Search Scope label for Header
  const searchScopeLabel = useMemo(() => {
    switch (currentNavTarget.type) {
      case 'ALL_SONGS':
        return 'All Songs'
      case 'TAG':
        return `#${currentNavTarget.tag}`
      case 'ALL_SETLISTS':
        return 'All Setlists'
      case 'UNFILED_SETLISTS':
        return 'Unfiled Setlists'
      case 'FOLDER': {
        const f = folders.find((item) => item.id === currentNavTarget.folderId)
        return f ? `Folder "${f.name}"` : 'Folder'
      }
      case 'SETLIST': {
        const sl = setlists.find((item) => item.id === currentNavTarget.setlistId)
        return sl ? `"${sl.name}"` : 'Setlist'
      }
      default:
        return 'All Songs'
    }
  }, [currentNavTarget, folders, setlists])

  const handleUpdateSongEntity = (updated: Partial<ActiveSongState>): boolean => {
    if (!updated.id) return false
    const existing = songs.find((s) => s.id === updated.id)
    if (!existing) return false

    const updatedTags = updated.tags
    const parsedTags = typeof updatedTags === 'string'
      ? updatedTags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : Array.isArray(updatedTags)
      ? updatedTags
      : existing.tags

    const merged: SongEntity = {
      ...existing,
      ...updated,
      id: String(updated.id),
      tags: parsedTags,
      updatedAt: Date.now(),
    }
    saveSong(merged).catch(() => {})
    setSongs((prev) => prev.map((s) => (s.id === merged.id ? merged : s)))
    if (selectedSong?.id === merged.id) {
      setSelectedSong(merged)
      if (updated.transposeOffset !== undefined) {
        setViewerTransposeOffset(updated.transposeOffset)
      }
    }
    return true
  }

  const handleSaveFromEditor = (updated: any): boolean => {
    const songId = updated.id || generateUUID()
    const songTags = typeof updated.tags === 'string'
      ? updated.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : Array.isArray(updated.tags) ? updated.tags : []

    const entity: SongEntity = {
      id: songId,
      title: updated.title || 'Untitled Song',
      artist: updated.artist || '',
      key: updated.key || '',
      originalKey: updated.originalKey || undefined,
      confirmedChartKey: updated.confirmedChartKey || undefined,
      capo: updated.capo || undefined,
      bpm: updated.bpm || undefined,
      time: updated.time || undefined,
      year: updated.year || undefined,
      tags: songTags,
      rawContent: updated.rawContent || '',
      format: updated.format || 'CHORD_PRO',
      isFavorite: updated.isFavorite,
      transposeOffset: updated.transposeOffset || 0,
      createdAt: updated.createdAt || Date.now(),
      updatedAt: Date.now(),
    }

    saveSong(entity).catch(() => {})
    setSongs((prev) => {
      const idx = prev.findIndex((s) => s.id === entity.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = entity
        return next
      }
      return [entity, ...prev]
    })
    setSelectedSong(entity)
    setViewerTransposeOffset(entity.transposeOffset || 0)
    return true
  }

  const handleBulkUpdateSongs = async (updatedSongs: SongEntity[]) => {
    await saveAllSongs(updatedSongs)
    setSongs((prev) => {
      const updateMap = new Map(updatedSongs.map((s) => [s.id, s]))
      return prev.map((s) => updateMap.get(s.id) || s)
    })
  }

  const handleDeleteSong = async (id: string) => {
    await deleteSong(id)
    setSongs((prev) => prev.filter((s) => s.id !== id))

    if (selectedSong?.id === id) {
      setSelectedSong(null)
      setActiveTab('SONGS')
    }
    setEditingSong(null)
  }

  const handleBulkDeleteSongs = async (ids: string[]) => {
    const idSet = new Set(ids)
    for (const id of ids) {
      await deleteSong(id)
    }
    setSongs((prev) => prev.filter((s) => !idSet.has(s.id)))
    if (selectedSong && idSet.has(selectedSong.id)) {
      setSelectedSong(null)
      setActiveTab('SONGS')
    }
  }

  // Setlist handlers
  const handleSaveSetlist = async (setlist: WebSetlist) => {
    await saveSetlist(setlist)
    setSetlists((prev) => {
      const idx = prev.findIndex((s) => s.id === setlist.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = setlist
        return next
      }
      return [...prev, setlist]
    })
  }

  const handleDeleteSetlist = async (id: string) => {
    await deleteSetlist(id)
    setSetlists((prev) => prev.filter((s) => s.id !== id))
    if (currentNavTarget.type === 'SETLIST' && currentNavTarget.setlistId === id) {
      setCurrentNavTarget({ type: 'ALL_SETLISTS' })
    }
  }

  // Folder handlers
  const handleSaveFolder = async (folder: SetlistFolder) => {
    await saveFolder(folder)
    setFolders((prev) => {
      const idx = prev.findIndex((f) => f.id === folder.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = folder
        return next
      }
      return [...prev, folder]
    })
  }

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id)
    setFolders((prev) => prev.filter((f) => f.id !== id))
    // Cleanly unfile setlists belonging to deleted folder in memory
    setSetlists((prev) =>
      prev.map((sl) => (sl.folderId === id ? { ...sl, folderId: null } : sl))
    )
    if (currentNavTarget.type === 'FOLDER' && currentNavTarget.folderId === id) {
      setCurrentNavTarget({ type: 'ALL_SETLISTS' })
    }
  }

  // JSON Import handler
  const handleImport = async (
    importedSongs: SongEntity[],
    importedSetlists: WebSetlist[],
    importedFolders: SetlistFolder[]
  ) => {
    await saveAllSongs(importedSongs)
    await saveAllSetlists(importedSetlists)
    await saveAllFolders(importedFolders)
    setSongs(importedSongs)
    setSetlists(importedSetlists)
    setFolders(importedFolders)
  }

  const handleSelectSong = (song: SongEntity) => {
    setSelectedSong(song)
    setViewerTransposeOffset(song.transposeOffset || 0)
    setActiveTab('VIEWER')
  }

  const handleEditSong = (song: SongEntity) => {
    setEditingSong(song)
    setActiveTab('EDITOR')
  }

  const handleNewSong = () => {
    setEditingSong({})
    setActiveTab('EDITOR')
  }

  const handleNewSetlist = () => {
    const newSetlist: WebSetlist = {
      id: generateUUID(),
      name: 'New Setlist',
      folderId:
        currentNavTarget.type === 'FOLDER' ? currentNavTarget.folderId : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      songs: [],
    }
    handleSaveSetlist(newSetlist).then(() => {
      setActiveSetlistManagerId(newSetlist.id)
      setActiveTab('SETLISTS')
    })
  }

  const handlePlaySetlistSong = (songId: string, transposeOffset?: number) => {
    const s = songs.find((item) => item.id === songId)
    if (s) {
      setSelectedSong(s)
      setViewerTransposeOffset(transposeOffset ?? s.transposeOffset ?? 0)
      setActiveTab('VIEWER')
    }
  }

  const handleOpenSetlistManager = (setlistId?: string) => {
    setActiveSetlistManagerId(setlistId)
    setActiveTab('SETLISTS')
  }

  const handleSelectNavTarget = (target: ExplorerNavTarget) => {
    setCurrentNavTarget(target)
    if (activeTab !== 'SONGS') {
      setActiveTab('SONGS')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 font-medium text-sm">
        Loading local music library...
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-red-950/80 border border-red-700 p-6 rounded-2xl max-w-md text-red-200">
          <h3 className="text-base font-bold mb-2">Storage Error</h3>
          <p className="text-xs">{loadError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNewSong={handleNewSong}
        onOpenBackup={() => setIsBackupOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        userProfile={userProfile}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleMobileDrawer={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
        isMobileDrawerOpen={isMobileDrawerOpen}
        searchScopeLabel={searchScopeLabel}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar: Music Explorer Navigation */}
        <aside className="hidden md:block w-64 lg:w-72 shrink-0">
          <ExplorerNavigation
            currentSelection={currentNavTarget}
            onSelectTarget={handleSelectNavTarget}
            songs={songs}
            setlists={setlists}
            folders={folders}
            allTags={allTags}
            onSaveFolder={handleSaveFolder}
            onDeleteFolder={handleDeleteFolder}
            onNewSong={handleNewSong}
            onNewSetlist={handleNewSetlist}
            onSelectSetlist={(slId) => handleSelectNavTarget({ type: 'SETLIST', setlistId: slId })}
          />
        </aside>

        {/* Mobile Drawer */}
        {isMobileDrawerOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Drawer"
            className="md:hidden fixed inset-0 z-50 flex"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileDrawerOpen(false)}
            />
            {/* Drawer Content */}
            <div className="relative w-72 max-w-[80vw] h-full bg-slate-900 z-10 shadow-2xl flex flex-col">
              <ExplorerNavigation
                currentSelection={currentNavTarget}
                onSelectTarget={handleSelectNavTarget}
                songs={songs}
                setlists={setlists}
                folders={folders}
                allTags={allTags}
                onSaveFolder={handleSaveFolder}
                onDeleteFolder={handleDeleteFolder}
                onNewSong={handleNewSong}
                onNewSetlist={handleNewSetlist}
                onSelectSetlist={(slId) => handleSelectNavTarget({ type: 'SETLIST', setlistId: slId })}
                onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Workspace Canvas */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {activeTab === 'SONGS' && (
            <SongbookHomeView
              songs={songs}
              setlists={setlists}
              folders={folders}
              currentNavTarget={currentNavTarget}
              onSelectNavTarget={handleSelectNavTarget}
              onSelectSong={handleSelectSong}
              onEditSong={handleEditSong}
              onNewSong={handleNewSong}
              onDeleteSong={handleDeleteSong}
              onSaveSong={handleSaveFromEditor as any}
              onBulkUpdateSongs={handleBulkUpdateSongs}
              onBulkDeleteSongs={handleBulkDeleteSongs}
              onSaveSetlist={handleSaveSetlist}
              onDeleteSetlist={handleDeleteSetlist}
              onPlaySetlistSong={handlePlaySetlistSong}
              onOpenSetlistManager={handleOpenSetlistManager}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
            />
          )}

          {activeTab === 'VIEWER' && selectedSong && (
            <SongViewer
              song={{
                ...selectedSong,
                transposeOffset: viewerTransposeOffset,
              }}
              onEdit={handleEditSong}
              onBack={() => setActiveTab('SONGS')}
              onUpdateSong={handleUpdateSongEntity}
            />
          )}

          {activeTab === 'EDITOR' && editingSong && (
            <DesktopEditor
              song={{
                id: editingSong.id || generateUUID(),
                title: editingSong.title || '',
                artist: editingSong.artist || '',
                key: editingSong.key || '',
                originalKey: editingSong.originalKey,
                confirmedChartKey: editingSong.confirmedChartKey,
                capo: editingSong.capo || '',
                bpm: editingSong.bpm || '',
                time: editingSong.time,
                year: editingSong.year,
                tags: Array.isArray(editingSong.tags) ? editingSong.tags.join(', ') : editingSong.tags || '',
                rawContent: editingSong.rawContent ?? '',
                format: editingSong.format || 'CHORD_PRO',
                transposeOffset: editingSong.transposeOffset || 0,
              }}
              transposeOffset={editingSong.transposeOffset || 0}
              onUpdateSong={handleUpdateSongEntity}
              onSaveSong={handleSaveFromEditor}
              onClose={() => {
                if (selectedSong) {
                  setActiveTab('VIEWER')
                } else {
                  setActiveTab('SONGS')
                }
                setEditingSong(null)
              }}
              onNewSong={() => {
                setEditingSong({})
              }}
            />
          )}

          {activeTab === 'SETLISTS' && (
            <SetlistManager
              setlists={setlists}
              folders={folders}
              allSongs={songs}
              initialSelectedSetlistId={activeSetlistManagerId}
              onSaveSetlist={handleSaveSetlist}
              onDeleteSetlist={handleDeleteSetlist}
              onSaveFolder={handleSaveFolder}
              onDeleteFolder={handleDeleteFolder}
              onPlaySong={handlePlaySetlistSong}
            />
          )}
        </main>
      </div>

      {/* Backup Modal */}
      {isBackupOpen && (
        <BackupModal
          songs={songs}
          setlists={setlists}
          folders={folders}
          onImport={handleImport}
          onClose={() => setIsBackupOpen(false)}
        />
      )}

      {/* Local Profile Modal */}
      {isProfileOpen && (
        <LocalProfileModal
          profile={userProfile}
          onSaveProfile={(updated) => setUserProfile(updated)}
          onClose={() => setIsProfileOpen(false)}
        />
      )}
    </div>
  )
}

export default App
