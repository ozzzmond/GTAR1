const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename)

const { createBackupPayload, parseBackupJson } = require('../src/utils/jsonBackup.ts')
const { validateBackupInput } = require('../src/utils/backupValidation.ts')
const { planLibraryRestore, planRecoveryImage, libraryDigest, recordHash } = require('../src/utils/restoreLibrary.ts')

const song = (id = 's1', title = 'Synthetic chart') => ({
  id,
  title,
  artist: 'Synthetic Artist',
  key: 'G',
  rawContent: '[G]fixture\r\n',
  format: 'CHORD_PRO',
  tags: [],
  isFavorite: false,
  transposeOffset: 0,
  createdAt: 100,
  updatedAt: 100,
})

test('GTAR1_ROUNDTRIP: fresh export -> merge preview and replace preview accept valid payload', () => {
  const s1 = song('s1', 'Song 1')
  const s2 = song('s2', 'Song 2')
  const sl1 = {
    id: 'sl1',
    name: 'Sunday Morning',
    folderId: null,
    createdAt: 100,
    updatedAt: 100,
    songs: [
      { id: 's1', title: 'Song 1', position: 0, entryId: 'e1', transposeOffset: 0 },
      { id: 's2', title: 'Song 2', position: 1, entryId: 'e2', transposeOffset: 2 },
    ],
  }

  const baseline = { songs: [s1, s2], setlists: [sl1], folders: [] }
  const backup = createBackupPayload(baseline.songs, baseline.setlists, baseline.folders)
  const jsonStr = JSON.stringify(backup)

  // 1. Parsing and validation succeeds
  const parsed = parseBackupJson(jsonStr)
  assert.equal(parsed.isValid, true, parsed.error)
  assert.equal(parsed.songs.length, 2)
  assert.equal(parsed.setlists.length, 1)

  const incoming = { songs: parsed.songs, setlists: parsed.setlists, folders: parsed.folders }

  // 2. Fresh export -> Merge preview
  const mergedPlan = planLibraryRestore(baseline, incoming, 'MERGE')
  assert.equal(mergedPlan.songs.length, 2)
  assert.equal(mergedPlan.setlists.length, 1)
  assert.equal(mergedPlan.setlists[0].songs.length, 2)
  assert.equal(mergedPlan.setlists[0].songs[0].position, 0)
  assert.equal(mergedPlan.setlists[0].songs[1].position, 1)

  // 3. Fresh export -> Replace preview
  const replacePlan = planLibraryRestore(baseline, incoming, 'REPLACE')
  assert.equal(replacePlan.songs.length, 2)
  assert.equal(replacePlan.setlists.length, 1)
  assert.equal(replacePlan.setlists[0].songs.length, 2)
})

