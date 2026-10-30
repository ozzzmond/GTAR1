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

// Window open tracker
let lastWindowOpened = null
dom.window.open = (url, target, features) => {
  lastWindowOpened = { url, target, features, opener: null }
  return lastWindowOpened
}

Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  localStorage: mockLocalStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
})

const React = require('react')
const { act } = React
const { createRoot } = require('react-dom/client')

const {
  validateAndNormalizeWebsiteUrl,
  openExternalSongSource,
  loadCustomSongSources,
  saveCustomSongSources,
  CURATED_SONG_SOURCES,
  SONG_SOURCES_STORAGE_KEY,
  getHostnameFallback,
} = require('../src/utils/songSources.ts')
const { BrowseSongSourcesModal } = require('../src/components/BrowseSongSourcesModal.tsx')
const { Header } = require('../src/components/Header.tsx')
const { SongbookHomeView } = require('../src/components/SongbookHomeView.tsx')
function setInputValue(el, value) {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}


test('URL_VALIDATION: Enforces http/https protocols and rejects dangerous schemes', () => {
  // Valid URLs
  const valid1 = validateAndNormalizeWebsiteUrl('https://www.ultimate-guitar.com/tabs')
  assert.equal(valid1.valid, true)
  assert.equal(valid1.url, 'https://www.ultimate-guitar.com/tabs')

  const valid2 = validateAndNormalizeWebsiteUrl('http://chordie.com/song.php?id=123')
  assert.equal(valid2.valid, true)
  assert.equal(valid2.url, 'http://chordie.com/song.php?id=123')

  // Auto-prefix https://
  const valid3 = validateAndNormalizeWebsiteUrl('opmtunes.com')
  assert.equal(valid3.valid, true)
  assert.equal(valid3.url, 'https://opmtunes.com/')

  const valid4 = validateAndNormalizeWebsiteUrl('//songselect.ccli.com')
  assert.equal(valid4.valid, true)
  assert.equal(valid4.url, 'https://songselect.ccli.com/')

  // Dangerous / Unsafe schemes MUST be rejected
  const unsafeSchemes = [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(document.cookie)',
    'javascript:void(0)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'blob:http://localhost/uuid',
    'vbscript:msgbox("test")',
    'about:blank',
    'ws://echo.websocket.org',
    'ftp://ftp.example.com/file',
  ]

  for (const unsafe of unsafeSchemes) {
    const res = validateAndNormalizeWebsiteUrl(unsafe)
    assert.equal(res.valid, false, `Must reject unsafe scheme: ${unsafe}`)
    assert.match(res.error, /forbidden|invalid/i)
  }

  // Empty / whitespace
  assert.equal(validateAndNormalizeWebsiteUrl('').valid, false)
  assert.equal(validateAndNormalizeWebsiteUrl('   ').valid, false)
  assert.equal(validateAndNormalizeWebsiteUrl('https://').valid, false)
})

test('CURATED_SOURCES: Includes SongSelect, Ultimate Guitar, Chordie and OPMTunes with safe attributes', () => {
  const ids = CURATED_SONG_SOURCES.map((s) => s.id)
  assert.ok(ids.includes('curated_songselect'), 'Includes SongSelect')
  assert.ok(ids.includes('curated_ultimate_guitar'), 'Includes Ultimate Guitar')
  assert.ok(ids.includes('curated_chordie'), 'Includes Chordie')
  assert.ok(ids.includes('curated_opmtunes'), 'Includes OPMTunes')

  for (const src of CURATED_SONG_SOURCES) {
    const val = validateAndNormalizeWebsiteUrl(src.url)
    assert.equal(val.valid, true, `Curated URL ${src.url} must be valid`)
    assert.ok(src.name && src.name.trim().length > 0)
    assert.ok(src.desc && src.desc.trim().length > 0)
    assert.equal(src.isCurated, true)
  }
})

