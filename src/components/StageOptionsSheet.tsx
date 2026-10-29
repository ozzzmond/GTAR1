import React, { useEffect } from 'react'
import {
  X,
  Type,
  Maximize,
  Minimize,
  Eye,
  EyeOff,
  Sun,
  Columns2,
  Sliders,
  ListMusic,
  Check,
} from 'lucide-react'
import type { StageChordScale, StageFontWeight, StageLineSpacing } from './SongLineRenderer'
import type { StageNotationMode } from '../utils/nashvilleNotation'
import type { SongEntity } from '../types/gtar'

export interface StageOptionsSheetProps {
  isOpen: boolean
  onClose: () => void

  // Typography
  fontSize: number
  onFontSizeChange: (size: number) => void
  chordScale: StageChordScale
  onChordScaleChange: (scale: StageChordScale) => void
  fontWeight: StageFontWeight
  onFontWeightChange: (weight: StageFontWeight) => void
  lineSpacing: StageLineSpacing
  onLineSpacingChange: (spacing: StageLineSpacing) => void
  fontFamily: 'mono' | 'sans' | 'serif'
  onFontFamilyChange: (family: 'mono' | 'sans' | 'serif') => void

  // Notation
  notation: StageNotationMode
  onNotationChange: (notation: StageNotationMode) => void

  // Layout & Dock
  isTwoColumn: boolean
  onToggleTwoColumn: (enabled: boolean) => void
  showDock: boolean
  onToggleShowDock: (enabled: boolean) => void

  // Autoscroll
  autoScrollSpeed: number
  onAutoScrollSpeedChange: (speed: number) => void

  // Controls Auto-Hide
  autoHideControls: boolean
  onToggleAutoHideControls: (enabled: boolean) => void

  // Wake lock & Fullscreen
  wakeLockActive: boolean
  onToggleWakeLock: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  isFullscreenSupported: boolean

  // Setlist Quick Jump (optional if setlist mode active)
  queueSongs?: Array<{ song: SongEntity; entryId?: string }>
  currentQueueIndex?: number
  onSelectQueueIndex?: (index: number) => void
  setlistName?: string
}

export const STAGE_SIZE_PRESETS = [
  { label: 'S', value: 16 },
  { label: 'M', value: 20 },
  { label: 'L', value: 24 },
  { label: 'XL', value: 30 },
]

export const CHORD_SCALE_PRESETS: Array<{ label: string; value: StageChordScale }> = [
  { label: '100%', value: 1.0 },
  { label: '110%', value: 1.1 },
  { label: '120%', value: 1.2 },
  { label: '130%', value: 1.3 },
]

export const FONT_WEIGHT_PRESETS: Array<{ label: string; value: StageFontWeight }> = [
  { label: 'Regular', value: 'regular' },
  { label: 'Medium', value: 'medium' },
  { label: 'Bold', value: 'bold' },
]

export const LINE_SPACING_PRESETS: Array<{ label: string; value: StageLineSpacing }> = [
  { label: 'Compact', value: 'compact' },
  { label: 'Normal', value: 'normal' },
  { label: 'Relaxed', value: 'relaxed' },
]

export const FONT_FAMILY_PRESETS: Array<{ label: string; value: 'mono' | 'sans' | 'serif' }> = [
  { label: 'Mono', value: 'mono' },
  { label: 'Sans', value: 'sans' },
  { label: 'Serif', value: 'serif' },
]

