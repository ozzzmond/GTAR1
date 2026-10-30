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

Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  KeyboardEvent: dom.window.KeyboardEvent,
  localStorage: mockLocalStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
})

const React = require('react')
const { act } = React
const { createRoot } = require('react-dom/client')

const { MultiSongSetlistPicker } = require('../src/components/MultiSongSetlistPicker.tsx')
const { SetlistManager } = require('../src/components/SetlistManager.tsx')

function setInputValue(el, value) {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}

// Sample canonical test songs
const SAMPLE_SONGS = [
  {
    id: 'song-1',
    title: 'Amazing Grace',
    artist: 'John Newton',
    key: 'G',
    rawContent: '{title: Amazing Grace}\n{artist: John Newton}\n{key: G}\n[G]Amazing [C]grace',
    format: 'CHORD_PRO',
    tags: ['hymn', 'traditional'],
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: 'song-2',
    title: 'Hallelujah',
    artist: 'Leonard Cohen',
    key: 'C',
    rawContent: '{title: Hallelujah}\n{artist: Leonard Cohen}\n{key: C}\n[C]I heard there was a [Am]secret chord',
    format: 'CHORD_PRO',
    tags: ['classic'],
    createdAt: 2000,
    updatedAt: 2000,
  },
  {
    id: 'song-3',
    title: 'Hallelujah',
    artist: 'Jeff Buckley',
    key: 'F',
    rawContent: '{title: Hallelujah}\n{artist: Jeff Buckley}\n{key: F}\n[F]I heard there was a [Dm]secret chord',
    format: 'CHORD_PRO',
    tags: ['cover', 'rock'],
    createdAt: 3000,
    updatedAt: 3000,
  },
  {
    id: 'song-4',
    title: 'Hotel California',
    artist: 'Eagles',
    key: 'Bm',
    rawContent: '{title: Hotel California}\n{artist: Eagles}\n{key: Bm}\n[Bm]On a dark desert highway',
    format: 'CHORD_PRO',
    tags: ['rock', 'classic'],
    createdAt: 4000,
    updatedAt: 4000,
  },
]

const SAMPLE_SETLIST = {
  id: 'setlist-trial',
  name: 'trial',
  folderId: null,
  createdAt: 5000,
  updatedAt: 5000,
  songs: [
    {
      entryId: 'entry-1',
      id: 'song-1',
      title: 'Amazing Grace',
      artist: 'John Newton',
      key: 'G',
      position: 0,
      transposeOffset: 0,
    },
  ],
}

test('MULTI_SONG_PICKER_SEARCH_AND_DISAMBIGUATION: Filters local songs by title, artist, key, tags and disambiguates duplicates', async () => {
  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  let addedSongs = []
  await act(async () => {
    root.render(
      React.createElement(MultiSongSetlistPicker, {
        isOpen: true,
        onClose: () => {},
        currentSetlist: SAMPLE_SETLIST,
        allSongs: SAMPLE_SONGS,
        onAddSongs: async (songs) => { addedSongs = songs },
      })
    )
  })

  // 1. Initial render shows all songs in local songbook
  let options = container.querySelectorAll('[role="option"]')
  assert.equal(options.length, 4, 'Should render all 4 songs initially')

  // 2. Disambiguation: Check that duplicate titles have distinct artists and keys visible
  const hallelujahRows = Array.from(options).filter((el) => el.textContent.includes('Hallelujah'))
  assert.equal(hallelujahRows.length, 2, 'Should find 2 Hallelujah songs')
  assert.ok(hallelujahRows[0].textContent.includes('Leonard Cohen') && hallelujahRows[0].textContent.includes('Key: C'))
  assert.ok(hallelujahRows[1].textContent.includes('Jeff Buckley') && hallelujahRows[1].textContent.includes('Key: F'))

  // 3. Already-in-setlist badge for Amazing Grace
  const graceRow = Array.from(options).find((el) => el.textContent.includes('Amazing Grace'))
  assert.ok(graceRow.textContent.includes('In setlist'), 'Amazing Grace should show "In setlist" badge')

  // 4. Search by artist (Jeff Buckley)
  const searchInput = container.querySelector('#multi-song-search-input')
  assert.ok(searchInput, 'Search input should exist')

  await act(async () => {
    setInputValue(searchInput, 'Buckley')
  })

  options = container.querySelectorAll('[role="option"]')
  assert.equal(options.length, 1, 'Search for Buckley should yield exactly 1 result')
  assert.ok(options[0].textContent.includes('Jeff Buckley'))

  // 5. Search by key (Bm)
  await act(async () => {
    setInputValue(searchInput, 'Bm')
  })

  options = container.querySelectorAll('[role="option"]')
  assert.equal(options.length, 1, 'Search for key Bm should yield Hotel California')
  assert.ok(options[0].textContent.includes('Hotel California'))

  // 6. No-match state
  await act(async () => {
    setInputValue(searchInput, 'NonExistentSong12345')
  })

  options = container.querySelectorAll('[role="option"]')
  assert.equal(options.length, 0, 'No matching options')
  assert.ok(container.textContent.includes('No songs match your search'), 'Clear no-match feedback')

  await act(async () => {
    root.unmount()
  })
})

