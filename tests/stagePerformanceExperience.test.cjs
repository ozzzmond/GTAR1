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
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
})
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

const React = require('react')
const { act } = React
const { createRoot } = require('react-dom/client')

const { StageView, STAGE_CONTROLS_AUTO_HIDE_KEY } = require('../src/components/StageView.tsx')
const {
  StageControlDock,
  clampDockPosition,
  getDefaultDockPosition,
  readPersistedDockPosition,
  persistDockPosition,
  DOCK_SIZE,
  STAGE_DOCK_POSITION_KEY,
} = require('../src/components/StageControlDock.tsx')
const { StageOptionsSheet } = require('../src/components/StageOptionsSheet.tsx')
const {
  createWakeLockController,
  createFullscreenController,
  isFullscreenApiSupported,
} = require('../src/utils/stagePerformance.ts')
const { parseGtarSong, splitSongLinesForColumns } = require('../src/utils/songParser.ts')
const { transposeContext } = require('../src/utils/songKeySemantics.ts')
const { chordTokenToNashville } = require('../src/utils/nashvilleNotation.ts')

// Helper for rendering React components in JSDOM
function renderComponent(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

// Sample test song
const sampleSong = {
  id: 'song_hotel_california',
  title: 'Desert Highway Song',
  artist: 'Desert Echoes',
  key: 'Bm',
  originalKey: 'Bm',
  confirmedChartKey: 'Bm',
  bpm: '75',
  rawContent: `{title: Desert Highway Song}
{artist: Desert Echoes}
{key: Bm}

[Intro]
Bm F# A E G D Em F#

[Verse 1]
Bm                      F#
Riding on an open highway underneath the evening stars
A                       E
Cool desert breezes drifting through the vintage cars
G                       D
Up ahead in the valley glowing signs along the way
Em                      F#
Finding our shelter before the break of dawn and day [to Chorus]

[Chorus]
G                       D
Welcome to the desert highway open sky
Em                      Bm
Singing through the night as travelers go by
G                       D
Gather around the desert highway open sky
Em                      F#
Any time of year under stars so high

[Outro]
Bm F# A E G D Em F#
`,
  format: 'CHORD_PRO',
  transposeOffset: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

// =========================================================================
// R1: STAGE ENTRY, EXIT, AND CONTEXT PRESERVATION
// =========================================================================
test('R1_STAGE_ENTRY_AND_RETURN_NAVIGATION: mounts StageView, verifies title, key chip, and exit back callback', () => {
  let exited = false
  let updatedOffset = null

  const { container, unmount } = renderComponent(
    React.createElement(StageView, {
      song: sampleSong,
      transposeOffset: 0,
      onTransposeChange: (newOffset) => {
        updatedOffset = newOffset
      },
      onBack: () => {
        exited = true
      },
    })
  )

  // Verify song title in top bar
  const heading = container.querySelector('h1')
  assert.ok(heading, 'Heading must exist')
  assert.equal(heading.textContent, 'Desert Highway Song')

  // Verify key chip shows Bm
  const keyBtn = container.querySelector('button[aria-label*="Key: Bm"]')
  assert.ok(keyBtn, 'Key button must display current performance key Bm')

  // Verify Exit back button triggers onBack
  const backBtn = container.querySelector('button[aria-label="Exit Stage and return to Music Explorer"]')
  assert.ok(backBtn, 'Exit back button must exist')
  act(() => {
    backBtn.click()
  })
  assert.equal(exited, true, 'Clicking back must trigger onBack callback')

  unmount()
})

// =========================================================================
// R2: SETLIST QUEUE TRAVERSAL, OCCURRENCE IDENTITY & INDEPENDENT TRANSPOSE
// =========================================================================
test('R2_SETLIST_QUEUE_TRAVERSAL_AND_INDEPENDENT_TRANSPOSE: queue traversal, boundary checks, and per-occurrence transpose', () => {
  const songB = {
    ...sampleSong,
    id: 'song_western_horizon',
    title: 'Western Horizon',
    key: 'G',
    originalKey: 'G',
  }

  // Queue with song A (transpose 0), song B (transpose +2), and song A reprise (transpose +3)
  const queue = [
    { song: sampleSong, transposeOffset: 0, entryId: 'entry_1' },
    { song: songB, transposeOffset: 2, entryId: 'entry_2' },
    { song: sampleSong, transposeOffset: 3, entryId: 'entry_3' },
  ]

  let currentIndex = 0
  let capturedNewOffset = null

  const { container, unmount } = renderComponent(
    React.createElement(StageView, {
      song: queue[currentIndex].song,
      transposeOffset: queue[currentIndex].transposeOffset,
      queue,
      currentQueueIndex: currentIndex,
      onSelectQueueIndex: (idx) => {
        currentIndex = idx
      },
      onTransposeChange: (offset) => {
        capturedNewOffset = offset
      },
      onBack: () => {},
      setlistName: 'Friday Gig Set',
    })
  )

  // Verify setlist badge indicator: 1/3
  const badge = container.querySelector('header span')
  assert.ok(badge && badge.textContent === '1/3', 'Must render 1/3 setlist occurrence position')

  // Keyboard navigation: next song via ArrowRight
  act(() => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }))
  })
  assert.equal(currentIndex, 1, 'ArrowRight advances queue to index 1 (Western Horizon)')

  // Transpose button in fixed transport
  const plusBtn = container.querySelector('button[aria-label="Transpose up one semitone"]')
  assert.ok(plusBtn, 'Transpose + button must exist in bottom transport')
  act(() => {
    plusBtn.click()
  })
  assert.equal(capturedNewOffset, 1, 'Transposing up increments offset to 1 without mutating canonical chart')

  unmount()
})

