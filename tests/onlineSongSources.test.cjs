// CSS modules are compiled by Vite in browser tests; DOM unit tests need class names only.
require.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } }
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
const { SONG_SOURCE_PROVIDERS, getExternalSongSearch, DEFAULT_SONG_SOURCE_PROVIDER } = require('../src/utils/songSourceProviders.ts')
const { loadSongSourceProvider, saveSongSourceProvider, SONG_SOURCE_PROVIDER_KEY, searchOnlineSongSource } = require('../src/utils/songSources.ts')
const { BrowseSongSourcesModal } = require('../src/components/BrowseSongSourcesModal.tsx')
const { Header } = require('../src/components/Header.tsx')
const { SongbookHomeView } = require('../src/components/SongbookHomeView.tsx')
function setInputValue(el, value) {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}



test('provider registry: correct query encoding, homepage fallback and truthful capabilities', () => {
  assert.equal(DEFAULT_SONG_SOURCE_PROVIDER, 'ultimate_guitar')
  assert.deepEqual(SONG_SOURCE_PROVIDERS.map(p => p.id).sort(), ['chordie', 'opmtunes', 'songselect', 'ultimate_guitar'])
  const query = 'AC/DC & Love? #1 + Ã¦â€”Â¥Ã¦Å“Â¬Ã¨ÂªÅ¾'
  for (const [id, origin, path, param] of [
    ['ultimate_guitar', 'https://www.ultimate-guitar.com', '/search.php', 'value'],
    ['chordie', 'https://www.chordie.com', '/result.php', 'q'],
  ]) {
    const result = getExternalSongSearch(id, `  ${query}  `)
    assert.equal(result.success, true)
    assert.equal(result.homepageFallback, false)
    const url = new URL(result.url)
    assert.equal(url.origin, origin)
    assert.equal(url.pathname, path)
    assert.equal(url.searchParams.get(param), query)
    assert.equal(url.hash, '')
    if (id === 'ultimate_guitar') assert.equal(url.searchParams.get('search_type'), 'title')
  }
  for (const id of ['songselect', 'opmtunes']) {
    const result = getExternalSongSearch(id, query)
    assert.equal(result.homepageFallback, true)
    assert.equal(result.url, SONG_SOURCE_PROVIDERS.find(p => p.id === id).homepageUrl)
    assert.equal(new URL(result.url).search, '')
  }
  for (const provider of SONG_SOURCE_PROVIDERS) {
    assert.equal(provider.capabilities.externalSearch, !!provider.searchUrl)
    assert.equal(provider.capabilities.nativeSearch, false)
    assert.equal(provider.capabilities.preview, false)
    assert.equal(provider.capabilities.import, false)
  }
  assert.equal(new URL(getExternalSongSearch('removed-provider', query).url).hostname, 'www.ultimate-guitar.com')
  for (const value of ['', '   ', 'x'.repeat(201), 'unsafe\nquery']) assert.equal(getExternalSongSearch('chordie', value).success, false)
})

test('provider preference: clean default, stale IDs, isolated setting and denied browser storage', () => {
  mockLocalStorage.clear()
  assert.equal(loadSongSourceProvider(), 'ultimate_guitar')
  for (const invalid of ['removed-provider', '{}', 'null', '__proto__']) {
    mockLocalStorage.setItem(SONG_SOURCE_PROVIDER_KEY, invalid)
    assert.equal(loadSongSourceProvider(), 'ultimate_guitar')
  }
  mockLocalStorage.setItem('gtar1_theme_settings', 'KEEP_THEME')
  mockLocalStorage.setItem(SONG_SOURCES_STORAGE_KEY, 'KEEP_SHORTCUTS')
  assert.equal(saveSongSourceProvider('chordie'), true)
  assert.equal(loadSongSourceProvider(), 'chordie')
  assert.equal(mockLocalStorage.getItem('gtar1_theme_settings'), 'KEEP_THEME')
  assert.equal(mockLocalStorage.getItem(SONG_SOURCES_STORAGE_KEY), 'KEEP_SHORTCUTS')
  const get = mockLocalStorage.getItem, set = mockLocalStorage.setItem
  try {
    mockLocalStorage.getItem = () => { throw new Error('PRIVATE_STORAGE') }
    mockLocalStorage.setItem = () => { throw new Error('PRIVATE_STORAGE') }
    assert.equal(loadSongSourceProvider(), 'ultimate_guitar')
    assert.equal(saveSongSourceProvider('chordie'), false)
  } finally { mockLocalStorage.getItem = get; mockLocalStorage.setItem = set }
})

test('Sources manages shared provider preference and manual imports without a second query input', async () => {
  mockLocalStorage.clear()
  lastWindowOpened = null
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root = createRoot(container)
  const render = async () => act(async () => root.render(React.createElement(BrowseSongSourcesModal, {isOpen:true, onClose:()=>{}})))
  await render()
  const select = () => container.querySelector('#online-source-provider')
  const changeProvider = async id => act(async () => {
    select().value = id
    select().dispatchEvent(new window.Event('change', {bubbles:true}))
  })
  assert.equal(select().value, 'ultimate_guitar')
  assert.equal(select().options.length, 4)
  assert.equal(container.querySelector('#online-source-query'), null)
  assert.equal(lastWindowOpened, null)
  await changeProvider('chordie')
  assert.equal(loadSongSourceProvider(), 'chordie')
  await changeProvider('songselect')
  assert.match(container.textContent, /Direct search link unavailable/)
  const set = mockLocalStorage.setItem
  try {
    mockLocalStorage.setItem = () => { throw new Error('PRIVATE_STORAGE') }
    await changeProvider('ultimate_guitar')
    assert.match(container.textContent, /Provider changed for this visit/)
    assert.doesNotMatch(container.textContent, /PRIVATE_STORAGE/)
    assert.equal(select().value, 'ultimate_guitar')
  } finally { mockLocalStorage.setItem = set }
  const importLink = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Import & Preview')
  await act(async () => importLink.click())
  assert.ok(container.querySelector('#import-raw-text-input'))
  await act(async () => container.querySelector('#sources-tab-browse').click())
  await changeProvider('chordie')
  await act(async () => root.unmount())
  root = createRoot(container)
  await render()
  assert.equal(select().value, 'chordie')
  await act(async () => root.unmount())
  container.remove()
})

test('shared online action validates before navigation and reports offline or denied navigation safely', () => {
  Object.defineProperty(global.navigator, 'onLine', { configurable:true, value:true })
  lastWindowOpened = null
  assert.equal(searchOnlineSongSource('ultimate_guitar', '  ').success, false)
  assert.equal(lastWindowOpened, null)
  Object.defineProperty(global.navigator, 'onLine', { configurable:true, value:false })
  assert.match(searchOnlineSongSource('chordie', 'Amazing Grace').message, /offline/)
  assert.equal(lastWindowOpened, null)
  Object.defineProperty(global.navigator, 'onLine', { configurable:true, value:true })
  assert.equal(searchOnlineSongSource('ultimate_guitar', 'Amazing Grace').success, true)
  assert.equal(new URL(lastWindowOpened.url).searchParams.get('value'), 'Amazing Grace')
  assert.equal(lastWindowOpened.features, 'noopener,noreferrer')
  const open = window.open
  try {
    window.open = () => { throw new Error('PRIVATE_POPUP') }
    const result = searchOnlineSongSource('chordie', 'Amazing Grace')
    assert.equal(result.success, false)
    assert.match(result.message, /popup settings/)
    assert.doesNotMatch(result.message, /PRIVATE_POPUP/)
  } finally { window.open = open }
})
