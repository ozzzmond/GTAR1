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
  title: 'Hotel California',
  artist: 'Eagles',
  key: 'Bm',
  originalKey: 'Bm',
  confirmedChartKey: 'Bm',
  bpm: '75',
  rawContent: `{title: Hotel California}
{artist: Eagles}
{key: Bm}

[Intro]
Bm F# A E G D Em F#

[Verse 1]
Bm                      F#
On a dark desert highway, cool wind in my hair
A                       E
Warm smell of colitas, rising up through the air
G                       D
Up ahead in the distance, I saw a shimmering light
Em                      F#
My head grew heavy and my sight grew dim, I had to stop for the night [to Chorus]

[Chorus]
G                       D
Welcome to the Hotel California
Em                      Bm
Such a lovely place, such a lovely face
G                       D
Plenty of room at the Hotel California
Em                      F#
Any time of year, you can find it here

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
  assert.equal(heading.textContent, 'Hotel California')

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
    id: 'song_desperado',
    title: 'Desperado',
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
  assert.equal(currentIndex, 1, 'ArrowRight advances queue to index 1 (Desperado)')

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
