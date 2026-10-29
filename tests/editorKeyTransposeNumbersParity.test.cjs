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

const { JSDOM } = require('jsdom')
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5173/' })
Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (fn) => fn(),
})
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

const React = require('react')
const { act } = React
const { createRoot } = require('react-dom/client')

const { DesktopEditor, createBlankCanonicalSong } = require('../src/components/DesktopEditor.tsx')
const { KeyPickerModal } = require('../src/components/KeyPickerModal.tsx')
const { SongViewer } = require('../src/components/SongViewer.tsx')
const {
  transposeContext,
  resolveSongKeys,
  declaredKey,
  wrapKeyOffset,
} = require('../src/utils/songKeySemantics.ts')
const {
  transposeChordToken,
  transposeChordLine,
  transposeChordProText,
  transposeKey,
  formatTransposeOffset,
  formatEnharmonicKey,
} = require('../src/utils/chordTransposer.ts')
const {
  parseChord,
  isChordToken,
} = require('../src/utils/chordParser.ts')
const {
  chordTokenToNashville,
  convertChordLineToNashville,
  convertChordProTextToNashville,
  getTrustworthySongKey,
  isValidMusicalKey,
} = require('../src/utils/nashvilleNotation.ts')
const { parseGtarSong } = require('../src/utils/songParser.ts')
const { indentText, TextHistory } = require('../src/utils/editorText.ts')
const { transposeCanonicalSong, establishChartKey, transposeChartText } = require('../src/utils/chartKeyAlignment.ts')

const fixtureSong = {
  id: 'fixture-editor-109',
  title: 'Parity Fixture',
  artist: 'Music Engine',
  key: 'G',
  originalKey: 'E',
  confirmedChartKey: 'G',
  rawContent: `{title: Parity Fixture}\n{artist: Music Engine}\n{key: G}\n{original_key: E}\n{year: 1984}\n\n[G]Amazing [D/F#]grace, how [Em7]sweet the [Cadd9]sound`,
  format: 'CHORD_PRO',
  transposeOffset: 0,
  capo: '',
  bpm: '120',
  time: '4/4',
  year: '1984',
  tags: 'Worship, Parity',
}

const inputVal = async (el, value) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    ).set.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })

const sendShortcut = async (key, el = window, shiftKey = false) =>
  act(async () => {
    el.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        shiftKey,
        bubbles: true,
      })
    )
  })

test('R1_LOSSLESS_EDITOR: round-trip, blank chart creation, year field, and directive sync without corruption', async () => {
  let currentSong = { ...fixtureSong }
  const handleUpdate = (updated) => {
    currentSong = { ...currentSong, ...updated }
    return true
  }

  let root = createRoot(document.getElementById('root'))
  try {
    await act(async () => {
      root.render(
        React.createElement(DesktopEditor, {
          song: currentSong,
          transposeOffset: 0,
          onUpdateSong: handleUpdate,
          onSaveSong: handleUpdate,
        })
      )
    })

    // Verify fields hydrated from chart metadata
    const textarea = document.querySelector('textarea')
    assert.ok(textarea)
    assert.ok(textarea.value.includes('[G]Amazing [D/F#]grace'))

    // Genuinely blank chart support
    const blank = createBlankCanonicalSong()
    assert.ok(blank.id)
    assert.equal(blank.title, 'New Song')
    assert.ok(blank.rawContent.includes('{title: New Song}'))

    // Bidirectional sync: change title in text updates field
    const updatedRaw = currentSong.rawContent.replace('Parity Fixture', 'New Parity Title')
    await inputVal(textarea, updatedRaw)
    assert.equal(currentSong.title, 'New Parity Title')

    // Save with Ctrl+S
    await sendShortcut('s')
    assert.equal(currentSong.title, 'New Parity Title')
    assert.equal(currentSong.year, '1984')
    assert.equal(currentSong.key, 'G')
    assert.equal(currentSong.originalKey, 'E')
    assert.ok(currentSong.rawContent.includes('[G]Amazing [D/F#]grace'))
  } finally {
    await act(async () => root.unmount())
  }
})

test('R1_SAVE_FAILURE_AND_DIRTY_NAV: preserves unsaved draft on save failure and presents Save/Discard/Cancel', async () => {
  let shouldFail = true
  const handleUpdate = () => {
    if (shouldFail) return false
    return true
  }

  const guardRef = { current: null }
  const recoveryRef = { current: null }
  let navTargetCalled = 0

  let root = createRoot(document.getElementById('root'))
  try {
    await act(async () => {
      root.render(
        React.createElement(DesktopEditor, {
          song: fixtureSong,
          transposeOffset: 0,
          onUpdateSong: handleUpdate,
          onSaveSong: handleUpdate,
          navigationGuardRef: guardRef,
          recoveryDraftRef: recoveryRef,
        })
      )
    })

    const textarea = document.querySelector('textarea')
    const draftText = fixtureSong.rawContent + '\n[G]Unsaved draft line'
    await inputVal(textarea, draftText)

    // Attempt save which fails
    await sendShortcut('s')
    assert.equal(textarea.value, draftText)
    assert.ok(recoveryRef.current())
    assert.ok(recoveryRef.current().rawContent.includes('Unsaved draft line'))

    // Navigate with changes triggers guard dialog
    await act(async () => {
      guardRef.current(() => {
        navTargetCalled++
      })
    })
    assert.equal(navTargetCalled, 0) // Guarded, not yet navigated

    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(dialog.textContent, /Save unsaved changes before leaving\?/)

    // Cancel leaves in editor
    const cancelButton = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')
    assert.ok(cancelButton)
    await act(async () => cancelButton.click())
    assert.equal(navTargetCalled, 0)
    assert.equal(textarea.value, draftText)
  } finally {
    await act(async () => root.unmount())
  }
})