test('MULTI_QUERY_CHIPS: Entering multiple queries creates chips and filters correctly', async () => {
  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  await act(async () => {
    root.render(
      React.createElement(MultiSongSetlistPicker, {
        isOpen: true,
        onClose: () => {},
        currentSetlist: SAMPLE_SETLIST,
        allSongs: SAMPLE_SONGS,
        onAddSongs: async () => {},
      })
    )
  })

  const searchInput = container.querySelector('#multi-song-search-input')

  // Type "Hallelujah" and press Enter to create query chip
  await act(async () => {
    setInputValue(searchInput, 'Hallelujah')
    searchInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })

  // Verify query chip was created
  let queryChips = container.querySelectorAll('[aria-label^="Remove query filter"]')
  assert.equal(queryChips.length, 1, 'Should have 1 query chip')
  assert.ok(container.textContent.includes('Hallelujah'))

  // Results should only show 2 Hallelujah songs
  let options = container.querySelectorAll('[role="option"]')
  assert.equal(options.length, 2, 'Should filter by Hallelujah chip')

  // Type second query "Buckley" and press Enter
  await act(async () => {
    setInputValue(searchInput, 'Buckley')
    searchInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })

  queryChips = container.querySelectorAll('[aria-label^="Remove query filter"]')
  assert.equal(queryChips.length, 2, 'Should have 2 query chips')

  options = container.querySelectorAll('[role="option"]')
  assert.equal(options.length, 1, 'Should narrow down to Buckley Hallelujah')

  // Remove the Buckley chip by clicking its remove button
  const buckleyRemoveBtn = container.querySelector('[aria-label="Remove query filter Buckley"]')
  await act(async () => {
    buckleyRemoveBtn.click()
  })

  options = container.querySelectorAll('[role="option"]')
  assert.equal(options.length, 2, 'Should return to 2 Hallelujah songs after removing chip')

  await act(async () => {
    root.unmount()
  })
})

test('SELECTION_AND_ORDER_PRESERVATION: Multi-select checkboxes, selected count, chips, and order stability', async () => {
  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  let addedSongs = []
  await act(async () => {
    root.render(
      React.createElement(MultiSongSetlistPicker, {
        isOpen: true,
        onClose: () => {},
        currentSetlist: SAMPLE_SETLIST,
        allSongs: SAMPLE_SONGS,
        onAddSongs: async (songs) => { addedSongs = songs },
      })
    )
  })

  // Select Hotel California (index 3), then Jeff Buckley Hallelujah (index 2)
  const options = container.querySelectorAll('[role="option"]')
  const hotelOption = Array.from(options).find((el) => el.textContent.includes('Hotel California'))
  const buckleyOption = Array.from(options).find((el) => el.textContent.includes('Jeff Buckley'))

  await act(async () => {
    hotelOption.click()
  })
  await act(async () => {
    buckleyOption.click()
  })

  // Check selected count
  assert.ok(container.textContent.includes('2 songs selected'), 'Selected count should be 2')

  // Selected songs chips should appear in recipient container
  const selectedChips = container.querySelectorAll('[aria-label^="Deselect "]')
  assert.equal(selectedChips.length, 2, 'Two selected song chips in header')

  // Clicking an already selected option toggles it off (prevents accidental duplicate selection in batch)
  await act(async () => {
    hotelOption.click()
  })
  assert.ok(container.textContent.includes('1 song selected'), 'Selected count should be 1 after unselecting')

  // Reselect Hotel California so order is [Buckley, Hotel]
  await act(async () => {
    hotelOption.click()
  })

  // Filter with search input - selection MUST remain stable!
  const searchInput = container.querySelector('#multi-song-search-input')
  await act(async () => {
    setInputValue(searchInput, 'Grace')
  })

  // Selected count must STILL be 2 even while results are filtered
  assert.ok(container.textContent.includes('2 songs selected'), 'Selection stable across filtering')

  // Select Amazing Grace as well (which is already in setlist, verifying intentional repeats are allowed)
  const graceOption = container.querySelector('[role="option"]')
  await act(async () => {
    graceOption.click()
  })
  assert.ok(container.textContent.includes('3 songs selected'), '3 songs selected')

  // Clear filter
  await act(async () => {
    setInputValue(searchInput, '')
  })

  // Click "Add 3 Selected Songs"
  const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Add 3 Selected Songs')
  )
  assert.ok(addBtn, 'Add 3 Selected Songs button present')

  await act(async () => {
    addBtn.click()
  })

  // Verify exact intentional selection order: Buckley, Hotel California, Amazing Grace
  assert.equal(addedSongs.length, 3, 'Should pass 3 songs to onAddSongs')
  assert.equal(addedSongs[0].id, 'song-3', '1st: Jeff Buckley Hallelujah')
  assert.equal(addedSongs[1].id, 'song-4', '2nd: Hotel California')
  assert.equal(addedSongs[2].id, 'song-1', '3rd: Amazing Grace (intentional repeat)')

  await act(async () => {
    root.unmount()
  })
})

