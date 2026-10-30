const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename)
const { parseBackupJson, createBackupPayload } = require('../src/utils/jsonBackup.ts')
const song = (id = 's') => ({ id, title: 'Synthetic chart', rawContent: '[C]fixture\r\n', format: 'CHORD_PRO', createdAt: 1, updatedAt: 2 })
const backup = () => ({ songs: [song()], setlists: [{ id: 'l', name: 'Synthetic set', songs: [{ id: 's', title: 'Synthetic chart', position: 0 }] }], folders: [] })

test('A1-A5/A11: strict source validation rejects malformed/ambiguous graphs before normalization', () => {
  const cases = [{}, { songs: null }, { songs: [null] }, { songs: [{ id: 's', title: 'missing body' }] },
    { ...backup(), schemaVersion: 999 }, { ...backup(), app: 'GTAR1', schemaVersion: 2 },
    { ...backup(), type: 'RECOVERY_ARCHIVE' }, { ...backup(), songs: [song(), song()] },
    { ...backup(), setlists: [...backup().setlists, ...backup().setlists] },
    { ...backup(), folders: [{ id: 's', name: 'collision' }] },
    { ...backup(), songs: [song('other')] }, { ...backup(), folders: [{ id: 'f', name: 'orphan', parentId: 'missing' }] },
    { ...backup(), folders: [{ id: 'f', name: 'cycle', parentId: 'g' }, { id: 'g', name: 'cycle', parentId: 'f' }] },
    { ...backup(), metadata: { songCount: 2 } }, { ...backup(), themeMode: 'invalid' },
    { ...backup(), songs: [{ ...song(), isFavorite: 'false' }] },
    { ...backup(), setlists: [{ ...backup().setlists[0], folderId: 'missing' }] },
    { ...backup(), songs: [{ ...song(), content: 'different' }] },
    { ...backup(), setlists: [{ id: 'l', name: 'order', songs: [{ id: 's', title: 'x', position: 9 }] }] },
    { ...backup(), setlists: [{ id: 'l', name: 'entries', songs: [{ id: 's', title: 'x', entryId: 'e' }, { id: 's', title: 'x', entryId: 'e' }] }] },
    { ...backup(), trash: [{ private: 'unsupported scope' }] },
  ]
  for (const input of cases) assert.equal(parseBackupJson(JSON.stringify(input)).isValid, false, JSON.stringify(input))
  for (const input of ['', '{', 'null', '3', '"x"']) assert.equal(parseBackupJson(input).isValid, false)
  assert.equal(parseBackupJson(JSON.stringify({ songs: new Array(50_001).fill(null) })).isValid, false)
  assert.equal(parseBackupJson(' '.repeat(20 * 1024 * 1024 + 1)).isValid, false)
})
test('A2/A8/A9: legacy unversioned/v1/v2 and native v1 retain numeric identity, repeated occurrences, bytes and extensions', () => {
  const input = backup(); input.songs[0].id = 7; input.songs[0].inertExtension = { value: '<script>inert</script>' }
  input.setlists[0].songs = [{ id: 7, title: 'Synthetic chart' }, { id: 7, title: 'Synthetic chart', transposeOffset: -2 }]
  for (const schemaVersion of [undefined, 1, 2]) {
    const parsed = parseBackupJson(JSON.stringify({ ...input, schemaVersion }))
    assert.equal(parsed.isValid, true, parsed.error)
    assert.equal(parsed.songs[0].id, '7')
    assert.equal(parsed.setlists[0].songs[1].id, '7')
    assert.equal(parsed.songs[0].rawContent, input.songs[0].rawContent)
    assert.deepEqual(parsed.songs[0].inertExtension, input.songs[0].inertExtension)
    assert.equal(parsed.setlists[0].songs[1].transposeOffset, -2)
    assert.deepEqual(parsed, parseBackupJson(JSON.stringify({ ...input, schemaVersion })))
    const native = createBackupPayload(parsed.songs, parsed.setlists, parsed.folders)
    assert.equal(parseBackupJson(JSON.stringify(native)).isValid, true)
  }
  assert.equal(parseBackupJson(JSON.stringify({ songs: [{ ...song(), rawContent: '' }], setlists: [] })).isValid, true)
  assert.equal(parseBackupJson(JSON.stringify([song()])).partial, true)
  const loose = { title: 'Loose synthetic chart', content: '[D]bytes' }
  const first = parseBackupJson(JSON.stringify([loose]))
  assert.equal(first.isValid, true)
  assert.equal(first.songs[0].id, parseBackupJson(JSON.stringify([loose])).songs[0].id)
})
