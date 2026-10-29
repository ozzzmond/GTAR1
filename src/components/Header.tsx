import React from 'react'
import { GTAR1_VERSION } from '../types/gtar'

export type ActiveTab = 'SONGS' | 'SETLISTS' | 'VIEWER' | 'EDITOR'

export interface HeaderProps {
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
  onNewSong: () => void
  onOpenBackup: () => void
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onNewSong,
  onOpenBackup,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-4 py-3">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('SONGS')}
            className="flex items-center gap-2 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center font-black text-white text-base shadow-sm">
              G
            </div>
            <div>
              <span className="text-base font-extrabold text-white tracking-tight group-hover:text-sky-300 transition-colors">
                GTAR
              </span>
              <span className="text-[10px] text-slate-400 font-mono ml-2">
                {GTAR1_VERSION}
              </span>
            </div>
          </button>

          {/* Local Status Pill */}
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Local Standalone
          </span>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center gap-2">
          <nav className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('SONGS')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'SONGS'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Songbook
            </button>
            <button
              onClick={() => setActiveTab('SETLISTS')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'SETLISTS'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Setlists
            </button>
          </nav>

          <button
            onClick={onNewSong}
            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            + New
          </button>

          <button
            onClick={onOpenBackup}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
          >
            JSON
          </button>
        </div>
      </div>
    </header>
  )
}