test('BULK_ADD_SETLIST_PERSISTENCE_AND_OCCURRENCE_MODEL: SetlistManager bulk add updates state, sets unique entryId, and reloads cleanly', async () => {
  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  let savedSetlist = null
  const handleSaveSetlist = async (setlist) => {
    savedSetlist = setlist
  }

  await act(async () => {
    root.render(
      React.createElement(SetlistManager, {
        setlists: [SAMPLE_SETLIST],
        folders: [],
        allSongs: SAMPLE_SONGS,
        initialSelectedSetlistId: 'setlist-trial',
        onSaveSetlist: handleSaveSetlist,
        onDeleteSetlist: async () => {},
        onSaveFolder: async () => {},
        onDeleteFolder: async () => {},
        onPlaySong: () => {},
      })
    )
  })

  // 1. Check Search button with Ctrl+K exists
  const searchBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Search Songs (Outlook-style Picker)')
  )
  assert.ok(searchBtn, 'Search Songs button should be visible')
  assert.ok(searchBtn.getAttribute('aria-keyshortcuts').includes('Control+k'))

  // 2. Click to open picker
  await act(async () => {
    searchBtn.click()
  })

  const picker = container.querySelector('[role="region"][aria-label="Multi-song search picker"]')
  assert.ok(picker, 'Picker panel opened')

  // 3. Select 2 songs: Leonard Cohen (song-2) and Hotel California (song-4)
  const options = container.querySelectorAll('[role="option"]')
  const cohenOption = Array.from(options).find((el) => el.textContent.includes('Leonard Cohen'))
  const hotelOption = Array.from(options).find((el) => el.textContent.includes('Hotel California'))

  await act(async () => {
    cohenOption.click()
  })
  await act(async () => {
    hotelOption.click()
  })

  // 4. Confirm bulk add
  const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Add 2 Selected Songs')
  )
  assert.ok(addBtn, 'Add 2 Selected Songs button found')

  await act(async () => {
    addBtn.click()
  })

  // 5. Verify saved setlist structure
  assert.ok(savedSetlist, 'Setlist was saved')
  assert.equal(savedSetlist.songs.length, 3, 'Setlist now has 1 initial + 2 new songs = 3 total')

  // Original song intact at position 0
  assert.equal(savedSetlist.songs[0].id, 'song-1')
  assert.equal(savedSetlist.songs[0].position, 0)
  assert.equal(savedSetlist.songs[0].entryId, 'entry-1')

  // New songs appended sequentially with distinct entryIds
  assert.equal(savedSetlist.songs[1].id, 'song-2')
  assert.equal(savedSetlist.songs[1].position, 1)
  assert.ok(savedSetlist.songs[1].entryId, 'Has unique entryId')
  assert.notEqual(savedSetlist.songs[1].entryId, savedSetlist.songs[0].entryId)

  assert.equal(savedSetlist.songs[2].id, 'song-4')
  assert.equal(savedSetlist.songs[2].position, 2)
  assert.ok(savedSetlist.songs[2].entryId, 'Has unique entryId')
  assert.notEqual(savedSetlist.songs[2].entryId, savedSetlist.songs[1].entryId)

  // Feedback message shown
  assert.ok(container.textContent.includes('Added 2 songs to setlist'), 'Confirmation status message displayed')

  await act(async () => {
    root.unmount()
  })
})

