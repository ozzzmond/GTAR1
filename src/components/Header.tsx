import React, { useState, useRef, useEffect } from 'react'
import styles from './Header.module.css'
import { SearchResults } from './SearchResults'
import type { SongEntity, WebSetlist } from '../types/gtar'
import { GTAR1_VERSION } from '../types/gtar'
import type { LocalUserProfile } from '../utils/localProfile'
import { getInitials, DEFAULT_AVATAR_PATH } from '../utils/localProfile'
import {
  Menu,
  X,
  Search,
  Plus,
  Database,
  User,
  Music,
  ListMusic,
  Palette,
  Globe,
  Terminal,
  Command,
} from 'lucide-react'

export type ActiveTab = 'SONGS' | 'SETLISTS' | 'VIEWER' | 'EDITOR' | 'STAGE'

export interface HeaderProps {
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
  onNewSong: () => void
  onOpenBackup: () => void
  onOpenProfile: () => void
  onOpenTheme?: () => void
  onOpenSources?: () => void
  userProfile: LocalUserProfile
  searchQuery: string
  onSearchChange: (query: string) => void
  onToggleMobileDrawer: () => void
  isMobileDrawerOpen: boolean
  searchScopeLabel?: string
  songs?: SongEntity[]
  setlists?: WebSetlist[]
  onSelectSong?: (song: SongEntity) => void
  onSelectSetlist?: (setlist: WebSetlist) => void
  onOpenImport?: () => void
  globalSearchRef?: React.RefObject<HTMLInputElement | null>
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onNewSong,
  onOpenBackup,
  onOpenProfile,
  onOpenTheme,
  onOpenSources,
  userProfile,
  searchQuery,
  onSearchChange,
  onToggleMobileDrawer,
  isMobileDrawerOpen,
  searchScopeLabel = 'All Songs',
  globalSearchRef,
  songs = [], setlists = [], onSelectSong, onSelectSetlist, onOpenImport,
}) => {
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const ownSearchRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = globalSearchRef || ownSearchRef
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)
  const avatarMenuRef = useRef<HTMLDivElement>(null)

  // Track viewport width for responsive search variant
  useEffect(() => {
    const updateMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    updateMobile()
    window.addEventListener('resize', updateMobile)
    return () => window.removeEventListener('resize', updateMobile)
  }, [])

  // Auto-activate mobile overlay if a search query is active on small screens
  useEffect(() => {
    if (searchQuery && typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsMobileSearchActive(true)
    }
  }, [searchQuery])

  // Handle keyboard events on search inputs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.nativeEvent.isComposing) {
      e.preventDefault()
      return
    }
    if (e.key === 'Escape') {
      if (searchQuery) {
        onSearchChange('')
      } else {
        setIsSearchFocused(false)
        e.currentTarget.blur()
      }
    }
  }

  // Desktop Ctrl/Cmd+K shortcut to focus search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        const target = e.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          if (target.id === 'multi-song-search-input') {
            return
          }
        }
        e.preventDefault()
        if (typeof window !== 'undefined' && window.innerWidth < 640) {
          setIsMobileSearchActive(true)
          requestAnimationFrame(() => {
            mobileInputRef.current?.focus()
            mobileInputRef.current?.select?.()
          })
        } else {
          searchInputRef.current?.focus()
          searchInputRef.current?.select?.()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [searchInputRef])

  // Click outside avatar popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setShowAvatarMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const openMobileSearch = () => {
    setIsMobileSearchActive(true)
    requestAnimationFrame(() => {
      mobileInputRef.current?.focus()
    })
  }

  const closeMobileSearch = () => {
    setIsMobileSearchActive(false)
    onSearchChange('')
  }

  const dismissResults = () => {
    setIsSearchFocused(false)
    setIsMobileSearchActive(false)
  }
  const resultsPanel = <SearchResults query={searchQuery} songs={songs} setlists={setlists}
    onSelectSong={song => { dismissResults(); onSelectSong?.(song) }}
    onSelectSetlist={setlist => { dismissResults(); onSelectSetlist?.(setlist) }}
    onOpenSources={onOpenSources ? () => { dismissResults(); onOpenSources() } : undefined}
    onOpenImport={onOpenImport ? () => { dismissResults(); onOpenImport() } : undefined} />
  const handleSearchBlur = (event: React.FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsSearchFocused(false)
  }
  const handleResultsKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (import.meta.env.GTAR1_DEV_NATIVE_SEARCH && event.key === 'ArrowDown' && event.target instanceof HTMLInputElement && searchQuery.trim()) {
      event.preventDefault()
      setIsSearchFocused(true)
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('#global-search-results button:not(:disabled)')?.focus())
    } else if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault()
      ;(isMobile ? mobileInputRef : searchInputRef).current?.focus()
      setIsSearchFocused(false)
    }
  }

  return (
    <header className="bg-app-header border-b border-app-border sticky top-0 z-40 px-3 py-2.5 relative">
      <div className={styles.layout}>
        {/* Left: Mobile Drawer Toggle & App Branding */}
        <div className={`flex items-center gap-2 sm:gap-3 ${styles.brand}`}>
          <button
            type="button"
            onClick={onToggleMobileDrawer}
            className="md:hidden p-1.5 rounded-lg header-neutral-icon hover:text-app-heading hover:bg-app-base transition-colors"
            aria-label={isMobileDrawerOpen ? 'Close explorer menu' : 'Open explorer menu'}
          >
            {isMobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setActiveTab('SONGS')}
            className="flex items-center gap-2 text-left group"
          >
            <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shadow-sm shrink-0 group-hover:opacity-90 transition-opacity">
              <img
                src="/pwa-192x192.png"
                alt="GTAR application logo"
                className="w-full h-full object-cover select-none"
                loading="eager"
                decoding="sync"
              />
            </div>
            <div className="hidden sm:block">
              <span className="text-base font-extrabold header-primary-text tracking-tight group-hover:text-app-link transition-colors">
                GTAR
              </span>
              <span className="text-[10px] header-secondary-text font-mono ml-2">
                {GTAR1_VERSION}
              </span>
            </div>
          </button>

        </div>

        {/* Center: Desktop search bar (Design 2 revamp) */}
        {!isMobile && (
          <form
            onSubmit={event => event.preventDefault()}
            role="search"
            aria-label="Global song search"
            onBlur={handleSearchBlur}
            onKeyDown={handleResultsKeyDown}
            className={`hidden sm:flex relative ${styles.search}`}
          >
            <div
              className={`header-search-box relative flex min-w-0 w-full items-center transition-all duration-200 rounded-xl border border-app-border bg-app-surface ${
                isSearchFocused ? 'border-app-accent ring-2 ring-app-accent/20' : 'hover:border-app-border/80'
              }`}
            >
              <div className="pl-3.5 pr-2 pointer-events-none shrink-0">
                <Search
                  className={`w-4 h-4 transition-colors ${
                    isSearchFocused ? 'text-app-accent' : 'header-neutral-icon'
                  }`}
                />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Global search"
                aria-controls="global-search-results"
                maxLength={200}
                value={searchQuery}
                onChange={event => { setIsSearchFocused(true); onSearchChange(event.target.value) }}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsSearchFocused(true)}
                placeholder={`Search ${searchScopeLabel}... (Esc to clear)`}
                className="header-search-input min-h-[36px] min-w-0 w-full py-1.5 pr-2 bg-transparent text-xs text-app-text placeholder:text-app-muted focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('')
                    searchInputRef.current?.focus()
                  }}
                  aria-label="Clear search query"
                  className="p-1 mr-1.5 header-neutral-icon hover:text-app-heading transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="pr-2 shrink-0 hidden md:flex items-center">
                <kbd
                  className="header-search-kbd inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-app-muted bg-app-base border border-app-border rounded select-none pointer-events-none"
                  title="Ctrl+K or Cmd+K to search"
                >
                  <Command className="w-2.5 h-2.5" /> K
                </kbd>
              </div>
            </div>
            {import.meta.env.GTAR1_DEV_NATIVE_SEARCH && isSearchFocused && searchQuery.trim() && <div className="absolute top-full left-0 right-0 pt-2 z-50">{resultsPanel}</div>}
          </form>
        )}

        {/* Right Actions */}
        <div className={`flex items-center gap-1.5 sm:gap-2 ${styles.actions}`}>
          {/* Mobile Search Icon Trigger Button */}
          {isMobile && (
            <button
              type="button"
              onClick={openMobileSearch}
              aria-label="Open search"
              title="Search songs"
              className={`sm:hidden ui-button mobile-search-trigger p-2 min-h-[36px] min-w-[36px] rounded-xl bg-app-surface border border-app-border transition-colors flex items-center justify-center active:scale-95 ${
                searchQuery ? 'text-app-accent border-app-accent' : 'header-neutral-icon hover:text-app-heading hover:border-app-accent'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Main Views Switcher */}
          <nav aria-label="Main navigation" className="hidden sm:flex items-center bg-app-surface/80 p-0.5 rounded-xl border border-app-border text-xs font-semibold min-h-[36px]">
            <button
              aria-label="Songbook"
              onClick={() => setActiveTab('SONGS')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'SONGS'
                  ? 'bg-app-action text-app-on-action shadow-sm'
                  : 'text-app-muted hover:text-app-heading'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>Songbook</span>
            </button>
            <button
              aria-label="Setlists"
              onClick={() => setActiveTab('SETLISTS')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'SETLISTS'
                  ? 'bg-app-action text-app-on-action shadow-sm'
                  : 'text-app-muted hover:text-app-heading'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Setlists</span>
            </button>
          </nav>

          {/* New Song Button */}
          <button
            aria-label="New Song"
            onClick={onNewSong}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-app-action hover:brightness-110 text-app-on-action font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5 min-h-[36px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Song</span>
          </button>

          {/* Browse Song Sources Entry */}
          {onOpenSources && (!isMobile || !isMobileSearchActive) && (
            <button
              onClick={onOpenSources}
              title="Browse Song Sources"
              aria-label="Browse Song Sources"
              className="ui-button px-2 sm:px-2.5 py-1.5 rounded-xl bg-app-button hover:brightness-110 border border-app-border text-app-button-text text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[36px]"
            >
              <Globe className="w-3.5 h-3.5 text-app-accent" />
              <span className="hidden md:inline">Sources</span>
            </button>
          )}

          {/* Backup & Restore Entry */}
          <button
            onClick={onOpenBackup}
            title="Backup & Restore (Local JSON)"
            aria-label="Backup and Restore"
            className="ui-button px-2 sm:px-2.5 py-1.5 rounded-xl bg-app-button hover:brightness-110 border border-app-border text-app-button-text text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[36px]"
          >
            <Database className="w-3.5 h-3.5 text-app-accent" />
            <span className="hidden md:inline">Backup</span>
          </button>

          {/* Local User Profile Avatar */}
          <div className="relative" ref={avatarMenuRef}>
            <button
              type="button"
              onClick={() => setShowAvatarMenu(!showAvatarMenu)}
              data-debug-logs-opener
              aria-label={`Musician Profile: ${userProfile.displayName}`}
              className="w-9 h-9 rounded-full border-2 border-app-border hover:border-app-action transition-colors overflow-hidden flex items-center justify-center bg-app-surface focus:outline-none shrink-0"
            >
              <img
                src={userProfile.avatarBase64 || DEFAULT_AVATAR_PATH}
                alt={userProfile.displayName}
                className="w-full h-full object-cover"
              />
            </button>

            {/* Avatar Dropdown Menu */}
            {showAvatarMenu && (
              <div className="absolute right-0 mt-2 w-60 bg-app-surface border border-app-border rounded-2xl p-2 shadow-2xl z-50 animate-scale-in text-xs text-app-text">
                <div className="px-3 py-2 border-b border-app-border flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-app-base border border-app-border flex items-center justify-center text-app-action font-extrabold text-xs overflow-hidden shrink-0">
                    <img
                      src={userProfile.avatarBase64 || DEFAULT_AVATAR_PATH}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-app-heading truncate">
                      {userProfile.displayName}
                    </div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                      Local Profile Only
                    </div>
                  </div>
                </div>

                <div className="py-1">
                  {import.meta.env.GTAR1_DEV_DIAGNOSTICS && <button type="button"
                    onClick={() => { setShowAvatarMenu(false); window.dispatchEvent(new Event('gtar1:debug-logs')) }}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl text-left hover:bg-app-base text-app-text flex items-center gap-2 font-medium">
                    <Terminal className="w-3.5 h-3.5 text-app-action" /><span>Debug Logs</span>
                  </button>}

                  <button
                    type="button"
                    onClick={() => {
                      setShowAvatarMenu(false)
                      onOpenProfile()
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left hover:bg-app-base text-app-text flex items-center gap-2 transition-colors font-medium"
                  >
                    <User className="w-3.5 h-3.5 text-app-action" />
                    <span>Edit Local Profile</span>
                  </button>

                  {onOpenSources && (
                    <button
                      type="button"
                      data-testid="header-sources-btn"
                      onClick={() => {
                        setShowAvatarMenu(false)
                        onOpenSources()
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left hover:bg-app-base text-app-text flex items-center gap-2 transition-colors font-medium"
                    >
                      <Globe className="w-3.5 h-3.5 text-app-action" />
                      <span>Browse Song Sources</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowAvatarMenu(false)
                      onOpenBackup()
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left hover:bg-app-base text-app-text flex items-center gap-2 transition-colors font-medium"
                  >
                    <Database className="w-3.5 h-3.5 text-app-action" />
                    <span>Backup &amp; Restore</span>
                  </button>

                  {onOpenTheme && (
                    <button
                      type="button"
                      data-testid="header-theme-settings-btn"
                      onClick={() => {
                        setShowAvatarMenu(false)
                        onOpenTheme()
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left hover:bg-app-base text-app-text flex items-center gap-2 transition-colors font-medium"
                    >
                      <Palette className="w-3.5 h-3.5 text-app-action" />
                      <span>Stage &amp; Color Theme</span>
                    </button>
                  )}
                </div>

                <div className="pt-1 border-t border-app-border px-3 py-1.5 text-[10px] text-app-muted">
                  GTAR1 Standalone Core • Zero Cloud Sync
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Full-Width Expanded Search Overlay */}
      {isMobile && isMobileSearchActive && (
        <div
          className="sm:hidden mobile-search-overlay absolute inset-0 z-50 flex items-center gap-2 px-3 bg-app-header border-b border-app-border animate-scale-in"
          role="search"
          aria-label="Mobile expanded song search"
          onBlur={handleSearchBlur}
          onKeyDown={handleResultsKeyDown}
        >
          <div className="header-search-box flex-1 relative flex items-center min-w-0 rounded-xl bg-app-surface border border-app-accent ring-2 ring-app-accent/20 px-3 py-1">
            <Search className="w-4 h-4 text-app-accent mr-2 shrink-0 pointer-events-none" />
            <input
              ref={mobileInputRef}
              type="text"
              aria-label="Global search"
              aria-controls="global-search-results"
              maxLength={200}
              onFocus={() => setIsSearchFocused(true)}
              value={searchQuery}
              onChange={event => { setIsSearchFocused(true); onSearchChange(event.target.value) }}
              onKeyDown={handleKeyDown}
              placeholder={`Search ${searchScopeLabel}...`}
              autoFocus
              className="header-search-input min-h-[36px] w-full bg-transparent text-xs text-app-text placeholder:text-app-muted font-medium focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('')
                  mobileInputRef.current?.focus()
                }}
                aria-label="Clear search query"
                className="p-1 header-neutral-icon hover:text-app-heading transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {onOpenSources && (
            <button
              type="button"
              onClick={onOpenSources}
              title="Browse Song Sources"
              aria-label="Browse Song Sources"
              className="ui-button px-2 sm:px-2.5 py-1.5 rounded-xl bg-app-button hover:brightness-110 border border-app-border text-app-button-text text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[36px]"
            >
              <Globe className="w-3.5 h-3.5 text-app-accent" />
            </button>
          )}
          <button
            type="button"
            onClick={closeMobileSearch}
            aria-label="Cancel search"
            className="px-2.5 py-1.5 text-xs font-semibold text-app-muted hover:text-app-heading transition-colors shrink-0 min-h-[36px] flex items-center justify-center"
          >
            Cancel
          </button>
          {import.meta.env.GTAR1_DEV_NATIVE_SEARCH && isSearchFocused && searchQuery.trim() && <div className="absolute top-full left-0 right-0 px-3 pt-2">{resultsPanel}</div>}
        </div>
      )}
    </header>
  )
}