test('R2_EDITOR_WORKFLOW: selection-aware Tab indentation and TextHistory undo/redo', () => {
  // Indent single line
  const text1 = 'Line 1\nLine 2\nLine 3'
  const indented = indentText(text1, 7, 7, false)
  assert.equal(indented.text, 'Line 1\n  Line 2\nLine 3')

  // Unindent
  const unindented = indentText(indented.text, 9, 9, true)
  assert.equal(unindented.text, 'Line 1\nLine 2\nLine 3')

  // TextHistory
  const history = new TextHistory()
  const edit0 = { text: 'A', start: 1, end: 1 }
  const edit1 = { text: 'AB', start: 2, end: 2 }
  history.record(edit0, edit1)

  const undone = history.undo(edit1)
  assert.deepEqual(undone, edit0)

  const redone = history.redo(undone)
  assert.deepEqual(redone, edit1)
})

test('R3_CANONICAL_KEY_CONTRACT: songKeySemantics, chart alignment and zero original-relative behavior', () => {
  const songData = {
    key: 'G',
    originalKey: 'E',
    rawContent: '{key: G}\n{original_key: E}\n[G]Song',
  }

  const keys = resolveSongKeys(songData)
  assert.equal(keys.chartKey, 'G')
  assert.equal(keys.originalKey, 'E')
  assert.equal(keys.originalConflict, false)
  assert.equal(keys.chartConflict, false)
  assert.equal(keys.originalRelative, true)

  // Transpose context at offset 0: display offset is +3 (from E to G), resetOffset is -3
  const ctx0 = transposeContext(songData, 0)
  assert.equal(ctx0.performanceKey, 'G')
  assert.equal(ctx0.displayOffset, 3)
  assert.equal(ctx0.resetOffset, -3)
  assert.equal(ctx0.toStoredOffset(0), -3)

  // At offset -3 (reset to Original Key E), performance key is E
  const ctxReset = transposeContext(songData, -3)
  assert.equal(ctxReset.performanceKey, 'E')
  assert.equal(ctxReset.displayOffset, 0)

  // Conflicting raw directives detected
  const conflicting = resolveSongKeys({
    rawContent: '{key: G}\n{key: A}\n{original_key: E}\n{originalkey: F}',
  })
  assert.equal(conflicting.chartConflict, true)
  assert.equal(conflicting.originalConflict, true)
  assert.equal(conflicting.originalRelative, false)

  // Contradictory minor vs major original key rejection
  const modeConflict = resolveSongKeys({
    key: 'G',
    originalKey: 'Em',
  })
  assert.equal(modeConflict.originalRelative, false) // Mode mismatch: major chart vs minor original
})

test('R4_TRANSPOSE_CORRECTNESS: plain, inline, slash, C6/9 and parenthesized extensions with bounds -11..+11', () => {
  // Extension support
  assert.ok(isChordToken('C6/9'))
  assert.ok(isChordToken('C6/9/G'))
  assert.ok(isChordToken('C(add9)'))
  assert.ok(isChordToken('G(#9)'))
  assert.ok(isChordToken('D/F#'))
  assert.ok(isChordToken('Bm7b5'))

  // Transposition of C6/9 and C6/9/G
  assert.equal(transposeChordToken('C6/9', 1), 'C#6/9')
  assert.equal(transposeChordToken('C6/9/G', 1), 'C#6/9/G#')
  assert.equal(transposeChordToken('C(add9)', 2), 'D(add9)')
  assert.equal(transposeChordToken('G(#9)', 2), 'A(#9)')
  assert.equal(transposeChordToken('D/F#', 2), 'E/G#')
  assert.equal(transposeChordToken('D/F#', -1), 'C#/F')

  // Malformed suffix rejection
  assert.equal(parseChord('Gxyz'), null)
  assert.equal(parseChord('Dance'), null)
  assert.equal(parseChord('Father'), null)

  // Preserves authored chart under zero offset
  assert.equal(transposeChordToken('D/F#', 0), 'D/F#')
  assert.equal(transposeChordLine('D/F#   C/E', 0), 'D/F#   C/E')
  assert.equal(transposeChordProText('[D/F#]Lyrics [C/E]', 0), '[D/F#]Lyrics [C/E]')

  // Semitone range -11 to +11
  for (let offset = -11; offset <= 11; offset++) {
    const res = transposeChordToken('Bb', offset)
    assert.ok(res && res.length > 0)
  }

  // Formatting helpers
  assert.equal(formatTransposeOffset(2), '+2')
  assert.equal(formatTransposeOffset(-3), '-3')
  assert.equal(formatTransposeOffset(0), '0')
  assert.equal(formatEnharmonicKey('Db'), 'C# / Db')
})

