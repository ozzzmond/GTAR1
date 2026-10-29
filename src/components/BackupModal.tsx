import React, { useState } from 'react'
import type { SongEntity, WebSetlist } from '../types/gtar'
import { createBackupPayload, parseBackupJson } from '../utils/jsonBackup'

export interface BackupModalProps {
  songs: SongEntity[]
  setlists: WebSetlist[]
  onImport: (importedSongs: SongEntity[], importedSetlists: WebSetlist[]) => Promise<void>
  onClose: () => void
}

export const BackupModal: React.FC<BackupModalProps> = ({
  songs,
  setlists,
  onImport,
  onClose,
}) => {
  const [mode, setMode] = useState<'EXPORT' | 'IMPORT'>('EXPORT')
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState<string>('')
  const [importPreview, setImportPreview] = useState<{
    valid: boolean
    songs: SongEntity[]
    setlists: WebSetlist[]
    error?: string
  } | null>(null)
  const [isImporting, setIsImporting] = useState<boolean>(false)

  const backupJsonString = JSON.stringify(createBackupPayload(songs, setlists), null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(backupJsonString)
    setCopyStatus('Copied JSON to clipboard!')
    setTimeout(() => setCopyStatus(null), 2500)
  }

  const handleDownload = () => {
    const blob = new Blob([backupJsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dateStr = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `gtar1-backup-${dateStr}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setPasteText(text)
      const res = parseBackupJson(text)
      setImportPreview({
        valid: res.isValid,
        songs: res.songs,
        setlists: res.setlists,
        error: res.error,
      })
    }
    reader.readAsText(file)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setPasteText(text)
    if (text.trim()) {
      const res = parseBackupJson(text)
      setImportPreview({
        valid: res.isValid,
        songs: res.songs,
        setlists: res.setlists,
        error: res.error,
      })
    } else {
      setImportPreview(null)
    }
  }

  const handleExecuteImport = async () => {
    if (!importPreview || !importPreview.valid) return
    setIsImporting(true)
    try {
      await onImport(importPreview.songs, importPreview.setlists)
      onClose()
    } catch (err: any) {
      alert(`Import error: ${err?.message}`)
      setIsImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('EXPORT')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'EXPORT'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-white bg-slate-800'
              }`}
            >
              Export JSON
            </button>
            <button
              onClick={() => setMode('IMPORT')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'IMPORT'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-white bg-slate-800'
              }`}
            >
              Import JSON
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          {mode === 'EXPORT' ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Export all {songs.length} song{songs.length === 1 ? '' : 's'} and {setlists.length} setlist{setlists.length === 1 ? '' : 's'} to a standard JSON backup file. No cloud or network required.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  Download .json File
                </button>
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
                >
                  {copyStatus || 'Copy to Clipboard'}
                </button>
              </div>

              <textarea
                readOnly
                value={backupJsonString}
                rows={12}
                className="w-full bg-slate-950 font-mono text-xs text-slate-300 p-3 rounded-xl border border-slate-800 focus:outline-none resize-none"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Choose a JSON backup file or paste JSON content directly.
              </p>

              <div>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <textarea
                value={pasteText}
                onChange={handleTextChange}
                placeholder="Or paste JSON backup content here..."
                rows={8}
                className="w-full bg-slate-950 font-mono text-xs text-slate-200 p-3 rounded-xl border border-slate-800 focus:outline-none focus:border-sky-500 resize-none"
              />

              {importPreview && (
                <div
                  className={`p-3 rounded-xl text-xs border ${
                    importPreview.valid
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                      : 'bg-red-950/40 border-red-800/80 text-red-300'
                  }`}
                >
                  {importPreview.valid ? (
                    <div className="flex items-center justify-between">
                      <span>
                        ✓ Valid backup detected: <strong>{importPreview.songs.length} songs</strong>,{' '}
                        <strong>{importPreview.setlists.length} setlists</strong>.
                      </span>
                    </div>
                  ) : (
                    <span>⚠️ {importPreview.error}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
          >
            Close
          </button>
          {mode === 'IMPORT' && (
            <button
              onClick={handleExecuteImport}
              disabled={!importPreview?.valid || isImporting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors shadow"
            >
              {isImporting ? 'Importing...' : 'Confirm Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
