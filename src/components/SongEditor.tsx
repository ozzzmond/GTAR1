import React, { useState, useRef } from 'react'
import type { SongEntity } from '../types/gtar'
import {
  parseChordProDirectives,
  syncCanonicalDirectives,
} from '../utils/chordProMetadata'
import { canonicalSongKey } from '../utils/musicalKey'
import { generateUUID } from '../utils/uuid'
import { normalizeTags } from '../utils/tags'

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
  const [tagsInput, setTagsInput] = useState<string>(
    initialSong?.tags ? initialSong.tags.join(', ') : ''
  )
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

    const songTitle = title.trim() || 'Untitled Song'
    const songKey = canonicalSongKey(key)
    const normalizedTags = normalizeTags(tagsInput)

    const songToSave: SongEntity = {
      id,
      title: songTitle,
      artist: artist.trim(),
      key: songKey,
      originalKey: originalKey ? canonicalSongKey(originalKey) : undefined,
      bpm: bpm.trim() || undefined,
      time: time.trim() || undefined,
      year: year.trim() || undefined,
      tags: normalizedTags,
      rawContent,
      format: initialSong?.format || 'CHORD_PRO',
      createdAt: initialSong?.createdAt || Date.now(),
      updatedAt: Date.now(),
    }

    try {
      await onSave(songToSave)
      setSaveStatus('SAVED')
    } catch (err: any) {
      setSaveStatus('ERROR')
      setErrorMessage(err?.message || 'Failed to save song')
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              ← Back
            </button>
            <h2 className="text-lg font-bold text-white">
              {initialSong?.id ? 'Edit Song' : 'New Song'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete song "${title}"?`)) {
                    onDelete(id)
                  }
                }}
                className="px-3 py-1.5 text-xs text-red-300 hover:text-red-200 bg-red-950/40 hover:bg-red-950 border border-red-900/60 rounded-lg transition-colors"
              >
                Delete Song
              </button>
            )}

            <button
              type="submit"
              disabled={saveStatus === 'SAVING'}
              className="px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-colors shadow disabled:opacity-50"
            >
              {saveStatus === 'SAVING' ? 'Saving...' : 'Save Song'}
            </button>
          </div>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-xs text-red-200">
            {errorMessage}
          </div>
        )}

        {/* Canonical Directives Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-850 p-4 rounded-xl border border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. Amazing Grace"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Artist
            </label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. John Newton"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Key
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. G, C, Eb, F#m"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Original Key (Optional)
            </label>
            <input
              type="text"
              value={originalKey}
              onChange={(e) => setOriginalKey(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. Bb, Dm"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Tempo / BPM
            </label>
            <input
              type="text"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. 120"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Time Signature
            </label>
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onBlur={handleMetadataBlur}
              placeholder="e.g. 4/4, 3/4"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Tags (comma-separated, case-normalized)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. worship, acoustic, communion, opener"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Assign tags to organize your songbook without duplicating chart bodies.
            </p>
          </div>
        </div>

        {/* ChordPro Chart Body Editor */}
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-400">
              ChordPro Chart Content
            </label>
            <button
              type="button"
              onClick={handleInsertBrackets}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-750 text-sky-400 border border-slate-700 rounded font-mono transition-colors"
            >
              [ Chord ]
            </button>
          </div>

          <textarea
            ref={textareaRef}
            rows={18}
            value={rawContent}
            onChange={handleContentChange}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 font-mono text-sm leading-relaxed focus:outline-none focus:border-sky-500 resize-y"
          />
        </div>
      </form>
    </div>
  )
}
