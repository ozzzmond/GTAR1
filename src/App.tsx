import { recoverRestoreSettings, getPendingRestoreJournal, inspectSettingsConflicts, captureSettings, type PendingRestoreJournal, type SettingsConflictInfo } from './utils/restoreSettings'
import { RecoveryConflictModal } from './components/RecoveryConflictModal'
import { restoreLibraryWithStatus, verifyPendingRestore, loadRecoveryPlan, type RestoreMode, type LibraryImage, type RestoreResult, type RecoveryPlan } from './utils/restoreLibrary'
import { LibraryRecoveryModal } from './components/LibraryRecoveryModal'
import type { BackupSettings } from './utils/backupSettings'
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder, ActiveSongState } from './types/gtar'
import {
  openRevampDB,
  STORES,
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
} from './utils/storage'
import { Header, type ActiveTab } from './components/Header'
import { SongbookHomeView } from './components/SongbookHomeView'
import { SongViewer } from './components/SongViewer'
import { DesktopEditor } from './components/DesktopEditor'
import { SetlistManager } from './components/SetlistManager'
import { StageView, type StageQueueItem } from './components/StageView'
import { BackupModal } from './components/BackupModal'
import { BrowseSongSourcesModal } from './components/BrowseSongSourcesModal'
import { LocalProfileModal } from './components/LocalProfileModal'
import {
  ThemeModal,
  type ThemeMode,
  type CustomThemeColors,
  applyThemeRuntime,
  hydrateThemeSettings,
  loadFactoryThemeOverrides,
} from './components/ThemeModal'
import { SETTINGS_KEYS, SETTINGS_CHANGED, STANDALONE_PALETTE_KEY } from './utils/backupSettings'
import {
  ExplorerNavigation,
  type ExplorerNavTarget,
} from './components/ExplorerNavigation'
import { loadLocalProfile, type LocalUserProfile } from './utils/localProfile'
import { generateUUID } from './utils/uuid'
import { recordDiagnostic } from './diagnostics/runtime'
import { resolveNavigation, type NavigationState } from './utils/navigation'

