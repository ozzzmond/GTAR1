const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) =>
    module._compile(
      ts.transpileModule(
        fs.readFileSync(filename, 'utf8'),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
          },
        }
      ).outputText,
      filename
    )
}

// In-Memory IndexedDB Simulation for Node.js verification
function createMockIndexedDB() {
  const databases = new Map()

  return {
    open(name, version = 1) {
      const openReq = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      }

      setTimeout(() => {
        let dbData = databases.get(name)
        const isNew = !dbData

        if (isNew) {
          dbData = {
            stores: new Map(),
            storeConfigs: new Map(),
          }
          databases.set(name, dbData)
        }

        const db = {
          name,
          version,
          objectStoreNames: {
            contains: (s) => dbData.storeConfigs.has(s),
          },
          createObjectStore: (storeName, options) => {
            if (!dbData.stores.has(storeName)) {
              dbData.stores.set(storeName, new Map())
            }
            dbData.storeConfigs.set(storeName, options)
            return {}
          },
          transaction: (storeNames, mode) => {
            const tx = {
              mode,
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              abort() {
                setTimeout(() => {
                  if (tx.onabort) tx.onabort()
                }, 0)
              },
              objectStore: (sName) => {
                const storeMap = dbData.stores.get(sName)
                if (!storeMap) throw new Error(`Store ${sName} not found`)
                return {
                  getAll: () => {
                    const req = { result: Array.from(storeMap.values()), onsuccess: null, onerror: null }
                    setTimeout(() => {
                      if (req.onsuccess) req.onsuccess()
                    }, 0)
                    return req
                  },
                  get: (key) => {
                    const req = { result: storeMap.get(key), onsuccess: null, onerror: null }
                    setTimeout(() => {
                      if (req.onsuccess) req.onsuccess()
                    }, 0)
                    return req
                  },
                  put: (val) => {
                    const keyPath = dbData.storeConfigs.get(sName)?.keyPath || 'id'
                    const key = val[keyPath]
                    storeMap.set(key, JSON.parse(JSON.stringify(val)))
                    const req = { result: key, onsuccess: null, onerror: null }
                    setTimeout(() => {
                      if (req.onsuccess) req.onsuccess()
                    }, 0)
                    return req
                  },
                  delete: (key) => {
                    storeMap.delete(key)
                    const req = { onsuccess: null, onerror: null }
                    setTimeout(() => {
                      if (req.onsuccess) req.onsuccess()
                    }, 0)
                    return req
                  },
                }
              },
            }

            setTimeout(() => {
              if (tx.oncomplete) tx.oncomplete()
            }, 5)

            return tx
          },
          close: () => {},
        }

        openReq.result = db

        if (isNew && openReq.onupgradeneeded) {
          openReq.onupgradeneeded({ target: openReq })
        }

        if (openReq.onsuccess) {
          openReq.onsuccess({ target: openReq })
        }
      }, 0)

      return openReq
    },
  }
}

global.indexedDB = createMockIndexedDB()

const {
  DB_NAME,
  DB_VERSION,
  STORES,
  loadAllSongs,
  loadAllSetlists,
  saveSong,
  deleteSong,
  saveSetlist,
  deleteSetlist,
  saveAllSongs,
  saveAllSetlists,
  closeRevampDB,
  openGtar1DB,
  closeGtar1DB,
} = require('../src/utils/storage.ts')

test('STORAGE_ISOLATION_AND_NAMESPACE: uses isolated gtar_revamp_local_v1 database', () => {
  assert.equal(DB_NAME, 'gtar_revamp_local_v1', 'Must use dedicated isolated DB namespace')
  assert.equal(typeof openGtar1DB, 'function')
  assert.equal(typeof closeGtar1DB, 'function')
  assert.equal(DB_VERSION, 2)
  assert.equal(STORES.SONGS, 'songs')
  assert.equal(STORES.SETLISTS, 'setlists')
  assert.equal(STORES.FOLDERS, 'folders')
})

test('BLANK_INITIAL_SONGBOOK: clean installation loads 0 songs and 0 setlists', async () => {
  const songs = await loadAllSongs()
  const setlists = await loadAllSetlists()

  assert.deepEqual(songs, [], 'Initial songbook must be blank (0 songs)')
  assert.deepEqual(setlists, [], 'Initial setlists must be blank (0 setlists)')
})

test('SONG_CRUD_DURABILITY: creates, reads, updates, and deletes songs atomically', async () => {
  const newSong = {
    id: 'test-song-1',
    title: 'Blessed Be Your Name',
    artist: 'Matt Redman',
    key: 'B',
    originalKey: 'B',
    bpm: '116',
    time: '4/4',
    rawContent: '{title: Blessed Be Your Name}\n[B]Blessed be Your name',
    format: 'CHORD_PRO',
    createdAt: 1000,
    updatedAt: 1000,
  }

  await saveSong(newSong)

  const songsAfterSave = await loadAllSongs()
  assert.equal(songsAfterSave.length, 1)
  assert.equal(songsAfterSave[0].id, 'test-song-1')
  assert.equal(songsAfterSave[0].title, 'Blessed Be Your Name')
  assert.equal(songsAfterSave[0].key, 'B')

  // Update
  const updatedSong = { ...newSong, title: 'Blessed Be Your Name (Live)', updatedAt: 2000 }
  await saveSong(updatedSong)

  const songsAfterUpdate = await loadAllSongs()
  assert.equal(songsAfterUpdate.length, 1)
  assert.equal(songsAfterUpdate[0].title, 'Blessed Be Your Name (Live)')

  // Delete
  await deleteSong('test-song-1')
  const songsAfterDelete = await loadAllSongs()
  assert.equal(songsAfterDelete.length, 0)
})

test('SETLIST_CRUD_AND_REORDER: creates, updates song order, and deletes setlist', async () => {
  const newSetlist = {
    id: 'setlist-test-1',
    name: 'Sunday Morning Worship',
    createdAt: 1000,
    updatedAt: 1000,
    songs: [
      { id: 's1', title: 'Song 1', position: 0 },
      { id: 's2', title: 'Song 2', position: 1 },
      { id: 's3', title: 'Song 3', position: 2 },
    ],
  }

  await saveSetlist(newSetlist)

  const loaded = await loadAllSetlists()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].name, 'Sunday Morning Worship')
  assert.equal(loaded[0].songs.length, 3)

  // Reorder (swap Song 1 and Song 2)
  const reordered = {
    ...newSetlist,
    songs: [
      { id: 's2', title: 'Song 2', position: 0 },
      { id: 's1', title: 'Song 1', position: 1 },
      { id: 's3', title: 'Song 3', position: 2 },
    ],
  }
  await saveSetlist(reordered)

  const loadedReordered = await loadAllSetlists()
  assert.equal(loadedReordered[0].songs[0].id, 's2')
  assert.equal(loadedReordered[0].songs[1].id, 's1')

  // Delete
  await deleteSetlist('setlist-test-1')
  const afterDelete = await loadAllSetlists()
  assert.equal(afterDelete.length, 0)
})
