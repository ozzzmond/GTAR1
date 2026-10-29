const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({DEV:false})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<button id="opener">Tools</button><div id="root"></div>', { url: 'http://localhost/' })
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const React = require('react')
const { act } = React
const { createRoot } = require('react-dom/client')
const { MetronomeEngine } = require('../src/utils/metronome.ts')
const { GUITAR_STRINGS, GuitarReferenceTuner } = require('../src/utils/guitarTuner.ts')
const { StageToolsModal } = require('../src/components/StageToolsModal.tsx')
let contexts = []
let pending = false
let rejectResume = false
class AudioContextMock {
  state = pending || rejectResume ? 'suspended' : 'running'
  currentTime = 0
  destination = {}
  oscillators = []
  gains = []
  constructor() { contexts.push(this) }
  createOscillator() {
    const osc = { frequency: { setValueAtTime(value, time) { osc.freq = value; osc.time = time } }, connect() {}, disconnect() { osc.disconnected = true }, start(time) { osc.started = true; osc.startTime = time }, stop(time) { osc.stopped = true; osc.stopTime = time } }
    this.oscillators.push(osc)
    return osc
  }
  createGain() {
    const gain = { gain: { setValueAtTime(value) { gain.value = value }, exponentialRampToValueAtTime(value) { gain.endValue = value } }, connect() {}, disconnect() {} }
    this.gains.push(gain)
    return gain
  }
  resume() {
    if (rejectResume) return Promise.reject(new Error('Audio denied'))
    if (pending) return new Promise(resolve => { this.release = () => { this.state = 'running'; resolve() } })
    this.state = 'running'
    return Promise.resolve()
  }
  close() { this.state = 'closed'; return Promise.resolve() }
}
function reset() { contexts = []; pending = rejectResume = false; window.AudioContext = AudioContextMock }

test('Legacy six-string octave mapping and toggle/switch triangle reference behavior', async () => {
  reset()
  assert.deepEqual(GUITAR_STRINGS.map(s => [s.name, s.freq]), [['E2 (6th)', 82.41], ['A2 (5th)', 110], ['D3 (4th)', 146.83], ['G3 (3rd)', 196], ['B3 (2nd)', 246.94], ['E4 (1st)', 329.63]])
  let active = null
  const tuner = new GuitarReferenceTuner(name => { active = name })
  assert.equal(contexts.length, 0)
  for (const string of GUITAR_STRINGS) {
    const previous = contexts[0]?.oscillators.at(-1)
    await tuner.play(string.name)
    if (previous) assert.ok(previous.stopped && previous.disconnected)
    const osc = contexts[0].oscillators.at(-1)
    assert.equal(osc.freq, string.freq)
    assert.equal(osc.type, 'triangle')
    assert.equal(active, string.name)
  }
  await tuner.play('E4 (1st)')
  assert.equal(active, null)
  assert.equal(contexts[0].oscillators.length, 6)
  tuner.dispose()
  assert.equal(contexts[0].state, 'closed')
})

test('Metronome bounds, audio-clock scheduling, accent/bar wrap, volume/mute and immediate stop', async () => {
  reset()
  const engine = new MetronomeEngine()
  engine.setBpm(NaN); assert.equal(engine.getState().bpm, 120)
  engine.setBpm(999); assert.equal(engine.getState().bpm, 300)
  engine.setBpm(-1); assert.equal(engine.getState().bpm, 30)
  engine.setBpm(120); engine.setBeatsPerBar(2)
  await engine.start()
  const ctx = contexts[0]
  ctx.currentTime = 0.45; engine.schedule()
  ctx.currentTime = 0.95; engine.schedule()
  assert.deepEqual(ctx.oscillators.map(o => [o.freq, o.startTime]), [[1200, 0], [800, 0.5], [1200, 1]])
  engine.setVolume(0.4); assert.equal(ctx.gains[0].value, 0.4)
  engine.toggleMute(); assert.equal(ctx.gains[0].value, 0)
  engine.toggleMute(); assert.equal(ctx.gains[0].value, 0.4)
  engine.setBpm(240)
  ctx.currentTime = 1.45; engine.schedule()
  ctx.currentTime = 1.7; engine.schedule()
  assert.equal(ctx.oscillators.at(-1).startTime, 1.75)
  engine.stop()
  assert.equal(engine.getState().isRunning, false)
  assert.equal(engine.voices.size, 0)
  assert.equal(engine.visualTimers.size, 0)
  assert.ok(ctx.oscillators.every(o => o.stopped && o.disconnected))
  engine.dispose()
  assert.equal(ctx.state, 'closed')
})