test('LOCAL_STORAGE_PERSISTENCE: Custom shortcuts CRUD persists to isolated namespace', () => {
  mockLocalStorage.clear()
  assert.deepEqual(loadCustomSongSources(), [])

  const sampleSources = [
    {
      id: 'custom-1',
      name: 'My Church Chords',
      url: 'https://praise.example.org/charts',
      desc: 'Sunday morning charts',
    },
    {
      id: 'custom-2',
      name: 'Acoustic Archive',
      url: 'https://acoustic.example.com',
      desc: 'Fingerpicking arrangements',
    },
  ]

  saveCustomSongSources(sampleSources)
  const storedRaw = mockLocalStorage.getItem(SONG_SOURCES_STORAGE_KEY)
  assert.ok(storedRaw, 'Storage key must be populated')

  const loaded = loadCustomSongSources()
  assert.equal(loaded.length, 2)
  assert.equal(loaded[0].name, 'My Church Chords')
  assert.equal(loaded[0].url, 'https://praise.example.org/charts')
  assert.equal(loaded[1].name, 'Acoustic Archive')

  // Corrupt / invalid URL entries are filtered out safely
  mockLocalStorage.setItem(
    SONG_SOURCES_STORAGE_KEY,
    JSON.stringify([
      { id: 'good', name: 'Good Site', url: 'https://good.example.com' },
      { id: 'bad', name: 'Bad Script', url: 'javascript:alert(1)' },
      { invalid: true },
      null,
    ])
  )
  const sanitized = loadCustomSongSources()
  assert.equal(sanitized.length, 1)
  assert.equal(sanitized[0].id, 'good')
})

test('SAFE_EXTERNAL_NAVIGATION: Opens only with explicit user action and safe attributes', () => {
  lastWindowOpened = null

  // Direct open helper
  const res = openExternalSongSource('https://www.chordie.com')
  assert.equal(res.success, true)
  assert.ok(lastWindowOpened)
  assert.equal(lastWindowOpened.url, 'https://www.chordie.com/')
  assert.equal(lastWindowOpened.target, '_blank')
  assert.equal(lastWindowOpened.features, 'noopener,noreferrer')
  assert.equal(lastWindowOpened.opener, null)

  // Blocked for unsafe URL
  lastWindowOpened = null
  const unsafeRes = openExternalSongSource('javascript:alert("exploit")')
  assert.equal(unsafeRes.success, false)
  assert.equal(lastWindowOpened, null)
})

test('BROWSE_SONG_SOURCES_MODAL: Accessible modal UI, curated links, custom CRUD and keyboard behavior', async () => {
  mockLocalStorage.clear()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let isClosed = false

  // 1. Modal closed initially - renders nothing
  await act(async () => {
    root.render(
      React.createElement(BrowseSongSourcesModal, {
        isOpen: false,
        onClose: () => { isClosed = true },
      })
    )
  })
  assert.equal(container.innerHTML, '')

  // 2. Open modal
  await act(async () => {
    root.render(
      React.createElement(BrowseSongSourcesModal, {
        isOpen: true,
        onClose: () => { isClosed = true },
      })
    )
  })

  // Verify dialog structure and accessibility
  const dialog = container.querySelector('[role="dialog"]')
  assert.ok(dialog, 'Must render dialog element')
  assert.equal(dialog.getAttribute('aria-modal'), 'true')
  assert.equal(dialog.getAttribute('aria-labelledby'), 'browse-sources-modal-title')

  // Verify heading
  const title = container.querySelector('#browse-sources-modal-title')
  assert.ok(title)
  assert.match(title.textContent, /Browse Song Sources/i)

  assert.match(container.textContent, /Online provider/)
  assert.match(container.textContent, /Use Online Sources in the header search/)
  assert.match(container.textContent, /permission to use/)
  assert.match(container.textContent, /source and author attribution/)
  Object.defineProperty(global.navigator, 'onLine', { configurable: true, value: false })
  await act(async () => { window.dispatchEvent(new window.Event('offline')) })
  assert.match(container.textContent, /You are offline/)
  assert.match(container.textContent, /Local Songbook, Stage, and paste or file import remain available/)
  Object.defineProperty(global.navigator, 'onLine', { configurable: true, value: true })
  await act(async () => { window.dispatchEvent(new window.Event('online')) })
  assert.match(container.textContent, /Use Online Sources in the header search/)

  // Verify curated sources are displayed
  const textContent = container.textContent
  assert.match(textContent, /SongSelect/i)
  assert.match(textContent, /Ultimate Guitar/i)
  assert.match(textContent, /Chordie/i)
  assert.match(textContent, /OPMTunes/i)

  // Verify no third-party site is claimed as "Verified" or "Security Vetted"
  assert.doesNotMatch(textContent, /Verified Chord Repositories/i)
  assert.doesNotMatch(textContent, /security-vetted/i)

  // Verify direct URL input
  const directInput = container.querySelector('#direct-url-input')
  assert.ok(directInput, 'Direct URL input must exist')

  // Test submitting unsafe URL directly
  lastWindowOpened = null
  await act(async () => {
    setInputValue(directInput, 'javascript:evil()')
  })

  const directForm = directInput.closest('form')
  await act(async () => {
    directForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  })

  assert.equal(lastWindowOpened, null, 'Must NOT open unsafe URL')
  const alertErr = container.querySelector('[role="alert"]')
  assert.ok(alertErr, 'Must display inline error message on invalid URL')

  // Test submitting valid URL directly
  await act(async () => {
    setInputValue(directInput, 'https://tabs.ultimate-guitar.com/tab/12345')
    directForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  })
  assert.ok(lastWindowOpened)
  assert.equal(lastWindowOpened.url, 'https://tabs.ultimate-guitar.com/tab/12345')

  // Test adding a custom shortcut
  const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Add Custom Website Shortcut')
  )
  assert.ok(addBtn, 'Must render Add Custom Shortcut button')

  await act(async () => {
    addBtn.click()
  })

  const customUrlInput = container.querySelector('#custom-source-url')
  const customNameInput = container.querySelector('#custom-source-name')
  assert.ok(customUrlInput && customNameInput)

  await act(async () => {
    setInputValue(customNameInput, 'Local Jam Library')
    setInputValue(customUrlInput, 'https://jam.local.chords/songs')
  })

  const customForm = customUrlInput.closest('form')
  await act(async () => {
    customForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  })

  // Verify custom shortcut was added and persisted
  assert.match(container.textContent, /Local Jam Library/i)
  const persisted = loadCustomSongSources()
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].name, 'Local Jam Library')
  assert.equal(persisted[0].url, 'https://jam.local.chords/songs')

  // Test deleting the custom shortcut
  const deleteBtn = container.querySelector('button[title="Remove Local Jam Library"]')
  assert.ok(deleteBtn, 'Delete button for custom shortcut must exist')
  await act(async () => {
    deleteBtn.click()
  })

  assert.equal(loadCustomSongSources().length, 0, 'Custom shortcut must be deleted from storage')

  // Test close on Escape
  isClosed = false
  await act(async () => {
    window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
  })
  assert.equal(isClosed, true, 'Escape key must close modal')

  await act(async () => {
    root.unmount()
  })
  container.remove()
})