export const App: React.FC = () => {
  const [songs, setSongs] = useState<SongEntity[]>([])
  const [setlists, setSetlists] = useState<WebSetlist[]>([])
  const [folders, setFolders] = useState<SetlistFolder[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('SONGS')
  const [selectedSong, setSelectedSong] = useState<SongEntity | null>(null)
  const [viewerTransposeOffset, setViewerTransposeOffset] = useState<number>(0)
  const [editingSong, setEditingSong] = useState<Partial<SongEntity> | null>(null)
  const [activeSetlistManagerId, setActiveSetlistManagerId] = useState<string | undefined>(undefined)

  // Stage Performance Queue & Return Navigation State
  const [stageQueue, setStageQueue] = useState<StageQueueItem[]>([])
  const [stageQueueIndex, setStageQueueIndex] = useState<number>(0)
  const [stageReturnTab, setStageReturnTab] = useState<'SONGS' | 'SETLISTS' | 'VIEWER'>('SONGS')
  const [stageSetlistName, setStageSetlistName] = useState<string | undefined>(undefined)
  const [stageActiveSetlistId, setStageActiveSetlistId] = useState<string | undefined>(undefined)

  const editorNavigationGuard = useRef<((next: () => void) => void) | null>(null)
  const navigationRef = useRef<NavigationState | null>(null)
  const replaceNavigationRef = useRef(false)
  const historyPositionRef = useRef<number>(Number.isSafeInteger(window.history.state?.gtarPosition) ? window.history.state.gtarPosition : 0)
  const historyBounceRef = useRef<(() => void) | null>(null)
  const approvedHistoryPopRef = useRef(false)
  const explorerMainRef = useRef<HTMLElement>(null)
  const explorerScrollRef = useRef<number>(0)
  const isRestoringScrollRef = useRef<boolean>(false)

  const handleExplorerScroll = () => {
    if (isRestoringScrollRef.current) return
    if (explorerMainRef.current && activeTab === 'SONGS') {
      explorerScrollRef.current = explorerMainRef.current.scrollTop
    }
  }

  // Restore Explorer scroll when returning to SONGS tab
  useLayoutEffect(() => {
    if (activeTab === 'SONGS' && explorerMainRef.current && explorerScrollRef.current > 0) {
      const target = explorerScrollRef.current
      isRestoringScrollRef.current = true
      explorerMainRef.current.scrollTop = target
      requestAnimationFrame(() => {
        if (explorerMainRef.current && activeTab === 'SONGS') {
          explorerMainRef.current.scrollTop = target
        }
        setTimeout(() => {
          isRestoringScrollRef.current = false
        }, 80)
      })
    }
  }, [activeTab])

  // Serialized persistence queue ref for setlist updates
  const setlistsRef = useRef<WebSetlist[]>(setlists)
  setlistsRef.current = setlists
  const setlistSaveQueueRef = useRef<Promise<void>>(Promise.resolve())

  // Navigation & Explorer State
  const [currentNavTarget, setCurrentNavTarget] = useState<ExplorerNavTarget>({
    type: 'ALL_SONGS',
  })
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [isBackupOpen, setIsBackupOpen] = useState<boolean>(false)
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false)
  const [isThemeOpen, setIsThemeOpen] = useState<boolean>(false)
  const [isSourcesOpen, setIsSourcesOpen] = useState<boolean>(false)
  const [userProfile, setUserProfile] = useState<LocalUserProfile>(loadLocalProfile)

  // Stage Color Theme (persisted in localStorage)
  const [stageTheme, setStageTheme] = useState<ThemeMode>(() => hydrateThemeSettings().mode)
  const [customThemeColors, setCustomThemeColors] = useState<CustomThemeColors>(() => hydrateThemeSettings().standalone)

  // Apply theme runtime on mount and updates
  useEffect(() => {
    applyThemeRuntime(stageTheme, customThemeColors)
  }, [stageTheme, customThemeColors])

  // Rehydrate active appearance after settings restore and cross-tab storage events
  useEffect(() => {
    const handleRehydrate = () => {
      const { mode, standalone } = hydrateThemeSettings()
      const overrides = loadFactoryThemeOverrides()
      setStageTheme(mode)
      setCustomThemeColors(standalone)
      applyThemeRuntime(mode, standalone, overrides)
    }

    const handleStorage = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key === SETTINGS_KEYS.appearance ||
        e.key === SETTINGS_KEYS.themeMode ||
        e.key === SETTINGS_KEYS.customThemeColors ||
        e.key === SETTINGS_KEYS.factoryThemeOverrides ||
        e.key === STANDALONE_PALETTE_KEY
      ) {
        // Storage events can arrive while another tab's restore is uncommitted.
        // Recovery takes the same cross-tab lock before publishing appearance.
        if (!window.navigator.locks) { handleRehydrate(); return }
        void openRevampDB().then(db => recoverRestoreSettings(db, STORES.RESTORE))
          .then(handleRehydrate).catch(error => setLoadError((error as Error).message))
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener(SETTINGS_CHANGED, handleRehydrate)
      window.addEventListener('storage', handleStorage)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(SETTINGS_CHANGED, handleRehydrate)
        window.removeEventListener('storage', handleStorage)
      }
    }
  }, [])

  // Initialization State
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recoveryConflict, setRecoveryConflict] = useState<{ journal: PendingRestoreJournal; conflicts: SettingsConflictInfo[] } | null>(null)
  const [libraryRecovery, setLibraryRecovery] = useState<{ plan: RecoveryPlan; reason?: string } | null>(null)

  // Initial load from isolated IndexedDB
  useEffect(() => {
    let isMounted = true

    async function initStorage() {
      try {
        const [loadedSongs, loadedSetlists, loadedFolders, db] = await Promise.all([
          loadAllSongs(),
          loadAllSetlists(),
          loadAllFolders(),
          openRevampDB(),
        ])
        const journal = await getPendingRestoreJournal(db, STORES.RESTORE)
        let settingsConflict = false
        if (journal) {
          const conflicts = inspectSettingsConflicts(journal, captureSettings())
          if (conflicts.length > 0 && isMounted) {
            settingsConflict = true
            setRecoveryConflict({ journal, conflicts })
          }
        }
        // A restore that committed but was never independently verified offers recovery.
        if (!settingsConflict && window.navigator.locks) {
          try {
            const pending = await verifyPendingRestore()
            if (pending.needsRecovery) {
              const plan = await loadRecoveryPlan()
              if (plan && isMounted) setLibraryRecovery({ plan, reason: pending.reason })
            }
          } catch (err) { console.warn('Restore verification check failed; library left unchanged', err) }
        }
        if (isMounted) {
          setSongs(loadedSongs)
          setSetlists(loadedSetlists)
          setFolders(loadedFolders)
          restoreNavigation(window.history.state?.gtarNavigation, loadedSongs, loadedSetlists, loadedFolders)
          setIsLoading(false)
        }
      } catch (err: any) {
        recordDiagnostic('INITIAL_LOAD_FAILED')
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

  function restoreNavigation(value: unknown, library = songs, lists = setlists, groups = folders) {
    const { state, song, setlist, queue } = resolveNavigation(value, library, lists, groups)
    navigationRef.current = state
    replaceNavigationRef.current = true
    setActiveTab(state.tab)
    setSelectedSong(song || null)
    setViewerTransposeOffset(state.transposeOffset ?? song?.transposeOffset ?? 0)
    setEditingSong(state.tab === 'EDITOR' ? song || null : null)
    setCurrentNavTarget(state.nav || { type: 'ALL_SONGS' })
    setActiveSetlistManagerId(state.setlistId)
    setStageQueue(queue)
    setStageQueueIndex(state.stage?.index || 0)
    setStageReturnTab(state.stage?.returnTab || 'SONGS')
    setStageActiveSetlistId(state.tab === 'STAGE' ? setlist?.id : undefined)
    setStageSetlistName(state.tab === 'STAGE' ? setlist?.name : undefined)
  }

  // One history entry per view/context. Queue movement replaces the current Stage entry,
  // so Back/Exit returns in one action. No content, draft, or private title enters the URL.
  useEffect(() => {
    if (isLoading || loadError) return
    const nav = currentNavTarget.type === 'TAG' ? undefined : currentNavTarget
    const state: NavigationState = {
      version: 1, tab: activeTab, nav,
      transposeOffset: activeTab === 'VIEWER' ? viewerTransposeOffset : undefined,
      songId: activeTab === 'EDITOR' ? editingSong?.id : ['VIEWER', 'STAGE'].includes(activeTab) ? selectedSong?.id : undefined,
      setlistId: activeTab === 'STAGE' ? stageActiveSetlistId : activeSetlistManagerId ?? (activeTab === 'SETLISTS' ? setlists[0]?.id : undefined),
      stage: activeTab === 'STAGE' && stageQueue[stageQueueIndex] ? {
        songId: stageQueue[stageQueueIndex].song.id,
        entryId: stageQueue[stageQueueIndex].entryId,
        index: stageQueueIndex, returnTab: stageReturnTab,
      } : undefined,
    }
    const previous = navigationRef.current
    const replace = replaceNavigationRef.current || !previous || (previous.tab === 'STAGE' && state.tab === 'STAGE')
    replaceNavigationRef.current = false
    navigationRef.current = state
    if (!replace && JSON.stringify(previous) === JSON.stringify(state)) return
    try {
      if (!replace) historyPositionRef.current += 1
      const historyState = { ...window.history.state, gtarPosition: historyPositionRef.current, gtarNavigation: state, stage: activeTab === 'STAGE', gtarHasPrevious: replace ? !!window.history.state?.gtarHasPrevious : true }
      if (replace) window.history.replaceState(historyState, '', window.location.href)
      else window.history.pushState(historyState, '', window.location.href)
    } catch { /* History may be unavailable; local music data is unaffected. */ }
  }, [isLoading, loadError, activeTab, viewerTransposeOffset, selectedSong?.id, editingSong?.id, currentNavTarget, activeSetlistManagerId, setlists, stageActiveSetlistId, stageQueue, stageQueueIndex, stageReturnTab])

  const restoreHistoryRef = useRef(restoreNavigation)
  restoreHistoryRef.current = restoreNavigation
  useEffect(() => {
    if (isLoading || loadError) return
    const handlePopState = (event: PopStateEvent) => {
      if (historyBounceRef.current) {
        const returned = historyBounceRef.current
        historyBounceRef.current = null
        returned()
        return
      }
      const target = event.state?.gtarNavigation
      const targetPosition = Number.isSafeInteger(event.state?.gtarPosition) ? event.state.gtarPosition : undefined
      const next = () => {
        historyPositionRef.current = targetPosition ?? 0
        restoreHistoryRef.current(target)
      }
      if (editorNavigationGuard.current && !approvedHistoryPopRef.current) {
        const delta = targetPosition === undefined ? 0 : targetPosition - historyPositionRef.current
        if (delta) {
          // Return to the editor entry while its guard asks Save/Discard/Cancel.
          // Cancel leaves both the draft and the original history entries intact.
          let returned = false
          let approved = false
          const proceed = () => { approvedHistoryPopRef.current = true; window.history.go(delta) }
          historyBounceRef.current = () => { returned = true; if (approved) proceed() }
          window.history.go(-delta)
          editorNavigationGuard.current(() => { approved = true; if (returned) proceed() })
        } else {
          // Unowned/old entries have no position marker. Preserve the draft on Cancel.
          window.history.replaceState({ ...window.history.state, gtarNavigation: navigationRef.current }, '', window.location.href)
          editorNavigationGuard.current(next)
        }
      } else {
        approvedHistoryPopRef.current = false
        next()
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isLoading, loadError])

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
    importedSongs: SongEntity[], importedSetlists: WebSetlist[], importedFolders: SetlistFolder[],
    mode: RestoreMode, expected: LibraryImage, settings?: BackupSettings
  ) => {
    await setlistSaveQueueRef.current
    const result = await restoreLibraryWithStatus({ songs: importedSongs, setlists: importedSetlists, folders: importedFolders }, mode, expected, settings)
    publishLibrary(result.image)
    if (result.status === 'COMMITTED_UNVERIFIED') {
      const plan = await loadRecoveryPlan().catch(() => null)
      if (plan) setLibraryRecovery({ plan, reason: result.reason })
    }
    return result
  }

  // Publish only data read back from IndexedDB after a completed transaction.
  const publishLibrary = (image: LibraryImage) => {
    setSongs(image.songs)
    setSetlists(image.setlists)
    setFolders(image.folders)
    setSelectedSong(null)
    setEditingSong(null)
    setStageQueue([])
    setActiveTab('SONGS')
    setCurrentNavTarget({ type: 'ALL_SONGS' })
  }

  const handleOpenRecovery = async () => {
    await setlistSaveQueueRef.current
    const plan = await loadRecoveryPlan()
    if (!plan) throw new Error('No recovery snapshot is available.')
    setIsBackupOpen(false)
    setLibraryRecovery({ plan })
  }

  const handleRecovered = (result: RestoreResult) => {
    publishLibrary(result.image)
  }

  const handleSelectSong = (song: SongEntity) => {
    if (explorerMainRef.current && activeTab === 'SONGS') {
      explorerScrollRef.current = explorerMainRef.current.scrollTop
    }
    setSelectedSong(song)
    setViewerTransposeOffset(song.transposeOffset || 0)
    setActiveTab('VIEWER')
  }

  const handleEditSong = (song: SongEntity) => {
    setEditingSong(song)
    setActiveTab('EDITOR')
  }

  const navigate = (next: () => void) => editorNavigationGuard.current ? editorNavigationGuard.current(next) : next()

  const handleNewSong = () => navigate(() => {
    setEditingSong({ id: generateUUID() })
    setActiveTab('EDITOR')
  })

  const handleNewSetlist = () => navigate(() => {
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
  })

  const handlePlaySetlistSong = (songId: string, transposeOffset?: number) => {
    const s = songs.find((item) => item.id === songId)
    if (s) {
      setSelectedSong(s)
      setViewerTransposeOffset(transposeOffset ?? s.transposeOffset ?? 0)
      setActiveTab('VIEWER')
    }
  }

  // Stage Performance Handlers
  const handleEnterStageSong = (song: SongEntity, transposeOffset?: number) => {
    if (explorerMainRef.current && activeTab === 'SONGS') {
      explorerScrollRef.current = explorerMainRef.current.scrollTop
    }
    const offset = transposeOffset ?? song.transposeOffset ?? 0
    setSelectedSong(song)
    setViewerTransposeOffset(offset)
    setStageReturnTab(activeTab === 'VIEWER' ? 'VIEWER' : 'SONGS')
    setStageSetlistName(undefined)
    setStageActiveSetlistId(undefined)

    // M1: Individual song entry opens standalone Stage with NO implicit library queue
    const q: StageQueueItem[] = [{ song, transposeOffset: offset }]
    setStageQueue(q)
    setStageQueueIndex(0)
    setActiveTab('STAGE')
  }

  const handleEnterStageSetlist = (
    setlist: WebSetlist,
    targetOccurrence?: number | string
  ) => {
    if (explorerMainRef.current && activeTab === 'SONGS') {
      explorerScrollRef.current = explorerMainRef.current.scrollTop
    }
    setStageReturnTab(activeTab === 'SETLISTS' ? 'SETLISTS' : 'SONGS')
    setStageSetlistName(setlist.name)
    setStageActiveSetlistId(setlist.id)

    // Build playable queue preserving entry identities
    const q: StageQueueItem[] = []
    const playableEntryIdToIndex = new Map<string, number>()

    for (const ref of setlist.songs) {
      const master = songs.find((s) => s.id === ref.id)
      if (master) {
        const itemIndex = q.length
        const entryId = ref.entryId || generateUUID()
        playableEntryIdToIndex.set(entryId, itemIndex)
        q.push({
          song: master,
          transposeOffset: ref.transposeOffset ?? master.transposeOffset ?? 0,
          entryId,
        })
      }
    }

    if (q.length === 0) {
      // Gracefully handle missing-only queue
      return
    }

    let initialIndex = 0
    if (typeof targetOccurrence === 'string') {
      const mapped = playableEntryIdToIndex.get(targetOccurrence)
      if (mapped !== undefined) {
        initialIndex = mapped
      }
    } else if (typeof targetOccurrence === 'number') {
      // Resolve clicked original setlist row by its entryId if available
      const originalRef = setlist.songs[targetOccurrence]
      if (originalRef?.entryId && playableEntryIdToIndex.has(originalRef.entryId)) {
        initialIndex = playableEntryIdToIndex.get(originalRef.entryId)!
      } else if (originalRef) {
        // Fallback: match by song id
        const found = q.findIndex((item) => item.song.id === originalRef.id)
        if (found >= 0) {
          initialIndex = found
        } else {
          initialIndex = Math.max(0, Math.min(q.length - 1, targetOccurrence))
        }
      } else {
        initialIndex = Math.max(0, Math.min(q.length - 1, targetOccurrence))
      }
    }

    setStageQueue(q)
    setStageQueueIndex(initialIndex)
    setSelectedSong(q[initialIndex].song)
    setViewerTransposeOffset(q[initialIndex].transposeOffset)
    setActiveTab('STAGE')
  }

  const handleExitStage = () => {
    if (window.history.state?.gtarHasPrevious) {
      window.history.back()
      return
    }
    // Also supports a restored Stage entry without an in-app predecessor.
    replaceNavigationRef.current = true
    if (stageReturnTab === 'SETLISTS' && stageActiveSetlistId) setActiveSetlistManagerId(stageActiveSetlistId)
    setActiveTab(stageReturnTab || 'SONGS')
  }

  const handleSelectStageQueueIndex = (index: number) => {
    if (stageQueue[index]) {
      setStageQueueIndex(index)
      setSelectedSong(stageQueue[index].song)
      setViewerTransposeOffset(stageQueue[index].transposeOffset)
    }
  }

  const handleStageTransposeChange = (newOffset: number) => {
    if (stageQueue[stageQueueIndex]) {
      const currentItem = stageQueue[stageQueueIndex]
      const nextQueue = [...stageQueue]
      nextQueue[stageQueueIndex] = {
        ...currentItem,
        transposeOffset: newOffset,
      }
      setStageQueue(nextQueue)
      setViewerTransposeOffset(newOffset)

      // If in setlist mode and item has an entryId: persist per-occurrence setlist transpose
      if (stageActiveSetlistId && currentItem.entryId) {
        const targetSetlistId = stageActiveSetlistId
        const targetEntryId = currentItem.entryId

        // Immediately and synchronously update authoritative in-memory state
        const currentSetlists = setlistsRef.current
        const sl = currentSetlists.find((s) => s.id === targetSetlistId)
        if (sl) {
          const updatedSongs = sl.songs.map((ref) =>
            ref.entryId === targetEntryId
              ? { ...ref, transposeOffset: newOffset }
              : ref
          )
          const updatedSetlist: WebSetlist = { ...sl, songs: updatedSongs, updatedAt: Date.now() }
          const nextSetlists = currentSetlists.map((s) => (s.id === targetSetlistId ? updatedSetlist : s))

          // Synchronous update of ref and React state
          setlistsRef.current = nextSetlists
          setSetlists(nextSetlists)

          // Serialize async persistence to IndexedDB
          setlistSaveQueueRef.current = setlistSaveQueueRef.current
            .then(async () => {
              await saveSetlist(updatedSetlist)
            })
            .catch(() => {})
        }
      }
    }
  }

  const handleOpenSetlistManager = (setlistId?: string) => {
    setActiveSetlistManagerId(setlistId)
    setActiveTab('SETLISTS')
  }

  const handleSelectNavTarget = (target: ExplorerNavTarget) => navigate(() => {
    setCurrentNavTarget(target)
    if (activeTab !== 'SONGS') {
      setActiveTab('SONGS')
    }
  })

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

  if (activeTab === 'STAGE' && stageQueue[stageQueueIndex]) {
    return (
      <StageView
        song={stageQueue[stageQueueIndex].song}
        transposeOffset={stageQueue[stageQueueIndex].transposeOffset}
        onTransposeChange={handleStageTransposeChange}
        onBack={handleExitStage}
        queue={stageQueue}
        currentQueueIndex={stageQueueIndex}
        onSelectQueueIndex={handleSelectStageQueueIndex}
        setlistName={stageSetlistName}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => navigate(() => setActiveTab(tab))}
        onNewSong={handleNewSong}
        onOpenBackup={() => setIsBackupOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenTheme={() => setIsThemeOpen(true)}
        onOpenSources={() => setIsSourcesOpen(true)}
        userProfile={userProfile}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleMobileDrawer={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
        isMobileDrawerOpen={isMobileDrawerOpen}
        searchScopeLabel={searchScopeLabel}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar: Music Explorer Navigation */}
        <aside className="hidden md:block w-64 lg:w-72 shrink-0 bg-app-toolbar border-r border-app-border">
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
            onOpenSources={() => setIsSourcesOpen(true)}
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
            <div className="relative w-72 max-w-[80vw] h-full bg-app-toolbar border-r border-app-border z-10 shadow-2xl flex flex-col">
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
                onOpenSources={() => setIsSourcesOpen(true)}
                onSelectSetlist={(slId) => handleSelectNavTarget({ type: 'SETLIST', setlistId: slId })}
                onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Workspace Canvas */}
        <main
          ref={explorerMainRef}
          onScroll={handleExplorerScroll}
          data-explorer-canvas="true"
          className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-app-base"
        >
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
              onOpenSources={() => setIsSourcesOpen(true)}
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
              onEnterStageSong={handleEnterStageSong}
              onEnterStageSetlist={handleEnterStageSetlist}
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
              onEnterStage={handleEnterStageSong}
            />
          )}

          {activeTab === 'EDITOR' && editingSong && (
            <DesktopEditor
              navigationGuardRef={editorNavigationGuard}
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
                setEditingSong({ id: generateUUID() })
              }}
            />
          )}

          {activeTab === 'SETLISTS' && (
            <SetlistManager
              setlists={setlists}
              folders={folders}
              allSongs={songs}
              initialSelectedSetlistId={activeSetlistManagerId}
              onSelectedSetlistChange={setActiveSetlistManagerId}
              onSaveSetlist={handleSaveSetlist}
              onDeleteSetlist={handleDeleteSetlist}
              onSaveFolder={handleSaveFolder}
              onDeleteFolder={handleDeleteFolder}
              onPlaySong={handlePlaySetlistSong}
              onEnterStageSetlist={handleEnterStageSetlist}
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
          onOpenRecovery={handleOpenRecovery}
          onClose={() => setIsBackupOpen(false)}
        />
      )}

      {/* Library Recovery (undo last restore / unverified restore) */}
      {libraryRecovery && !recoveryConflict && (
        <LibraryRecoveryModal
          plan={libraryRecovery.plan}
          reason={libraryRecovery.reason}
          onRecovered={handleRecovered}
          onReload={async () => { const plan = await loadRecoveryPlan(); setLibraryRecovery(plan ? { plan } : null) }}
          onClose={() => setLibraryRecovery(null)}
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

      {/* Recovery Conflict Modal */}
      {recoveryConflict && (
        <RecoveryConflictModal
          journal={recoveryConflict.journal}
          conflicts={recoveryConflict.conflicts}
          songs={songs}
          setlists={setlists}
          folders={folders}
          onResolved={() => setRecoveryConflict(null)}
          onDismiss={() => setRecoveryConflict(null)}
        />
      )}

      {/* Stage Color Theme Modal */}
      <ThemeModal
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        currentTheme={stageTheme}
        customColors={customThemeColors}
        onApplyTheme={(theme, colors) => {
          setStageTheme(theme)
          if (theme === 'custom' && colors) {
            setCustomThemeColors(colors)
          }
        }}
        onSelectTheme={(theme) => setStageTheme(theme)}
      />

      {/* Browse Song Sources Modal */}
      <BrowseSongSourcesModal
        isOpen={isSourcesOpen}
        onClose={() => setIsSourcesOpen(false)}
        songs={songs}
        onSaveSong={async (song) => {
          await saveSong(song)
          setSongs((prev) => {
            const idx = prev.findIndex((s) => s.id === song.id)
            if (idx >= 0) return prev.map((s, i) => (i === idx ? song : s))
            return [song, ...prev]
          })
        }}
        onSelectSong={(song) => {
          setSelectedSong(song)
          setActiveTab('SONGS')
        }}
      />
    </div>
  )
}

export default App
