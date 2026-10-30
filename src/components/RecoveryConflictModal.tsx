import React, { useState } from 'react'
import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import {
  type PendingRestoreJournal,
  type SettingsConflictInfo,
  type RestoreConflictResolution,
  resolveRestoreConflict,
} from '../utils/restoreSettings'
import { openRevampDB, STORES } from '../utils/storage'
import { createBackupPayload } from '../utils/jsonBackup'
import { AlertTriangle, Download, CheckCircle, ShieldAlert, X } from 'lucide-react'

export interface RecoveryConflictModalProps {
  journal: PendingRestoreJournal
  conflicts: SettingsConflictInfo[]
  songs: SongEntity[]
  setlists: WebSetlist[]
  folders: SetlistFolder[]
  onResolved: () => void
  onDismiss?: () => void
}

export const RecoveryConflictModal: React.FC<RecoveryConflictModalProps> = ({
  journal,
  conflicts,
  songs,
  setlists,
  folders,
  onResolved,
  onDismiss,
}) => {
  const [selectedResolution, setSelectedResolution] = useState<RestoreConflictResolution>('KEEP_CURRENT')
  const [isApplying, setIsApplying] = useState(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleExportRecoverableData = () => {
    try {
      const payload = createBackupPayload(songs, setlists, folders)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `gtar1-recovery-rescue-${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportNotice(`Exported rescue backup (${songs.length} songs, ${setlists.length} setlists, ${folders.length} folders).`)
    } catch (err) {
      setActionError(`Export failed: ${(err as Error).message}`)
    }
  }

  const handleApplyResolution = async () => {
    setIsApplying(true)
    setActionError(null)
    try {
      const db = await openRevampDB()
      const currentSettings = Object.fromEntries(conflicts.map(c => [c.key, c.currentValue]));
      await resolveRestoreConflict(db, STORES.RESTORE, selectedResolution, currentSettings)
      onResolved()
    } catch (err) {
      setActionError((err as Error).message || 'Resolution failed')
      setIsApplying(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="bg-slate-900 border border-amber-600/60 rounded-2xl max-w-xl w-full p-6 text-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 id="recovery-conflict-title" className="text-lg font-bold text-amber-200">
                Interrupted Restore — Settings Conflict Review
              </h2>
              <p className="text-xs text-slate-400">
                An interrupted restore was detected. Your songs and setlists are safe, but settings changed while restoration was incomplete.
              </p>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label="Close recovery review"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl text-xs text-amber-300/90 leading-relaxed space-y-1">
            <div className="font-semibold text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              Non-destructive Protection Active
            </div>
            <p>
              Musician songs and setlists remain intact in IndexedDB. No newer settings have been overwritten. Review the differences below and choose how to resolve the recovery journal.
            </p>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-800/60 text-xs font-semibold text-slate-300 border-b border-slate-800">
              Conflicting Settings ({conflicts.length})
            </div>
            <div className="divide-y divide-slate-800/60 text-xs">
              {conflicts.map((c) => (
                <div key={c.key} className="p-3 space-y-1 bg-slate-900/60">
                  <div className="font-medium text-slate-200 capitalize">{c.label}</div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                    <div className="bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Active Current:</span>
                      <span className="text-emerald-400 font-mono break-all">{c.currentValue ?? 'null'}</span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Pre-restore State:</span>
                      <span className="text-slate-400 font-mono break-all">{c.beforeValue ?? 'null'}</span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Interrupted Incoming:</span>
                      <span className="text-amber-400 font-mono break-all">{c.incomingValue ?? 'null'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">Resolution Action:</label>
            <div className="space-y-2 text-xs">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-800/30 cursor-pointer">
                <input
                  type="radio"
                  name="resolution"
                  value="KEEP_CURRENT"
                  checked={selectedResolution === 'KEEP_CURRENT'}
                  onChange={() => setSelectedResolution('KEEP_CURRENT')}
                  className="mt-0.5 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <div className="font-semibold text-slate-200">Keep newer active settings (Recommended)</div>
                  <div className="text-[11px] text-slate-400">
                    Preserves your active settings, clears the interrupted restore journal, and continues with current data.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-800/30 cursor-pointer">
                <input
                  type="radio"
                  name="resolution"
                  value="RESTORE_PRE_RESTORE"
                  checked={selectedResolution === 'RESTORE_PRE_RESTORE'}
                  onChange={() => setSelectedResolution('RESTORE_PRE_RESTORE')}
                  className="mt-0.5 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <div className="font-semibold text-slate-200">Roll back to pre-restore baseline</div>
                  <div className="text-[11px] text-slate-400">
                    Restores appearance and stage settings as they were before the interrupted restore attempt.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-800/30 cursor-pointer">
                <input
                  type="radio"
                  name="resolution"
                  value="APPLY_BACKUP"
                  checked={selectedResolution === 'APPLY_BACKUP'}
                  onChange={() => setSelectedResolution('APPLY_BACKUP')}
                  className="mt-0.5 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <div className="font-semibold text-slate-200">Apply interrupted backup settings</div>
                  <div className="text-[11px] text-slate-400">
                    Applies incoming backup settings that were pending when the interruption happened.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {exportNotice && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              {exportNotice}
            </div>
          )}

          {actionError && (
            <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-xs text-red-300">
              {actionError}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleExportRecoverableData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Recoverable Library
          </button>

          <button
            type="button"
            onClick={handleApplyResolution}
            disabled={isApplying}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
          >
            {isApplying ? 'Applying...' : 'Apply Resolution & Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
