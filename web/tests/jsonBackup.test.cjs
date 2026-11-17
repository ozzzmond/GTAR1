require('./helpers/load-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeBackupSong, createBackupPayload, parseBackupJson } = require('../src/utils/jsonBackup.ts')

test('JSON backup round trip preserves active/trash songs, keys, transpose and ordered setlist entries', t => {
  // Only the browser storage boundary is substituted; backup/settings logic is real.
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
  t.after(() => { delete globalThis.localStorage })
  const songs = [
    normalizeBackupSong({ id: 'one', title: 'Practice', key: 'C', originalKey: 'C', transposeOffset: 2, rawContent: '{key: C}\n[C]Hello', tags: ['practice'], isFavorite: true }),
    normalizeBackupSong({ id: 'two', title: 'Archived', rawContent: '[G]Goodbye', isDeleted: true }),
  ]
  const setlists = [{ id: 'gig', name: 'Gig', songs: [
    { id: 'one', title: 'Practice', entryId: 'a', position: 0 },
    { id: 'one', title: 'Practice', entryId: 'b', position: 1 },
  ] }]
  const before = structuredClone({ songs, setlists })
  const payload = createBackupPayload(songs, setlists)
  const parsed = parseBackupJson(JSON.stringify(payload))
  assert.equal(parsed.isValid, true, parsed.error)
  assert.equal(payload.songCount, 1)
  assert.equal(payload.trashCount, 1)
  assert.deepEqual(parsed.songs, songs)
  assert.deepEqual(parsed.setlists, setlists)
  assert.deepEqual({ songs, setlists }, before)
  const corrupted = structuredClone(payload)
  corrupted.songs[0].rawContent += 'altered'
  assert.equal(parseBackupJson(JSON.stringify(corrupted)).isValid, false)
})

test('invalid JSON, future schemas, duplicate IDs and incorrect counts are rejected atomically', () => {
  const song = { id: 'one', title: 'Practice', rawContent: '[C]Hello' }
  for (const raw of [
    '{broken',
    JSON.stringify({ schemaVersion: 999, songs: [song] }),
    JSON.stringify({ songs: [song, song] }),
    JSON.stringify({ songs: [song], songCount: 2 }),
  ]) {
    const parsed = parseBackupJson(raw)
    assert.equal(parsed.isValid, false, raw)
    assert.ok(parsed.error)
    assert.deepEqual(parsed.songs, [])
    assert.deepEqual(parsed.setlists, [])
  }
})

test('legacy backups preserve broken shortcuts for recovery instead of guessing by title', () => {
  const parsed = parseBackupJson(JSON.stringify({
    songs: [{ id: 'one', title: 'Practice', rawContent: '[C]Hello' }],
    setlists: [{ id: 'gig', name: 'Gig', songs: [{ id: 'missing', title: 'Practice' }] }],
  }))
  assert.equal(parsed.isValid, true, parsed.error)
  assert.equal(parsed.setlists[0].songs[0].id, 'missing')
})