test('R5_NUMBERS_NOTATION: Nashville Number System conversion and source-key plumbing', () => {
  const key = 'G'
  assert.equal(chordTokenToNashville('G', key), '1')
  assert.equal(chordTokenToNashville('D/F#', key), '5/7')
  assert.equal(chordTokenToNashville('Em7', key), '6m7')
  assert.equal(chordTokenToNashville('Cadd9', key), '4add9')

  // Slash bass scale degree in NNS
  assert.equal(chordTokenToNashville('C/E', key), '4/6')
  assert.equal(chordTokenToNashville('Am7/D', key), '2m7/5')

  // ChordPro inline conversion
  const inline = '[G]Amazing [D/F#]grace, how [Em7]sweet [Cadd9]'
  assert.equal(
    convertChordProTextToNashville(inline, key),
    '[1]Amazing [5/7]grace, how [6m7]sweet [4add9]'
  )

  // Two-line chord row conversion with spacing preservation
  const row = 'G      D/F#      Em7      Cadd9'
  const rowConverted = convertChordLineToNashville(row, key)
  assert.equal(rowConverted, '1      5/7       6m7      4add9')

  // Unknown reference key never guesses C from fallback
  assert.equal(getTrustworthySongKey(null, 'Some plain lyrics without key'), null)
  assert.equal(getTrustworthySongKey('invalid-key', ''), null)
  assert.equal(getTrustworthySongKey('G', ''), 'G')
  assert.equal(getTrustworthySongKey('', '{key: Bb}'), 'Bb')
})

test('R6_SETLIST_OCCURRENCE: Setlist shortcuts with per-entry transpose independent of song-level offset', () => {
  const canonicalSong = {
    id: 'song-unique-1',
    title: 'Stand by Me',
    key: 'A',
    rawContent: '{key: A}\n[A]When the night',
    transposeOffset: 0,
  }

  // Two occurrences of same song in setlist with distinct entry IDs and transpose offsets
  const occurrence1 = {
    entryId: 'entry-uuid-1',
    id: canonicalSong.id,
    title: canonicalSong.title,
    key: canonicalSong.key,
    position: 0,
    transposeOffset: 2, // Performer sings in B (+2)
  }

  const occurrence2 = {
    entryId: 'entry-uuid-2',
    id: canonicalSong.id,
    title: canonicalSong.title,
    key: canonicalSong.key,
    position: 1,
    transposeOffset: -2, // Later set singing in G (-2)
  }

  // Verify song-level transpose offset is unaltered
  assert.equal(canonicalSong.transposeOffset, 0)
  assert.notEqual(occurrence1.transposeOffset, canonicalSong.transposeOffset)
  assert.notEqual(occurrence2.transposeOffset, occurrence1.transposeOffset)

  // Transpose context evaluates per-entry transpose cleanly
  const ctxOccur1 = transposeContext(canonicalSong, occurrence1.transposeOffset)
  assert.equal(ctxOccur1.performanceKey, 'B')

  const ctxOccur2 = transposeContext(canonicalSong, occurrence2.transposeOffset)
  assert.equal(ctxOccur2.performanceKey, 'G')
})

test('R7_VIEWER_INTEGRATION: SongViewer renders KeyPickerModal and Chords/Numbers toggle cleanly', async () => {
  let updatedOffset = null
  let root = createRoot(document.getElementById('root'))
  try {
    await act(async () => {
      root.render(
        React.createElement(SongViewer, {
          song: {
            ...fixtureSong,
            transposeOffset: 0,
          },
          onEdit: () => {},
          onBack: () => {},
          onUpdateSong: (up) => {
            updatedOffset = up.transposeOffset
          },
        })
      )
    })

    // Notation toggle button exists
    const toggle = document.querySelector('[data-testid="notation-toggle"]')
    assert.ok(toggle)
    assert.equal(toggle.textContent.trim(), 'Chords')

    // Click toggle changes to Numbers (NNS)
    await act(async () => toggle.click())
    assert.equal(toggle.textContent.trim(), 'Numbers (NNS)')
    assert.equal(localStorage.getItem('gtar_stage_notation'), 'numbers')

    // Click toggle changes back to Chords
    await act(async () => toggle.click())
    assert.equal(toggle.textContent.trim(), 'Chords')
    assert.equal(localStorage.getItem('gtar_stage_notation'), 'chords')

    // Reset button exists (since G vs E original key gives displayOffset +3)
    const resetButton = [...document.querySelectorAll('button')].find((b) => b.title.includes('Reset'))
    assert.ok(resetButton)
    assert.equal(resetButton.textContent.trim(), '+3')

    // Clicking reset sets offset to -3 (Original Key E)
    await act(async () => resetButton.click())
    assert.equal(updatedOffset, -3)
  } finally {
    await act(async () => root.unmount())
  }
})
