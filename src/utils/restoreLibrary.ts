import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import { openRevampDB, closeRevampDB, STORES } from './storage'
import { validateBackupInput, MAX_BACKUP_BYTES } from './backupValidation'
import { captureSettings, planSettings, writeSettings, RESTORE_LOCK } from './restoreSettings'
import { SETTINGS_CHANGED, type BackupSettings } from './backupSettings'
import { normalizeTags } from './tags'

export interface LibraryImage { songs: SongEntity[]; setlists: WebSetlist[]; folders: SetlistFolder[] }
export type RestoreMode = 'MERGE' | 'REPLACE'
const stores = [STORES.SONGS, STORES.SETLISTS, STORES.FOLDERS] as const
const collections = ['songs', 'setlists', 'folders'] as const
function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, stable(value[k])]))
  return value
}
export const recordDigest = (value: unknown) => JSON.stringify(stable(value))
export function libraryDigest(image: LibraryImage): string {
  return recordDigest({
    songs: image.songs.map(s => ({ ...s, tags: normalizeTags(s.tags) })).sort((a, b) => a.id.localeCompare(b.id)),
    setlists: image.setlists.map(sl => ({ ...sl, folderId: sl.folderId ?? null })).sort((a, b) => a.id.localeCompare(b.id)),
    folders: [...image.folders].sort((a, b) => a.id.localeCompare(b.id)),
  })
}
function readImage(tx: IDBTransaction, ready: (image: LibraryImage) => void) {
  const image: LibraryImage = { songs: [], setlists: [], folders: [] }
  let remaining = stores.length
  stores.forEach((name, i) => {
    const request = tx.objectStore(name).getAll()
    request.onsuccess = () => {
      Object.assign(image, { [collections[i]]: request.result })
      if (!--remaining) ready(image)
    }
  })
}
export function planLibraryRestore(current: LibraryImage, incoming: LibraryImage, mode: RestoreMode): LibraryImage {
  if (mode !== 'MERGE' && mode !== 'REPLACE') throw new Error('Choose Merge or Replace explicitly')
  validateBackupInput(incoming)
  if (mode === 'REPLACE') return structuredClone(incoming)
  const result = structuredClone(current)
  for (const key of collections) {
    const target = result[key] as Array<{ id: string }>
    const byID = new Map(target.map(r => [r.id, r]))
    for (const item of incoming[key]) {
      const existing = byID.get(item.id)
      if (existing && recordDigest(existing) !== recordDigest(item)) throw new Error(`Merge conflict: ${key} ID ${item.id}. Local data kept. Use Replace only if you intend to discard the local library.`)
      if (!existing) target.push(structuredClone(item))
    }
  }
  validateBackupInput(result)
  if (recordDigest(result).length > MAX_BACKUP_BYTES) throw new Error('Merged library exceeds restore size limit')
  return result
}

/** Journal settings before touching localStorage; delete journal WITH library commit.
 * All library writes and verification reads share one readwrite transaction.
 * A failed verification aborts before commit, preserving the entire original library.
 */
export async function restoreLibrary(incoming: LibraryImage, mode: RestoreMode, expected: LibraryImage, settings?: BackupSettings): Promise<LibraryImage> {
  incoming = structuredClone(incoming)
  validateBackupInput(incoming)
  if (recordDigest(incoming).length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds restore size limit')
  const db = await openRevampDB()
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Safe restore requires browser Web Locks support')
  return navigator.locks.request(RESTORE_LOCK, () => commitRestore(db, incoming, mode, expected, settings))
}

async function commitRestore(db: IDBDatabase, incoming: LibraryImage, mode: RestoreMode, expected: LibraryImage, settings?: BackupSettings): Promise<LibraryImage> {
  const expectedDigest = libraryDigest(expected)
  const settingsBefore = captureSettings()
  const settingsAfter = planSettings(settingsBefore, settings)
  // Persist a bounded recovery record before any nontransactional settings change.
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...stores, STORES.RESTORE], 'readwrite', { durability: 'strict' })
    let failure: unknown
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Could not create restore journal'))
    try {
      const journal = tx.objectStore(STORES.RESTORE)
      const request = journal.get('pending-restore')
      request.onsuccess = () => {
        try {
          if (request.result) throw new Error('Another restore requires recovery; reload before restoring')
          readImage(tx, before => {
            try {
              if (libraryDigest(before) !== expectedDigest) throw new Error('Library changed since preview. Reopen backup preview.')
              planLibraryRestore(before, incoming, mode)
              journal.add({ id: 'pending-restore', settingsBefore, settingsAfter })
            } catch (err) { failure = err; tx.abort() }
          })
        } catch (err) { failure = err; tx.abort() }
      }
    } catch (err) { failure = err; tx.abort() }
  })
  let output: LibraryImage | undefined
  let changedSettings = false
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...stores, STORES.RESTORE], 'readwrite', { durability: 'strict' })
      let failure: unknown
      const abort = (error: unknown) => { failure = error; tx.abort() }
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Restore transaction aborted; local data kept'))
      try {
        readImage(tx, before => {
          try {
            if (libraryDigest(before) !== expectedDigest) throw new Error('Library changed since preview. Reopen backup preview.')
            output = planLibraryRestore(before, incoming, mode)
            stores.forEach((name, i) => {
              const store = tx.objectStore(name)
              if (mode === 'REPLACE') store.clear()
              for (const record of output![collections[i]]) store.put(record)
            })
            readImage(tx, verified => {
              try {
                if (libraryDigest(verified) !== libraryDigest(output!)) throw new Error('Restore readback mismatch')
                if (recordDigest(captureSettings()) !== recordDigest(settingsBefore)) throw new Error('Settings changed since preview; retry restore')
                changedSettings = true
                writeSettings(settingsAfter)
                tx.objectStore(STORES.RESTORE).delete('pending-restore')
                output = verified
              } catch (err) { abort(err) }
            })
          } catch (err) { abort(err) }
        })
      } catch (err) { abort(err) }
    })
  } catch (error) {
    // Recovery failure leaves the durable journal intact and blocks further access
    // until startup recovery succeeds; no success or UI state is published.
    try {
      if (changedSettings) writeSettings(settingsBefore)
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.RESTORE, 'readwrite', { durability: 'strict' })
        tx.oncomplete = () => resolve()
        tx.onabort = tx.onerror = () => reject(tx.error)
        tx.objectStore(STORES.RESTORE).delete('pending-restore')
      })
    } catch { closeRevampDB(); throw new Error('Restore aborted. Settings recovery is pending; reload before editing.') }
    throw error
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SETTINGS_CHANGED))
  return output!
}
