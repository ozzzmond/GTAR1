/**
 * GTAR Revamp — Isolated IndexedDB Local Storage
 * Database Namespace: 'gtar_revamp_local_v1'
 * 
 * INVARIANTS:
 * - NO legacy storage mutation (never touches legacy gtar_db, gtar-local-library, etc.)
 * - NO automatic account data migration
 * - Atomic local writes with transaction error handling
 * - Clean failure reporting for UI error states
 * - Blank initial songbook and setlist library on clean install
 */

import type { SongEntity, WebSetlist } from '../types/gtar'

export const DB_NAME = 'gtar_revamp_local_v1'
export const DB_VERSION = 1
export const STORES = {
  SONGS: 'songs',
  SETLISTS: 'setlists',
} as const

let dbInstance: IDBDatabase | null = null

export function openRevampDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance)
  }

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORES.SONGS)) {
        db.createObjectStore(STORES.SONGS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.SETLISTS)) {
        db.createObjectStore(STORES.SETLISTS, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result
      dbInstance.onclose = () => {
        dbInstance = null
      }
      resolve(dbInstance)
    }

    request.onerror = () => {
      reject(request.error || new Error('Failed to open GTAR Revamp IndexedDB'))
    }
  })
}

/**
 * Loads all songs from the isolated IndexedDB namespace.
 * Returns an empty array on fresh installation (blank initial songbook).
 */
export async function loadAllSongs(): Promise<SongEntity[]> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SONGS, 'readonly')
      const store = tx.objectStore(STORES.SONGS)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
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
 */
export async function loadAllSetlists(): Promise<WebSetlist[]> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SETLISTS, 'readonly')
      const store = tx.objectStore(STORES.SETLISTS)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
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
 * Atomically saves a single song to local storage.
 * Reports save failures cleanly if transaction aborts.
 */
export async function saveSong(song: SongEntity): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SONGS, 'readwrite')
      const store = tx.objectStore(STORES.SONGS)
      const request = store.put(song)

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
      store.put(setlist)

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
 * Saves multiple songs in a single atomic transaction.
 */
export async function saveAllSongs(songs: SongEntity[]): Promise<void> {
  const db = await openRevampDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.SONGS, 'readwrite')
      const store = tx.objectStore(STORES.SONGS)
      for (const song of songs) {
        store.put(song)
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
        store.put(setlist)
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

export function closeRevampDB(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