test('GTAR1_POSITIONS: noncontiguous positions where supported are validated and round-tripped', () => {
  const s1 = song('s1')
  const s2 = song('s2')
  const s3 = song('s3')

  // Case A: 1-indexed contiguous [1, 2, 3]
  const oneIndexed = {
    songs: [s1, s2, s3],
    setlists: [{
      id: 'sl-1',
      name: '1-Indexed',
      folderId: null,
      songs: [
        { id: 's1', title: 'Song 1', position: 1, entryId: 'e1' },
        { id: 's2', title: 'Song 2', position: 2, entryId: 'e2' },
        { id: 's3', title: 'Song 3', position: 3, entryId: 'e3' },
      ],
    }],
    folders: [],
  }
  const parsedA = parseBackupJson(JSON.stringify(oneIndexed))
  assert.equal(parsedA.isValid, true, parsedA.error)
  assert.equal(parsedA.setlists[0].songs[0].position, 1)
  assert.equal(parsedA.setlists[0].songs[1].position, 2)
  assert.equal(parsedA.setlists[0].songs[2].position, 3)

  // Case B: Noncontiguous gaps [0, 5, 20]
  const gaps = {
    songs: [s1, s2, s3],
    setlists: [{
      id: 'sl-gaps',
      name: 'Gaps',
      folderId: null,
      songs: [
        { id: 's1', title: 'Song 1', position: 0, entryId: 'e1' },
        { id: 's2', title: 'Song 2', position: 5, entryId: 'e2' },
        { id: 's3', title: 'Song 3', position: 20, entryId: 'e3' },
      ],
    }],
    folders: [],
  }
  const parsedB = parseBackupJson(JSON.stringify(gaps))
  assert.equal(parsedB.isValid, true, parsedB.error)
  assert.equal(parsedB.setlists[0].songs[0].position, 0)
  assert.equal(parsedB.setlists[0].songs[1].position, 5)
  assert.equal(parsedB.setlists[0].songs[2].position, 20)

  // Case C: Single-song setlist with non-zero position [9]
  const singleNine = {
    songs: [s1],
    setlists: [{
      id: 'sl-single',
      name: 'Single 9',
      folderId: null,
      songs: [{ id: 's1', title: 'Song 1', position: 9, entryId: 'e1' }],
    }],
    folders: [],
  }
  const parsedC = parseBackupJson(JSON.stringify(singleNine))
  assert.equal(parsedC.isValid, true, parsedC.error)
  assert.equal(parsedC.setlists[0].songs[0].position, 9)

  // Case D: Roundtrip preservation through createBackupPayload
  const payloadB = createBackupPayload(parsedB.songs, parsedB.setlists, parsedB.folders)
  const roundtripB = parseBackupJson(JSON.stringify(payloadB))
  assert.equal(roundtripB.isValid, true)
  assert.equal(roundtripB.setlists[0].songs[1].position, 5)
  assert.equal(roundtripB.setlists[0].songs[2].position, 20)
})

test('GTAR1_ORDER_REJECTION: malformed order, duplicate positions, and negative positions are strictly rejected', () => {
  const s1 = song('s1')
  const s2 = song('s2')

  // Descending order [5, 2]
  const descending = {
    songs: [s1, s2],
    setlists: [{
      id: 'sl-desc',
      name: 'Descending',
      folderId: null,
      songs: [
        { id: 's1', title: 'Song 1', position: 5, entryId: 'e1' },
        { id: 's2', title: 'Song 2', position: 2, entryId: 'e2' },
      ],
    }],
    folders: [],
  }
  const parsedDesc = parseBackupJson(JSON.stringify(descending))
  assert.equal(parsedDesc.isValid, false)
  assert.match(parsedDesc.error, /Setlist order\/position mismatch/)

  // Duplicate positions [3, 3]
  const duplicates = {
    songs: [s1, s2],
    setlists: [{
      id: 'sl-dup',
      name: 'Duplicates',
      folderId: null,
      songs: [
        { id: 's1', title: 'Song 1', position: 3, entryId: 'e1' },
        { id: 's2', title: 'Song 2', position: 3, entryId: 'e2' },
      ],
    }],
    folders: [],
  }
  const parsedDup = parseBackupJson(JSON.stringify(duplicates))
  assert.equal(parsedDup.isValid, false)
  assert.match(parsedDup.error, /Setlist order\/position mismatch/)

  // Negative position [-1]
  const negative = {
    songs: [s1],
    setlists: [{
      id: 'sl-neg',
      name: 'Negative',
      folderId: null,
      songs: [{ id: 's1', title: 'Song 1', position: -1, entryId: 'e1' }],
    }],
    folders: [],
  }
  const parsedNeg = parseBackupJson(JSON.stringify(negative))
  assert.equal(parsedNeg.isValid, false)
  assert.match(parsedNeg.error, /Setlist order\/position mismatch/)
})