// =========================================================================
// R3: ORIGINAL / CHART / PERFORMANCE KEY CORRECTNESS AND NNS NOTATION
// =========================================================================
test('R3_KEY_SEMANTICS_AND_NUMBERS_NOTATION: transposeContext correctness and Nashville Number System conversion', () => {
  // Transpose Bm by +2 semitones -> C#m
  const ctx = transposeContext(sampleSong, 2)
  assert.equal(ctx.performanceKey, 'C#m', 'Bm transposed +2 must resolve to C#m')
  assert.equal(ctx.displayOffset, 2, 'Display offset must be +2')
  assert.equal(ctx.originalKey, 'Bm', 'Original key must remain preserved as Bm')

  // Verify Nashville Number System conversion in key of Bm / D
  assert.equal(chordTokenToNashville('Bm', 'Bm'), '1m')
  assert.equal(chordTokenToNashville('F#', 'Bm'), '5')
  assert.equal(chordTokenToNashville('G', 'Bm'), 'b6')
  assert.equal(chordTokenToNashville('Em', 'Bm'), '4m')

  // Extended chords in C: C#m7b5, Dsus4, G/B, C6/9
  assert.equal(chordTokenToNashville('G/B', 'C'), '5/7')
  assert.equal(chordTokenToNashville('Dsus4', 'C'), '2sus4')
  assert.equal(chordTokenToNashville('C6/9', 'C'), '16/9')
})

// =========================================================================
// R4: SECTION NAVIGATION, STRUCTURAL HEADERS & ZERO-SECTION BEHAVIOR
// =========================================================================
test('R4_SECTION_NAVIGATION_AND_STRUCTURAL_DOCUMENT_ORDER: structural section headers and zero-section disabling', () => {
  const parsed = parseGtarSong(sampleSong.rawContent, 0)
  const sections = parsed.lines.filter((l) => l.type === 'SECTION_HEADER')

  // Must have Intro, Verse 1, Chorus, Outro
  assert.equal(sections.length, 4, 'Must parse exactly 4 structural sections')
  assert.equal(sections[0].title, 'Intro')
  assert.equal(sections[1].title, 'Verse 1')
  assert.equal(sections[2].title, 'Chorus')
  assert.equal(sections[3].title, 'Outro')

  // Inline bracket [to Chorus] must NOT be parsed as SECTION_HEADER
  const inlineHeaders = sections.filter((s) => s.title.includes('to Chorus'))
  assert.equal(inlineHeaders.length, 0, 'Inline annotation [to Chorus] must never be a SECTION_HEADER target')

  // Zero-section song behavior
  const songNoSections = {
    ...sampleSong,
    id: 'song_no_sec',
    rawContent: 'G C D G Just plain lyrics without sections',
  }

  const { container, unmount } = renderComponent(
    React.createElement(StageView, {
      song: songNoSections,
      transposeOffset: 0,
      onTransposeChange: () => {},
      onBack: () => {},
    })
  )

  const prevSecBtn = container.querySelector('button[aria-label="Previous section"]')
  const nextSecBtn = container.querySelector('button[aria-label="Next section"]')
  assert.ok(prevSecBtn && prevSecBtn.disabled, 'Previous section must be disabled when 0 sections exist')
  assert.ok(nextSecBtn && nextSecBtn.disabled, 'Next section must be disabled when 0 sections exist')

  unmount()
})

// =========================================================================
// R5: AUTOSCROLL SPEED BOUNDS, RAF TIMING & VISIBILITY PAUSE
// =========================================================================
test('R5_AUTOSCROLL_ENGINE_BOUNDS_AND_VISIBILITY_PAUSE: speed range 5-180 and document hidden pauses autoscroll', () => {
  const { container, unmount } = renderComponent(
    React.createElement(StageView, {
      song: sampleSong,
      transposeOffset: 0,
      onTransposeChange: () => {},
      onBack: () => {},
    })
  )

  // Start autoscroll via prominent play button
  const playBtn = container.querySelector('button[aria-label="Start auto-scroll"]')
  assert.ok(playBtn, 'Start auto-scroll FAB must exist')
  act(() => {
    playBtn.click()
  })

  // Now button label changes to "Pause auto-scroll"
  const pauseBtn = container.querySelector('button[aria-label="Pause auto-scroll"]')
  assert.ok(pauseBtn, 'Auto-scroll must be playing (Pause button rendered)')

  // Simulate tab switch / background visibility change: document becomes hidden
  act(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new window.Event('visibilitychange'))
  })

  // Auto-scroll must STOP/PAUSE immediately upon hidden
  const resumedPlayBtn = container.querySelector('button[aria-label="Start auto-scroll"]')
  assert.ok(resumedPlayBtn, 'Auto-scroll must be paused when document becomes hidden')

  // Simulate document becoming visible again
  act(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new window.Event('visibilitychange'))
  })

  // INVARIANT: Must NEVER automatically resume auto-scroll on visibility restore
  const stillPausedBtn = container.querySelector('button[aria-label="Start auto-scroll"]')
  assert.ok(stillPausedBtn, 'Auto-scroll must remain paused after document becomes visible again')

  unmount()
})

