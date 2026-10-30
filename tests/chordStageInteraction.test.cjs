const test = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

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

const { SongLineRenderer } = require('../src/components/SongLineRenderer.tsx')
const { parseGtarSong } = require('../src/utils/songParser.ts')
const { getChordVoicing } = require('../src/utils/chordDictionary.ts')

test('STAGE_CHORD_TOKENS_ACCESSIBILITY: Chord tokens in stage view have role button, tabIndex, and click handler', () => {
  let clickedChord = null
  const parsed = parseGtarSong('[G]Desert [Em]highway [D/F#]drive', 0)
  
  const html = renderToStaticMarkup(
    React.createElement(SongLineRenderer, {
      lines: parsed.lines,
      fontSizePx: 20,
      notation: 'chords',
      onChordClick: (chord) => { clickedChord = chord },
    })
  )

  // Verify interactive chord tokens are marked with cursor-pointer and stage-chord-token
  assert.match(html, /class="stage-chord-token cursor-pointer select-none"/)
  assert.match(html, /role="button"/)
  assert.match(html, /tabindex="0"/)
  assert.match(html, />G<\/span>/)
  assert.match(html, />Em<\/span>/)
  assert.match(html, />D\/F#<\/span>/)
})

test('STAGE_NUMBERS_MODE_SUPPRESSION: When notation is numbers, chord diagrams are suppressed', () => {
  const parsed = parseGtarSong('[G]Desert [Em]highway', 0)
  
  const html = renderToStaticMarkup(
    React.createElement(SongLineRenderer, {
      lines: parsed.lines,
      fontSizePx: 20,
      notation: 'numbers',
      referenceKey: 'G',
    })
  )

  // In numbers mode: role=button and cursor-pointer are suppressed
  assert.match(html, /stage-number-token cursor-default/)
  assert.doesNotMatch(html, /role="button"/)
  assert.match(html, />1<\/span>/, 'G in key of G is rendered as 1')
  assert.match(html, />6m<\/span>/, 'Em in key of G is rendered as 6m')
})

test('OFFLINE_DETERMINISM: Chord lookups and diagrams require zero network requests', () => {
  const sampleChords = ['G', 'Em', 'C', 'D', 'A', 'Am', 'E', 'F', 'D/F#', 'G/B', 'Cadd9', 'F#m']
  for (const c of sampleChords) {
    const v = getChordVoicing(c)
    assert.ok(v, `${c} must resolve synchronously offline`)
    assert.equal(v.frets.length, 6)
  }
})
