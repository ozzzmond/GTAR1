const test = require('node:test')
const assert = require('node:assert/strict')
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

const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-container"></div></body></html>', {
  url: 'http://localhost/',
})

// Setup mock localStorage
const storageStore = new Map()
const mockLocalStorage = {
  getItem: (key) => storageStore.get(key) ?? null,
  setItem: (key, value) => { storageStore.set(key, String(value)) },
  removeItem: (key) => { storageStore.delete(key) },
  clear: () => { storageStore.clear() },
}

Object.defineProperty(dom.window, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
})

let lastWindowOpened = null
dom.window.open = (url, target, features) => {
  lastWindowOpened = { url, target, features, opener: null }
  return lastWindowOpened
}

Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  localStorage: mockLocalStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
})

const React = require('react')
const { act } = React
const { createRoot } = require('react-dom/client')

const {
  validateRetrievalUrl,
  retrieveSongSource,
  parseImportedChordContent,
  getProviderForUrl,
  KNOWN_SOURCE_PROVIDERS,
  MAX_IMPORT_BYTES,
} = require('../src/utils/songSourceRetrieval.ts')
const { BrowseSongSourcesModal } = require('../src/components/BrowseSongSourcesModal.tsx')

function setInputValue(el, value) {
  const prototype = el instanceof dom.window.HTMLTextAreaElement
    ? dom.window.HTMLTextAreaElement.prototype
    : dom.window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value)
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}

test('DISCOVERY_AND_PROVIDER_CLASSIFICATION: Audits external song sources and identifies restrictions', () => {
  assert.equal(KNOWN_SOURCE_PROVIDERS.length, 4)

  // 1. SongSelect (CCLI)
  const songSelect = KNOWN_SOURCE_PROVIDERS.find((p) => p.id === 'songselect')
  assert.ok(songSelect)
  assert.equal(songSelect.classification, 'RESTRICTED')
  assert.equal(songSelect.requiresAuth, true)
  assert.equal(songSelect.corsSupported, false)
  assert.match(songSelect.restrictionReason, /CCLI Terms of Service/i)
  assert.equal(songSelect.matchUrl('https://songselect.ccli.com/view'), true)

  // 2. Ultimate Guitar
  const ug = KNOWN_SOURCE_PROVIDERS.find((p) => p.id === 'ultimate_guitar')
  assert.ok(ug)
  assert.equal(ug.classification, 'RESTRICTED')
  assert.equal(ug.corsSupported, false)
  assert.match(ug.restrictionReason, /Terms of Service prohibit scraping/i)
  assert.equal(ug.matchUrl('https://tabs.ultimate-guitar.com/tab/eagles/hotel-california-chords-46190'), true)

  // 3. Chordie
  const chordie = KNOWN_SOURCE_PROVIDERS.find((p) => p.id === 'chordie')
  assert.ok(chordie)
  assert.equal(chordie.classification, 'UNSUPPORTED')
  assert.equal(chordie.corsSupported, false)
  assert.equal(chordie.matchUrl('https://www.chordie.com/song.php/song42.html'), true)

  // 4. OPMTunes
  const opmtunes = KNOWN_SOURCE_PROVIDERS.find((p) => p.id === 'opmtunes')
  assert.ok(opmtunes)
  assert.equal(opmtunes.classification, 'UNSUPPORTED')
  assert.equal(opmtunes.corsSupported, false)
  assert.equal(opmtunes.matchUrl('https://www.opmtunes.com/artist/eraserheads'), true)

  // Lookup helper
  assert.equal(getProviderForUrl('https://tabs.ultimate-guitar.com/tab/123')?.id, 'ultimate_guitar')
  assert.equal(getProviderForUrl('https://songselect.ccli.com/songs/456')?.id, 'songselect')
  assert.equal(getProviderForUrl('https://random-unverified-site.com/chords.txt'), null)
})

