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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-app-border">
        <button
          onClick={onBack}
          className="ui-button px-3 py-1.5 rounded-lg bg-app-button hover:brightness-110 text-app-button-text border border-app-border transition-colors text-sm font-medium flex items-center gap-1.5"
        >
          ← Back to Songbook
        </button>

        <div className="flex items-center gap-2">
          {/* Chords / Numbers Toggle */}
          <div className="flex items-center bg-app-surface rounded-lg p-1 border border-app-border text-xs">
            <button
              type="button"
              data-testid="notation-toggle"
              onClick={handleToggleNotation}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                notation === 'numbers'
                  ? 'bg-app-action text-app-on-action shadow-sm'
                  : 'text-app-muted hover:bg-app-base hover:text-app-text'
              }`}
              title="Toggle Nashville Number System notation"
            >
              {notation === 'numbers' ? 'Numbers (NNS)' : 'Chords'}
            </button>
          </div>

          {/* Transpose Controls */}
          <div className="flex items-center bg-app-surface rounded-lg p-1 border border-app-border">
            <button
              type="button"
              onClick={() => setIsKeyPickerOpen(true)}
              className="px-2 text-xs font-semibold text-app-muted uppercase tracking-wider hover:text-app-heading transition-colors"
              title="Open Key Picker"
            >
              Key: <span className="text-app-accent font-bold text-sm">{currentKey}</span>
            </button>
            <button
              onClick={() => handleSetOffset(transposeOffset - 1)}
              className="ui-button px-2.5 py-1 text-sm font-bold rounded bg-app-button hover:brightness-110 text-app-button-text border border-app-border transition-colors"
              title="Transpose down 1 semitone"
            >
              ♭ -1
            </button>
            <button
              onClick={handleReset}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                context.displayOffset === 0
                  ? 'text-app-muted/60'
                  : 'text-app-accent hover:bg-app-base'
              }`}
              title={context.originalRelative ? 'Reset to Original Key' : 'Reset to Chart Key'}
            >
              {context.displayOffset === 0 ? '0' : (context.displayOffset > 0 ? `+${context.displayOffset}` : context.displayOffset)}
            </button>
            <button
              onClick={() => handleSetOffset(transposeOffset + 1)}
              className="ui-button px-2.5 py-1 text-sm font-bold rounded bg-app-button hover:brightness-110 text-app-button-text border border-app-border transition-colors"
              title="Transpose up 1 semitone"
            >
              ♯ +1
            </button>
          </div>

          {/* Font sizing */}
          <div className="flex items-center bg-app-surface rounded-lg p-1 border border-app-border text-xs text-app-text">
            <button
              onClick={() => setFontSize((s) => Math.max(12, s - 2))}
              className="px-2 py-1 hover:bg-app-base hover:text-app-heading rounded"
              title="Decrease font size"
            >
              A-
            </button>
            <span className="px-1 text-app-muted">{fontSize}px</span>
            <button
              onClick={() => setFontSize((s) => Math.min(32, s + 2))}
              className="px-2 py-1 hover:bg-app-base hover:text-app-heading rounded"
              title="Increase font size"
            >
              A+
            </button>
          </div>

          {onEnterStage && (
            <button
              type="button"
              onClick={() => onEnterStage(song, transposeOffset)}
              className="px-3.5 py-1.5 rounded-lg bg-app-action hover:brightness-110 text-app-on-action font-semibold text-sm transition-colors flex items-center gap-1.5 shadow-sm"
              title="Enter Stage Performance Mode (Alt+1)"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Stage</span>
            </button>
          )}

          <button
            onClick={() => onEdit(song)}
            className="ui-button px-4 py-1.5 rounded-lg bg-app-button hover:brightness-110 text-app-button-text border border-app-border font-medium text-sm transition-colors"
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
        <h1 className="ui-primary-text text-3xl font-extrabold text-app-heading tracking-tight">
          {song.title || parsed.title}
        </h1>
        {Boolean(song.artist || parsed.artist) && (
          <p className="ui-secondary-text text-lg text-app-muted mt-1">
            {song.artist || parsed.artist}
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-3 text-xs text-app-muted">
          {Boolean(context.originalKey) && (
            <span className="bg-app-surface px-2.5 py-1 rounded-full border border-app-border text-app-muted">
              Orig Key: <strong className="text-app-text">{context.originalKey}</strong>
            </span>
          )}
          {Boolean(context.chartKey) && (
            <span className="bg-app-surface px-2.5 py-1 rounded-full border border-app-border text-app-muted">
              Chart Key: <strong className="text-app-text">{context.chartKey}{context.chartEstimated ? ' (est)' : ''}</strong>
            </span>
          )}
          {Boolean(song.bpm || parsed.bpm) && (
            <span className="bg-app-surface px-2.5 py-1 rounded-full border border-app-border text-app-muted">
              Tempo: <strong className="text-app-text">{song.bpm || parsed.bpm} BPM</strong>
            </span>
          )}
          {Boolean(song.time || parsed.time) && (
            <span className="bg-app-surface px-2.5 py-1 rounded-full border border-app-border text-app-muted">
              Time: <strong className="text-app-text">{song.time || parsed.time}</strong>
            </span>
          )}
          {Boolean(song.year || parsed.year) && (
            <span className="bg-app-surface px-2.5 py-1 rounded-full border border-app-border text-app-muted">
              Year: <strong className="text-app-text">{song.year || parsed.year}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Rendered Song Lines */}
      <div className="ui-song-card bg-app-surface rounded-2xl p-6 border border-app-border shadow-xl overflow-x-auto min-h-[400px]">
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
