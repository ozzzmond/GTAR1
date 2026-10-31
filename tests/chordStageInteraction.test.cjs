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

test('CDX F1: actual SongViewer and Stage parents expose preview, full SVG, voicings and dismissal', async (t) => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  Object.assign(global, {
    window: dom.window, document: dom.window.document, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: fn => setTimeout(() => fn(Date.now()), 16),
    cancelAnimationFrame: clearTimeout,
  })
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  const { createRoot } = require('react-dom/client')
  const { act } = React
  const { SongViewer } = require('../src/components/SongViewer.tsx')
  const { StageView } = require('../src/components/StageView.tsx')
  const song = { id: 'parity', title: 'Parity', key: 'G', rawContent: '{key: G}\n[G]one [Em]two\n\n[Asus2]three [D/F#]four\n\n[G]five [Cmaj13]six', format: 'CHORD_PRO', createdAt: 0, updatedAt: 0 }
  const button = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label || b.getAttribute('aria-label') === label)
  const click = el => { assert.ok(el); act(() => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))) }
  const key = (el, value, extra = {}) => act(() => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra })))
  for (const [name, Component, twoColumn] of [['SongViewer', SongViewer, false], ['Stage single', StageView, false], ['Stage two-column', StageView, true]]) {
    await t.test(name, async () => {
      localStorage.clear()
      localStorage.setItem('gtar1_stage_two_column', String(twoColumn))
      let backCalls = 0
      const root = createRoot(document.getElementById('root'))
      const props = { song, transposeOffset: 0, onTransposeChange() {}, onBack() { backCalls++ }, onEdit() {} }
      act(() => root.render(React.createElement(Component, props)))
      try {
        const tokens = () => [...document.querySelectorAll('.stage-chord-token')]
        const token = chord => tokens().find(el => el.textContent === chord)
        // Both chord occurrences retain their own anchor, even with duplicate text positions.
        const secondG = tokens().filter(el => el.textContent === 'G')[1]
        secondG.getBoundingClientRect = () => ({ top: 300, bottom: 320, left: 700, right: 740, width: 40, height: 20 })
        click(secondG)
        assert.ok(document.querySelector('[data-chord-preview] svg[aria-label="Chord diagram for G"]'))
        assert.equal(document.querySelector('[data-chord-preview]').style.left, '615px')
        click(button('Open Full Diagram'))
        assert.ok(document.querySelector('[aria-modal="true"] svg'))
        click(button('Next voicing'))
        assert.match(document.querySelector('[aria-modal="true"]').textContent, /3 2 0 0 3 3/)
        const closeButton = button('Close Diagram')
        closeButton.focus()
        key(closeButton, 'Tab', { shiftKey: true })
        assert.equal(document.activeElement, button('Next voicing'))
        key(window, 'Escape')
        assert.equal(document.querySelector('[role="dialog"]'), null)
        assert.equal(document.activeElement, secondG)
        assert.equal(backCalls, 0, 'Escape dismisses chord, keeps Stage')
        // Space activates a chord without toggling Stage autoscroll.
        key(token('Em'), ' ')
        assert.ok(document.querySelector('svg[aria-label="Chord diagram for Em"]'))
        click(button('Dismiss quick preview'))
        // Hover stays open during pointer transfer to the preview.
        act(() => token('Asus2').dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })))
        await act(async () => new Promise(resolve => setTimeout(resolve, 270)))
        const preview = document.querySelector('[data-chord-preview]')
        assert.ok(preview?.querySelector('svg[aria-label="Chord diagram for Asus2"]'))
        act(() => token('Asus2').dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true })))
        act(() => preview.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })))
        await act(async () => new Promise(resolve => setTimeout(resolve, 220)))
        click(button('Open Full Diagram'))
        click(button('Next voicing'))
        assert.match(document.querySelector('[aria-modal="true"]').textContent, /x 0 2 4 0 0/)
        click(button('Close Diagram'))
        key(token('D/F#'), 'Enter')
        assert.ok(document.querySelector('svg[aria-label="Chord diagram for D/F#"]'))
        key(window, 'Escape')
        click(token('Cmaj13'))
        assert.match(document.querySelector('[data-chord-preview]').textContent, /Diagram unavailable/)
        click(button('Open Full Diagram'))
        assert.match(document.querySelector('[aria-modal="true"]').textContent, /Chord diagram unavailable/)
        click(document.querySelector('[aria-modal="true"]'))
        assert.equal(document.querySelector('[role="dialog"]'), null)
        // A transpose closes stale diagrams and resolves the displayed chord token.
        click(token('G'))
        if (Component === StageView) act(() => root.render(React.createElement(Component, { ...props, transposeOffset: 2 })))
        else click(document.querySelector('[title="Transpose up 1 semitone"]'))
        assert.equal(document.querySelector('[role="dialog"]'), null)
        const transposed = tokens()[0]
        click(transposed)
        assert.ok(document.querySelector(`svg[aria-label="Chord diagram for ${transposed.textContent}"]`))
        // Numbers mode removes active popups and chord interaction.
        if (Component === StageView) click(document.querySelector('[aria-label="Toggle Chords vs Numbers"]'))
        else click(document.querySelector('[data-testid="notation-toggle"]'))
        assert.equal(document.querySelector('[role="dialog"]'), null)
        assert.equal(document.querySelector('.stage-chord-token[role="button"]'), null)
      } finally { act(() => root.unmount()) }
    })
  }
  dom.window.close()
})

