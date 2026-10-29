import React, { useState } from 'react'
import type { SongEntity } from '../types/gtar'
import { parseGtarSong } from '../utils/songParser'
import { SongLineRenderer } from './SongLineRenderer'
import { KeyPickerModal } from './KeyPickerModal'
import { transposeContext } from '../utils/songKeySemantics'
import { Play } from 'lucide-react'
import {
  NOTATION_STORAGE_KEY,
  getTrustworthySongKey,
  type StageNotationMode,
} from '../utils/nashvilleNotation'

export interface SongViewerProps {
  song: SongEntity
  onEdit: (song: SongEntity) => void
  onBack: () => void
  onUpdateSong?: (updated: Partial<SongEntity>) => void
  onEnterStage?: (song: SongEntity, transposeOffset: number) => void
}

export const SongViewer: React.FC<SongViewerProps> = ({ song, onEdit, onBack, onUpdateSong, onEnterStage }) => {
  const [transposeOffset, setTransposeOffset] = useState<number>(song.transposeOffset || 0)
  const [fontSize, setFontSize] = useState<number>(18)
  const [isKeyPickerOpen, setIsKeyPickerOpen] = useState(false)
  const [notation, setNotation] = useState<StageNotationMode>(() => {
    try {
      const stored = localStorage.getItem(NOTATION_STORAGE_KEY)
      return stored === 'numbers' ? 'numbers' : 'chords'
    } catch {
      return 'chords'
    }
  })

  const context = transposeContext(song, transposeOffset)
  const parsed = parseGtarSong(song.rawContent, transposeOffset)
  const currentKey = context.performanceKey || parsed.key || '—'

  // Determine trustworthy reference key for Numbers notation
  const trustworthyKey = getTrustworthySongKey(currentKey, song.rawContent)

  const handleToggleNotation = () => {
    const nextNotation = notation === 'chords' ? 'numbers' : 'chords'
    setNotation(nextNotation)
    try {
      localStorage.setItem(NOTATION_STORAGE_KEY, nextNotation)
    } catch {
      // localStorage may fail in restricted sandboxes
    }
  }

  const handleSetOffset = (newOffset: number) => {
    // Bound semitone offset to -11..+11
    const clamped = Math.max(-11, Math.min(11, newOffset))
    setTransposeOffset(clamped)
    if (onUpdateSong) {
      onUpdateSong({ id: song.id, transposeOffset: clamped })
    }
  }

  const handleReset = () => {
    handleSetOffset(context.resetOffset)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-700">
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-sm font-medium flex items-center gap-1.5"
        >
          ← Back to Songbook
        </button>

        <div className="flex items-center gap-2">
          {/* Chords / Numbers Toggle */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 text-xs">
            <button
              type="button"
              data-testid="notation-toggle"
              onClick={handleToggleNotation}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                notation === 'numbers'
                  ? 'bg-amber-500 text-slate-900 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
              title="Toggle Nashville Number System notation"
            >
              {notation === 'numbers' ? 'Numbers (NNS)' : 'Chords'}
            </button>
          </div>

          {/* Transpose Controls */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              type="button"
              onClick={() => setIsKeyPickerOpen(true)}
              className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-white transition-colors"
              title="Open Key Picker"
            >
              Key: <span className="text-amber-400 font-bold text-sm">{currentKey}</span>
            </button>
            <button
              onClick={() => handleSetOffset(transposeOffset - 1)}
              className="px-2.5 py-1 text-sm font-bold rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
              title="Transpose down 1 semitone"
            >
              ♭ -1
            </button>
            <button
              onClick={handleReset}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                context.displayOffset === 0
                  ? 'text-slate-500'
                  : 'text-amber-300 hover:bg-slate-700'
              }`}
              title={context.originalRelative ? 'Reset to Original Key' : 'Reset to Chart Key'}
            >
              {context.displayOffset === 0 ? '0' : (context.displayOffset > 0 ? `+${context.displayOffset}` : context.displayOffset)}
            </button>
            <button
              onClick={() => handleSetOffset(transposeOffset + 1)}
              className="px-2.5 py-1 text-sm font-bold rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
              title="Transpose up 1 semitone"
            >
              ♯ +1
            </button>
          </div>

          {/* Font sizing */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 text-xs text-slate-300">
            <button
              onClick={() => setFontSize((s) => Math.max(12, s - 2))}
              className="px-2 py-1 hover:bg-slate-700 rounded"
              title="Decrease font size"
            >
              A-
            </button>
            <span className="px-1 text-slate-500">{fontSize}px</span>
            <button
              onClick={() => setFontSize((s) => Math.min(32, s + 2))}
              className="px-2 py-1 hover:bg-slate-700 rounded"
              title="Increase font size"
            >
              A+
            </button>
          </div>

          {onEnterStage && (
            <button
              type="button"
              onClick={() => onEnterStage(song, transposeOffset)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors flex items-center gap-1.5 shadow-sm"
              title="Enter Stage Performance Mode (Alt+1)"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Stage</span>
            </button>
          )}

          <button
            onClick={() => onEdit(song)}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors"
          >
            Edit Song
          </button>
        </div>
      </div>

      {/* Warning when Numbers mode requested but reference key is unknown */}
      {notation === 'numbers' && !trustworthyKey && (
        <div
          role="alert"
          data-testid="numbers-unknown-key-warning"
          className="mb-4 p-3 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-200 text-xs flex items-center justify-between"
        >
          <span>
            <strong>Reference key unknown:</strong> Cannot establish a verified reference key for Nashville Numbers. Showing standard chords. Set a valid Key in the chart or editor.
          </span>
        </div>
      )}

      {/* Song Header Info */}
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          {song.title || parsed.title}
        </h1>
        {Boolean(song.artist || parsed.artist) && (
          <p className="text-lg text-slate-400 mt-1">
            {song.artist || parsed.artist}
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-400">
          {Boolean(context.originalKey) && (
            <span className="bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              Orig Key: <strong className="text-slate-200">{context.originalKey}</strong>
            </span>
          )}
          {Boolean(context.chartKey) && (
            <span className="bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              Chart Key: <strong className="text-slate-200">{context.chartKey}{context.chartEstimated ? ' (est)' : ''}</strong>
            </span>
          )}
          {Boolean(song.bpm || parsed.bpm) && (
            <span className="bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              Tempo: <strong className="text-slate-200">{song.bpm || parsed.bpm} BPM</strong>
            </span>
          )}
          {Boolean(song.time || parsed.time) && (
            <span className="bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              Time: <strong className="text-slate-200">{song.time || parsed.time}</strong>
            </span>
          )}
          {Boolean(song.year || parsed.year) && (
            <span className="bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              Year: <strong className="text-slate-200">{song.year || parsed.year}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Rendered Song Lines */}
      <div className="bg-slate-900/90 rounded-2xl p-6 border border-slate-800 shadow-xl overflow-x-auto min-h-[400px]">
        <SongLineRenderer
          lines={parsed.lines}
          fontSizePx={fontSize}
          notation={notation}
          referenceKey={trustworthyKey}
        />
      </div>

      {/* KeyPickerModal */}
      {isKeyPickerOpen && (
        <KeyPickerModal
          isOpen={isKeyPickerOpen}
          onClose={() => setIsKeyPickerOpen(false)}
          song={song}
          currentOffset={transposeOffset}
          onSelectOffset={handleSetOffset}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