export const StageOptionsSheet: React.FC<StageOptionsSheetProps> = ({
  isOpen,
  onClose,
  fontSize,
  onFontSizeChange,
  chordScale,
  onChordScaleChange,
  fontWeight,
  onFontWeightChange,
  lineSpacing,
  onLineSpacingChange,
  fontFamily,
  onFontFamilyChange,
  notation,
  onNotationChange,
  isTwoColumn,
  onToggleTwoColumn,
  showDock,
  onToggleShowDock,
  autoScrollSpeed,
  onAutoScrollSpeedChange,
  autoHideControls,
  onToggleAutoHideControls,
  wakeLockActive,
  onToggleWakeLock,
  isFullscreen,
  onToggleFullscreen,
  isFullscreenSupported,
  queueSongs,
  currentQueueIndex,
  onSelectQueueIndex,
  setlistName,
}) => {
  // Handle escape to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stage Performance Options"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Sheet / Modal Container */}
      <div className="relative w-full sm:max-w-xl max-h-[88vh] bg-slate-900 border border-slate-700 sm:rounded-3xl rounded-t-3xl shadow-2xl z-10 flex flex-col overflow-hidden animate-slide-up sm:animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-white tracking-tight">Stage Options</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close options"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-5 space-y-6 text-xs text-slate-200">
          {/* Autoscroll Speed */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">Auto-Scroll Speed</span>
              <span className="font-mono font-bold text-sky-400 text-sm">
                {Math.round(autoScrollSpeed)} px/s
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onAutoScrollSpeedChange(Math.max(5, autoScrollSpeed - 5))}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
              >
                -5
              </button>
              <input
                type="range"
                min="5"
                max="180"
                step="1"
                value={autoScrollSpeed}
                onChange={(e) => onAutoScrollSpeedChange(Number(e.target.value))}
                className="flex-1 accent-sky-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <button
                type="button"
                onClick={() => onAutoScrollSpeedChange(Math.min(180, autoScrollSpeed + 5))}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
              >
                +5
              </button>
            </div>
          </div>

          {/* Notation Mode: Chords vs Numbers */}
          <div className="space-y-2">
            <span className="font-semibold text-slate-300">Notation Mode</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onNotationChange('chords')}
                className={`py-2 px-3 rounded-xl font-bold transition-all border ${
                  notation === 'chords'
                    ? 'bg-sky-600 border-sky-400 text-white shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                Chords (Letters)
              </button>
              <button
                type="button"
                onClick={() => onNotationChange('numbers')}
                className={`py-2 px-3 rounded-xl font-bold transition-all border ${
                  notation === 'numbers'
                    ? 'bg-amber-500 border-amber-400 text-slate-900 shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
              >
                Numbers (NNS)
              </button>
            </div>
          </div>

          {/* Typography: Font Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">Font Size</span>
              <span className="text-slate-400 font-mono">{fontSize}px</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {STAGE_SIZE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onFontSizeChange(p.value)}
                  className={`py-2 rounded-xl font-bold transition-all border ${
                    fontSize === p.value
                      ? 'bg-sky-600 border-sky-400 text-white shadow-sm'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  {p.label} ({p.value})
                </button>
              ))}
            </div>
          </div>

          {/* Typography: Chord Scaling */}
          <div className="space-y-2">
            <span className="font-semibold text-slate-300">Chord Scale</span>
            <div className="grid grid-cols-4 gap-2">
              {CHORD_SCALE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChordScaleChange(p.value)}
                  className={`py-2 rounded-xl font-bold transition-all border ${
                    chordScale === p.value
                      ? 'bg-sky-600 border-sky-400 text-white shadow-sm'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Typography: Font Weight & Line Spacing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-semibold text-slate-300">Font Weight</span>
              <div className="grid grid-cols-3 gap-1.5">
                {FONT_WEIGHT_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onFontWeightChange(p.value)}
                    className={`py-1.5 rounded-lg font-medium text-[11px] transition-all border ${
                      fontWeight === p.value
                        ? 'bg-sky-600 border-sky-400 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-semibold text-slate-300">Line Spacing</span>
              <div className="grid grid-cols-3 gap-1.5">
                {LINE_SPACING_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onLineSpacingChange(p.value)}
                    className={`py-1.5 rounded-lg font-medium text-[11px] transition-all border ${
                      lineSpacing === p.value
                        ? 'bg-sky-600 border-sky-400 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Font Family */}
          <div className="space-y-2">
            <span className="font-semibold text-slate-300">Font Style</span>
            <div className="grid grid-cols-3 gap-2">
              {FONT_FAMILY_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onFontFamilyChange(p.value)}
                  className={`py-2 rounded-xl font-medium transition-all border ${
                    fontFamily === p.value
                      ? 'bg-sky-600 border-sky-400 text-white shadow-sm'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reading Layout & Behavior Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <span className="font-semibold text-slate-300">Reading & Performance Features</span>

            {/* Two-Column Mode (User-Controlled opt-in) */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <Columns2 className="w-4 h-4 text-sky-400" />
                <div>
                  <div className="font-semibold text-slate-100">Two-Column Layout</div>
                  <div className="text-[11px] text-slate-400">
                    Split song across two reading columns on widescreen displays
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleTwoColumn(!isTwoColumn)}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  isTwoColumn ? 'bg-sky-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    isTwoColumn ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Controls Auto-Hide */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2.5">
                {autoHideControls ? (
                  <EyeOff className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Eye className="w-4 h-4 text-slate-400" />
                )}
                <div>
                  <div className="font-semibold text-slate-100">Auto-Hide Controls</div>
                  <div className="text-[11px] text-slate-400">
                    Fade out bars during auto-scroll or inactivity for full canvas reading
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleAutoHideControls(!autoHideControls)}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  autoHideControls ? 'bg-sky-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    autoHideControls ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Draggable Dock on Desktop/Tablet */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="font-semibold text-slate-100">Floating Control Dock</div>
                  <div className="text-[11px] text-slate-400">
                    Use draggable side dock instead of fixed bottom bar (tablet / desktop)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleShowDock(!showDock)}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  showDock ? 'bg-sky-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    showDock ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Wake Lock Controller */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <Sun className={`w-4 h-4 ${wakeLockActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <div>
                  <div className="font-semibold text-slate-100">Keep Screen Awake</div>
                  <div className="text-[11px] text-slate-400">
                    Screen Wake Lock controller (enabled by default)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleWakeLock}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  wakeLockActive ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    wakeLockActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Fullscreen Toggle */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2.5">
                {isFullscreen ? (
                  <Minimize className="w-4 h-4 text-sky-400" />
                ) : (
                  <Maximize className="w-4 h-4 text-slate-400" />
                )}
                <div>
                  <div className="font-semibold text-slate-100">Fullscreen Mode</div>
                  <div className="text-[11px] text-slate-400">
                    {isFullscreenSupported
                      ? 'Toggle native fullscreen viewing'
                      : 'iOS distraction-free reading mode'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleFullscreen}
                className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                  isFullscreen
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                }`}
              >
                {isFullscreen ? 'Exit' : 'Enter'}
              </button>
            </div>
          </div>

          {/* Setlist Quick-Jump (if in setlist queue) */}
          {queueSongs && queueSongs.length > 1 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <ListMusic className="w-4 h-4 text-sky-400" />
                <span>Setlist Quick-Jump ({setlistName || 'Active Setlist'})</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-2xl bg-slate-950/60 p-2 border border-slate-800">
                {queueSongs.map((item, idx) => (
                  <button
                    key={item.entryId || `${item.song.id}_${idx}`}
                    type="button"
                    onClick={() => {
                      onSelectQueueIndex?.(idx)
                      onClose()
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors ${
                      currentQueueIndex === idx
                        ? 'bg-sky-600 text-white font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-[11px] opacity-75">
                        {idx + 1}.
                      </span>
                      <span className="truncate">{item.song.title}</span>
                    </div>
                    {currentQueueIndex === idx && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
