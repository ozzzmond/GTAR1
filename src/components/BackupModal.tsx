import React, { useState } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import { createBackupPayload, parseBackupJson } from '../utils/jsonBackup'

export interface BackupModalProps {
  songs: SongEntity[]
  setlists: WebSetlist[]
  folders: SetlistFolder[]
  onImport: (
    importedSongs: SongEntity[],
    importedSetlists: WebSetlist[],
    importedFolders: SetlistFolder[]
  ) => Promise<void>
  onClose: () => void
}

export const BackupModal: React.FC<BackupModalProps> = ({
  songs,
  setlists,
  folders,
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
    folders: SetlistFolder[]
    error?: string
  } | null>(null)
  const [isImporting, setIsImporting] = useState<boolean>(false)

  const backupJsonString = JSON.stringify(createBackupPayload(songs, setlists, folders), null, 2)

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
        folders: res.folders,
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
        folders: res.folders,
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
      await onImport(importPreview.songs, importPreview.setlists, importPreview.folders)
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
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-white">JSON Backup & Migration</h3>
            <span className="text-xs bg-sky-950 border border-sky-800 text-sky-300 px-2 py-0.5 rounded-full font-mono">
              Offline-First
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex gap-2 my-4">
          <button
            onClick={() => setMode('EXPORT')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${
              mode === 'EXPORT'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Export Backup
          </button>
          <button
            onClick={() => setMode('IMPORT')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${
              mode === 'IMPORT'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Import Backup
          </button>
        </div>

        {/* Mode Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {mode === 'EXPORT' ? (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>
                  Contains {songs.length} canonical songs, {setlists.length} setlists, and {folders.length} folders
                </span>
                {copyStatus && (
                  <span className="text-emerald-400 font-semibold">{copyStatus}</span>
                )}
              </div>

              <textarea
                readOnly
                rows={12}
                value={backupJsonString}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 focus:outline-none select-all"
              />

              <div className="flex items-center justify-end gap-3 mt-4">
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  Copy JSON
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition-colors shadow"
                >
                  Download .json File
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="p-3 bg-slate-850 border border-slate-800 rounded-xl mb-4">
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Option 1: Upload a GTAR or GTAR1 JSON Backup file
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Option 2: Paste JSON directly
              </label>
              <textarea
                rows={7}
                placeholder="Paste GTAR1 or legacy GTAR backup JSON payload here..."
                value={pasteText}
                onChange={handleTextChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 focus:outline-none focus:border-sky-500"
              />

              {/* Import Preview Feedback */}
              {importPreview && (
                <div
                  className={`mt-4 p-3 rounded-xl border text-xs ${
                    importPreview.valid
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                      : 'bg-red-950/40 border-red-800/80 text-red-200'
                  }`}
                >
                  {importPreview.valid ? (
                    <div>
                      <p className="font-bold mb-1">Backup Validated Cleanly:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90">
                        <li>{importPreview.songs.length} canonical songs discovered</li>
                        <li>{importPreview.setlists.length} setlists discovered</li>
                        <li>{importPreview.folders.length} setlist folders discovered</li>
                      </ul>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold mb-1">Backup Validation Error:</p>
                      <p className="font-mono text-[11px]">{importPreview.error}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  disabled={!importPreview || !importPreview.valid || isImporting}
                  onClick={handleExecuteImport}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors shadow"
                >
                  {isImporting ? 'Importing...' : 'Restore Library'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
