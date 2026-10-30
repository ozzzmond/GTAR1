import { SETTINGS_KEYS, STANDALONE_PALETTE_KEY, restoreBackupSettings, type BackupSettings } from './backupSettings'

export type SettingsImage = Record<string, string | null>
export const RESTORE_LOCK = 'gtar1-library-restore'
export const RESTORE_JOURNAL_KEY = 'pending-restore'

export interface PendingRestoreJournal {
  id: string
  settingsBefore: SettingsImage
  settingsAfter: SettingsImage
  conflictExplanation?: string
  detectedAt?: number
}

export interface SettingsConflictInfo {
  key: string
  label: string
  beforeValue: string | null
  incomingValue: string | null
  currentValue: string | null
}

const keys = [...Object.values(SETTINGS_KEYS), STANDALONE_PALETTE_KEY]

export function captureSettings(): SettingsImage {
  return Object.fromEntries(keys.map(key => [key, typeof localStorage === 'undefined' ? null : localStorage.getItem(key)]))
}

export function planSettings(before: SettingsImage, settings?: BackupSettings): SettingsImage {
  const after = { ...before }
  if (settings) restoreBackupSettings(settings, {
    getItem: key => after[key] ?? null,
    setItem: (key, value) => { after[key] = value },
  }, false)
  return after
}

export function writeSettings(image: SettingsImage) {
  if (typeof localStorage === 'undefined') {
    if (Object.values(image).some(v => v !== null)) throw new Error('Settings storage unavailable')
    return
  }
  for (const key of keys) {
    if (localStorage.getItem(key) === image[key]) continue
    if (image[key] === null) localStorage.removeItem(key)
    else localStorage.setItem(key, image[key])
  }
  if (JSON.stringify(captureSettings()) !== JSON.stringify(image)) throw new Error('Settings readback failed')
}

export function getPendingRestoreJournal(db: IDBDatabase, storeName: string): Promise<PendingRestoreJournal | null> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(RESTORE_JOURNAL_KEY)
      request.onsuccess = () => resolve((request.result as PendingRestoreJournal) || null)
      request.onerror = () => reject(request.error || new Error('Failed to read restore journal'))
    } catch (err) {
      reject(err)
    }
  })
}

export function inspectSettingsConflicts(journal: PendingRestoreJournal, currentSettings: SettingsImage): SettingsConflictInfo[] {
  const conflicts: SettingsConflictInfo[] = []
  for (const key of keys) {
    const curr = currentSettings[key] ?? null
    const before = journal.settingsBefore[key] ?? null
    const incoming = journal.settingsAfter[key] ?? null
    if (curr !== before && curr !== incoming) {
      conflicts.push({
        key,
        label: key.replace(/^gtar_/, '').replace(/_/g, ' '),
        beforeValue: before,
        incomingValue: incoming,
        currentValue: curr,
      })
    }
  }
  return conflicts
}

export type RestoreConflictResolution = 'KEEP_CURRENT' | 'RESTORE_PRE_RESTORE' | 'APPLY_BACKUP'

export async function resolveRestoreConflict(
  db: IDBDatabase,
  storeName: string,
  resolution: RestoreConflictResolution
): Promise<void> {
  const execute = () => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite', { durability: 'strict' })
    let failure: unknown
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Failed to resolve restore conflict'))
    const store = tx.objectStore(storeName)
    const request = store.get(RESTORE_JOURNAL_KEY)
    request.onsuccess = () => {
      const journal = request.result as PendingRestoreJournal | undefined
      if (!journal) {
        resolve()
        return
      }
      try {
        if (resolution === 'RESTORE_PRE_RESTORE') {
          writeSettings(journal.settingsBefore)
        } else if (resolution === 'APPLY_BACKUP') {
          writeSettings(journal.settingsAfter)
        } else if (resolution === 'KEEP_CURRENT') {
          // Intentionally keep current localStorage settings intact without modification
        }
        store.delete(RESTORE_JOURNAL_KEY)
      } catch (err) {
        failure = err
        tx.abort()
      }
    }
    request.onerror = () => {
      failure = request.error
      tx.abort()
    }
  })

  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(RESTORE_LOCK, execute)
  }
  return execute()
}

// A journal exists only while the library transaction is uncommitted. Its deletion
// commits with all library stores, so a surviving journal always means rollback.
export function recoverRestoreSettings(db: IDBDatabase, storeName: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(RESTORE_LOCK, () => recover(db, storeName))
  return recover(db, storeName)
}

function recover(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite', { durability: 'strict' })
    let failure: unknown
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Restore recovery failed; local library remains locked'))
    const store = tx.objectStore(storeName)
    const request = store.get(RESTORE_JOURNAL_KEY)
    request.onsuccess = () => {
      if (!request.result) return
      try {
        if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Restore recovery requires browser Web Locks support')
        const current = captureSettings()
        const conflicts = inspectSettingsConflicts(request.result, current)
        if (conflicts.length > 0) {
          // Preserve newer settings and retain journal record in IndexedDB without deletion.
          // Do not overwrite current settings. The database opens successfully so the user
          // can access recovery conflict review and export data safely.
          return
        }
        writeSettings(request.result.settingsBefore)
        store.delete(RESTORE_JOURNAL_KEY)
      } catch (err) { failure = err; tx.abort() }
    }
  })
}
