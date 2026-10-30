import { SETTINGS_KEYS, STANDALONE_PALETTE_KEY, restoreBackupSettings, type BackupSettings } from './backupSettings'

export type SettingsImage = Record<string, string | null>
export const RESTORE_LOCK = 'gtar1-library-restore'
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
    const request = store.get('pending-restore')
    request.onsuccess = () => {
      if (!request.result) return
      try {
        if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Restore recovery requires browser Web Locks support')
        const current = captureSettings()
        for (const key of keys) {
          if (current[key] !== request.result.settingsBefore[key] && current[key] !== request.result.settingsAfter[key]) throw new Error('Settings changed after interruption; recovery requires conflict review')
        }
        writeSettings(request.result.settingsBefore)
        store.delete('pending-restore')
      } catch (err) { failure = err; tx.abort() }
    }
  })
}
