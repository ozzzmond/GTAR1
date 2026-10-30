import React, { useMemo, useState } from 'react'
import {
  recoverLastRestore,
  acknowledgeUnverifiedRestore,
  planRecoveryImage,
  type RecoveryPlan,
  type RecoveryChoice,
  type RestoreResult,
} from '../utils/restoreLibrary'
import { createBackupPayload } from '../utils/jsonBackup'
import { AlertTriangle, Download, History, X } from 'lucide-react'

export interface LibraryRecoveryModalProps {
  plan: RecoveryPlan
  /** Present when the last restore committed but could not be verified. */
  reason?: string
  onRecovered: (result: RestoreResult) => void
  onReload: () => Promise<void>
  onClose: () => void
}

const changeText = { EDITED: 'edited after restore', ADDED: 'added after restore', DELETED: 'deleted after restore' } as const

export const LibraryRecoveryModal: React.FC<LibraryRecoveryModalProps> = ({ plan, reason, onRecovered, onReload, onClose }) => {
  const [choices, setChoices] = useState<Record<string, RecoveryChoice>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const unverified = !plan.marker.verified && !plan.marker.acknowledged
  const preview = useMemo(() => {
    try { return planRecoveryImage(plan.snapshot, plan.marker, plan.current, plan.currentSettings, choices) } catch { return null }
  }, [plan, choices])

  const exportCurrent = () => {
    try {
      const payload = createBackupPayload(plan.current.songs, plan.current.setlists, plan.current.folders)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gtar1-before-recovery-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setNotice('Exported the current library.')
    } catch (err) { setError(`Export failed: ${(err as Error).message}`) }
  }

  const recover = async () => {
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await recoverLastRestore(plan, choices)
      onRecovered(result)
      if (result.status === 'COMMITTED_VERIFIED') {
        alert('Library recovered and verified. This recovery can itself be undone from Backup & Restore.')
        onClose()
      } else {
        setError(`Recovery was saved but could not be verified (${result.reason || 'readback failed'}). Review again before editing.`)
        await onReload()
      }
    } catch (err) {
      setError(`Recovery not applied; your library was not changed. ${(err as Error).message}`)
    } finally { setBusy(false) }
  }

  const keepCurrent = async () => {
    setBusy(true); setError(null)
    try {
      if (unverified) await acknowledgeUnverifiedRestore(plan.marker.planId)
      onClose()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="library-recovery-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-app-surface border border-status-warning/60 rounded-2xl max-w-xl w-full p-6 text-app-text shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-4 border-b border-app-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-status-warning/20 text-status-warning"><History className="w-5 h-5" /></div>
            <h2 id="library-recovery-title" className="text-lg font-bold text-app-heading">Library Recovery</h2>
          </div>
          {!busy && !unverified && (
            <button type="button" aria-label="Close recovery" onClick={onClose} className="p-1.5 rounded-lg text-app-muted hover:text-app-heading"><X className="w-4 h-4" /></button>
          )}
        </div>
        <div className="py-4 space-y-3 overflow-y-auto text-xs">
          {unverified && (
            <div role="alert" className="p-3 rounded-xl border border-status-warning/50 bg-status-warning/10 text-status-warning flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>The last restore was saved but could not be verified{reason ? ` (${reason})` : ''}. Your library from before that restore is kept as a recovery snapshot.</span>
            </div>
          )}
          <p className="text-app-muted">
            Snapshot taken {new Date(plan.snapshot.createdAt).toLocaleString()}. Undoing the restore returns {preview?.revertCount ?? plan.revertCount} changed item(s) to their earlier state.
            {plan.conflicts.length > 0 ? ' Items you changed after the restore are listed below and stay as they are now unless you choose otherwise.' : ' Nothing was edited after the restore.'}
            {preview && preview.keptForReferences > 0 ? ` ${preview.keptForReferences} item(s) are kept so setlists and folders stay valid.` : ''}
          </p>
          {plan.conflicts.length > 0 && (
            <ul aria-label="Changes made after the restore" className="space-y-1.5">
              {plan.conflicts.map(c => (
                <li key={c.key} className="p-2 rounded-lg border border-app-border bg-app-base flex items-center justify-between gap-2">
                  <span><span className="font-semibold text-app-heading">{c.label}</span> <span className="text-app-muted">({c.collection}, {changeText[c.change]})</span></span>
                  <select aria-label={`Recovery choice for ${c.label}`} disabled={busy} value={choices[c.key] ?? 'KEEP_CURRENT'}
                    onChange={e => setChoices(prev => ({ ...prev, [c.key]: e.target.value as RecoveryChoice }))}
                    className="bg-app-surface border border-app-border rounded-lg p-1 text-app-text">
                    <option value="KEEP_CURRENT">Keep current</option>
                    <option value="USE_PRE_RESTORE">Use pre-restore</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
          {notice && <p role="status" className="text-status-success">{notice}</p>}
          {error && <p role="alert" className="text-status-error">{error}</p>}
          {busy && <p role="status" className="text-app-muted">Keep this tab open until recovery finishes.</p>}
        </div>
        <div className="pt-4 border-t border-app-border flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={busy} onClick={exportCurrent} className="ui-button mr-auto px-3 py-1.5 rounded-xl bg-app-button text-app-button-text border border-app-border text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export current library
          </button>
          <button type="button" disabled={busy} onClick={keepCurrent} className="ui-button px-3 py-1.5 rounded-xl bg-app-button text-app-button-text border border-app-border text-xs font-semibold disabled:opacity-40">
            Keep current library
          </button>
          <button type="button" disabled={busy || !preview} onClick={recover} className="px-3 py-1.5 rounded-xl bg-app-action text-app-on-action text-xs font-semibold disabled:opacity-40">
            {busy ? 'Recovering…' : 'Undo restore'}
          </button>
        </div>
      </div>
    </div>
  )
}
