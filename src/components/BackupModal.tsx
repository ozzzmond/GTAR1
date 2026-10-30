import { planLibraryRestore, readLibraryImage, getLastRestoreInfo, type RestoreMode, type LibraryImage, type RestoreResult, type LastRestoreInfo } from '../utils/restoreLibrary'
import { MAX_BACKUP_BYTES } from '../utils/backupValidation'
import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import { createBackupPayload, parseBackupJson } from '../utils/jsonBackup'
import { type BackupSettings } from '../utils/backupSettings'
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
    importedFolders: SetlistFolder[],
    mode: RestoreMode, expected: LibraryImage, settings?: BackupSettings
  ) => Promise<RestoreResult>
  onOpenRecovery?: () => Promise<void>
  onClose: () => void
}

export const BackupModal: React.FC<BackupModalProps> = ({
  songs,
  setlists,
  folders,
  onImport,
  onOpenRecovery,
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
    themeSettings?: BackupSettings
    error?: string
  } | null>(null)
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('MERGE')
  // Preview baseline is the authoritative IndexedDB image, never UI state.
  const [previewBaseline, setPreviewBaseline] = useState<LibraryImage | null>(null)
  const [baselineError, setBaselineError] = useState('')
  const baselineRequest = useRef(0)
  const [lastRestore, setLastRestore] = useState<LastRestoreInfo | null>(null)
  useEffect(() => {
    let live = true
    getLastRestoreInfo().then(info => { if (live) setLastRestore(info) }, () => {})
    return () => { live = false }
  }, [])
  const [partialImport, setPartialImport] = useState(false)
  const [isImporting, setIsImporting] = useState<boolean>(false)

  const backupJsonString = useMemo(() => {
    try {
      return JSON.stringify(createBackupPayload(songs, setlists, folders), null, 2)
    } catch (err) {
      console.warn('Isolating corrupt backup settings during export:', err)
      return JSON.stringify({
        app: 'GTAR1',
        schemaVersion: 1,
        version: '0.1.0-dev',
        exportedAt: new Date().toISOString(),
        songs,
        setlists,
        folders,
      }, null, 2)
    }
  }, [songs, setlists, folders])

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

    if (file.size > MAX_BACKUP_BYTES) {
      setImportPreview({ valid: false, songs: [], setlists: [], folders: [], error: 'Backup exceeds 20 MiB limit' })
      return
    }
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
    const request = ++baselineRequest.current
    setPreviewBaseline(null)
    setBaselineError('')
    readLibraryImage().then(
      image => { if (request === baselineRequest.current) setPreviewBaseline(image) },
      error => { if (request === baselineRequest.current) setBaselineError(`Could not read the local library: ${(error as Error)?.message || 'unknown error'}`) },
    )
    setPartialImport(!!result.partial)
    if (result.isValid) {
      setImportPreview({
        valid: true,
        songs: result.songs,
        setlists: result.setlists,
        folders: result.folders || [],
        themeSettings: result.themeSettings,
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
    if (!importPreview || !importPreview.valid || !previewBaseline) return

    setIsImporting(true)
    try {
      if (partialImport && restoreMode === 'REPLACE') throw new Error('Song-only imports support Merge only. Use a complete backup for Replace.')
      if (restoreMode === 'REPLACE' && !window.confirm(`Replace the entire local library (${previewBaseline.songs.length} songs, ${previewBaseline.setlists.length} setlists, ${previewBaseline.folders.length} folders) with this backup? Local records absent from the backup will be removed. The current library is kept as a recovery snapshot for Undo.`)) return
      const result = await onImport(importPreview.songs, importPreview.setlists, importPreview.folders, restoreMode, previewBaseline, importPreview.themeSettings)
      if (result.status === 'COMMITTED_VERIFIED') {
        alert(`Successfully restored and verified: ${result.image.songs.length} songs, ${result.image.setlists.length} setlists, and ${result.image.folders.length} folders. Your previous library is kept for Undo last restore.`)
      } else {
        alert(`Restore was saved but could not be verified (${result.reason || 'readback failed'}). Your previous library is kept as a recovery snapshot — review it in Library Recovery.`)
      }
      onClose()
    } catch (err: any) {
      alert(`Import error: Restore not applied; your library was not changed. ${err?.message || 'Storage write failed'}`)
    } finally {
      setIsImporting(false)
    }
  }

  let planError = ''
  let planSummary = ''
  if (importPreview?.valid && baselineError) planError = baselineError
  else if (importPreview?.valid && previewBaseline) {
    try {
      if (partialImport && restoreMode === 'REPLACE') throw new Error('Song-only imports require Merge.')
      const planned = planLibraryRestore(previewBaseline, { songs: importPreview.songs, setlists: importPreview.setlists, folders: importPreview.folders }, restoreMode)
      const beforeCount = previewBaseline.songs.length + previewBaseline.setlists.length + previewBaseline.folders.length
      const incomingCount = importPreview.songs.length + importPreview.setlists.length + importPreview.folders.length
      const afterCount = planned.songs.length + planned.setlists.length + planned.folders.length
      planSummary = restoreMode === 'MERGE'
        ? `${afterCount - beforeCount} records added; ${incomingCount - (afterCount - beforeCount)} unchanged; 0 local records removed.`
        : `${beforeCount} local records replaced by ${afterCount} backup records.`
    } catch (error) { planError = (error as Error).message }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={() => { if (!isImporting) onClose() }}
    >
      <div
        className="bg-app-surface border border-app-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col text-app-text shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-app-border bg-app-base">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-app-action/20 text-app-action flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 id="backup-modal-title" className="text-base font-bold text-app-heading">
                Backup &amp; Restore
              </h2>
              <p className="text-[11px] text-app-muted">
                Honest local JSON library export and safe schema restoration
              </p>
            </div>
          </div>
          <button
            onClick={() => { if (!isImporting) onClose() }}
            aria-label="Close backup modal"
            className="p-1 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-app-border bg-app-base px-4 pt-2">
          <button
            type="button"
            onClick={() => setMode('EXPORT')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              mode === 'EXPORT'
                ? 'border-app-action text-app-action'
                : 'border-transparent text-app-muted hover:text-app-text'
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
                ? 'border-app-action text-app-action'
                : 'border-transparent text-app-muted hover:text-app-text'
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
              <div className="p-3 bg-app-base border border-app-border rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-status-success shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-app-heading">
                    Offline Canonical Library Snapshot
                  </div>
                  <p className="text-app-muted leading-relaxed text-[11px]">
                    This backup contains all {songs.length} master songs with full ChordPro formatting and multi-tags, {setlists.length} setlists with ordered shortcut references, and {folders.length} folder hierarchy definitions.
                  </p>
                </div>
              </div>

              <div className="relative">
                <textarea
                  readOnly
                  value={backupJsonString}
                  rows={10}
                  className="w-full bg-app-base border border-app-border rounded-xl p-3 font-mono text-[11px] text-app-text resize-none focus:outline-none focus:border-app-accent"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-app-muted">
                  {copyStatus && (
                    <span className="text-status-success font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      {copyStatus}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="ui-button px-3 py-1.5 rounded-xl bg-app-button hover:brightness-110 border border-app-border text-app-button-text text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-3.5 py-1.5 rounded-xl bg-app-action hover:brightness-110 text-app-on-action text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
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
              <div className="p-3 bg-app-base border border-app-border rounded-xl flex items-start gap-2.5 text-xs text-status-warning">
                <Info className="w-4 h-4 shrink-0 text-app-accent mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-app-heading">
                    Restore safety and scope
                  </div>
                  <p className="text-[11px] text-app-muted leading-relaxed">
                    Merge keeps local records and rejects conflicting IDs. Replace removes the local library and restores the backup exactly. The preview compares against the library saved on this device. Saving the current library as a recovery snapshot and writing the backup happen in one all-or-nothing step: if any part fails, nothing changes. Success is shown only after the saved library is read back and matches. Undo last restore returns the previous library and keeps records you edited afterwards unless you choose otherwise; only the most recent restore can be undone. Appearance and stage settings in the backup are restored with interruption recovery. The local profile is kept. Unsupported backup sections are rejected.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-heading mb-1.5">
                  Choose Backup File (.json)
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={isImporting}
                  onChange={handleFileSelect}
                  className="w-full text-xs text-app-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border file:border-app-border file:text-xs file:font-semibold file:bg-app-button file:text-app-button-text hover:file:brightness-110 file:cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-heading mb-1.5">
                  Or Paste Raw Backup JSON
                </label>
                <textarea
                  disabled={isImporting}
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
                  className="w-full bg-app-base border border-app-border rounded-xl p-3 font-mono text-[11px] text-app-text resize-none focus:outline-none focus:border-app-accent"
                />
              </div>

              {/* Validation Status & Summary */}
              {importPreview && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    importPreview.valid
                      ? 'bg-status-success/20 border-status-success/40 text-status-success'
                      : 'bg-status-error/20 border-status-error/40 text-status-error'
                  }`}
                >
                  {importPreview.valid ? (
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-app-heading">
                        <Check className="w-4 h-4 text-status-success" />
                        Valid Backup Payload Ready for Restoration
                      </div>
                      <div className="text-[11px] text-app-muted">
                        Contains {importPreview.songs.length} songs, {importPreview.setlists.length} setlists, and {importPreview.folders.length} folders.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-status-error">
                        <AlertTriangle className="w-4 h-4 text-status-error" />
                        Invalid Payload Rejected
                      </div>
                      <div className="text-[11px] text-status-error">{importPreview.error}</div>
                    </div>
                  )}
                </div>
              )}

              <label className="block text-xs font-semibold text-app-heading">
                Restore behavior
                <select aria-label="Restore behavior" value={restoreMode} disabled={isImporting} onChange={e => setRestoreMode(e.target.value as RestoreMode)} className="block w-full bg-app-base border border-app-border text-app-text rounded-xl p-2 mt-1 focus:outline-none focus:border-app-accent">
                  <option value="MERGE">Merge — keep local records; reject conflicting IDs</option>
                  <option value="REPLACE">Replace — remove local library, restore this backup</option>
                </select>
              </label>
              {planSummary && <p className="text-xs text-app-muted">{planSummary}</p>}
              {planError && <p role="alert" className="text-xs text-status-error">{planError}</p>}
              <div className="flex items-center justify-end gap-2 pt-2">
                {lastRestore && onOpenRecovery && (
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => { onOpenRecovery().catch(error => alert((error as Error).message)) }}
                    className="ui-button mr-auto px-3.5 py-1.5 rounded-xl bg-app-button hover:brightness-110 disabled:opacity-40 text-app-button-text border border-app-border text-xs font-semibold transition-colors"
                  >
                    Undo last restore…
                  </button>
                )}
                {isImporting && <span role="status" className="text-[11px] text-app-muted">Keep this tab open until restore finishes.</span>}
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => { if (!isImporting) onClose() }}
                  className="ui-button px-3.5 py-1.5 rounded-xl bg-app-button hover:brightness-110 disabled:opacity-40 text-app-button-text border border-app-border text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!importPreview?.valid || !previewBaseline || !!planError || isImporting}
                  onClick={handleExecuteImport}
                  className="px-4 py-1.5 rounded-xl bg-app-action hover:brightness-110 disabled:opacity-40 text-app-on-action text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
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
