import React, { useState } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import { createBackupPayload, parseBackupJson } from '../utils/jsonBackup'
import {
  Download,
  Upload,
  Copy,
  Check,
  AlertTriangle,
  Database,
  X,
  FileText,
  ShieldCheck,
  Info,
} from 'lucide-react'

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setPasteText(content)
      validateImportPayload(content)
    }
    reader.readAsText(file)
  }

  const validateImportPayload = (text: string) => {
    const result = parseBackupJson(text)
    if (result.isValid) {
      setImportPreview({
        valid: true,
        songs: result.songs,
        setlists: result.setlists,
        folders: result.folders || [],
      })
    } else {
      setImportPreview({
        valid: false,
        songs: [],
        setlists: [],
        folders: [],
        error: result.error || 'Invalid GTAR backup JSON structure',
      })
    }
  }

  const handleExecuteImport = async () => {
    if (!importPreview || !importPreview.valid) return

    setIsImporting(true)
    try {
      await onImport(importPreview.songs, importPreview.setlists, importPreview.folders)
      alert(
        `Successfully restored ${importPreview.songs.length} canonical songs, ${importPreview.setlists.length} setlists, and ${importPreview.folders.length} folders!`
      )
      onClose()
    } catch (err: any) {
      alert(`Import error: ${err?.message || 'Storage write failed'}`)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col text-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-600/20 text-sky-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 id="backup-modal-title" className="text-base font-bold text-white">
                Backup &amp; Restore
              </h2>
              <p className="text-[11px] text-slate-400">
                Honest local JSON library export and safe schema restoration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close backup modal"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2">
          <button
            type="button"
            onClick={() => setMode('EXPORT')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              mode === 'EXPORT'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Library Backup</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('IMPORT')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              mode === 'IMPORT'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore From File / JSON</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {mode === 'EXPORT' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-slate-200">
                    Offline Canonical Library Snapshot
                  </div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    This backup contains all {songs.length} master songs with full ChordPro formatting and multi-tags, {setlists.length} setlists with ordered shortcut references, and {folders.length} folder hierarchy definitions.
                  </p>
                </div>
              </div>

              <div className="relative">
                <textarea
                  readOnly
                  value={backupJsonString}
                  rows={10}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 resize-none focus:outline-none focus:border-slate-700"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-slate-400">
                  {copyStatus && (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      {copyStatus}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .json</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === 'IMPORT' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
                <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-amber-300">
                    Safe Restoration Guarantee
                  </div>
                  <p className="text-[11px] text-amber-300/90 leading-relaxed">
                    This parser validates schema integrity, sanitizes tag lists, preserves folder hierarchies without cycles, and protects existing canonical IDs. Smart Merge and Cloud Sync are not claimed in this standalone release.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Choose Backup File (.json)
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-sky-300 hover:file:bg-slate-700 file:cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Or Paste Raw Backup JSON
                </label>
                <textarea
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value)
                    if (e.target.value.trim()) {
                      validateImportPayload(e.target.value)
                    } else {
                      setImportPreview(null)
                    }
                  }}
                  placeholder="Paste GTAR1 or legacy GTAR backup payload here..."
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 resize-none focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Validation Status & Summary */}
              {importPreview && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    importPreview.valid
                      ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                      : 'bg-red-950/40 border-red-800/60 text-red-300'
                  }`}
                >
                  {importPreview.valid ? (
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-emerald-200">
                        <Check className="w-4 h-4 text-emerald-400" />
                        Valid Backup Payload Ready for Restoration
                      </div>
                      <div className="text-[11px] text-slate-300">
                        Contains {importPreview.songs.length} songs, {importPreview.setlists.length} setlists, and {importPreview.folders.length} folders.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-red-200">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        Invalid Payload Rejected
                      </div>
                      <div className="text-[11px] text-red-300">{importPreview.error}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!importPreview?.valid || isImporting}
                  onClick={handleExecuteImport}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isImporting ? 'Restoring Library...' : 'Restore Library'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
