const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename)
const { planRecoveryImage, recordHash, libraryDigest } = require('../src/utils/restoreLibrary.ts')

const song = (id, title = id) => ({ id, title, rawContent: 'Synthetic', format: 'PLAIN', tags: [], createdAt: 1, updatedAt: 1 })
const hashes = image => Object.fromEntries(['songs', 'setlists', 'folders'].map(k => [k, Object.fromEntries(image[k].map(r => [r.id, recordHash(r)]))]))
function fixture(after, settingsBefore = { theme: 'a' }, settingsAfter = { theme: 'b' }) {
  const before = { songs: [song('s1'), song('s2')], setlists: [], folders: [] }
  return {
    snapshot: { id: 'pre-restore-snapshot', planId: 'p', createdAt: 1, beforeDigest: libraryDigest(before), beforeImage: before, settingsBefore },
    marker: { id: 'restore-marker', planId: 'p', kind: 'REPLACE', committedAt: 1, beforeDigest: '', afterDigest: libraryDigest(after), afterHashes: hashes(after), settingsAfter, verified: true },
    before,
  }
}

test('#13 recovery: untouched restore returns exact snapshot with no conflicts', () => {
  const after = { songs: [song('r1')], setlists: [], folders: [] }
  const { snapshot, marker, before } = fixture(after)
  const out = planRecoveryImage(snapshot, marker, after, { theme: 'b' })
  assert.equal(out.conflicts.length, 0)
  assert.equal(libraryDigest(out.image), libraryDigest(before))
  assert.deepEqual(out.settings, { theme: 'a' })
})

test('#13 recovery: newer edits are conflicts defaulting to keep-current; explicit choice honoured', () => {
  const after = { songs: [song('s1'), song('r1')], setlists: [], folders: [] }
  const { snapshot, marker } = fixture(after)
  const current = { songs: [song('s1', 'edited later'), song('r1'), song('n1')], setlists: [], folders: [] }
  const out = planRecoveryImage(snapshot, marker, current, { theme: 'c' })
  assert.deepEqual(out.conflicts.map(c => `${c.key}:${c.change}`).sort(), ['settings:theme:EDITED', 'songs:n1:ADDED', 'songs:s1:EDITED'])
  assert.deepEqual(out.image.songs.map(s => `${s.id}:${s.title}`).sort(), ['n1:n1', 's1:edited later', 's2:s2'])
  assert.equal(out.settings.theme, 'c')
  const chosen = planRecoveryImage(snapshot, marker, current, { theme: 'c' }, { 'songs:s1': 'USE_PRE_RESTORE', 'songs:n1': 'USE_PRE_RESTORE', 'settings:theme': 'USE_PRE_RESTORE' })
  assert.deepEqual(chosen.image.songs.map(s => `${s.id}:${s.title}`).sort(), ['s1:s1', 's2:s2'])
  assert.equal(chosen.settings.theme, 'a')
})

test('#13 recovery: kept setlist retains referenced restored song; mismatched snapshot rejected', () => {
  const after = { songs: [song('s1'), song('s2'), song('r1')], setlists: [], folders: [] }
  const { snapshot, marker } = fixture(after)
  const current = { ...after, setlists: [{ id: 'l1', name: 'Later set', folderId: null, songs: [{ id: 'r1', title: 'r1', entryId: 'e', position: 0 }] }] }
  const out = planRecoveryImage(snapshot, marker, current, { theme: 'b' })
  assert.ok(out.image.songs.some(s => s.id === 'r1'))
  assert.equal(out.keptForReferences, 1)
  assert.throws(() => planRecoveryImage({ ...snapshot, planId: 'other' }, marker, current, {}), /does not match/)
})
