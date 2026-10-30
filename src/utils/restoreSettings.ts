import { SETTINGS_KEYS, STANDALONE_PALETTE_KEY, SETTINGS_CHANGED, restoreBackupSettings, type BackupSettings } from './backupSettings'

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
  const execute = async () => {
    // 1. Snapshot current settings before resolution
    const currentBefore = captureSettings()

    // 2. Fetch journal and compute target settings to apply
    let journal: PendingRestoreJournal | null = null
    let targetSettings: SettingsImage | null = null

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const req = store.get(RESTORE_JOURNAL_KEY)
        req.onsuccess = () => {
          journal = (req.result as PendingRestoreJournal) || null
          resolve()
        }
        req.onerror = () => reject(req.error || new Error('Failed to read restore journal for conflict resolution'))
      } catch (err) {
        reject(err)
      }
    })

    if (!journal) return
    const activeJournal: PendingRestoreJournal = journal

    if (resolution === 'RESTORE_PRE_RESTORE') {
      targetSettings = activeJournal.settingsBefore
    } else if (resolution === 'APPLY_BACKUP') {
      targetSettings = activeJournal.settingsAfter
    } else if (resolution === 'KEEP_CURRENT') {
      targetSettings = currentBefore
    }

    // 3. Atomically remove the journal record from IndexedDB first.
    // If this transaction fails or aborts, nothing in localStorage is modified.
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite', { durability: 'strict' })
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Failed to commit journal resolution'))
      const store = tx.objectStore(storeName)
      store.delete(RESTORE_JOURNAL_KEY)
    })

    // 4. Transaction committed successfully: now apply chosen settings with rollback guard if write/readback fails
    if (targetSettings && resolution !== 'KEEP_CURRENT') {
      try {
        writeSettings(targetSettings)
      } catch (err) {
        // Roll back localStorage to pre-resolution snapshot
        try { writeSettings(currentBefore) } catch {}
        // Restore journal in IDB so recovery evidence is not lost
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite', { durability: 'strict' })
            tx.oncomplete = () => resolve()
            tx.onabort = tx.onerror = () => reject(tx.error)
            tx.objectStore(storeName).put(journal!)
          })
        } catch {}
        throw err
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SETTINGS_CHANGED))
    }
  }

  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(RESTORE_LOCK, execute)
  }
  return execute()
}

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
