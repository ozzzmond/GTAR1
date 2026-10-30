import { recoverRestoreSettings } from './restoreSettings'
/**
 * GTAR1 — Isolated IndexedDB Local Storage
 * Database Namespace: 'gtar_revamp_local_v1'
 * 
 * INVARIANTS:
 * - NO legacy storage mutation (never touches legacy gtar_db, gtar-local-library, etc.)
 * - NO automatic account data migration
 * - Atomic local writes with transaction error handling
 * - Clean failure reporting for UI error states
 * - Blank initial songbook, setlist library, and folder tree on clean install
 * - Forward-only schema migration preserving existing records and stable IDs
 */

import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import { normalizeTags } from './tags'
import { generateUUID } from './uuid'

export const DB_NAME = 'gtar_revamp_local_v1'
export const DB_VERSION = 3
export const STORES = {
  SONGS: 'songs',
  SETLISTS: 'setlists',
  FOLDERS: 'folders',
  RESTORE: 'restoreJournal',
} as const

let opening: Promise<IDBDatabase> | null = null
let dbInstance: IDBDatabase | null = null

export function openRevampDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance)
  }

  if (opening) return opening
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion

      if (!db.objectStoreNames.contains(STORES.RESTORE)) db.createObjectStore(STORES.RESTORE, { keyPath: 'id' })

      // Version 1 stores: songs, setlists
      if (!db.objectStoreNames.contains(STORES.SONGS)) {
        db.createObjectStore(STORES.SONGS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.SETLISTS)) {
        db.createObjectStore(STORES.SETLISTS, { keyPath: 'id' })
      }

      // Version 2 addition: folders store
      if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
        db.createObjectStore(STORES.FOLDERS, { keyPath: 'id' })
      }

      // Schema migration: if upgrading from v1 or earlier, ensure data normalization
      // IndexedDB upgrade transaction automatically has access to existing object stores
      const tx = (event.target as IDBOpenDBRequest).transaction
      if (tx && oldVersion < 3) {
        // Upgrade existing songs: ensure tags array exists
        try {
          const songStore = tx.objectStore(STORES.SONGS)
          const getAllSongsReq = songStore.getAll()
          getAllSongsReq.onsuccess = () => {
            const songs = getAllSongsReq.result as SongEntity[] | undefined
            if (Array.isArray(songs)) {
              for (const s of songs) {
                let modified = false
                if (!Array.isArray(s.tags)) {
                  s.tags = normalizeTags(s.tags)
                  modified = true
                }
                if (modified) {
                  songStore.put(s)
                }
              }
            }
          }
        } catch (_) {
          // Ignore if store not available yet in mock/synthetic runs
        }

        // Upgrade existing setlists: ensure folderId and entryId on song references
        try {
          const setlistStore = tx.objectStore(STORES.SETLISTS)
          const getAllSetlistsReq = setlistStore.getAll()
          getAllSetlistsReq.onsuccess = () => {
            const setlists = getAllSetlistsReq.result as WebSetlist[] | undefined
            if (Array.isArray(setlists)) {
              for (const sl of setlists) {
                let modified = false
                if (sl.folderId === undefined) {
                  sl.folderId = null
                  modified = true
                }
                if (Array.isArray(sl.songs)) {
                  for (let i = 0; i < sl.songs.length; i++) {
                    const ref = sl.songs[i]
                    if (!ref.entryId) {
                      ref.entryId = generateUUID()
                      modified = true
                    }
                    if (typeof ref.position !== 'number') {
                      ref.position = i
                      modified = true
                    }
                  }
                }
                if (modified) {
                  setlistStore.put(sl)
                }
              }
            }
          }
        } catch (_) {
          // Ignore if store not available yet
        }
      }
    }

    request.onsuccess = () => {
      const db = request.result
      recoverRestoreSettings(db, STORES.RESTORE).then(() => {
        dbInstance = db
        db.onclose = () => { dbInstance = null }
        db.onversionchange = () => { db.close(); dbInstance = null }
        resolve(db)
      }, error => { db.close(); reject(error) })
    }

    request.onerror = () => {
      reject(request.error || new Error('Failed to open GTAR1 IndexedDB'))
    }
  })
  return opening.finally(() => { opening = null })
}

export const openGtar1DB = openRevampDB

/**
 * Loads all songs from the isolated IndexedDB namespace.
 * Normalizes tags field so it's always string[].
 */
