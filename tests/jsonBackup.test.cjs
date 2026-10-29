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

const {
  createBackupPayload,
  parseBackupJson,
  normalizeBackupSong,
  normalizeBackupSetlist,
} = require('../src/utils/jsonBackup.ts')

test('JSON_BACKUP_ROUND_TRIP: full backup creation and parsing round-trips correctly', () => {
  const songs = [
    {
      id: 'song-1',
      title: 'Amazing Grace',
      artist: 'John Newton',
      key: 'Eb',
      originalKey: 'Eb',
      bpm: '96',
      time: '3/4',
      year: '1779',
      rawContent: '{title: Amazing Grace}\n[Eb]Amazing grace',
      format: 'CHORD_PRO',
      createdAt: 1000,
      updatedAt: 2000,
    },
    {
      id: 'song-2',
      title: '10,000 Reasons',
      artist: 'Matt Redman',
      key: 'G',
      bpm: '73',
      time: '4/4',
      rawContent: '{title: 10,000 Reasons}\n[G]Bless the Lord',
      format: 'CHORD_PRO',
      createdAt: 3000,
      updatedAt: 4000,
    },
  ]

  const setlists = [
    {
      id: 'set-1',
      name: 'Sunday Morning',
      createdAt: 5000,
      updatedAt: 6000,
      songs: [
        { id: 'song-1', title: 'Amazing Grace', artist: 'John Newton', key: 'Eb', position: 0 },
        { id: 'song-2', title: '10,000 Reasons', artist: 'Matt Redman', key: 'G', position: 1 },
      ],
    },
  ]

  const payload = createBackupPayload(songs, setlists)
  assert.equal(payload.app, 'GTAR1')
  assert.equal(payload.schemaVersion, 1)
  assert.equal(payload.songs.length, 2)
  assert.equal(payload.setlists.length, 1)

  const jsonString = JSON.stringify(payload)
  const parsed = parseBackupJson(jsonString)

  assert.equal(parsed.isValid, true)
  assert.equal(parsed.songs.length, 2)
  assert.equal(parsed.setlists.length, 1)

  // Verify first song fields
  const s1 = parsed.songs[0]
  assert.equal(s1.id, 'song-1')
  assert.equal(s1.title, 'Amazing Grace')
  assert.equal(s1.artist, 'John Newton')
  assert.equal(s1.key, 'Eb')
  assert.equal(s1.originalKey, 'Eb')
  assert.equal(s1.bpm, '96')
  assert.equal(s1.time, '3/4')
  assert.equal(s1.year, '1779')

  // Verify setlist
  const sl = parsed.setlists[0]
  assert.equal(sl.id, 'set-1')
  assert.equal(sl.name, 'Sunday Morning')
  assert.equal(sl.songs.length, 2)
  assert.equal(sl.songs[0].title, 'Amazing Grace')
  assert.equal(sl.songs[0].position, 0)
  assert.equal(sl.songs[1].title, '10,000 Reasons')
  assert.equal(sl.songs[1].position, 1)
})

test('LEGACY_JSON_COMPATIBILITY: imports legacy GTAR backup payload correctly', () => {
  const legacyBackup = {
    metadata: {
      appName: 'GTAR',
      appVersion: '1.1.108',
      exportTimestamp: 1690000000,
    },
    songs: [
      {
        id: 'legacy-song-1',
        title: 'Legacy Song',
        artist: 'Legacy Band',
        key: 'D',
        originalKey: 'D',
        content: '{title: Legacy Song}\n[D]Chord here',
        time: '6/8',
        tempo: '110',
      },
    ],
    setlists: [
      {
        id: 'legacy-set-1',
        name: 'Legacy Service',
        createdAt: 1690000000,
        songs: [
          {
            id: 'legacy-song-1',
            title: 'Legacy Song',
            artist: 'Legacy Band',
            position: 0,
          },
        ],
      },
    ],
  }

  const parsed = parseBackupJson(JSON.stringify(legacyBackup))
  assert.equal(parsed.isValid, true)
  assert.equal(parsed.songs.length, 1)
  assert.equal(parsed.songs[0].id, 'legacy-song-1')
  assert.equal(parsed.songs[0].title, 'Legacy Song')
  assert.equal(parsed.songs[0].key, 'D')
  assert.equal(parsed.songs[0].time, '6/8')
  assert.equal(parsed.songs[0].bpm, '110')
  assert.equal(parsed.setlists.length, 1)
  assert.equal(parsed.setlists[0].name, 'Legacy Service')
})

test('BACKUP_VALIDATION_ERRORS: invalid JSON or malformed input reports errors cleanly', () => {
  const emptyRes = parseBackupJson('')
  assert.equal(emptyRes.isValid, false)
  assert.match(emptyRes.error, /Empty backup input/)

  const malformedRes = parseBackupJson('{ broken json')
  assert.equal(malformedRes.isValid, false)
  assert.match(malformedRes.error, /Invalid JSON syntax/)

  const nonObjectRes = parseBackupJson('"just a string"')
  assert.equal(nonObjectRes.isValid, false)
  assert.match(nonObjectRes.error, /must be a JSON object/)
})