test('KEYBOARD_SHORTCUTS_AND_SCOPING: Ctrl+K, Alt+S, Escape dismissal, and input focus safety', async () => {
  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  await act(async () => {
    root.render(
      React.createElement(SetlistManager, {
        setlists: [SAMPLE_SETLIST],
        folders: [],
        allSongs: SAMPLE_SONGS,
        initialSelectedSetlistId: 'setlist-trial',
        onSaveSetlist: async () => {},
        onDeleteSetlist: async () => {},
        onSaveFolder: async () => {},
        onDeleteFolder: async () => {},
        onPlaySong: () => {},
      })
    )
  })

  // Initially picker is closed
  assert.equal(container.querySelector('[role="region"][aria-label="Multi-song search picker"]'), null)

  // 1. Pressing Ctrl+K opens the picker
  await act(async () => {
    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    dom.window.dispatchEvent(event)
  })

  assert.ok(container.querySelector('[role="region"][aria-label="Multi-song search picker"]'), 'Picker opened via Ctrl+K')

  // 2. Pressing Escape closes the picker
  const searchInput = container.querySelector('#multi-song-search-input')
  await act(async () => {
    const escEvent = new dom.window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    searchInput.dispatchEvent(escEvent)
  })

  assert.equal(container.querySelector('[role="region"][aria-label="Multi-song search picker"]'), null, 'Picker closed via Escape')

  // 3. Pressing Alt+S also opens the picker (alternative shortcut where Ctrl+K conflicts)
  await act(async () => {
    const altSEvent = new dom.window.KeyboardEvent('keydown', {
      key: 's',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    dom.window.dispatchEvent(altSEvent)
  })

  assert.ok(container.querySelector('[role="region"][aria-label="Multi-song search picker"]'), 'Picker opened via Alt+S')

  // 4. Shortcut does not hijack when user is typing in another input (e.g. folder name)
  await act(async () => {
    // Close picker first
    const closeBtn = container.querySelector('[aria-label="Close search picker"]')
    closeBtn.click()
  })

  // Open "New Folder" input
  const newFolderBtn = container.querySelector('button[class*="text-[11px] text-app-action"]')
  await act(async () => {
    newFolderBtn.click()
  })

  const folderInput = container.querySelector('input[placeholder="Folder name..."]')
  assert.ok(folderInput, 'Folder input open')

  await act(async () => {
    const eventInFolderInput = new dom.window.KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    folderInput.dispatchEvent(eventInFolderInput)
  })

  // Picker must NOT open while user is typing in folder input!
  assert.equal(
    container.querySelector('[role="region"][aria-label="Multi-song search picker"]'),
    null,
    'Ctrl+K safely ignored while user typing in folder name input'
  )

  await act(async () => {
    root.unmount()
  })
})

test('OFFLINE_DETERMINISM: Multi-song picker executes entirely offline with zero network requests', async () => {
  let networkRequested = false
  const originalFetch = dom.window.fetch
  dom.window.fetch = async () => {
    networkRequested = true
    throw new Error('Network request forbidden in offline-first mode')
  }

  const container = dom.window.document.getElementById('test-container')
  const root = createRoot(container)

  let saved = false
  await act(async () => {
    root.render(
      React.createElement(MultiSongSetlistPicker, {
        isOpen: true,
        onClose: () => {},
        currentSetlist: SAMPLE_SETLIST,
        allSongs: SAMPLE_SONGS,
        onAddSongs: async () => { saved = true },
      })
    )
  })

  // Select all filtered
  const selectAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Select All Filtered')
  )
  await act(async () => {
    selectAllBtn.click()
  })

  // Add selected
  const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.includes('Add 4 Selected Songs')
  )
  await act(async () => {
    addBtn.click()
  })

  assert.equal(saved, true, 'Add completed successfully')
  assert.equal(networkRequested, false, 'Zero network requests were made')

  dom.window.fetch = originalFetch

  await act(async () => {
    root.unmount()
  })
})
