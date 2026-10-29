import React, { useState, useEffect } from 'react'
import type { SongEntity, WebSetlist } from './types/gtar'
import {
  loadAllSongs,
  loadAllSetlists,
  saveSong,
  deleteSong,
  saveSetlist,
  deleteSetlist,
  saveAllSongs,
  saveAllSetlists,
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('SONGS')
  const [selectedSong, setSelectedSong] = useState<SongEntity | null>(null)
  const [editingSong, setEditingSong] = useState<Partial<SongEntity> | null>(null)
  const [isBackupOpen, setIsBackupOpen] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Initial load from isolated IndexedDB (blank initial songbook if clean)
  useEffect(() => {
    let isMounted = true

    async function initStorage() {
      try {
        const [loadedSongs, loadedSetlists] = await Promise.all([
          loadAllSongs(),
          loadAllSetlists(),
        ])
        if (isMounted) {
          setSongs(loadedSongs)
          setSetlists(loadedSetlists)
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
    setActiveTab('VIEWER')
    setEditingSong(null)
  }

  const handleDeleteSong = async (id: string) => {
    await deleteSong(id)
    setSongs((prev) => prev.filter((s) => s.id !== id))
    // Also remove from any setlists
    const updatedSetlists = setlists.map((sl) => ({
      ...sl,
      songs: sl.songs.filter((ref) => ref.id !== id),
    }))
    setSetlists(updatedSetlists)
    await saveAllSetlists(updatedSetlists)

    setSelectedSong(null)
    setEditingSong(null)
    setActiveTab('SONGS')
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

  // JSON Import handler
  const handleImport = async (
    importedSongs: SongEntity[],
    importedSetlists: WebSetlist[]
  ) => {
    await saveAllSongs(importedSongs)
    await saveAllSetlists(importedSetlists)
    setSongs(importedSongs)
    setSetlists(importedSetlists)
  }

  const handleSelectSong = (song: SongEntity) => {
    setSelectedSong(song)
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

  const handlePlaySetlistSong = (songId: string) => {
    const s = songs.find((item) => item.id === songId)
    if (s) {
      setSelectedSong(s)
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
          />
        )}

        {activeTab === 'VIEWER' && selectedSong && (
          <SongViewer
            song={selectedSong}
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
            allSongs={songs}
            onSaveSetlist={handleSaveSetlist}
            onDeleteSetlist={handleDeleteSetlist}
            onPlaySong={handlePlaySetlistSong}
          />
        )}
      </main>

      {isBackupOpen && (
        <BackupModal
          songs={songs}
          setlists={setlists}
          onImport={handleImport}
          onClose={() => setIsBackupOpen(false)}
        />
      )}
    </div>
  )
}

export default App