test('Cancelled pending audio cannot restart after stop/dispose; independent engines', async () => {
  reset(); pending = true
  const engine = new MetronomeEngine()
  const start = engine.start()
  engine.dispose(); contexts[0].release(); await start
  assert.equal(engine.getState().isRunning, false)
  assert.equal(contexts[0].oscillators.length, 0)
  let active
  const tuner = new GuitarReferenceTuner(name => { active = name })
  const play = tuner.play('E2 (6th)')
  tuner.dispose(); contexts[1].release(); await play
  assert.equal(active, null)
  assert.equal(contexts[1].oscillators.length, 0)
  reset()
  const metro = new MetronomeEngine()
  const other = new GuitarReferenceTuner(() => {})
  await metro.start(); await other.play('A2 (5th)'); other.dispose()
  assert.equal(metro.getState().isRunning, true)
  contexts[0].state = 'suspended'; contexts[0].onstatechange()
  assert.equal(metro.getState().isRunning, false)
  metro.dispose()
})

test('Unsupported and rejected audio fail visibly without running state or unhandled startup', async () => {
  reset(); window.AudioContext = undefined
  const metro = new MetronomeEngine()
  await assert.rejects(metro.start(), /not supported/)
  assert.equal(metro.getState().isRunning, false)
  const tuner = new GuitarReferenceTuner(() => {})
  await assert.rejects(tuner.play('E2 (6th)'), /not supported/)
  reset(); rejectResume = true
  await assert.rejects(metro.start(), /Audio denied/)
  await assert.rejects(tuner.play('A2 (5th)'), /Audio denied/)
  metro.dispose(); tuner.dispose()
})

test('Sheet controls, tap tempo, focus trap, tab switch, repeated open/close and background silence', async () => {
  reset()
  const root = createRoot(document.getElementById('root'))
  const opener = document.getElementById('opener')
  const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text)
  const click = async element => act(async () => { element.click(); await Promise.resolve() })
  for (let i = 0; i < 2; i++) {
    opener.focus()
    await act(async () => root.render(React.createElement(StageToolsModal, { initialBpm: 100, onClose: () => root.render(null) })))
    assert.equal(contexts.length, i * 2)
    await click(button('+5')); assert.match(document.querySelector('[data-testid="metronome-bpm"]').textContent, /105/)
    const originalNow = performance.now
    let now = 0
    performance.now = () => now
    await click(button('Tap Tempo')); now = 500; await click(button('Tap Tempo'))
    performance.now = originalNow
    assert.match(document.querySelector('[data-testid="metronome-bpm"]').textContent, /120/)
    await click(button('Start Metronome'))
    assert.ok(button('Stop Metronome'))
    await click(button('Mute')); assert.equal(contexts.at(-1).gains[0].value, 0)
    await click(button('Guitar Tuner'))
    assert.ok(contexts.at(-1).oscillators.every(o => o.stopped))
    const stringButton = [...document.querySelectorAll('button')].find(b => b.textContent.includes('E2 (6th)'))
    await click(stringButton)
    assert.equal(stringButton.getAttribute('aria-pressed'), 'true')
    await act(async () => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new window.Event('visibilitychange')) })
    assert.ok(contexts.slice(-2).every(c => c.state === 'closed'))
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    await act(async () => document.dispatchEvent(new window.Event('visibilitychange')))
    assert.equal(stringButton.getAttribute('aria-pressed'), 'false')
    const close = document.querySelector('[aria-label="Close Stage Tools"]')
    close.focus()
    await act(async () => close.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    assert.equal(document.activeElement, button('Stop reference tone'))
    await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.activeElement, opener)
  }
  await act(async () => root.unmount())
})