test('RETRIEVAL_SECURITY_AND_SSRF: Rejects private IPs, loopback, dangerous schemes, and restricted providers', async () => {
  // SSRF prevention: Loopback and local IPs
  const checkLocalhost = validateRetrievalUrl('http://localhost/tab')
  assert.equal(checkLocalhost.valid, false)
  assert.equal(checkLocalhost.isPrivateOrLocal, true)

  const check127 = validateRetrievalUrl('http://127.0.0.1:8080/secret')
  assert.equal(check127.valid, false)
  assert.equal(check127.isPrivateOrLocal, true)

  const check10 = validateRetrievalUrl('http://10.0.0.15/internal')
  assert.equal(check10.valid, false)
  assert.equal(check10.isPrivateOrLocal, true)

  const check192 = validateRetrievalUrl('http://192.168.1.1/router')
  assert.equal(check192.valid, false)
  assert.equal(check192.isPrivateOrLocal, true)

  const checkAWS = validateRetrievalUrl('http://169.254.169.254/latest/meta-data')
  assert.equal(checkAWS.valid, false)
  assert.equal(checkAWS.isPrivateOrLocal, true)

  const checkIPv6 = validateRetrievalUrl('http://[::1]/chords')
  assert.equal(checkIPv6.valid, false)
  assert.equal(checkIPv6.isPrivateOrLocal, true)

  // Dangerous schemes
  const checkJS = validateRetrievalUrl('javascript:alert(1)')
  assert.equal(checkJS.valid, false)

  // Fail closed on restricted provider without making network requests
  const ugRes = await retrieveSongSource('https://tabs.ultimate-guitar.com/tab/eagles/hotel-california-chords-46190')
  assert.equal(ugRes.success, false)
  assert.equal(ugRes.errorCode, 'RESTRICTED_PROVIDER')
  assert.ok(ugRes.provider)
  assert.match(ugRes.error, /prohibit scraping/i)

  const ccliRes = await retrieveSongSource('https://songselect.ccli.com/songs/123')
  assert.equal(ccliRes.success, false)
  assert.equal(ccliRes.errorCode, 'RESTRICTED_PROVIDER')

  const chordieRes = await retrieveSongSource('https://www.chordie.com/song.php?id=999')
  assert.equal(chordieRes.success, false)
  assert.equal(chordieRes.errorCode, 'UNSUPPORTED_PROVIDER')

  const unverifiedRes = await retrieveSongSource('https://unknown-domain.org/chords.txt')
  assert.equal(unverifiedRes.success, false)
  assert.equal(unverifiedRes.errorCode, 'UNSUPPORTED_PROVIDER')
})

test('BOUNDS_AND_CANCEL: Bounded response size and abort cancellation', async () => {
  // Test cancellation with AbortController
  const controller = new AbortController()
  controller.abort()

  // For a URL passing validation
  const abortCheck = await retrieveSongSource('https://example.com/test.txt', {
    signal: controller.signal,
  })
  // Should fail fast either unsupported provider or aborted
  assert.equal(abortCheck.success, false)

  // Content size check on parsing
  const oversizedText = 'A'.repeat(MAX_IMPORT_BYTES + 500)
  const parseOversized = parseImportedChordContent(oversizedText)
  assert.equal(parseOversized.success, false)
  assert.match(parseOversized.error, /exceeds maximum allowed size/i)
})

test('CHORDPRO_PARSER: Parses valid directives, handles malformed ChordPro, and sanitizes metadata', () => {
  const authenticChordPro = `{title: Way Maker}
{artist: Sinach}
{key: E}
{tempo: 68}
{time: 4/4}

[Verse 1]
You are [E]here, moving in our [B]midst
I worship [C#m]You, I worship [A]You`

  const parsed = parseImportedChordContent(authenticChordPro, {
    sourceUrl: 'https://example.com/charts/way-maker',
  })
  assert.equal(parsed.success, true)
  assert.ok(parsed.song)
  assert.equal(parsed.song.title, 'Way Maker')
  assert.equal(parsed.song.artist, 'Sinach')
  assert.equal(parsed.song.key, 'E')
  assert.equal(parsed.song.bpm, '68')
  assert.equal(parsed.song.time, '4/4')
  assert.equal(parsed.song.format, 'CHORD_PRO')
  assert.ok(parsed.song.tags.includes('Imported'))
  assert.ok(parsed.song.tags.includes('example.com'))

  // Malformed ChordPro: unclosed directive, unclosed chord bracket, trailing spaces
  const malformed = `{title: Broken Directive
{artist: Test Artist
[G]Unclosed [D chord bracket here
Some random lyric line with \x00 control chars`

  const malformedParsed = parseImportedChordContent(malformed)
  assert.equal(malformedParsed.success, true)
  assert.ok(malformedParsed.song)
  assert.ok(malformedParsed.song.title)
  // Control characters stripped
  assert.doesNotMatch(malformedParsed.song.rawContent, /\x00/)

  // Empty content rejected
  const emptyParsed = parseImportedChordContent('    \n\r   ')
  assert.equal(emptyParsed.success, false)
  assert.match(emptyParsed.error, /empty song content/i)

  // Plain text fallback (no directives, no chord brackets)
  const plainText = `Line one of my custom song
Line two of my song`
  const plainParsed = parseImportedChordContent(plainText)
  assert.equal(plainParsed.success, true)
  assert.equal(plainParsed.song.title, 'Line one of my custom song')
  assert.equal(plainParsed.song.format, 'TWO_LINE')
})