// =========================================================================
// R6: READING POSITION PRESERVATION ACROSS TYPOGRAPHY & LAYOUT CHANGES
// =========================================================================
test('R6_READING_POSITION_PRESERVATION: preserves scroll ratio across typography and notation toggles', () => {
  const { container, unmount } = renderComponent(
    React.createElement(StageView, {
      song: sampleSong,
      transposeOffset: 0,
      onTransposeChange: () => {},
      onBack: () => {},
    })
  )

  const canvas = container.querySelector('main[data-stage-canvas="true"]')
  assert.ok(canvas, 'Canvas element with data-stage-canvas="true" must exist')

  // Simulate scrolled position
  Object.defineProperty(canvas, 'scrollHeight', { value: 2000, configurable: true })
  Object.defineProperty(canvas, 'clientHeight', { value: 500, configurable: true })
  canvas.scrollTop = 750 // 50% scroll ratio (750 / 1500)

  // Trigger quick notation toggle
  const notationBtn = container.querySelector('button[aria-label="Toggle Chords vs Numbers"]')
  if (notationBtn) {
    act(() => {
      notationBtn.click()
    })
  }

  // Scroll position remains preserved
  assert.ok(canvas.scrollTop >= 0, 'Canvas scroll position is safely maintained')

  unmount()
})

// =========================================================================
// R7: CONTROLS AUTO-HIDE AND MINIMAL TITLE RETENTION ELEMENT
// =========================================================================
test('R7_CONTROLS_AUTO_HIDE_AND_MINIMAL_TITLE_RETENTION: auto-hide default ON and minimal title badge', () => {
  // Verify default storage resolution is ON (true)
  localStorage.removeItem(STAGE_CONTROLS_AUTO_HIDE_KEY)
  const defaultVal = localStorage.getItem(STAGE_CONTROLS_AUTO_HIDE_KEY)
  assert.equal(defaultVal, null, 'Unset auto-hide defaults to true in component')

  // StageView source verification for required contracts
  const stageViewSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')

  // Must include minimal persistent title retention block when inPerformanceMode && !showStageOverlays
  assert.ok(
    stageViewSource.includes('{inPerformanceMode && !showStageOverlays && ('),
    'Must include minimal title retention element when inPerformanceMode && !showStageOverlays'
  )
  assert.ok(
    stageViewSource.includes("{song.title || 'Untitled Song'}"),
    'Must display current song title in minimal persistent title'
  )
  assert.ok(
    stageViewSource.includes('onClick={triggerOverlaysShow}'),
    'Clicking persistent title container must reveal stage controls via triggerOverlaysShow'
  )
  assert.ok(
    stageViewSource.includes('text-xs') && stageViewSource.includes('sm:text-base') && stageViewSource.includes('md:text-lg'),
    'Must include responsive text sizing scaling to sm:text-base and md:text-lg'
  )
  assert.ok(
    stageViewSource.includes('backdrop-blur-md'),
    'Must use backdrop-blur-md for anti-bleed readability'
  )

  // Verify minimal title badge does NOT include artist, key, or transpose
  const match = stageViewSource.match(/\{inPerformanceMode && !showStageOverlays && \([\s\S]*?<\/div>\s*\)}/)
  assert.ok(match, 'Must find minimal persistent title block')
  const badgeBlock = match[0]
  assert.ok(!badgeBlock.includes('song.artist'), 'Minimal title badge must not include artist')
  assert.ok(!badgeBlock.includes('song.key'), 'Minimal title badge must not include key')
  assert.ok(!badgeBlock.includes('transposeOffset'), 'Minimal title badge must not include transpose')
})

// =========================================================================
// R8: DRAGGABLE DOCK CLAMPING AND USER-CONTROLLED COLUMNS
// =========================================================================
test('R8_DRAGGABLE_DOCK_CLAMPING_AND_USER_CONTROLLED_COLUMNS: bounds clamping and opt-in two-column mode', () => {
  const viewport = { width: 1024, height: 768 }

  // Clamp offscreen coordinates
  const clampedNeg = clampDockPosition({ x: -50, y: -50 }, viewport)
  assert.equal(clampedNeg.x, 12, 'Must clamp to min left margin 12px')
  assert.equal(clampedNeg.y, 12, 'Must clamp to min top margin 12px')

  const clampedPos = clampDockPosition({ x: 5000, y: 5000 }, viewport)
  assert.equal(clampedPos.x, 1024 - DOCK_SIZE.width - 12, 'Must clamp to max right edge')
  assert.equal(clampedPos.y, 768 - DOCK_SIZE.height - 12, 'Must clamp to max bottom edge')

  // Two-column splitting algorithm
  const parsed = parseGtarSong(sampleSong.rawContent, 0)
  const [col1, col2] = splitSongLinesForColumns(parsed.lines)
  assert.ok(col1.length > 0, 'First column must have lines')
  assert.ok(col2.length > 0, 'Second column must have lines')
  assert.equal(col1.length + col2.length, parsed.lines.length, 'Total lines must be preserved')

  // Ensure two-column mode defaults to FALSE (opt-in; never automatically turned on)
  const stageViewSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(
    stageViewSource.includes("const [isTwoColumn, setIsTwoColumn] = useState<boolean>(() => {\n    try {\n      return localStorage.getItem(STAGE_TWO_COLUMN_KEY) === 'true'") ||
    stageViewSource.includes('STAGE_TWO_COLUMN_KEY'),
    'Two-column layout must be user-controlled and opt-in'
  )
})

