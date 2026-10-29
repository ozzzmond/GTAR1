import React, { useState } from 'react'
import type { SongEntity } from '../types/gtar'
import { parseGtarSong } from '../utils/songParser'
import { transposeKey } from '../utils/chordTransposer'
import { SongLineRenderer } from './SongLineRenderer'

export interface SongViewerProps {
  song: SongEntity
  onEdit: (song: SongEntity) => void
  onBack: () => void
}

export const SongViewer: React.FC<SongViewerProps> = ({ song, onEdit, onBack }) => {
  const [transposeOffset, setTransposeOffset] = useState<number>(song.transposeOffset || 0)
  const [fontSize, setFontSize] = useState<number>(18)

  const parsed = parseGtarSong(song.rawContent, transposeOffset)
  const currentKey = transposeKey(song.key || parsed.key, transposeOffset)

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
          {/* Transpose Controls */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
            <span className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Key: <span className="text-amber-400 font-bold text-sm">{currentKey || '—'}</span>
            </span>
            <button
              onClick={() => setTransposeOffset((o) => o - 1)}
              className="px-2.5 py-1 text-sm font-bold rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
              title="Transpose down 1 semitone"
            >
              ♭ -1
            </button>
            <button
              onClick={() => setTransposeOffset(0)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                transposeOffset === 0
                  ? 'text-slate-500'
                  : 'text-amber-300 hover:bg-slate-700'
              }`}
              title="Reset transposition"
            >
              {transposeOffset === 0 ? '0' : (transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset)}
            </button>
            <button
              onClick={() => setTransposeOffset((o) => o + 1)}
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

          <button
            onClick={() => onEdit(song)}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors"
          >
            Edit Song
          </button>
        </div>
      </div>

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
          {Boolean(song.originalKey || parsed.originalKey) && (
            <span className="bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              Orig Key: <strong className="text-slate-200">{song.originalKey || parsed.originalKey}</strong>
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
        <SongLineRenderer lines={parsed.lines} fontSizePx={fontSize} />
      </div>
    </div>
  )
}
