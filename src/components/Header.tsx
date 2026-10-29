import React, { useState, useRef, useEffect } from 'react'
import { GTAR1_VERSION } from '../types/gtar'
import type { LocalUserProfile } from '../utils/localProfile'
import { getInitials } from '../utils/localProfile'
import {
  Menu,
  X,
  Search,
  Plus,
  Database,
  User,
  Music,
  ListMusic,
} from 'lucide-react'

export type ActiveTab = 'SONGS' | 'SETLISTS' | 'VIEWER' | 'EDITOR' | 'STAGE'

export interface HeaderProps {
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
  onNewSong: () => void
  onOpenBackup: () => void
  onOpenProfile: () => void
  userProfile: LocalUserProfile
  searchQuery: string
  onSearchChange: (query: string) => void
  onToggleMobileDrawer: () => void
  isMobileDrawerOpen: boolean
  searchScopeLabel?: string
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onNewSong,
  onOpenBackup,
  onOpenProfile,
  userProfile,
  searchQuery,
  onSearchChange,
  onToggleMobileDrawer,
  isMobileDrawerOpen,
  searchScopeLabel = 'All Songs',
}) => {
  const [isSearchActive, setIsSearchActive] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)
  const avatarMenuRef = useRef<HTMLDivElement>(null)

  // Handle escape to close search or clear
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
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
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-3 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Mobile Drawer Toggle & App Branding */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleMobileDrawer}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label={isMobileDrawerOpen ? 'Close explorer menu' : 'Open explorer menu'}
          >
            {isMobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setActiveTab('SONGS')}
            className="flex items-center gap-2 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center font-black text-white text-base shadow-sm group-hover:bg-sky-500 transition-colors">
              G
            </div>
            <div className="hidden xs:block">
              <span className="text-base font-extrabold text-white tracking-tight group-hover:text-sky-300 transition-colors">
                GTAR
              </span>
              <span className="text-[10px] text-slate-400 font-mono ml-2">
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

        {/* Center: Search Box */}
        <div className="flex-1 max-w-md mx-1 sm:mx-2">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsSearchActive(true)}
              onBlur={() => setIsSearchActive(false)}
              placeholder={`Search ${searchScopeLabel}... (Esc to clear)`}
              className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search query"
                className="absolute right-2.5 p-0.5 text-slate-400 hover:text-white rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Main Views Switcher */}
          <nav aria-label="Main navigation" className="hidden sm:flex items-center bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/80 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('SONGS')}
              className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'SONGS'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>Songbook</span>
            </button>
            <button
              onClick={() => setActiveTab('SETLISTS')}
              className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'SETLISTS'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Setlists</span>
            </button>
          </nav>

          {/* New Song Button */}
          <button
            onClick={onNewSong}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors shadow-sm flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Song</span>
          </button>

          {/* Backup & Restore Entry */}
          <button
            onClick={onOpenBackup}
            title="Backup & Restore (Local JSON)"
            aria-label="Backup and Restore"
            className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors flex items-center gap-1"
          >
            <Database className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">Backup</span>
          </button>

          {/* Local User Profile Avatar */}
          <div className="relative" ref={avatarMenuRef}>
            <button
              type="button"
              onClick={() => setShowAvatarMenu(!showAvatarMenu)}
              aria-label={`Musician Profile: ${userProfile.displayName}`}
              className="w-8 h-8 rounded-full border-2 border-slate-700 hover:border-sky-400 transition-colors overflow-hidden flex items-center justify-center bg-slate-800 focus:outline-none"
            >
              {userProfile.avatarBase64 ? (
                <img
                  src={userProfile.avatarBase64}
                  alt={userProfile.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-sky-300">
                  {getInitials(userProfile.displayName)}
                </span>
              )}
            </button>

            {/* Avatar Dropdown Menu */}
            {showAvatarMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-2xl p-2 shadow-2xl z-50 animate-scale-in text-xs">
                <div className="px-3 py-2 border-b border-slate-750 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sky-300 font-extrabold text-xs overflow-hidden shrink-0">
                    {userProfile.avatarBase64 ? (
                      <img
                        src={userProfile.avatarBase64}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getInitials(userProfile.displayName)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate">
                      {userProfile.displayName}
                    </div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                      Local Profile Only
                    </div>
                  </div>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAvatarMenu(false)
                      onOpenProfile()
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-700/70 text-slate-200 flex items-center gap-2 transition-colors font-medium"
                  >
                    <User className="w-3.5 h-3.5 text-sky-400" />
                    <span>Edit Local Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAvatarMenu(false)
                      onOpenBackup()
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-700/70 text-slate-200 flex items-center gap-2 transition-colors font-medium"
                  >
                    <Database className="w-3.5 h-3.5 text-sky-400" />
                    <span>Backup &amp; Restore</span>
                  </button>
                </div>

                <div className="pt-1 border-t border-slate-700/60 px-3 py-1.5 text-[10px] text-slate-400">
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