test('Stage entry point preserves chart/scroll and isolates tool keys; Stage exit cleans active audio', async () => {
  reset()
  Object.assign(global, {
    localStorage: window.localStorage, sessionStorage: window.sessionStorage,
    requestAnimationFrame: fn => setTimeout(() => fn(Date.now()), 16),
    cancelAnimationFrame: id => clearTimeout(id),
  })
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  const { StageView } = require('../src/components/StageView.tsx')
  const song = { id: 'local', title: 'Practice', bpm: '90 BPM', originalKey: 'G', confirmedChartKey: 'G', rawContent: '{title: Practice}\n{original_key: G}\n[Verse]\n[G]Practice', format: 'CHORD_PRO', createdAt: 1, updatedAt: 1 }
  const before = JSON.stringify(song)
  let exited = 0
  const root = createRoot(document.getElementById('root'))
  await act(async () => root.render(React.createElement(StageView, { song, transposeOffset: 0, onTransposeChange() {}, onBack() { exited++ } })))
  const canvas = document.querySelector('[data-stage-canvas]')
  canvas.scrollTop = 120
  const opener = document.querySelector('[aria-label="Open Stage Tools"]')
  await act(async () => opener.click())
  assert.match(document.querySelector('[data-testid="metronome-bpm"]').textContent, /90/)
  await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })))
  assert.ok(document.querySelector('[aria-label="Start auto-scroll"]'))
  await act(async () => document.querySelector('[aria-label="Close Stage Tools"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(exited, 0)
  assert.equal(canvas.scrollTop, 120)
  assert.equal(JSON.stringify(song), before)
  await act(async () => opener.click())
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Start Metronome').click())
  await act(async () => window.dispatchEvent(new window.Event('pagehide')))
  assert.equal(contexts.at(-1).state, 'closed')
  assert.ok([...document.querySelectorAll('button')].some(b => b.textContent === 'Start Metronome'))
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Start Metronome').click())
  await act(async () => root.unmount())
  assert.equal(contexts.at(-1).state, 'closed')
  assert.ok(contexts.at(-1).oscillators.every(o => o.stopped && o.disconnected))
})

test('Stage Tools use merged Batch 5 semantic roles under all seven factory themes without changing appearance settings', async () => {
  reset()
  const { THEME_OPTIONS, DEFAULT_CUSTOM_COLORS, applyThemeRuntime } = require('../src/components/ThemeModal.tsx')
  const snapshot = JSON.stringify(THEME_OPTIONS)
  const root = createRoot(document.getElementById('root'))
  assert.equal(THEME_OPTIONS.length, 7)
  try {
    for (const theme of THEME_OPTIONS) {
      applyThemeRuntime(theme.id, DEFAULT_CUSTOM_COLORS)
      const variables = document.documentElement.style.cssText
      const storage = JSON.stringify(Object.entries(localStorage))
      await act(async () => root.render(React.createElement(StageToolsModal, { onClose() {} })))
      const dialog = document.querySelector('[aria-label="Stage Tools"]')
      assert.ok(dialog.classList.contains('bg-app-surface'))
      assert.ok(dialog.classList.contains('border-app-border'))
      const start = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Start Metronome')
      assert.ok(start.classList.contains('bg-app-button'))
      assert.ok(start.classList.contains('text-app-button-text'))
      const tuner = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Guitar Tuner')
      await act(async () => tuner.click())
      assert.ok(tuner.className.includes('aria-pressed:bg-app-action'))
      assert.equal(document.body.dataset.theme, theme.id)
      assert.equal(document.documentElement.style.cssText, variables)
      assert.equal(JSON.stringify(Object.entries(localStorage)), storage)
      await act(async () => root.render(null))
    }
  } finally { await act(async () => root.unmount()) }
  assert.equal(JSON.stringify(THEME_OPTIONS), snapshot)
  const source = fs.readFileSync(require.resolve('../src/components/StageToolsModal.tsx'), 'utf8')
  assert.doesNotMatch(source, /(?:bg|text|border)-(?:slate|sky|amber|red)-\d/)
})
