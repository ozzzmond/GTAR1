require('./helpers/load-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeSongbookIds } = require('../src/utils/songbookFoundation.ts')
const { resolveSetlistSong, setSongMembership, isSongInSetlist, transitionSongLibrary } = require('../src/utils/setlistSongs.ts')
const song = { id: 0, title: 'Practice', artist: 'One', rawContent: '[C]Hello' }
const other = { ...song, id: 'other', artist: 'Two' }
const list = { id: 'gig', name: 'Gig', songs: [{ id: 'other', title: 'Practice', entryId: 'first', position: 0 }] }

test('songbook normalization preserves stable IDs and binds only unambiguous legacy shortcuts', () => {
  const source = [song, other]
  const before = structuredClone(source)
  const result = normalizeSongbookIds(source, [{ ...list, songs: [
    { id: 0, title: 'Old name' }, { title: 'Practice', artist: 'Two' }, { title: 'Practice' },
  ] }])
  assert.deepEqual(result.songs.map(item => item.id), ['0', 'other'])
  assert.equal(result.setlists[0].songs[0].id, '0')
  assert.equal(result.setlists[0].songs[1].id, 'other')
  assert.equal(resolveSetlistSong(result.setlists[0].songs[2], result.songs), undefined)
  assert.deepEqual(source, before)
})

test('membership uses stable IDs, appends once, and removes repeats without disturbing queue order', () => {
  const before = structuredClone(list)
  const added = setSongMembership(list, song, true)
  assert.deepEqual(added.songs.map(ref => ref.id), ['other', 0])
  assert.equal(isSongInSetlist(added, '0'), true)
  assert.equal(setSongMembership(added, { ...song, title: 'Renamed' }, true), added)
  const repeated = { ...added, songs: [...added.songs, { id: '0', title: 'Old' }] }
  assert.deepEqual(setSongMembership(repeated, song, false).songs, list.songs)
  assert.throws(() => setSongMembership(list, { ...song, id: undefined }, true), /stable song ID/)
  assert.deepEqual(list, before)
})

test('trash and restore retain saved setlist shortcuts and song performance state', () => {
  const saved = { ...song, transposeOffset: 3 }
  const state = { active: [saved, other], deleted: [], setlists: [list] }
  const before = structuredClone(state)
  const trashed = transitionSongLibrary(state, { kind: 'trash', ids: ['0'], blank: {} })
  assert.deepEqual(trashed.active, [other])
  assert.deepEqual(trashed.deleted, [{ ...saved, isDeleted: true }])
  const restored = transitionSongLibrary(trashed, { kind: 'restore', ids: [0] })
  assert.deepEqual(restored.active, [{ ...saved, isDeleted: false }, other])
  assert.deepEqual(restored.deleted, [])
  assert.deepEqual(restored.setlists, state.setlists)
  assert.deepEqual(state, before)
})
