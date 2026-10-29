import React, { useState, useRef } from 'react'
import type { SongEntity } from '../types/gtar'
import {
  parseChordProDirectives,
  syncCanonicalDirectives,
  formatCanonicalTempo,
} from '../utils/chordProMetadata'
import { canonicalSongKey } from '../utils/musicalKey'
import { generateUUID } from '../utils/uuid'

export interface SongEditorProps {
  initialSong?: Partial<SongEntity>
  onSave: (song: SongEntity) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onCancel: () => void
}

export const SongEditor: React.FC<SongEditorProps> = ({
  initialSong,
  onSave,
  onDelete,
  onCancel,
}) => {
  const [id] = useState<string>(initialSong?.id || generateUUID())
  const [title, setTitle] = useState<string>(initialSong?.title || '')
  const [artist, setArtist] = useState<string>(initialSong?.artist || '')
  const [key, setKey] = useState<string>(initialSong?.key || '')
  const [originalKey, setOriginalKey] = useState<string>(initialSong?.originalKey || '')
  const [bpm, setBpm] = useState<string>(initialSong?.bpm || '')
  const [time, setTime] = useState<string>(initialSong?.time || '')
  const [year, setYear] = useState<string>(initialSong?.year || '')
  const [rawContent, setRawContent] = useState<string>(
    initialSong?.rawContent || '{title: }\n{artist: }\n{key: }\n\n[C]Amazing grace! How [F]sweet the [C]sound'
  )

  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Quick insertion of brackets [] around cursor or selection
  const handleInsertBrackets = () => {
    const el = textareaRef.current
    if (!el) return

    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = rawContent.slice(start, end)
    const replacement = `[${selected}]`

    const newContent =
      rawContent.slice(0, start) + replacement + rawContent.slice(end)
    setRawContent(newContent)

    // Set cursor inside or right after brackets
    requestAnimationFrame(() => {
      el.focus()
      if (selected.length > 0) {
        el.setSelectionRange(start + replacement.length, start + replacement.length)
      } else {
        el.setSelectionRange(start + 1, start + 1)
      }
    })
  }

  // Sync directives from rawContent when user edits content directly
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setRawContent(val)

    const parsed = parseChordProDirectives(val)
    if (parsed.metadata.title !== undefined) setTitle(parsed.metadata.title)
    if (parsed.metadata.artist !== undefined) setArtist(parsed.metadata.artist)
    if (parsed.metadata.key !== undefined) setKey(canonicalSongKey(parsed.metadata.key))
    if (parsed.metadata.originalKey !== undefined) setOriginalKey(canonicalSongKey(parsed.metadata.originalKey))
    if (parsed.metadata.bpm !== undefined || parsed.metadata.tempo !== undefined) {
      const t = parsed.metadata.bpm ?? parsed.metadata.tempo
      setBpm(t ? String(t).replace(/\s*BPM/i, '') : '')
    }
    if (parsed.metadata.time !== undefined) setTime(parsed.metadata.time)
    if (parsed.metadata.year !== undefined) setYear(String(parsed.metadata.year))
  }

  // Update directive in content when header input changes
  const handleMetadataBlur = () => {
    const updated = syncCanonicalDirectives(rawContent, {
      title,
      artist,
      key: canonicalSongKey(key),
      originalKey: originalKey ? canonicalSongKey(originalKey) : undefined,
      bpm,
      time,
      year,
    })
    setRawContent(updated)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveStatus('SAVING')
    setErrorMessage(null)

    const finalTitle = title.trim() || 'Untitled Song'
    const finalContent = syncCanonicalDirectives(rawContent, {
      title: finalTitle,
      artist: artist.trim(),
      key: canonicalSongKey(key),
      originalKey: originalKey ? canonicalSongKey(originalKey) : undefined,
      bpm: bpm.trim(),
      time: time.trim(),
      year: year.trim(),
    })

    const songEntity: SongEntity = {
      id,
      title: finalTitle,
      artist: artist.trim() || undefined,
      key: key ? canonicalSongKey(key) : undefined,
      originalKey: originalKey ? canonicalSongKey(originalKey) : undefined,
      bpm: bpm.trim() || undefined,
      time: time.trim() || undefined,
      year: year.trim() || undefined,
      rawContent: finalContent,
      format: 'CHORD_PRO',
      createdAt: initialSong?.createdAt || Date.now(),
      updatedAt: Date.now(),
      transposeOffset: initialSong?.transposeOffset || 0,
      isFavorite: initialSong?.isFavorite || false,
    }

    try {
      await onSave(songEntity)
      setSaveStatus('SAVED')
      setTimeout(() => setSaveStatus('IDLE'), 2500)
    } catch (err: any) {
      setSaveStatus('ERROR')
      setErrorMessage(err?.message || 'Failed to save song to local storage')
    }
  }

  const handleDelete = async () => {
    if (!initialSong?.id || !onDelete) return
    if (!confirm(`Are you sure you want to delete "${title || 'Untitled Song'}"?`)) return

    try {
      await onDelete(initialSong.id)
    } catch (err: any) {
      setSaveStatus('ERROR')
      setErrorMessage(err?.message || 'Failed to delete song')
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <h2 className="text-xl font-bold text-white ml-2">
              {initialSong?.id ? 'Edit Song' : 'New Song'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {initialSong?.id && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-800/80 text-red-200 text-sm font-medium transition-colors"
              >
                Delete
              </button>
            )}

            <button
              type="submit"
              disabled={saveStatus === 'SAVING'}
              className="px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-semibold text-sm transition-colors shadow-md flex items-center gap-2"
            >
              {saveStatus === 'SAVING' ? 'Saving...' : saveStatus === 'SAVED' ? '✓ Saved!' : 'Save Song'}
            </button>
          </div>
        </div>

        {/* Error notification */}
        {saveStatus === 'ERROR' && errorMessage && (
          <div className="p-3 rounded-lg bg-red-950/80 border border-red-700 text-red-200 text-sm">
            <strong>Save Error:</strong> {errorMessage}
          </div>
        )}

        {/* Metadata Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-850 p-4 rounded-xl border border-slate-800">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. Amazing Grace"
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Artist / Author</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. John Newton"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Chart Key</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. C, Eb, F#m"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Original Key</label>
            <input
              type="text"
              value={originalKey}
              onChange={(e) => setOriginalKey(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. G"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Tempo (BPM)</label>
            <input
              type="text"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. 120"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Time Signature</label>
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. 4/4 or 3/4"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-sm"
            />
          </div>
        </div>

        {/* Textarea Toolbar */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300">ChordPro Chart Content</span>
          <button
            type="button"
            onClick={handleInsertBrackets}
            aria-label="Wrap selection or insert brackets []"
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 font-mono font-bold rounded flex items-center gap-1 transition-colors"
          >
            [ ] Chord Brackets
          </button>
        </div>

        {/* Editor Area */}
        <textarea
          ref={textareaRef}
          value={rawContent}
          onChange={handleContentChange}
          rows={18}
          className="w-full bg-slate-950 font-mono text-sm text-slate-100 p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-sky-500 leading-relaxed resize-y"
          placeholder="[C]Enter ChordPro lyrics and chords here..."
        />
      </form>
    </div>
  )
}
