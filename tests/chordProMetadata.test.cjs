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

const {
  parseChordProDirectives,
  syncCanonicalDirectives,
  formatCanonicalTempo,
} = require('../src/utils/chordProMetadata.ts')
const {
  normalizeMusicalKey,
  keysArePitchEquivalent,
} = require('../src/utils/musicalKey.ts')
const { parseGtarSong } = require('../src/utils/songParser.ts')
const {
  transposeChordToken,
  transposeKey,
} = require('../src/utils/chordTransposer.ts')

test('CHORDPRO_SIX_CANONICAL_DIRECTIVES: parses title, artist, original_key, tempo, time, year and retains unknown', () => {
  const content = `{title: Amazing Grace}
{artist: John Newton}
{original_key: Eb}
{tempo: 96 BPM}
{time: 3/4}
{year: 1779}
{c: Verse 1}
{custom_tag: test_value}
[Eb]Amazing grace! How [Ab]sweet the [Eb]sound`

  const parsed = parseChordProDirectives(content)
  assert.equal(parsed.metadata.title, 'Amazing Grace')
  assert.equal(parsed.metadata.artist, 'John Newton')
  assert.equal(parsed.metadata.originalKey, 'Eb')
  assert.equal(parsed.metadata.tempo, '96 BPM')
  assert.equal(parsed.metadata.time, '3/4')
  assert.equal(parsed.metadata.year, '1779')
  assert.ok(parsed.directives.some((d) => d.name === 'custom_tag'))
})

test('TEMPO_FORMATTING: supports 120 and 120 BPM cleanly', () => {
  assert.equal(formatCanonicalTempo('120'), '120 BPM')
  assert.equal(formatCanonicalTempo('120 BPM'), '120 BPM')
  assert.equal(formatCanonicalTempo('95 bpm'), '95 BPM')
  assert.equal(formatCanonicalTempo(''), undefined)
  assert.equal(formatCanonicalTempo(undefined), undefined)
})

test('METADATA_SYNC_BOUNDARY: syncCanonicalDirectives writes canonical original_key while preserving custom and body', () => {
  const original = `{title: Old Title}
{key: C}
{custom: keep_me}
[C]Old chord line`

  const synced = syncCanonicalDirectives(original, {
    title: 'New Title',
    artist: 'New Artist',
    originalKey: 'Bb',
    bpm: '128',
    time: '6/8',
    year: '2024',
  })

  assert.match(synced, /\{title: New Title\}/)
  assert.match(synced, /\{artist: New Artist\}/)
  assert.match(synced, /\{original_key: Bb\}/)
  assert.match(synced, /\{tempo: 128 BPM\}/)
  assert.match(synced, /\{time: 6\/8\}/)
  assert.match(synced, /\{year: 2024\}/)
  assert.match(synced, /\{custom: keep_me\}/)
  assert.match(synced, /\[C\]Old chord line/)
})

test('FLAT_KEY_PRESERVATION: preserves Bb, Eb, Ab, Db, Gb and minors without normalizing to sharps', () => {
  const flatKeys = ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Bbm', 'Ebm', 'Abm']
  for (const fk of flatKeys) {
    const normalized = normalizeMusicalKey(fk)
    assert.equal(normalized, fk, `Flat key ${fk} must not be converted to sharp`)
  }

  assert.equal(keysArePitchEquivalent('Bb', 'A#'), true)
  assert.equal(keysArePitchEquivalent('Eb', 'D#'), true)
  assert.equal(keysArePitchEquivalent('Gb', 'F#'), true)
  assert.equal(keysArePitchEquivalent('Db', 'C#'), true)
  assert.equal(keysArePitchEquivalent('Ab', 'G#'), true)
  assert.equal(keysArePitchEquivalent('C', 'D'), false)
})

test('ZERO_TRANSPOSE_OFFSET_PRESERVES_EXACT_AUTHORED_SPELLING', () => {
  const authored = ['Bb', 'Bbm', 'Ebmaj7', 'Ab7', 'Db/F', 'Gbdim', 'Cb']
  for (const chord of authored) {
    const zeroShifted = transposeChordToken(chord, 0)
    assert.equal(
      zeroShifted,
      chord,
      `Zero offset must preserve authored chord spelling for ${chord}`
    )
  }
})

test('TRANSPOSE_OFFSETS_AND_FLAT_EXTENSIONS: offsets -11 to +11 transpose cleanly', () => {
  assert.equal(transposeChordToken('Bb', 2), 'C')
  assert.equal(transposeChordToken('Eb', -1), 'D')
  assert.equal(transposeChordToken('Ab/C', 2), 'Bb/D')
  assert.equal(transposeChordToken('Dbmaj7', 1), 'Dmaj7')

  for (let offset = -11; offset <= 11; offset++) {
    const res = transposeChordToken('Bb', offset)
    assert.ok(res && res.length > 0, `Offset ${offset} produces valid chord`)
  }
})

test('KEY_TRANSPOSITION_MUSICAL_CONVENTIONS: prefers conventional flats for musician keys', () => {
  assert.equal(transposeKey('C', 1), 'Db')
  assert.equal(transposeKey('C', 2), 'D')
  assert.equal(transposeKey('C', 3), 'Eb')
  assert.equal(transposeKey('C', 5), 'F')
  assert.equal(transposeKey('C', 10), 'Bb')
  assert.equal(transposeKey('Am', 1), 'Bbm')
})

test('PARSE_GTAR_SONG: correctly decomposes ChordPro into structured lines, segments, and metadata', () => {
  const raw = `{title: Stand by Me}
{artist: Ben E. King}
{key: A}
{original_key: A}
{time: 4/4}
{tempo: 120}

[Intro]
[A] [F#m] [D] [E] [A]

[Verse 1]
When the [A]night has come
And the [F#m]land is dark`

  const parsed = parseGtarSong(raw)
  assert.equal(parsed.title, 'Stand by Me')
  assert.equal(parsed.artist, 'Ben E. King')
  assert.equal(parsed.key, 'A')
  assert.equal(parsed.originalKey, 'A')
  assert.equal(parsed.time, '4/4')
  assert.equal(parsed.bpm, '120')

  const verseHeader = parsed.lines.find(
    (l) => l.type === 'SECTION_HEADER' && l.title === 'Verse 1'
  )
  assert.ok(verseHeader, 'Must parse Verse 1 section header')

  const chordProLines = parsed.lines.filter((l) => l.type === 'CHORD_PRO')
  assert.ok(chordProLines.length > 0, 'Must identify ChordPro lyric lines')
})