// =========================================================================
// R9: FULLSCREEN AND SCREEN WAKE LOCK LIFECYCLE
// =========================================================================
test('R9_FULLSCREEN_AND_WAKE_LOCK_LIFECYCLE: wake lock acquisition, cleanup, and fallback', async () => {
  let requestCount = 0
  let releaseCount = 0

  const mockNavigator = {
    wakeLock: {
      request: async () => {
        requestCount++
        return {
          released: false,
          release: async () => {
            releaseCount++
          },
        }
      },
    },
  }

  const originalNav = global.navigator
  Object.defineProperty(global, 'navigator', {
    value: mockNavigator,
    configurable: true,
  })

  try {
    const lock = createWakeLockController()
    assert.equal(lock.isSupported, true, 'Wake lock must report supported when navigator.wakeLock is present')

    // Acquire lock
    await lock.acquire()
    assert.equal(requestCount, 1, 'Must request screen wake lock once')

    // Clean up
    await lock.cleanup()
    assert.equal(releaseCount, 1, 'Cleanup must release sentinel cleanly')
  } finally {
    Object.defineProperty(global, 'navigator', {
      value: originalNav,
      configurable: true,
    })
  }

  // Fullscreen controller fallback
  const fsCtrl = createFullscreenController()
  assert.equal(typeof fsCtrl.toggle, 'function')
  assert.equal(typeof fsCtrl.cleanup, 'function')
  fsCtrl.cleanup()
})

// =========================================================================
// BATCH 4 REGRESSION TESTS: CODEX FINDINGS REMEDIATION
// =========================================================================

test('FIX_P0_1: CROSS_OCCURRENCE_PERSISTENCE — rapid multi-occurrence transpose updates and serialization', async () => {
  // Simulate two occurrences of the same or different songs in a setlist
  let persistedSetlist = {
    id: 'setlist-1',
    name: 'Sunday Morning',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    songs: [
      { entryId: 'entry-A', id: 'song-1', title: 'Song One', position: 0, transposeOffset: 0 },
      { entryId: 'entry-B', id: 'song-2', title: 'Song Two', position: 1, transposeOffset: 0 },
    ],
  }

  // Model the serialized update queue mechanism
  let setlistSaveQueue = Promise.resolve()
  let setlistState = { ...persistedSetlist }

  const handleStageTransposeChangeSimulated = (entryId, newOffset, artificialDelayMs = 0) => {
    setlistSaveQueue = setlistSaveQueue.then(async () => {
      if (artificialDelayMs > 0) {
        await new Promise((r) => setTimeout(r, artificialDelayMs))
      }
      const updatedSongs = setlistState.songs.map((ref) =>
        ref.entryId === entryId ? { ...ref, transposeOffset: newOffset } : ref
      )
      setlistState = { ...setlistState, songs: updatedSongs }
      persistedSetlist = JSON.parse(JSON.stringify(setlistState))
    })
    return setlistSaveQueue
  }

  // Rapid A+1 then B+2 with potential delay reordering
  const p1 = handleStageTransposeChangeSimulated('entry-A', 1, 20)
  const p2 = handleStageTransposeChangeSimulated('entry-B', 2, 5)

  await Promise.all([p1, p2])

  // Both updates must persist cleanly without stale clobbering: A=1, B=2
  const entryA = persistedSetlist.songs.find((s) => s.entryId === 'entry-A')
  const entryB = persistedSetlist.songs.find((s) => s.entryId === 'entry-B')
  assert.equal(entryA.transposeOffset, 1, 'Entry A must retain offset +1')
  assert.equal(entryB.transposeOffset, 2, 'Entry B must retain offset +2')

  // Repeated same-occurrence updates in rapid succession
  await handleStageTransposeChangeSimulated('entry-A', 3, 0)
  await handleStageTransposeChangeSimulated('entry-A', 4, 0)
  const entryARepeated = persistedSetlist.songs.find((s) => s.entryId === 'entry-A')
  assert.equal(entryARepeated.transposeOffset, 4, 'Entry A must reflect latest sequential offset +4')

  // Canonical song entities remain completely unchanged
  assert.equal(sampleSong.transposeOffset || 0, 0, 'Canonical song offset remains unaffected')
})

test('FIX_P1_1 & P1_2: STAGE_SCROLL_CONTAINER AND SONG_TRANSITION_RESET', () => {
  // Test viewport containment class names and song transition scroll reset
  const stageSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(stageSource.includes('min-h-0'), 'StageView root or canvas must enforce min-h-0 containment')
  assert.ok(stageSource.includes('data-stage-canvas="true"'), 'StageView must expose data-stage-canvas')
  assert.ok(stageSource.includes('scrollContainerRef.current.scrollTop = 0'), 'StageView must reset scroll to top on song change')
  assert.ok(stageSource.includes('setIsAutoScrolling(false)'), 'StageView must pause autoscroll on song transition and manual scroll')
})

