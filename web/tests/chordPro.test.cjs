require('./helpers/load-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseGtarSong } = require('../src/utils/songParser.ts')

test('ChordPro preserves lyrics, sections and trailing chords while transposing slash chords', () => {
  const raw = '{title: Practice}\n(Verse I)\n{Cadd9}Sing [G/B]on{D}\n{soc}\n[Cadd9]Again\n{eoc}'
  const song = parseGtarSong(raw, 2)
  assert.equal(song.title, 'Practice')
  assert.deepEqual(song.lines.filter(line => line.type === 'SECTION_HEADER').map(line => line.title), ['Verse I', 'Chorus'])
  assert.deepEqual(song.lines.find(line => line.type === 'CHORD_PRO').segments, [
    { chord: 'Dadd9', text: 'Sing ' }, { chord: 'A/C#', text: 'on' }, { chord: 'E', text: '' },
  ])
  assert.equal(parseGtarSong(raw).lines.find(line => line.type === 'CHORD_PRO').segments[0].chord, 'Cadd9')
})

test('two-line charts retain chord alignment and their following lyric line', () => {
  const song = parseGtarSong('C     G\nSing along', 2)
  assert.equal(song.lines[0].raw.indexOf('A'), 6)
  assert.equal(song.lines[0].isOverLyric, true)
  assert.equal(song.lines[1].lyrics, 'Sing along')
})