test('GTAR1_MULTIPLE_EMPTY_REPEATED: multiple setlists, empty setlists, and repeated song references', () => {
  const s1 = song('s1', 'Amazing Grace')
  const s2 = song('s2', '10,000 Reasons')

  const payload = {
    app: 'GTAR1',
    schemaVersion: 1,
    version: '0.1.0-dev',
    exportedAt: new Date().toISOString(),
    songs: [s1, s2],
    setlists: [
      // Empty setlist
      { id: 'sl-empty', name: 'Empty Setlist', folderId: null, songs: [] },
      // Setlist with repeated song references with distinct entryId and increasing position
      {
        id: 'sl-repeated',
        name: 'Repeated Setlist',
        folderId: null,
        songs: [
          { id: 's1', title: 'Amazing Grace (Opener)', entryId: 'entry-open', position: 0, transposeOffset: 0 },
          { id: 's2', title: '10,000 Reasons', entryId: 'entry-mid', position: 1, transposeOffset: 2 },
          { id: 's1', title: 'Amazing Grace (Encore)', entryId: 'entry-encore', position: 2, transposeOffset: 5 },
        ],
      },
      // Second populated setlist with noncontiguous positions
      {
        id: 'sl-third',
        name: 'Third Setlist',
        folderId: null,
        songs: [
          { id: 's2', title: '10,000 Reasons', entryId: 'entry-third-1', position: 10 },
          { id: 's1', title: 'Amazing Grace', entryId: 'entry-third-2', position: 20 },
        ],
      },
    ],
    folders: [],
  }

  const parsed = parseBackupJson(JSON.stringify(payload))
  assert.equal(parsed.isValid, true, parsed.error)
  assert.equal(parsed.setlists.length, 3)
  assert.equal(parsed.setlists[0].songs.length, 0)
  assert.equal(parsed.setlists[1].songs.length, 3)
  assert.equal(parsed.setlists[2].songs.length, 2)

  // Export roundtrip
  const exported = createBackupPayload(parsed.songs, parsed.setlists, parsed.folders)
  const roundtrip = parseBackupJson(JSON.stringify(exported))
  assert.equal(roundtrip.isValid, true)
  assert.equal(roundtrip.setlists[1].songs[2].transposeOffset, 5)
})

test('GTAR1_EDIT_RESTORE_UNDO: edit -> restore -> undo maintains snapshot, conflict protection, and exact reversion', () => {
  const originalSong = song('s1', 'Original Song')
  const originalSetlist = {
    id: 'sl1',
    name: 'Original Set',
    folderId: null,
    createdAt: 10,
    updatedAt: 10,
    songs: [{ id: 's1', title: 'Original Song', position: 0, entryId: 'e1' }],
  }

  const beforeImage = { songs: [originalSong], setlists: [originalSetlist], folders: [] }
  const backup = createBackupPayload(beforeImage.songs, beforeImage.setlists, beforeImage.folders)

  // Musician edits the song locally after the backup was created
  const editedSong = { ...originalSong, title: 'Edited Local Song', updatedAt: 200 }
  const currentImage = { songs: [editedSong], setlists: [originalSetlist], folders: [] }

  // 1. Merge mode correctly detects conflict on edited song
  assert.throws(
    () => planLibraryRestore(currentImage, beforeImage, 'MERGE'),
    /Merge conflict: songs ID s1/
  )

  // 2. Replace mode accepts the restore plan
  const replacePlan = planLibraryRestore(currentImage, beforeImage, 'REPLACE')
  assert.equal(replacePlan.songs[0].title, 'Original Song')

  // 3. Simulate Undo via recovery snapshot
  const hashes = image => Object.fromEntries(['songs', 'setlists', 'folders'].map(k => [k, Object.fromEntries(image[k].map(r => [r.id, recordHash(r)]))]))
  const snapshot = {
    id: 'pre-restore-snapshot',
    planId: 'plan-1',
    createdAt: 300,
    beforeDigest: libraryDigest(currentImage),
    beforeImage: currentImage,
    settingsBefore: {},
  }
  const marker = {
    id: 'restore-marker',
    planId: 'plan-1',
    kind: 'REPLACE',
    committedAt: 301,
    beforeDigest: '',
    afterDigest: libraryDigest(replacePlan),
    afterHashes: hashes(replacePlan),
    settingsAfter: {},
    verified: true,
  }

  const recoveryResult = planRecoveryImage(snapshot, marker, replacePlan, {})
  assert.equal(recoveryResult.conflicts.length, 0)
  assert.equal(libraryDigest(recoveryResult.image), libraryDigest(currentImage))
  assert.equal(recoveryResult.image.songs[0].title, 'Edited Local Song')
})