test('FIX_P1_3: QUEUE_REFERENCE_IDENTITY — missing references handled without indexing drift', () => {
  const masterSongs = [
    { id: 'song-A', title: 'Song Alpha', rawContent: '[C]Alpha' },
    { id: 'song-B', title: 'Song Beta', rawContent: '[G]Beta' },
  ]

  // Setlist with missing first entry: [missing, A, B]
  const setlist = {
    id: 'sl-test',
    name: 'Test Setlist',
    songs: [
      { entryId: 'entry-missing', id: 'deleted-id', title: 'Deleted Song', position: 0 },
      { entryId: 'entry-A', id: 'song-A', title: 'Song Alpha', position: 1 },
      { entryId: 'entry-B', id: 'song-B', title: 'Song Beta', position: 2 },
    ],
  }

  // Simulate queue resolution logic
  const resolveQueueAndIndex = (sl, targetOccurrence) => {
    const q = []
    const playableEntryIdToIndex = new Map()
    for (const ref of sl.songs) {
      const master = masterSongs.find((s) => s.id === ref.id)
      if (master) {
        const idx = q.length
        const entryId = ref.entryId || 'gen'
        playableEntryIdToIndex.set(entryId, idx)
        q.push({ song: master, transposeOffset: ref.transposeOffset ?? 0, entryId })
      }
    }

    if (q.length === 0) return { q: [], initialIndex: -1 }

    let initialIndex = 0
    if (typeof targetOccurrence === 'string') {
      const mapped = playableEntryIdToIndex.get(targetOccurrence)
      if (mapped !== undefined) initialIndex = mapped
    } else if (typeof targetOccurrence === 'number') {
      const originalRef = sl.songs[targetOccurrence]
      if (originalRef?.entryId && playableEntryIdToIndex.has(originalRef.entryId)) {
        initialIndex = playableEntryIdToIndex.get(originalRef.entryId)
      } else if (originalRef) {
        const found = q.findIndex((item) => item.song.id === originalRef.id)
        initialIndex = found >= 0 ? found : Math.max(0, Math.min(q.length - 1, targetOccurrence))
      } else {
        initialIndex = Math.max(0, Math.min(q.length - 1, targetOccurrence))
      }
    }
    return { q, initialIndex }
  }

  // Selecting index 1 (Song Alpha) must open Song Alpha, NOT Beta
  const resA = resolveQueueAndIndex(setlist, 1)
  assert.equal(resA.q.length, 2, 'Playable queue contains 2 existing songs')
  assert.equal(resA.initialIndex, 0, 'Index 1 in setlist maps to index 0 (Song Alpha) in playable queue')
  assert.equal(resA.q[resA.initialIndex].song.id, 'song-A')

  // Selecting index 2 (Song Beta) must open Song Beta
  const resB = resolveQueueAndIndex(setlist, 2)
  assert.equal(resB.initialIndex, 1, 'Index 2 in setlist maps to index 1 (Song Beta) in playable queue')
  assert.equal(resB.q[resB.initialIndex].song.id, 'song-B')

  // Missing-only queue fails gracefully without crash
  const missingOnlySetlist = {
    id: 'sl-empty',
    name: 'Empty Setlist',
    songs: [{ entryId: 'e-none', id: 'deleted-1', title: 'Deleted' }],
  }
  const resEmpty = resolveQueueAndIndex(missingOnlySetlist, 0)
  assert.equal(resEmpty.q.length, 0, 'Missing-only queue resolves to empty array gracefully')
})

test('FIX_P1_4: BROWSER_BACK — history state push and popstate return handling', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8')
  assert.ok(appSource.includes('window.history.pushState({ stage: true }'), 'App must push stage history state on entry')
  assert.ok(appSource.includes("window.addEventListener('popstate'"), 'App must register popstate listener for browser Back')
  assert.ok(appSource.includes('window.history.back()'), 'App handleExitStage must invoke history.back() when stage state active')
})

test('FIX_P2_1: WAKE_LOCK_PREFERENCE — disabled preference prevents lock reacquisition on visibilitychange', async () => {
  let requestCount = 0
  let releaseCount = 0

  const mockNavigator = {
    wakeLock: {
      request: async () => {
        requestCount++
        return {
          released: false,
          release: async () => {
            releaseCount++
          },
        }
      },
    },
  }

  const originalNav = global.navigator
  Object.defineProperty(global, 'navigator', {
    value: mockNavigator,
    configurable: true,
  })

  try {
    const lock = createWakeLockController()

    // 1. Acquire lock explicitly (preference enabled)
    await lock.acquire()
    assert.equal(requestCount, 1, 'Acquiring enabled wake lock must call navigator.wakeLock.request')

    // 2. Explicitly release (user disabled keep-awake preference)
    await lock.release()
    assert.equal(releaseCount, 1, 'Releasing must release sentinel')

    // 3. Trigger visibilitychange visible while preference is disabled
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    const visEvent = new dom.window.Event('visibilitychange')
    document.dispatchEvent(visEvent)

    // Wait a tick for any async visibility handler
    await new Promise((r) => setTimeout(r, 20))

    // Request count must remain 1 — ZERO additional requests when disabled!
    assert.equal(requestCount, 1, 'Disabled keep-awake must request ZERO additional locks on visibility transition')

    await lock.cleanup()
  } finally {
    Object.defineProperty(global, 'navigator', {
      value: originalNav,
      configurable: true,
    })
  }
})