export async function loadAllSongs(): Promise<SongEntity[]> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SONGS, 'readonly')
      const store = tx.objectStore(STORES.SONGS)
      const request = store.getAll()

      request.onsuccess = () => {
        const rawSongs = (request.result || []) as SongEntity[]
        const normalized = rawSongs.map((s) => ({
          ...s,
          tags: normalizeTags(s.tags),
        }))
        resolve(normalized)
      }

      request.onerror = () => {
        reject(request.error || new Error('Failed to load songs from storage'))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Loads all setlists from the isolated IndexedDB namespace.
 * Ensures each song reference has an entryId and folderId defaults to null if unfiled.
 */
export async function loadAllSetlists(): Promise<WebSetlist[]> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SETLISTS, 'readonly')
      const store = tx.objectStore(STORES.SETLISTS)
      const request = store.getAll()

      request.onsuccess = () => {
        const rawList = (request.result || []) as WebSetlist[]
        const normalized = rawList.map((sl) => ({
          ...sl,
          folderId: sl.folderId ?? null,
          songs: Array.isArray(sl.songs)
            ? sl.songs.map((ref, idx) => ({
                ...ref,
                entryId: ref.entryId || generateUUID(),
                position: typeof ref.position === 'number' ? ref.position : idx,
              }))
            : [],
        }))
        resolve(normalized)
      }

      request.onerror = () => {
        reject(request.error || new Error('Failed to load setlists from storage'))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Loads all setlist folders from the isolated IndexedDB namespace.
 */
export async function loadAllFolders(): Promise<SetlistFolder[]> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
        resolve([])
        return
      }
      const tx = db.transaction(STORES.FOLDERS, 'readonly')
      const store = tx.objectStore(STORES.FOLDERS)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
      }

      request.onerror = () => {
        reject(request.error || new Error('Failed to load folders from storage'))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Atomically saves a single song to local storage.
 */
export async function saveSong(song: SongEntity): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SONGS, 'readwrite')
      const store = tx.objectStore(STORES.SONGS)
      const toSave: SongEntity = {
        ...song,
        tags: normalizeTags(song.tags),
      }
      const request = store.put(toSave)

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error(`Failed to save song ${song.id} (${song.title})`))
      }

      tx.onabort = () => {
        reject(new Error(`Transaction aborted while saving song ${song.id}`))
      }

      request.onerror = () => {
        reject(request.error || new Error(`Request error while saving song ${song.id}`))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Deletes a song by ID from local storage.
 * Does not mutate setlists here; setlists retain references or handle them explicitly.
 */
export async function deleteSong(id: string): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SONGS, 'readwrite')
      const store = tx.objectStore(STORES.SONGS)
      store.delete(id)

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error(`Failed to delete song ${id}`))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Atomically saves a single setlist.
 */
export async function saveSetlist(setlist: WebSetlist): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SETLISTS, 'readwrite')
      const store = tx.objectStore(STORES.SETLISTS)
      const toSave: WebSetlist = {
        ...setlist,
        folderId: setlist.folderId ?? null,
        songs: setlist.songs.map((ref, idx) => ({
          ...ref,
          entryId: ref.entryId || generateUUID(),
          position: typeof ref.position === 'number' ? ref.position : idx,
        })),
      }
      store.put(toSave)

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error(`Failed to save setlist ${setlist.id}`))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Deletes a setlist by ID.
 */
export async function deleteSetlist(id: string): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SETLISTS, 'readwrite')
      const store = tx.objectStore(STORES.SETLISTS)
      store.delete(id)

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error(`Failed to delete setlist ${id}`))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Atomically saves a single setlist folder.
 */
export async function saveFolder(folder: SetlistFolder): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.FOLDERS, 'readwrite')
      const store = tx.objectStore(STORES.FOLDERS)
      store.put(folder)

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error(`Failed to save folder ${folder.id}`))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Deletes a setlist folder by ID.
 */
export async function deleteFolder(id: string): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.FOLDERS, 'readwrite')
      const store = tx.objectStore(STORES.FOLDERS)
      store.delete(id)

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error(`Failed to delete folder ${id}`))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Saves multiple songs in a single atomic transaction.
 */
export async function saveAllSongs(songs: SongEntity[]): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SONGS, 'readwrite')
      const store = tx.objectStore(STORES.SONGS)
      for (const song of songs) {
        store.put({
          ...song,
          tags: normalizeTags(song.tags),
        })
      }

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error('Failed to bulk save songs'))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Saves multiple setlists in a single atomic transaction.
 */
export async function saveAllSetlists(setlists: WebSetlist[]): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SETLISTS, 'readwrite')
      const store = tx.objectStore(STORES.SETLISTS)
      for (const setlist of setlists) {
        store.put({
          ...setlist,
          folderId: setlist.folderId ?? null,
          songs: setlist.songs.map((ref, idx) => ({
            ...ref,
            entryId: ref.entryId || generateUUID(),
            position: typeof ref.position === 'number' ? ref.position : idx,
          })),
        })
      }

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error('Failed to bulk save setlists'))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Saves multiple folders in a single atomic transaction.
 */
export async function saveAllFolders(folders: SetlistFolder[]): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.FOLDERS, 'readwrite')
      const store = tx.objectStore(STORES.FOLDERS)
      for (const folder of folders) {
        store.put(folder)
      }

      tx.oncomplete = () => {
        resolve()
      }

      tx.onerror = () => {
        reject(tx.error || new Error('Failed to bulk save folders'))
      }
    } catch (err) {
      reject(err)
    }
  })
}

export function closeRevampDB(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

export const closeGtar1DB = closeRevampDB
