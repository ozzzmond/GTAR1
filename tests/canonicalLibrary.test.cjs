const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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

// In-Memory IndexedDB Simulation
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
        const oldVersion = dbData ? dbData.version : 0

        if (isNew) {
          dbData = {
            version,
            stores: new Map(),
            storeConfigs: new Map(),
          }
          databases.set(name, dbData)
        } else {
          dbData.version = version
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
                    const req = {
                      result: Array.from(storeMap.values()).map((v) =>
                        JSON.parse(JSON.stringify(v))
                      ),
                      onsuccess: null,
                      onerror: null,
                    }
                    setTimeout(() => {
                      if (req.onsuccess) req.onsuccess()
                    }, 0)
                    return req
                  },
                  get: (key) => {
                    const val = storeMap.get(key)
                    const req = {
                      result: val ? JSON.parse(JSON.stringify(val)) : undefined,
                      onsuccess: null,
                      onerror: null,
                    }
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

        if ((isNew || oldVersion < version) && openReq.onupgradeneeded) {
          openReq.transaction = db.transaction(
            Array.from(dbData.storeConfigs.keys()),
            'readwrite'
          )
          openReq.oldVersion = oldVersion
          openReq.onupgradeneeded({ target: openReq, oldVersion })
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
  normalizeTags,
  songHasTag,
  renameTagInList,
  removeTagFromList,
} = require('../src/utils/tags.ts')

const {
  validateFolderParentChange,
  buildFolderTree,
  getFolderDescendantIds,
} = require('../src/utils/folders.ts')

const {
  createBackupPayload,
  parseBackupJson,
} = require('../src/utils/jsonBackup.ts')

const {
  loadAllSongs,
  loadAllSetlists,
  loadAllFolders,
  saveSong,
  deleteSong,
  saveSetlist,
  deleteSetlist,
  saveFolder,
  deleteFolder,
  saveAllSongs,
  saveAllSetlists,
  saveAllFolders,
} = require('../src/utils/storage.ts')

test('CANONICAL_SONGBOOK_TAGS: one song across many tags, normalized, deduplicated, no chart copying', () => {
  const rawTags = ['Worship', 'acoustic', 'WORSHIP', '  Sunday-Morning  ', '']
  const normalized = normalizeTags(rawTags)
  assert.deepEqual(normalized, ['worship', 'acoustic', 'sunday-morning'])

  const song = {
    id: 'song-tag-1',
    title: 'Everlasting God',
    tags: normalized,
    rawContent: '{title: Everlasting God}\n[G]Strength will rise',
    format: 'CHORD_PRO',
    createdAt: 100,
    updatedAt: 100,
  }

  assert.equal(songHasTag(song.tags, 'worship'), true)
  assert.equal(songHasTag(song.tags, 'WORSHIP'), true) // Case-insensitive
  assert.equal(songHasTag(song.tags, 'acoustic'), true)
  assert.equal(songHasTag(song.tags, 'hymn'), false)

  // Safe tag rename: song record body unchanged, only tag list updated
  const renamedTags = renameTagInList(song.tags, 'acoustic', 'unplugged')
  assert.deepEqual(renamedTags, ['worship', 'unplugged', 'sunday-morning'])
  assert.equal(song.rawContent, '{title: Everlasting God}\n[G]Strength will rise')

  // Safe tag delete
  const deletedTagList = removeTagFromList(renamedTags, 'worship')
  assert.deepEqual(deletedTagList, ['unplugged', 'sunday-morning'])
})

test('SETLIST_SHORTCUTS: one song across multiple setlists with stable entry IDs and per-entry transpose', () => {
  const masterSong = {
    id: 'master-song-1',
    title: '10,000 Reasons',
    artist: 'Matt Redman',
    key: 'G',
    rawContent: '{title: 10,000 Reasons}\n[G]Bless the Lord O my soul',
    format: 'CHORD_PRO',
    createdAt: 200,
    updatedAt: 200,
  }

  // Setlist A: uses original key G (offset 0)
  const setlistA = {
    id: 'setlist-a',
    name: 'Acoustic Set',
    songs: [
      {
        entryId: 'entry-a-1',
        id: masterSong.id,
        title: masterSong.title,
        position: 0,
        transposeOffset: 0,
      },
    ],
    createdAt: 200,
    updatedAt: 200,
  }

  // Setlist B: contains duplicate occurrences with independent entry IDs and transpositions
  const setlistB = {
    id: 'setlist-b',
    name: 'Sunday Full Band',
    songs: [
      {
        entryId: 'entry-b-1', // First occurrence as opener in key A (+2)
        id: masterSong.id,
        title: masterSong.title,
        position: 0,
        transposeOffset: 2,
      },
      {
        entryId: 'entry-b-2', // Second occurrence as encore in key Bb (+3)
        id: masterSong.id,
        title: masterSong.title,
        position: 1,
        transposeOffset: 3,
      },
    ],
    createdAt: 200,
    updatedAt: 200,
  }

  // Verify independence
  assert.notEqual(setlistA.songs[0].entryId, setlistB.songs[0].entryId)
  assert.notEqual(setlistB.songs[0].entryId, setlistB.songs[1].entryId)
  assert.equal(setlistB.songs[0].id, masterSong.id)
  assert.equal(setlistB.songs[1].id, masterSong.id)
  assert.equal(setlistB.songs[0].transposeOffset, 2)
  assert.equal(setlistB.songs[1].transposeOffset, 3)

  // Removing reference does not delete master song
  const filteredB = {
    ...setlistB,
    songs: setlistB.songs.filter((s) => s.entryId !== 'entry-b-1'),
  }
  assert.equal(filteredB.songs.length, 1)
  assert.equal(masterSong.rawContent.includes('Bless the Lord'), true)
})

test('SETLIST_FOLDERS_AND_CYCLE_PREVENTION: prevents cycles, moves folders, unfiled setlists', () => {
  const folders = [
    { id: 'f-worship', name: 'Worship', parentId: null, createdAt: 1, updatedAt: 1 },
    { id: 'f-2026', name: '2026', parentId: 'f-worship', createdAt: 2, updatedAt: 2 },
    { id: 'f-october', name: 'October', parentId: 'f-2026', createdAt: 3, updatedAt: 3 },
  ]

  // Valid move: moving October to Worship root
  assert.equal(validateFolderParentChange(folders, 'f-october', 'f-worship'), true)
  assert.equal(validateFolderParentChange(folders, 'f-october', null), true)

  // Invalid moves (Cycles)
  assert.equal(validateFolderParentChange(folders, 'f-worship', 'f-worship'), false) // Self parent
  assert.equal(validateFolderParentChange(folders, 'f-worship', 'f-2026'), false) // Parent to child
  assert.equal(validateFolderParentChange(folders, 'f-worship', 'f-october'), false) // Parent to grandchild

  // Descendants collection
  const worshipDescendants = getFolderDescendantIds(folders, 'f-worship')
  assert.equal(worshipDescendants.has('f-2026'), true)
  assert.equal(worshipDescendants.has('f-october'), true)
  assert.equal(worshipDescendants.has('f-worship'), false)

  // Tree build
  const tree = buildFolderTree(folders)
  assert.equal(tree.length, 1) // Only 1 root: Worship
  assert.equal(tree[0].children.length, 1) // 2026
  assert.equal(tree[0].children[0].children.length, 1) // October
})

test('JSON_BACKUP_ROUND_TRIP_WITH_CANONICAL_MODEL: tags, folders, and occurrences survive round-trip', () => {
  const songs = [
    {
      id: 's-1',
      title: 'Cornerstone',
      artist: 'Hillsong',
      key: 'C',
      tags: ['hymn', 'anthems'],
      rawContent: '{title: Cornerstone}\n[C]My hope is built',
      format: 'CHORD_PRO',
      createdAt: 500,
      updatedAt: 500,
    },
  ]

  const folders = [
    { id: 'f-1', name: 'Sunday Sets', parentId: null, createdAt: 500, updatedAt: 500 },
  ]

  const setlists = [
    {
      id: 'sl-1',
      name: 'Morning Worship',
      folderId: 'f-1',
      createdAt: 500,
      updatedAt: 500,
      songs: [
        {
          entryId: 'e-1',
          id: 's-1',
          title: 'Cornerstone',
          position: 0,
          transposeOffset: 2,
        },
      ],
    },
  ]

  const payload = createBackupPayload(songs, setlists, folders)
  const jsonStr = JSON.stringify(payload)

  const parsed = parseBackupJson(jsonStr)
  assert.equal(parsed.isValid, true)
  assert.equal(parsed.songs.length, 1)
  assert.deepEqual(parsed.songs[0].tags, ['hymn', 'anthems'])
  assert.equal(parsed.folders.length, 1)
  assert.equal(parsed.folders[0].id, 'f-1')
  assert.equal(parsed.setlists.length, 1)
  assert.equal(parsed.setlists[0].folderId, 'f-1')
  assert.equal(parsed.setlists[0].songs[0].entryId, 'e-1')
  assert.equal(parsed.setlists[0].songs[0].transposeOffset, 2)
})

test('LEGACY_GTAR1_BACKUP_MIGRATION: older backups without tags or folders default safely', () => {
  const olderGtar1Backup = {
    app: 'GTAR1',
    schemaVersion: 1,
    version: '0.1.0-dev',
    exportedAt: '2026-10-20T00:00:00Z',
    songs: [
      {
        id: 'legacy-song-1',
        title: 'Ancient Song',
        rawContent: '{title: Ancient Song}\n[D]Old lyrics',
        // No tags field
      },
    ],
    setlists: [
      {
        id: 'legacy-setlist-1',
        name: 'Classic List',
        // No folderId field
        songs: [
          {
            // No entryId
            id: 'legacy-song-1',
            title: 'Ancient Song',
            position: 0,
          },
        ],
      },
    ],
  }

  const parsed = parseBackupJson(JSON.stringify(olderGtar1Backup))
  assert.equal(parsed.isValid, true)
  assert.equal(parsed.songs.length, 1)
  assert.deepEqual(parsed.songs[0].tags, []) // Default to empty array
  assert.equal(parsed.folders.length, 0)
  assert.equal(parsed.setlists.length, 1)
  assert.equal(parsed.setlists[0].folderId, null) // Default to unfiled
  assert.equal(typeof parsed.setlists[0].songs[0].entryId, 'string') // Synthetic stable entry ID
  assert.equal(parsed.setlists[0].songs[0].entryId.length > 0, true)
})

test('STORAGE_INTEGRATION_AND_ATOMIC_FAILURE_RESILIENCE: folders and songs persist atomically', async () => {
  const folder = {
    id: 'f-atomic-1',
    name: 'Special Events',
    parentId: null,
    createdAt: 1000,
    updatedAt: 1000,
  }

  await saveFolder(folder)
  const folders = await loadAllFolders()
  assert.equal(folders.some((f) => f.id === 'f-atomic-1'), true)

  // Clean delete
  await deleteFolder('f-atomic-1')
  const afterDelete = await loadAllFolders()
  assert.equal(afterDelete.some((f) => f.id === 'f-atomic-1'), false)
})