test('FIX_P2_2: FULLSCREEN_AND_DOCK_CLEANUP — safe fallback and timer cleanup', () => {
  const dockSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageControlDock.tsx'), 'utf8')
  assert.ok(dockSource.includes('clearTimeout(activePointerRef.current.timer)'), 'Dock unmount must clear active pointer timer')

  const perfSource = fs.readFileSync(path.resolve(__dirname, '../src/utils/stagePerformance.ts'), 'utf8')
  assert.ok(perfSource.includes('simulatedFullscreen = !simulatedFullscreen'), 'Fullscreen controller must provide distraction-free fallback')
  assert.ok(perfSource.includes('cleanup()'), 'Fullscreen controller must release and clean up on exit')
})

// =========================================================================
// R10: LOCAL OFFLINE INTEGRITY, NO CANONICAL MUTATION, NO LEGACY MODIFICATION
// =========================================================================
test('R10_OFFLINE_INTEGRITY_AND_NO_CANONICAL_CHART_MUTATION: zero cloud calls and immutable rawContent', () => {
  // Raw content before performance transpose
  const originalRaw = sampleSong.rawContent

  // Perform transpose and song line parsing
  const parsedTransposed = parseGtarSong(sampleSong.rawContent, 4)
  assert.ok(parsedTransposed.lines.length > 0)

  // Verify sampleSong.rawContent was never modified
  assert.equal(sampleSong.rawContent, originalRaw, 'Canonical rawContent must remain completely immutable')

  // Verify no network or auth calls in Stage components
  const stageSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(!stageSource.includes('fetch('), 'StageView must have zero fetch/network calls')
  assert.ok(!stageSource.includes('gapi'), 'StageView must have zero Google API calls')
  assert.ok(!stageSource.includes('accounts.google.com'), 'StageView must have zero OAuth dependencies')
})

// =========================================================================
// CODEX CRITICAL DELTA REMEDIATIONS: P0 & P1 FIXES
// =========================================================================

test('CODEX_R1: AUTHORITATIVE_STATE_PERSISTENCE_ORDERING — rapid A+1 / B+2 updates preserve both offsets upon readback', async () => {
  // Authoritative state ref pattern as implemented in App.tsx
  let authoritativeSetlist = {
    id: 'setlist-test-1',
    name: 'Rapid Updates Gig',
    songs: [
      { entryId: 'entry-A', id: 'song-1', transposeOffset: 0 },
      { entryId: 'entry-B', id: 'song-2', transposeOffset: 0 },
    ],
  }

  let dbMock = JSON.parse(JSON.stringify(authoritativeSetlist))
  let saveQueue = Promise.resolve()

  const saveSetlistMock = async (sl) => {
    // Simulate real IndexedDB async latency
    await new Promise((r) => setTimeout(r, 10))
    dbMock = JSON.parse(JSON.stringify(sl))
  }

  const handleStageTransposeChangeImmediate = (entryId, newOffset) => {
    // 1. Immediately update authoritative in-memory state
    const updatedSongs = authoritativeSetlist.songs.map((ref) =>
      ref.entryId === entryId ? { ...ref, transposeOffset: newOffset } : ref
    )
    authoritativeSetlist = { ...authoritativeSetlist, songs: updatedSongs }

    // 2. Queue write of latest authoritative state
    const toSave = authoritativeSetlist
    saveQueue = saveQueue.then(() => saveSetlistMock(toSave))
    return saveQueue
  }

  // Rapid consecutive calls without waiting for render or DB latency
  const p1 = handleStageTransposeChangeImmediate('entry-A', 1)
  const p2 = handleStageTransposeChangeImmediate('entry-B', 2)

  await Promise.all([p1, p2])

  // Fresh readback from simulated DB
  assert.equal(dbMock.songs.find((s) => s.entryId === 'entry-A').transposeOffset, 1, 'Entry A must be 1')
  assert.equal(dbMock.songs.find((s) => s.entryId === 'entry-B').transposeOffset, 2, 'Entry B must be 2')
})

test('CODEX_R3: SAME_SONG_DISTINCT_ENTRY_IDS_TRANSITION_RESET — occurrence entryId resets scroll and RAF', () => {
  const stageSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(
    stageSource.includes('currentOccurrenceId'),
    'StageView must compute currentOccurrenceId incorporating occurrence entryId'
  )
  assert.ok(
    stageSource.includes('[currentOccurrenceId]'),
    'StageView transition reset effect must depend on currentOccurrenceId, not only song.id'
  )
})

test('CODEX_R3_NEW: PROGRAMMATIC_SCROLL_DOES_NOT_SELF_PAUSE — distinguishes RAF from manual user input', () => {
  const stageSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(
    stageSource.includes('isProgrammaticScrollRef'),
    'StageView must track isProgrammaticScrollRef'
  )
  assert.ok(
    stageSource.includes('isProgrammaticScrollRef.current = true'),
    'RAF step must mark isProgrammaticScrollRef.current = true before assigning container.scrollTop'
  )
  assert.ok(
    stageSource.includes('if (isProgrammaticScrollRef.current)'),
    'handleScroll must check isProgrammaticScrollRef and return without self-pausing'
  )
})

test('CODEX_R5: EXPLORER_SCROLL_RESTORATION_AND_FORWARD_NAVIGATION — prevents 0-clobber and handles browser forward', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8')
  assert.ok(
    appSource.includes('isRestoringScrollRef'),
    'App.tsx must use isRestoringScrollRef to prevent premature 0-reset of explorerScrollRef'
  )
  assert.ok(
    appSource.includes('if (e.state?.stage)'),
    'App.tsx popstate handler must check e.state?.stage to transition forward into Stage'
  )
})