test('Escape keeps an overlapping preview dismissed until pointer exit; explicit activation and later hover still work', (t) => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  Object.assign(global, {
    window: dom.window, document: dom.window.document, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  })
  const { createRoot } = require('react-dom/client')
  const { useChordDiagrams } = require('../src/components/useChordDiagrams.tsx')
  const { act } = React
  let diagrams
  function Harness() {
    diagrams = useChordDiagrams('dismissal-regression', true)
    return React.createElement(React.Fragment, null, React.createElement('button', { id: 'trigger' }, 'Cadd9/E'), diagrams.overlays)
  }
  const root = createRoot(document.getElementById('root'))
  const preview = () => document.querySelector('[data-chord-preview]')
  const escape = () => act(() => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  try {
    act(() => root.render(React.createElement(Harness)))
    const trigger = document.getElementById('trigger')
    trigger.getBoundingClientRect = () => ({ left: 100, right: 140, top: 200, bottom: 220, width: 40, height: 20 })
    t.mock.timers.enable({ apis: ['setTimeout'] })
    // The popup overlaps the trigger's pointer position. Its removal causes a
    // browser-generated mouseenter without any intentional pointer movement.
    act(() => diagrams.onChordClick('Cadd9/E', trigger))
    act(() => preview().dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 120, clientY: 210 })))
    escape()
    assert.equal(preview(), null)
    assert.equal(document.activeElement, trigger, 'Escape restores trigger focus')
    act(() => diagrams.onChordHover('Cadd9/E', trigger))
    act(() => t.mock.timers.tick(250))
    assert.equal(preview() === null, true, 'Stationary pointer cannot reopen dismissed preview')
    act(() => diagrams.onChordClick('Cadd9/E', trigger))
    assert.ok(preview(), 'Explicit activation still opens the same chord')
    escape()
    act(() => diagrams.onChordLeave())
    act(() => diagrams.onChordHover('Cadd9/E', trigger))
    act(() => t.mock.timers.tick(250))
    assert.ok(preview(), 'Hover works again after pointer exit and reentry')
    escape()
    // With the pointer elsewhere, keyboard dismissal must not suppress the next
    // intentional hover over the same trigger.
    act(() => document.body.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 })))
    act(() => diagrams.onChordClick('Cadd9/E', trigger))
    escape()
    act(() => diagrams.onChordHover('Cadd9/E', trigger))
    act(() => t.mock.timers.tick(250))
    assert.ok(preview(), 'Pointer elsewhere does not suppress a later hover')
  } finally {
    act(() => root.unmount())
    t.mock.timers.reset()
    dom.window.close()
  }
})
