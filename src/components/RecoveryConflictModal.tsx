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
      <div className="bg-app-surface border border-status-warning/60 rounded-2xl max-w-xl w-full p-6 text-app-text shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-4 border-b border-app-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-status-warning/20 text-status-warning">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 id="recovery-conflict-title" className="text-lg font-bold text-app-heading">
                Interrupted Restore — Settings Conflict Review
              </h2>
              <p className="text-xs text-app-muted">
                An interrupted restore was detected. Your songs and setlists are safe, but settings changed while restoration was incomplete.
              </p>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label="Close recovery review"
              className="p-1 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-base"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <div className="p-3 bg-app-base border border-status-warning/40 rounded-xl text-xs text-status-warning leading-relaxed space-y-1">
            <div className="font-semibold text-app-heading flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />
              Non-destructive Protection Active
            </div>
            <p className="text-app-muted">
              Musician songs and setlists remain intact in IndexedDB. No newer settings have been overwritten. Review the differences below and choose how to resolve the recovery journal.
            </p>
          </div>

          <div className="border border-app-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-app-base text-xs font-semibold text-app-heading border-b border-app-border">
              Conflicting Settings ({conflicts.length})
            </div>
            <div className="divide-y divide-app-border/60 text-xs">
              {conflicts.map((c) => (
                <div key={c.key} className="p-3 space-y-1 bg-app-surface">
                  <div className="font-medium text-app-heading capitalize">{c.label}</div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                    <div className="bg-app-base p-2 rounded border border-app-border">
                      <span className="text-app-muted block text-[10px]">Active Current:</span>
                      <span className="text-status-success font-mono break-all">{c.currentValue ?? 'null'}</span>
                    </div>
                    <div className="bg-app-base p-2 rounded border border-app-border">
                      <span className="text-app-muted block text-[10px]">Pre-restore State:</span>
                      <span className="text-app-muted font-mono break-all">{c.beforeValue ?? 'null'}</span>
                    </div>
                    <div className="bg-app-base p-2 rounded border border-app-border">
                      <span className="text-app-muted block text-[10px]">Interrupted Incoming:</span>
                      <span className="text-status-warning font-mono break-all">{c.incomingValue ?? 'null'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-app-heading block">Resolution Action:</label>
            <div className="space-y-2 text-xs">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-app-border hover:border-app-accent bg-app-base cursor-pointer">
                <input
                  type="radio"
                  name="resolution"
                  value="KEEP_CURRENT"
                  checked={selectedResolution === 'KEEP_CURRENT'}
                  onChange={() => setSelectedResolution('KEEP_CURRENT')}
                  className="mt-0.5 text-app-accent focus:ring-app-accent"
                />
                <div>
                  <div className="font-semibold text-app-heading">Keep newer active settings (Recommended)</div>
                  <div className="text-[11px] text-app-muted">
                    Preserves your active settings, clears the interrupted restore journal, and continues with current data.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-app-border hover:border-app-accent bg-app-base cursor-pointer">
                <input
                  type="radio"
                  name="resolution"
                  value="RESTORE_PRE_RESTORE"
                  checked={selectedResolution === 'RESTORE_PRE_RESTORE'}
                  onChange={() => setSelectedResolution('RESTORE_PRE_RESTORE')}
                  className="mt-0.5 text-app-accent focus:ring-app-accent"
                />
                <div>
                  <div className="font-semibold text-app-heading">Roll back to pre-restore baseline</div>
                  <div className="text-[11px] text-app-muted">
                    Restores appearance and stage settings as they were before the interrupted restore attempt.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-app-border hover:border-app-accent bg-app-base cursor-pointer">
                <input
                  type="radio"
                  name="resolution"
                  value="APPLY_BACKUP"
                  checked={selectedResolution === 'APPLY_BACKUP'}
                  onChange={() => setSelectedResolution('APPLY_BACKUP')}
                  className="mt-0.5 text-app-accent focus:ring-app-accent"
                />
                <div>
                  <div className="font-semibold text-app-heading">Apply interrupted backup settings</div>
                  <div className="text-[11px] text-app-muted">
                    Applies incoming backup settings that were pending when the interruption happened.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {exportNotice && (
            <div className="p-3 bg-status-success/20 border border-status-success/40 rounded-xl text-xs text-status-success flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-status-success shrink-0" />
              {exportNotice}
            </div>
          )}

          {actionError && (
            <div className="p-3 bg-status-error/20 border border-status-error/40 rounded-xl text-xs text-status-error">
              {actionError}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-app-border flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleExportRecoverableData}
            className="ui-button flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-app-button hover:brightness-110 text-app-button-text border border-app-border transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Recoverable Library
          </button>

          <button
            type="button"
            onClick={handleApplyResolution}
            disabled={isApplying}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-app-action hover:brightness-110 text-app-on-action transition-colors disabled:opacity-50"
          >
            {isApplying ? 'Applying...' : 'Apply Resolution & Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