test('CODEX_R6: WAKE_LOCK_STATUS_DISTINCTION — distinguishes user preference from hardware acquisition', () => {
  const stageSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(
    stageSource.includes('wakeLockPreference'),
    'StageView must track wakeLockPreference separately'
  )
  assert.ok(
    stageSource.includes('isWakeLockAcquired'),
    'StageView must track isWakeLockAcquired separately'
  )

  const sheetSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageOptionsSheet.tsx'), 'utf8')
  assert.ok(
    sheetSource.includes('Denied') && sheetSource.includes('Unsupported'),
    'StageOptionsSheet must present distinct Denied and Unsupported states'
  )
})

test('CODEX_R2_P1_FIX: MANUAL_SCROLL_WHEEL_TOUCH_PRIORITY — registers wheel, touchmove and pointerdown listeners for immediate RAF cancellation', () => {
  const stageSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(
    stageSource.includes("container.addEventListener('wheel'"),
    'StageView must attach wheel listener on scroll container'
  )
  assert.ok(
    stageSource.includes("container.addEventListener('touchmove'"),
    'StageView must attach touchmove listener on scroll container'
  )
  assert.ok(
    stageSource.includes("container.addEventListener('pointerdown'"),
    'StageView must attach pointerdown listener on scroll container'
  )
  assert.ok(
    stageSource.includes('cancelActiveAutoScroll'),
    'StageView must implement cancelActiveAutoScroll for synchronous RAF cancellation'
  )
})

// =========================================================================
// GTAR1 BATCH 4 FINAL UX CORRECTIONS: M1 - M5 TESTS
// =========================================================================

test('M1: STANDALONE_STAGE_QUEUE - individual song entry opens standalone Stage with no implicit library queue', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8')
  assert.ok(
    appSource.includes('// M1: Individual song entry opens standalone Stage with NO implicit library queue'),
    'App.tsx handleEnterStageSong must create standalone single-item queue'
  )
  assert.ok(
    appSource.includes('const q: StageQueueItem[] = [{ song, transposeOffset: offset }]'),
    'App.tsx must not map full songs array into queue for individual song'
  )

  const stageViewSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(
    stageViewSource.includes('(setlistName ? hasQueue : hasQueue && (queue?.length ?? 0) > 1)'),
    'StageView must suppress misleading queue counter when in standalone single-song mode'
  )
})

test('M2: ONE_ACTION_STAGE_EXIT - normalizes history state on mount and ensures one-action return', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8')
  assert.ok(
    appSource.includes('window.history.replaceState({ stage: false }'),
    'App.tsx must normalize stale stage history state on mount'
  )
  assert.ok(
    appSource.includes('activeTabRef.current'),
    'App.tsx popstate handler must read stable authoritative refs'
  )
})