test('HEADER_AND_SONGBOOK_INTEGRATION: Browse Sources triggers available across navigation', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let sourcesOpenedFromHeader = false
  let sourcesOpenedFromSongbook = false

  // Test Header Sources button
  await act(async () => {
    root.render(
      React.createElement(Header, {
        activeTab: 'SONGS',
        setActiveTab: () => {},
        onNewSong: () => {},
        onOpenBackup: () => {},
        onOpenProfile: () => {},
        onOpenSources: () => { sourcesOpenedFromHeader = true },
        userProfile: { displayName: 'Musician', updatedAt: Date.now() },
        searchQuery: '',
        onSearchChange: () => {},
        onToggleMobileDrawer: () => {},
        isMobileDrawerOpen: false,
      })
    )
  })

  const headerSourcesBtn = container.querySelector('button[title="Browse Song Sources"]')
  assert.ok(headerSourcesBtn, 'Header must render Sources button')
  await act(async () => {
    headerSourcesBtn.click()
  })
  assert.equal(sourcesOpenedFromHeader, true)

  // Test SongbookHomeView Browse Sources button
  await act(async () => {
    root.render(
      React.createElement(SongbookHomeView, {
        songs: [],
        setlists: [],
        folders: [],
        currentNavTarget: { type: 'ALL_SONGS' },
        onSelectNavTarget: () => {},
        onSelectSong: () => {},
        onEditSong: () => {},
        onNewSong: () => {},
        onOpenSources: () => { sourcesOpenedFromSongbook = true },
        onDeleteSong: async () => {},
        onSaveSong: async () => {},
        onSaveSetlist: async () => {},
        onDeleteSetlist: async () => {},
        onPlaySetlistSong: () => {},
        onOpenSetlistManager: () => {},
        searchQuery: '',
        onClearSearch: () => {},
      })
    )
  })

  const songbookSourcesBtns = container.querySelectorAll('button')
  const songbookSourcesBtn = Array.from(songbookSourcesBtns).find((b) =>
    b.textContent.includes('Browse Sources')
  )
  assert.ok(songbookSourcesBtn, 'Songbook empty state / header must render Browse Sources button')
  await act(async () => {
    songbookSourcesBtn.click()
  })
  assert.equal(sourcesOpenedFromSongbook, true)

  await act(async () => {
    root.unmount()
  })
  container.remove()
})
