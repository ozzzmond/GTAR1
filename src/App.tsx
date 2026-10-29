import React, { useState, useEffect } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder } from './types/gtar'
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
import { SongEditor } from './components/SongEditor'
import { SetlistManager } from './components/SetlistManager'
import { BackupModal } from './components/BackupModal'

export const App: React.FC = () => {
  const [songs, setSongs] = useState<SongEntity[]>([])
  const [setlists, setSetlists] = useState<WebSetlist[]>([])
  const [folders, setFolders] = useState<SetlistFolder[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('SONGS')
  const [selectedSong, setSelectedSong] = useState<SongEntity | null>(null)
  const [viewerTransposeOffset, setViewerTransposeOffset] = useState<number>(0)
  const [editingSong, setEditingSong] = useState<Partial<SongEntity> | null>(null)
  const [isBackupOpen, setIsBackupOpen] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Initial load from isolated IndexedDB (blank initial songbook if clean)
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

  // Song handlers
  const handleSaveSong = async (song: SongEntity) => {
    await saveSong(song)
    setSongs((prev) => {
      const idx = prev.findIndex((s) => s.id === song.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = song
        return next
      }
      return [song, ...prev]
    })
    setSelectedSong(song)
    setViewerTransposeOffset(song.transposeOffset || 0)
    setActiveTab('VIEWER')
    setEditingSong(null)
  }

  const handleBulkUpdateSongs = async (updatedSongs: SongEntity[]) => {
    await saveAllSongs(updatedSongs)
    setSongs((prev) => {
      const updateMap = new Map(updatedSongs.map((s) => [s.id, s]))
      return prev.map((s) => updateMap.get(s.id) || s)
    })
  }

  const handleDeleteSong = async (id: string) => {
    // Delete master canonical song; shortcuts in setlists handle missing source explicitly
    await deleteSong(id)
    setSongs((prev) => prev.filter((s) => s.id !== id))

    if (selectedSong?.id === id) {
      setSelectedSong(null)
      setActiveTab('SONGS')
    }
    setEditingSong(null)
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

  const handlePlaySetlistSong = (songId: string, transposeOffset?: number) => {
    const s = songs.find((item) => item.id === songId)
    if (s) {
      setSelectedSong(s)
      setViewerTransposeOffset(transposeOffset ?? s.transposeOffset ?? 0)
      setActiveTab('VIEWER')
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
      />

      <main className="flex-1 pb-16">
        {activeTab === 'SONGS' && (
          <SongbookHomeView
            songs={songs}
            onSelectSong={handleSelectSong}
            onEditSong={handleEditSong}
            onNewSong={handleNewSong}
            onOpenBackup={() => setIsBackupOpen(true)}
            onBulkUpdateSongs={handleBulkUpdateSongs}
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
          />
        )}

        {activeTab === 'EDITOR' && (
          <SongEditor
            initialSong={editingSong || undefined}
            onSave={handleSaveSong}
            onDelete={editingSong?.id ? handleDeleteSong : undefined}
            onCancel={() => {
              if (selectedSong) {
                setActiveTab('VIEWER')
              } else {
                setActiveTab('SONGS')
              }
              setEditingSong(null)
            }}
          />
        )}

        {activeTab === 'SETLISTS' && (
          <SetlistManager
            setlists={setlists}
            folders={folders}
            allSongs={songs}
            onSaveSetlist={handleSaveSetlist}
            onDeleteSetlist={handleDeleteSetlist}
            onSaveFolder={handleSaveFolder}
            onDeleteFolder={handleDeleteFolder}
            onPlaySong={handlePlaySetlistSong}
          />
        )}
      </main>

      {isBackupOpen && (
        <BackupModal
          songs={songs}
          setlists={setlists}
          folders={folders}
          onImport={handleImport}
          onClose={() => setIsBackupOpen(false)}
        />
      )}
    </div>
  )
}

export default App