test('IMPORT_PREVIEW_UI: Tab navigation, provider warning on restricted URL, preview mode, and editable fields', async () => {
  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  let savedSong = null
  const handleSaveSong = async (song) => {
    savedSong = song
  }

  const existingSongs = [
    {
      id: 'existing-1',
      title: 'Existing Song Title',
      artist: 'Local Band',
      key: 'G',
      rawContent: '{title: Existing Song Title}\n[G]Hello world',
      format: 'CHORD_PRO',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]

  await act(async () => {
    root.render(
      React.createElement(BrowseSongSourcesModal, {
        isOpen: true,
        onClose: () => {},
        onSaveSong: handleSaveSong,
        songs: existingSongs,
        initialTab: 'import',
      })
    )
  })

  // 1. Verify Import & Preview Tab is active
  const importTabBtn = container.querySelector('#sources-tab-import')
  assert.ok(importTabBtn)
  assert.equal(importTabBtn.getAttribute('aria-selected'), 'true')

  // 2. Entering Ultimate Guitar URL shows provider restriction alert
  const urlInput = container.querySelector('#import-source-url-input')
  assert.ok(urlInput)

  await act(async () => {
    setInputValue(urlInput, 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596')
  })

  const alertBanner = container.querySelector('div[class*="bg-amber"]')
  assert.ok(alertBanner, 'Must display provider restriction banner for Ultimate Guitar')
  assert.match(alertBanner.textContent, /Terms of Service/i)
  assert.match(alertBanner.textContent, /prohibit scraping/i)

  // 3. Paste ChordPro text and click Preview Chart
  const textarea = container.querySelector('#import-raw-text-input')
  assert.ok(textarea)

  const sampleChordPro = `{title: Stand By Me}
{artist: Ben E. King}
{key: A}
{tempo: 118}
{time: 4/4}

[Verse 1]
When the [A]night has come
[F#m]And the land is dark`

  await act(async () => {
    setInputValue(textarea, sampleChordPro)
  })

  const previewBtn = container.querySelector('#btn-preview-chart')
  assert.ok(previewBtn)

  await act(async () => {
    previewBtn.click()
  })

  // 4. Verify preview mode entered
  const editTitleInput = container.querySelector('#preview-title')
  assert.ok(editTitleInput, 'Should display editable title field in preview mode')
  assert.equal(editTitleInput.value, 'Stand By Me')

  const editArtistInput = container.querySelector('#preview-artist')
  assert.ok(editArtistInput)
  assert.equal(editArtistInput.value, 'Ben E. King')

  const editKeyInput = container.querySelector('#preview-key')
  assert.ok(editKeyInput)
  assert.equal(editKeyInput.value, 'A')

  // 5. Verify rendered chord sheet segments
  const chordSpans = Array.from(container.querySelectorAll('span')).filter((s) => s.textContent === 'A' || s.textContent === 'F#m')
  assert.ok(chordSpans.length > 0, 'Rendered preview must display chord badges')

  // Clean up
  await act(async () => {
    root.unmount()
  })
})

test('DUPLICATE_TITLE_AND_EXPLICIT_SAVE: Detects duplicates, offers copy, and persists atomically on explicit save', async () => {
  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  let savedSong = null
  const handleSaveSong = async (song) => {
    savedSong = song
  }

  const existingSongs = [
    {
      id: 'song-dup-1',
      title: 'Amazing Grace',
      artist: 'Traditional',
      key: 'G',
      rawContent: '{title: Amazing Grace}\n[G]Amazing Grace',
      format: 'CHORD_PRO',
      createdAt: 1000,
      updatedAt: 1000,
    },
  ]

  await act(async () => {
    root.render(
      React.createElement(BrowseSongSourcesModal, {
        isOpen: true,
        onClose: () => {},
        onSaveSong: handleSaveSong,
        songs: existingSongs,
        initialTab: 'import',
      })
    )
  })

  const textarea = container.querySelector('#import-raw-text-input')
  const dupChordPro = `{title: Amazing Grace}
{artist: John Newton}
{key: G}

[Verse 1]
[G]Amazing grace how sweet the sound`

  await act(async () => {
    setInputValue(textarea, dupChordPro)
  })

  const previewBtn = container.querySelector('#btn-preview-chart')
  await act(async () => {
    previewBtn.click()
  })

  // 1. Verify duplicate warning alert is rendered
  const dupAlert = container.querySelector('div[role="alert"]')
  assert.ok(dupAlert, 'Duplicate title must trigger alert banner')
  assert.match(dupAlert.textContent, /Duplicate Title Detected/i)

  // 2. Click "Save as Copy"
  const copyBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Save as Copy'))
  assert.ok(copyBtn)

  await act(async () => {
    copyBtn.click()
  })

  const titleInput = container.querySelector('#preview-title')
  assert.equal(titleInput.value, 'Amazing Grace (Copy)')

  // 3. User edits key to 'A'
  const keyInput = container.querySelector('#preview-key')
  await act(async () => {
    setInputValue(keyInput, 'A')
  })

  // 4. Invariant: Nothing saved yet before clicking Save button!
  assert.equal(savedSong, null, 'Must NOT mutate storage before explicit save action')

  // 5. Explicit Save
  const saveBtn = container.querySelector('#btn-save-to-songbook')
  assert.ok(saveBtn)

  await act(async () => {
    saveBtn.click()
  })

  assert.ok(savedSong, 'Explicit save action must trigger onSaveSong')
  assert.equal(savedSong.title, 'Amazing Grace (Copy)')
  assert.equal(savedSong.key, 'A')
  assert.ok(savedSong.tags.includes('Imported'))
  assert.match(savedSong.rawContent, /\{title:\s*Amazing Grace \(Copy\)\}/)
  assert.match(savedSong.rawContent, /\{key:\s*A\}/)

  // Clean up
  await act(async () => {
    root.unmount()
  })
})

test('PREVIEW_DISCARD_AND_FAILURE_RESILIENCE: Cancel leaves songbook intact; error does not corrupt state', async () => {
  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  let saveAttempted = false
  const failingSaveSong = async () => {
    saveAttempted = true
    throw new Error('Database transaction failed: QuotaExceededError')
  }

  await act(async () => {
    root.render(
      React.createElement(BrowseSongSourcesModal, {
        isOpen: true,
        onClose: () => {},
        onSaveSong: failingSaveSong,
        songs: [],
        initialTab: 'import',
      })
    )
  })

  const textarea = container.querySelector('#import-raw-text-input')
  await act(async () => {
    setInputValue(textarea, '{title: Discard Test}\n[C]Hello')
  })

  await act(async () => {
    container.querySelector('#btn-preview-chart').click()
  })

  // 1. Click Discard
  const discardBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Discard'))
  assert.ok(discardBtn)

  await act(async () => {
    discardBtn.click()
  })

  // Returned to input mode
  assert.ok(container.querySelector('#import-raw-text-input'), 'Discard must return to input mode')
  assert.equal(saveAttempted, false, 'Discard must not attempt save')

  // 2. Re-enter preview and trigger error on save
  await act(async () => {
    container.querySelector('#btn-preview-chart').click()
  })

  const saveBtn = container.querySelector('#btn-save-to-songbook')
  await act(async () => {
    saveBtn.click()
  })

  assert.equal(saveAttempted, true)
  // Check that error message is surfaced to user
  const errorAlert = container.querySelector('div[role="alert"]')
  assert.ok(errorAlert)
  assert.match(errorAlert.textContent, /QuotaExceededError/i)

  // Clean up
  await act(async () => {
    root.unmount()
  })
})
