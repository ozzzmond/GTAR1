import React, { useState, useRef, useEffect } from 'react'
import { useSongSourceProvider } from '../hooks/useSongSourceProvider'
import { SONG_SOURCE_PROVIDERS } from '../utils/songSourceProviders'
import { searchOnlineSongSource } from '../utils/songSources'
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
} from 'lucide-react'

export type SearchScope = 'MY_SONGS' | 'ONLINE_SOURCES'

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
  searchScope?: SearchScope
  onSearchScopeChange?: (scope: SearchScope) => void
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
  searchScope = 'MY_SONGS',
  onSearchScopeChange,
  globalSearchRef,
}) => {
  const [isSearchActive, setIsSearchActive] = useState(false)
  const ownSearchRef = useRef<HTMLInputElement>(null)
  const searchInputRef = globalSearchRef || ownSearchRef
  const { provider, selectProvider, preferenceNotice } = useSongSourceProvider()
  const [searchFeedback, setSearchFeedback] = useState<{ success: boolean; message: string } | null>(null)
  useEffect(() => { setSearchFeedback(null) }, [searchQuery, searchScope, provider.id])
  const onlineScope = searchScope === 'ONLINE_SOURCES'
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    if (onlineScope) setSearchFeedback(searchOnlineSongSource(provider.id, searchQuery))
  }
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)
  const avatarMenuRef = useRef<HTMLDivElement>(null)

  // Handle escape to close search or clear
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.nativeEvent.isComposing) { e.preventDefault(); return }
    if (e.key === 'Escape') {
      setSearchFeedback(null)
      if (searchQuery) {
        onSearchChange('')
      } else {
        setIsSearchActive(false)
        searchInputRef.current?.blur()
      }
    }
  }

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

  return (
    <header className="bg-app-header border-b border-app-border sticky top-0 z-40 px-3 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-4">
        {/* Left: Mobile Drawer Toggle & App Branding */}
        <div className="flex items-center gap-2 sm:gap-3">
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

          {/* Local Offline Pill */}
          <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Local Standalone
          </span>
        </div>

        {/* One primary search input. Online navigation requires explicit submit. */}
        <form onSubmit={submitSearch} role="search" aria-label="Global song search" className="order-last lg:order-none w-full lg:w-auto lg:flex-1 lg:min-w-0 lg:max-w-lg space-y-1.5">
          <div className="flex min-w-0 gap-1.5 items-center">
            <select aria-label="Search scope" value={searchScope} onChange={event => onSearchScopeChange?.(event.target.value as SearchScope)}
              className="min-h-[44px] w-[8.5rem] shrink-0 rounded-xl border border-app-border bg-app-surface px-2.5 text-xs text-app-text focus-visible:outline-2 focus-visible:outline-app-action">
              <option value="MY_SONGS">My Songs</option><option value="ONLINE_SOURCES">Online Sources</option>
            </select>
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search className="w-4 h-4 header-neutral-icon absolute left-3 pointer-events-none" />
              <input ref={searchInputRef} type="text" aria-label="Global search" value={searchQuery}
                onChange={event => onSearchChange(event.target.value)} onKeyDown={handleKeyDown}
                onFocus={() => setIsSearchActive(true)} onBlur={() => setIsSearchActive(false)}
                placeholder={onlineScope ? 'Song or artist on website' : `Search ${searchScopeLabel}... (Esc to clear)`}
                aria-describedby={onlineScope ? 'global-online-help' : undefined}
                aria-invalid={searchFeedback?.success === false}
                className="header-search-input min-h-[44px] min-w-0 w-full pl-9 pr-10 rounded-xl bg-app-surface border border-app-border text-xs text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent transition-colors" />
              {searchQuery && <button type="button" onClick={() => { onSearchChange(''); searchInputRef.current?.focus() }} aria-label="Clear search query"
                className="absolute right-0 min-h-[44px] min-w-[36px] flex items-center justify-center header-neutral-icon hover:text-app-heading rounded"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
          {onlineScope && <>
            <div className="flex gap-1.5 items-center">
              <select aria-label="Online provider" value={provider.id} onChange={event => selectProvider(event.target.value)}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-2.5 text-xs text-app-text focus-visible:outline-2 focus-visible:outline-app-action">
                {SONG_SOURCE_PROVIDERS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button type="submit" className="min-h-[44px] rounded-xl bg-app-action px-3 text-xs font-bold text-app-on-action flex items-center gap-1.5 hover:brightness-110">
                <Globe className="w-3.5 h-3.5" />{provider.capabilities.externalSearch ? 'Search Online' : 'Open Website'}
              </button>
            </div>
            <p id="global-online-help" className="text-[11px] text-app-muted">{provider.capabilities.externalSearch ? 'Results open on the provider website in a new tab.' : 'Opens the provider homepage; search or browse there.'}</p>
            {preferenceNotice && <p role="status" className="text-xs text-app-muted">{preferenceNotice}</p>}
          </>}
          {searchFeedback && <p role={searchFeedback.success ? 'status' : 'alert'} className={`text-xs ${searchFeedback.success ? 'text-app-muted' : 'text-red-400'}`}>{searchFeedback.message}</p>}
        </form>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Main Views Switcher */}
          <nav aria-label="Main navigation" className="hidden sm:flex items-center bg-app-surface/80 p-0.5 rounded-xl border border-app-border text-xs font-semibold min-h-[36px]">
            <button
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
            onClick={onNewSong}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-app-action hover:brightness-110 text-app-on-action font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5 min-h-[36px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Song</span>
          </button>

          {/* Browse Song Sources Entry */}
          {onOpenSources && (
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
    </header>
  )
}