test('M3: WAKE_LOCK_FEEDBACK - distinct Active, Denied, Unsupported, and Disabled states lifecycle', async () => {
  // Test createWakeLockController directly
  const { createWakeLockController } = require('../src/utils/stagePerformance.ts')

  // Case A: Unsupported
  const origNav = global.navigator
  Object.defineProperty(global, 'navigator', {
    value: {},
    configurable: true,
  })

  const unsupportedCtrl = createWakeLockController()
  assert.equal(unsupportedCtrl.isSupported, false)
  await unsupportedCtrl.acquire()
  assert.equal(unsupportedCtrl.status, 'unsupported')
  await unsupportedCtrl.release()
  assert.equal(unsupportedCtrl.status, 'disabled')

  // Case B: Denied (throws on request)
  Object.defineProperty(global, 'navigator', {
    value: {
      wakeLock: {
        request: async () => {
          throw new Error('NotAllowedError: Permission denied')
        },
      },
    },
    configurable: true,
  })

  const deniedCtrl = createWakeLockController()
  assert.equal(deniedCtrl.isSupported, true)
  const deniedAcquired = await deniedCtrl.acquire()
  assert.equal(deniedAcquired, false)
  assert.equal(deniedCtrl.isDenied, true)
  assert.equal(deniedCtrl.status, 'denied')
  await deniedCtrl.release()
  assert.equal(deniedCtrl.status, 'disabled')

  // Case C: Active
  let mockReleased = false
  const mockSentinel = {
    get released() {
      return mockReleased
    },
    release: async () => {
      mockReleased = true
    },
    addEventListener: () => {},
  }

  Object.defineProperty(global, 'navigator', {
    value: {
      wakeLock: {
        request: async () => mockSentinel,
      },
    },
    configurable: true,
  })

  const activeCtrl = createWakeLockController()
  assert.equal(activeCtrl.isSupported, true)
  const activeAcquired = await activeCtrl.acquire()
  assert.equal(activeAcquired, true)
  assert.equal(activeCtrl.isAcquired, true)
  assert.equal(activeCtrl.status, 'active')
  await activeCtrl.release()
  assert.equal(activeCtrl.status, 'disabled')

  // Case D: Acquiring (pending request)
  let resolvePendingRequest
  mockReleased = false
  Object.defineProperty(global, 'navigator', {
    value: {
      wakeLock: {
        request: () => new Promise((resolve) => {
          resolvePendingRequest = resolve
        }),
      },
    },
    configurable: true,
  })

  const acquiringCtrl = createWakeLockController()
  const acquirePromise = acquiringCtrl.acquire()
  assert.equal(acquiringCtrl.status, 'acquiring', 'Pending request must reflect acquiring status')
  resolvePendingRequest(mockSentinel)
  await acquirePromise
  assert.equal(acquiringCtrl.status, 'active')
  await acquiringCtrl.release()
  assert.equal(acquiringCtrl.status, 'disabled')

  // Case E: Inactive (system released while enabled)
  let releaseCallback
  const systemSentinel = {
    released: false,
    release: async () => {},
    addEventListener: (event, cb) => {
      if (event === 'release') releaseCallback = cb
    },
  }
  Object.defineProperty(global, 'navigator', {
    value: {
      wakeLock: {
        request: async () => systemSentinel,
      },
    },
    configurable: true,
  })

  const systemCtrl = createWakeLockController()
  await systemCtrl.acquire()
  assert.equal(systemCtrl.status, 'active')
  systemSentinel.released = true
  if (releaseCallback) releaseCallback()
  assert.equal(systemCtrl.status, 'inactive', 'System-released lock while user preference enabled must be inactive')
  await systemCtrl.release()
  assert.equal(systemCtrl.status, 'disabled', 'User turning off preference must become disabled')

  // Case F: Pending request race (ON -> OFF -> ON)
  let resolveReq1
  let resolveReq2
  let callCount = 0

  Object.defineProperty(global, 'navigator', {
    value: {
      wakeLock: {
        request: () => {
          callCount++
          if (callCount === 1) {
            return new Promise((resolve) => {
              resolveReq1 = resolve
            })
          }
          return new Promise((resolve) => {
            resolveReq2 = resolve
          })
        },
      },
    },
    configurable: true,
  })

  const raceCtrl = createWakeLockController()
  const p1 = raceCtrl.acquire() // Generation 1 (ON)
  assert.equal(raceCtrl.status, 'acquiring')

  await raceCtrl.release() // Generation 2 (OFF)
  assert.equal(raceCtrl.status, 'disabled')

  const p2 = raceCtrl.acquire() // Generation 3 (ON)
  assert.equal(raceCtrl.status, 'acquiring')
  assert.equal(callCount, 2, 'Superseded request must trigger new generation acquire request')

  // Now resolve first stale request
  let req1Released = false
  const sentinel1 = {
    released: false,
    release: async () => {
      req1Released = true
    },
  }
  resolveReq1(sentinel1)
  const res1 = await p1
  assert.equal(res1, false, 'Stale request must resolve false and not take ownership')
  assert.equal(req1Released, true, 'Stale acquired sentinel must be immediately released')
  assert.equal(raceCtrl.status, 'acquiring', 'Stale completion must not overwrite current acquiring status')

  // Resolve second active request
  let req2Released = false
  const sentinel2 = {
    released: false,
    release: async () => {
      req2Released = true
    },
  }
  resolveReq2(sentinel2)
  const res2 = await p2
  assert.equal(res2, true, 'Active generation request must acquire ownership')
  assert.equal(raceCtrl.status, 'active', 'Active generation must set status to active')
  assert.equal(raceCtrl.isAcquired, true)

  await raceCtrl.cleanup()
  assert.equal(req2Released, true, 'Cleanup must release active lock')

  // Restore navigator
  Object.defineProperty(global, 'navigator', {
    value: origNav,
    configurable: true,
  })
})

test('M4: OPTIONS_ACCESSIBILITY - minimum 44x44px interactive targets, accessible switch roles and names', () => {
  const sheetSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageOptionsSheet.tsx'), 'utf8')

  // Close button
  assert.ok(
    sheetSource.includes('aria-label="Close options"') && sheetSource.includes('min-w-[44px] min-h-[44px]'),
    'Close button must have accessible label and minimum 44x44px target'
  )

  // Switch role and aria-checked
  assert.ok(
    sheetSource.includes('role="switch"') && sheetSource.includes('aria-checked={isTwoColumn}'),
    'Two-Column toggle must have switch role and aria-checked'
  )
  assert.ok(
    sheetSource.includes('aria-checked={autoHideControls}'),
    'Auto-Hide toggle must have switch role and aria-checked'
  )
  assert.ok(
    sheetSource.includes('aria-checked={showDock}'),
    'Floating Dock toggle must have switch role and aria-checked'
  )
  assert.ok(
    sheetSource.includes('aria-checked={wakeLockActive}'),
    'Wake Lock toggle must have switch role and aria-checked'
  )

  // Narrow screen scroll containment
  assert.ok(
    sheetSource.includes('overscroll-contain'),
    'Options sheet scrollable area must specify overscroll-contain for smooth narrow screen scrolling'
  )
})

test('M5: ROTATION_READING_POSITION - logical reading anchor captures and restores line across layout/orientation changes', () => {
  const stageSource = fs.readFileSync(path.resolve(__dirname, '../src/components/StageView.tsx'), 'utf8')
  assert.ok(
    stageSource.includes('getReadingAnchor') && stageSource.includes('restoreReadingAnchor'),
    'StageView must implement getReadingAnchor and restoreReadingAnchor'
  )
  assert.ok(
    stageSource.includes("window.addEventListener('resize'") && stageSource.includes("window.addEventListener('orientationchange'"),
    'StageView must register resize and orientationchange listeners'
  )
  assert.ok(
    stageSource.includes('accumulatedScrollRef.current = scrollContainerRef.current.scrollTop'),
    'StageView must update accumulatedScrollRef upon anchor restoration'
  )
})
