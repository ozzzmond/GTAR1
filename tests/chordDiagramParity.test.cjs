const test = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// TypeScript transpile setup for tests
const fs = require('node:fs')
const ts = require('typescript')

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) =>
    module._compile(
      ts.transpileModule(
        fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({DEV:false})'),
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
  getChordVoicing,
  getAllChordVoicings,
  getSoundingPitchClasses,
  normalizeChordForVoicingLookup,
  STANDARD_TUNING_NAMES,
  STANDARD_TUNING_MIDI,
  OPEN_STRING_SEMITONES,
  PITCH_CLASS_NAMES,
} = require('../src/utils/chordDictionary.ts')
const { ChordSvgDiagram } = require('../src/components/ChordSvgDiagram.tsx')
const { ChordQuickPreview } = require('../src/components/ChordQuickPreview.tsx')
const { FretboardDiagramModal } = require('../src/components/FretboardDiagramModal.tsx')
const { transposeChordToken } = require('../src/utils/chordTransposer.ts')

// ============================================================================
// 1. STANDARD SIX-STRING GUITAR TUNING & STRING ORDERING
// ============================================================================
test('TUNING_AND_STRING_ORDER: Verified E2-A2-D3-G3-B3-E4 tuning and low-to-high string order', () => {
  // String names left to right: low E (string 6) to high e (string 1)
  assert.deepEqual(
    Array.from(STANDARD_TUNING_NAMES),
    ['E', 'A', 'D', 'G', 'B', 'e'],
    'Strings must be ordered low E to high e: E A D G B e'
  )

  // Standard MIDI pitch numbers: E2(40), A2(45), D3(50), G3(55), B3(59), E4(64)
  assert.deepEqual(
    Array.from(STANDARD_TUNING_MIDI),
    [40, 45, 50, 55, 59, 64],
    'Standard MIDI notes must match standard guitar tuning'
  )

  // Semitones mod 12: E=4, A=9, D=2, G=7, B=11, E=4
  assert.deepEqual(
    Array.from(OPEN_STRING_SEMITONES),
    [4, 9, 2, 7, 11, 4],
    'Open string pitch classes must be E(4), A(9), D(2), G(7), B(11), E(4)'
  )
})

// ============================================================================
// 2. G AND Em PARITY & SOUNDING PITCH CLASSES
// ============================================================================
test('G_CHORD_PARITY: Open G produces sounding pitch classes {G, B, D} with conventional fingering', () => {
  const g = getChordVoicing('G')
  assert.ok(g, 'G must resolve to a valid voicing')
  assert.equal(g.chord, 'G')
  assert.equal(g.baseFret, 1)

  // Conventional 3-finger open G: [3, 2, 0, 0, 0, 3]
  assert.deepEqual(g.frets, [3, 2, 0, 0, 0, 3], 'G frets must be standard open shape 3 2 0 0 0 3')
  assert.deepEqual(g.fingers, [2, 1, 0, 0, 0, 3], 'G fingers match standard middle-index-ring')

  // Sounding pitch classes calculation
  const pitches = getSoundingPitchClasses(g).sort()
  assert.deepEqual(pitches, ['B', 'D', 'G'], 'Sounding pitches must be exact G major triad {G, B, D}')

  // Prove rejection of reversed string order:
  // If strings were inverted e-B-G-D-A-E: frets would be [3, 0, 0, 0, 2, 3]
  const reversedGVoicing = { chord: 'G_reversed', baseFret: 1, frets: [3, 0, 0, 0, 2, 3] }
  const reversedGPitches = getSoundingPitchClasses(reversedGVoicing)
  assert.ok(reversedGPitches.includes('A'), 'Reversed G mistakenly introduces A (not in G major)')
  assert.ok(reversedGPitches.includes('C#'), 'Reversed G mistakenly introduces C# (tritone from G)')
  assert.ok(!reversedGPitches.includes('B'), 'Reversed G lacks crucial major third B')
})

test('EM_CHORD_PARITY: Open Em produces sounding pitch classes {E, G, B} with conventional fingering', () => {
  const em = getChordVoicing('Em')
  assert.ok(em, 'Em must resolve to a valid voicing')
  assert.equal(em.chord, 'Em')
  assert.equal(em.baseFret, 1)

  // Conventional open Em: [0, 2, 2, 0, 0, 0]
  assert.deepEqual(em.frets, [0, 2, 2, 0, 0, 0], 'Em frets must be standard open shape 0 2 2 0 0 0')
  assert.deepEqual(em.fingers, [0, 2, 3, 0, 0, 0], 'Em fingers match standard middle-ring')

  // Sounding pitch classes calculation
  const pitches = getSoundingPitchClasses(em).sort()
  assert.deepEqual(pitches, ['B', 'E', 'G'], 'Sounding pitches must be exact E minor triad {E, G, B}')

  // Prove rejection of reversed string order:
  // If strings were inverted: frets would be [0, 0, 0, 2, 2, 0]
  const reversedEmVoicing = { chord: 'Em_reversed', baseFret: 1, frets: [0, 0, 0, 2, 2, 0] }
  const reversedEmPitches = getSoundingPitchClasses(reversedEmVoicing)
  assert.ok(reversedEmPitches.includes('A'), 'Reversed Em mistakenly introduces A (not in E minor)')
  assert.ok(reversedEmPitches.includes('C#'), 'Reversed Em mistakenly introduces C# (not in E minor)')
  assert.ok(!reversedEmPitches.includes('G'), 'Reversed Em lacks minor third G')
})

test('ALTERNATE_VOICINGS_PRESERVED: G and Em multiple voicings cataloged and accessible', () => {
  const gVoicings = getAllChordVoicings('G')
  assert.ok(gVoicings.length >= 3, `Expected at least 3 voicings for G, got ${gVoicings.length}`)
  
  // Voicing 1: standard 3-finger open G
  assert.deepEqual(gVoicings[0].frets, [3, 2, 0, 0, 0, 3])
  // Voicing 2: 4-finger rock/folk G [3, 2, 0, 0, 3, 3]
  assert.deepEqual(gVoicings[1].frets, [3, 2, 0, 0, 3, 3])
  assert.deepEqual(getSoundingPitchClasses(gVoicings[1]).sort(), ['B', 'D', 'G'])
  // Voicing 4 or barre: 3rd fret barre G [3, 5, 5, 4, 3, 3]
  const barreG = gVoicings.find((v) => v.baseFret === 3)
  assert.ok(barreG, 'G must have 3rd fret barre voicing')
  assert.deepEqual(barreG.frets, [3, 5, 5, 4, 3, 3])
  assert.deepEqual(getSoundingPitchClasses(barreG).sort(), ['B', 'D', 'G'])

  const emVoicings = getAllChordVoicings('Em')
  assert.ok(emVoicings.length >= 2, `Expected at least 2 voicings for Em, got ${emVoicings.length}`)
  // Voicing 1: open Em
  assert.deepEqual(emVoicings[0].frets, [0, 2, 2, 0, 0, 0])
  // Barre Em at 7th fret
  const barreEm = emVoicings.find((v) => v.baseFret === 7)
  assert.ok(barreEm, 'Em must have 7th fret barre voicing')
  assert.deepEqual(barreEm.frets, [-1, 7, 9, 9, 8, 7])
  assert.deepEqual(getSoundingPitchClasses(barreEm).sort(), ['B', 'E', 'G'])
})

// ============================================================================
// 3. ESSENTIAL NATURAL CHORDS (C, D, A, Am, E, F)
// ============================================================================
test('NATURAL_CHORDS_PITCHES: C, D, A, Am, E, F produce exact harmonic pitches', () => {
  // C major: {C, E, G}
  const c = getChordVoicing('C')
  assert.deepEqual(c.frets, [-1, 3, 2, 0, 1, 0])
  assert.deepEqual(getSoundingPitchClasses(c).sort(), ['C', 'E', 'G'])

  // D major: {D, F#, A}
  const d = getChordVoicing('D')
  assert.deepEqual(d.frets, [-1, -1, 0, 2, 3, 2])
  assert.deepEqual(getSoundingPitchClasses(d).sort(), ['A', 'D', 'F#'])

  // A major: {A, C#, E}
  const a = getChordVoicing('A')
  assert.deepEqual(a.frets, [-1, 0, 2, 2, 2, 0])
  assert.deepEqual(getSoundingPitchClasses(a).sort(), ['A', 'C#', 'E'])

  // A minor: {A, C, E}
  const am = getChordVoicing('Am')
  assert.deepEqual(am.frets, [-1, 0, 2, 2, 1, 0])
  assert.deepEqual(getSoundingPitchClasses(am).sort(), ['A', 'C', 'E'])

  // E major: {E, G#, B}
  const e = getChordVoicing('E')
  assert.deepEqual(e.frets, [0, 2, 2, 1, 0, 0])
  assert.deepEqual(getSoundingPitchClasses(e).sort(), ['B', 'E', 'G#'])

  // F major (barre at fret 1): {F, A, C}
  const f = getChordVoicing('F')
  assert.deepEqual(f.frets, [1, 3, 3, 2, 1, 1])
  assert.deepEqual(f.barres, [1])
  assert.deepEqual(getSoundingPitchClasses(f).sort(), ['A', 'C', 'F'])
})

// ============================================================================
// 4. REPRESENTATIVE 7TH, SLASH, BARRE & EXTENDED CHORDS
// ============================================================================
test('SEVENTH_CHORDS_PARITY: Dominant and major 7th chords resolve and sound harmonic 7ths', () => {
  // G7: {G, B, D, F}
  const g7 = getChordVoicing('G7')
  assert.ok(g7)
  assert.deepEqual(g7.frets, [3, 2, 0, 0, 0, 1])
  assert.deepEqual(getSoundingPitchClasses(g7).sort(), ['B', 'D', 'F', 'G'])

  // C7: {C, E, G, Bb/A#}
  const c7 = getChordVoicing('C7')
  assert.ok(c7)
  assert.deepEqual(c7.frets, [-1, 3, 2, 3, 1, 0])
  const c7Pitches = getSoundingPitchClasses(c7)
  assert.ok(c7Pitches.includes('A#') || c7Pitches.includes('Bb'))

  // D7: {D, F#, A, C}
  const d7 = getChordVoicing('D7')
  assert.ok(d7)
  assert.deepEqual(d7.frets, [-1, -1, 0, 2, 1, 2])
  assert.deepEqual(getSoundingPitchClasses(d7).sort(), ['A', 'C', 'D', 'F#'])

  // A7: {A, C#, E, G}
  const a7 = getChordVoicing('A7')
  assert.ok(a7)
  assert.deepEqual(a7.frets, [-1, 0, 2, 0, 2, 0])
  assert.deepEqual(getSoundingPitchClasses(a7).sort(), ['A', 'C#', 'E', 'G'])

  // B7: {B, D#, F#, A}
  const b7 = getChordVoicing('B7')
  assert.ok(b7)
  assert.deepEqual(b7.frets, [-1, 2, 1, 2, 0, 2])
  assert.deepEqual(getSoundingPitchClasses(b7).sort(), ['A', 'B', 'D#', 'F#'])
})

test('SLASH_CHORDS_PARITY: Lowest fretted note matches requested bass note exactly', () => {
  // D/F# -> lowest note on string 6 is fret 2 = F#
  const dfsharp = getChordVoicing('D/F#')
  assert.ok(dfsharp)
  assert.equal(dfsharp.frets[0], 2, 'String 6 must be fret 2 (F#)')
  const dfsharpPitches = getSoundingPitchClasses(dfsharp).sort()
  assert.deepEqual(dfsharpPitches, ['A', 'D', 'F#'])

  // G/B -> muted string 6 (-1), lowest sounded on string 5 is fret 2 = B
  const gb = getChordVoicing('G/B')
  assert.ok(gb)
  assert.equal(gb.frets[0], -1, 'String 6 must be muted')
  assert.equal(gb.frets[1], 2, 'String 5 must be fret 2 (B)')
  assert.deepEqual(getSoundingPitchClasses(gb).sort(), ['B', 'D', 'G'])

  // C/E -> lowest sounded is string 6 open = E
  const ce = getChordVoicing('C/E')
  assert.ok(ce)
  assert.equal(ce.frets[0], 0, 'String 6 must be open 0 (E)')

  // C/G -> lowest sounded is string 6 fret 3 = G
  const cg = getChordVoicing('C/G')
  assert.ok(cg)
  assert.equal(cg.frets[0], 3, 'String 6 must be fret 3 (G)')

  // A/C# -> string 6 muted, string 5 fret 4 = C#
  const acsharp = getChordVoicing('A/C#')
  assert.ok(acsharp)
  assert.equal(acsharp.frets[0], -1)
  assert.equal(acsharp.frets[1], 4, 'String 5 must be fret 4 (C#)')
})

test('BARRE_CHORDS_AND_FRET_OFFSETS: Base fret offsets and absolute frets valid and within 5-fret span', () => {
  const barreChords = ['Bm', 'C#m', 'F#m', 'Cm', 'Bb', 'Eb']
  for (const name of barreChords) {
    const v = getChordVoicing(name)
    assert.ok(v, `Voicing must exist for ${name}`)
    assert.ok(v.baseFret >= 1 && v.baseFret <= 12, `Base fret valid for ${name}`)
    for (let s = 0; s < 6; s++) {
      const f = v.frets[s]
      if (f > 0) {
        assert.ok(f >= v.baseFret, `Fret ${f} on string ${s} must be >= baseFret ${v.baseFret} for ${name}`)
        assert.ok(f - v.baseFret + 1 <= 5, `Fret ${f} must fit within 5-fret window for ${name}`)
      }
    }
  }
})

test('EXTENDED_CHORDS_PARITY: add9, sus2, sus4, maj7 resolve with expected pitch classes', () => {
  // Cadd9: {C, E, G, D}
  const cadd9 = getChordVoicing('Cadd9')
  assert.ok(cadd9)
  assert.deepEqual(cadd9.frets, [-1, 3, 2, 0, 3, 0])
  assert.deepEqual(getSoundingPitchClasses(cadd9).sort(), ['C', 'D', 'E', 'G'])

  // Dsus4: {D, G, A}
  const dsus4 = getChordVoicing('Dsus4')
  assert.ok(dsus4)
  assert.deepEqual(dsus4.frets, [-1, -1, 0, 2, 3, 3])
  assert.deepEqual(getSoundingPitchClasses(dsus4).sort(), ['A', 'D', 'G'])

  // Asus2: {A, B, E}
  const asus2 = getChordVoicing('Asus2')
  assert.ok(asus2)
  assert.deepEqual(asus2.frets, [-1, 0, 2, 2, 0, 0])
  assert.deepEqual(getSoundingPitchClasses(asus2).sort(), ['A', 'B', 'E'])

  // Cmaj7: {C, E, G, B}
  const cmaj7 = getChordVoicing('Cmaj7')
  assert.ok(cmaj7)
  assert.deepEqual(cmaj7.frets, [-1, 3, 2, 0, 0, 0])
  assert.deepEqual(getSoundingPitchClasses(cmaj7).sort(), ['B', 'C', 'E', 'G'])
})

// ============================================================================
// 5. TRANSPOSE-TO-DIAGRAM PARITY
// ============================================================================
test('TRANSPOSE_TO_DIAGRAM_PARITY: Transposed chords across all 12 semitones resolve to valid diagrams', () => {
  // Starting chord G transposed through all 12 semitones
  for (let offset = -11; offset <= 11; offset++) {
    const transposedG = transposeChordToken('G', offset)
    const voicing = getChordVoicing(transposedG)
    assert.ok(voicing, `Transposed G (offset ${offset} -> ${transposedG}) must resolve to a valid voicing`)
  }

  // Starting chord Em transposed through all 12 semitones
  for (let offset = -11; offset <= 11; offset++) {
    const transposedEm = transposeChordToken('Em', offset)
    const voicing = getChordVoicing(transposedEm)
    assert.ok(voicing, `Transposed Em (offset ${offset} -> ${transposedEm}) must resolve to a valid voicing`)
  }
})

// ============================================================================
// 6. HONEST FALLBACK FOR UNSUPPORTED SHAPES
// ============================================================================
test('HONEST_FALLBACK: Unsupported or non-chord tokens return null without crashing', () => {
  assert.equal(getChordVoicing('C13#11'), null, 'Unsupported complex extension returns null')
  assert.equal(getChordVoicing('NotAChord'), null, 'Non-chord returns null')
  assert.equal(getChordVoicing('N.C.'), null, 'No-chord marker returns null')
  assert.equal(getChordVoicing(''), null, 'Empty string returns null')
})

// ============================================================================
// 7. COMPONENT RENDERING & ACCESSIBILITY
// ============================================================================
test('SVG_RENDERER: ChordSvgDiagram renders 6 strings, frets, nut/baseFret, open/muted marks, and dots', () => {
  const g = getChordVoicing('G')
  const html = renderToStaticMarkup(React.createElement(ChordSvgDiagram, { voicing: g }))

  // Must render strings E A D G B e
  assert.match(html, /<text[^>]*>E<\/text>/, 'Must render low E label')
  assert.match(html, /<text[^>]*>A<\/text>/, 'Must render A label')
  assert.match(html, /<text[^>]*>D<\/text>/, 'Must render D label')
  assert.match(html, /<text[^>]*>G<\/text>/, 'Must render G label')
  assert.match(html, /<text[^>]*>B<\/text>/, 'Must render B label')
  assert.match(html, /<text[^>]*>e<\/text>/, 'Must render high e label')

  // Accessible role and label
  assert.match(html, /role="img"/, 'Must have role=img')
  assert.match(html, /aria-label="Chord diagram for G"/, 'Must have descriptive aria-label')

  // Open circles for D, G, B strings
  assert.match(html, /<circle[^>]*fill="none"/, 'Must render open string circle indicator')

  // Test barre chord SVG rendering
  const bm = getChordVoicing('Bm')
  const bmHtml = renderToStaticMarkup(React.createElement(ChordSvgDiagram, { voicing: bm }))
  assert.match(bmHtml, /2fr/, 'Bm at fret 2 must render base fret indicator 2fr')
})

test('MODAL_RENDERER: FretboardDiagramModal renders accessible dialog, summary, and honest fallback', () => {
  const g = getChordVoicing('G')
  const openModalHtml = renderToStaticMarkup(
    React.createElement(FretboardDiagramModal, { voicing: g, requestedChord: 'G', onClose: () => {} })
  )

  assert.match(openModalHtml, /role="dialog"/, 'Modal must have role=dialog')
  assert.match(openModalHtml, /aria-modal="true"/, 'Modal must have aria-modal=true')
  assert.match(openModalHtml, /Frets:.*3 2 0 0 0 3/, 'Modal must display frets summary')
  assert.match(openModalHtml, /aria-label="Close Diagram"/, 'Close button must have accessible label')

  // Fallback test
  const fallbackHtml = renderToStaticMarkup(
    React.createElement(FretboardDiagramModal, { voicing: null, requestedChord: 'UnknownChord', onClose: () => {} })
  )
  assert.match(fallbackHtml, /Chord diagram unavailable/, 'Must show honest fallback text')
  assert.match(fallbackHtml, /No trusted guitar fingering is currently cataloged/, 'Must explain why unavailable')
})

test('QUICK_PREVIEW_RENDERER: ChordQuickPreview renders anchored popover with offline diagram', () => {
  const em = getChordVoicing('Em')
  const anchor = {
    rect: { top: 100, left: 100, width: 40, height: 20, bottom: 120, right: 140 },
    chord: 'Em',
  }
  const previewHtml = renderToStaticMarkup(
    React.createElement(ChordQuickPreview, { anchor, voicing: em, onClose: () => {} })
  )

  assert.match(previewHtml, /role="tooltip"/, 'Quick preview must have tooltip role')
  assert.match(previewHtml, /Em/, 'Quick preview must display chord name')
  assert.match(previewHtml, /aria-label="Dismiss quick preview"/, 'Dismiss button must have accessible label')
})
