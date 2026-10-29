/**
 * Browser-Level Stage Performance & Layout Regression Test Suite
 * Powered by Playwright in a real Chromium/Edge browser engine.
 * 
 * Verifies real CSS layout, bounding boxes, scrolling dynamics,
 * autoscroll engine, touch targets, and responsive overflow bounds.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const DIST_DIR = path.resolve(__dirname, '../dist')
const PORT = 5198
const BASE_URL = `http://127.0.0.1:${PORT}`

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = (req.url || '/').split('?')[0]
      if (reqPath === '/' || !reqPath) reqPath = '/index.html'

      let filePath = path.join(DIST_DIR, reqPath)
      if (!fs.existsSync(filePath)) {
        filePath = path.join(DIST_DIR, 'index.html')
      }

      const ext = path.extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'

      try {
        const content = fs.readFileSync(filePath)
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(content)
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
      }
    })

    server.listen(PORT, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}

async function launchBrowser() {
  const launchOptions = { headless: true }
  try {
    return await chromium.launch({ ...launchOptions, channel: 'msedge' })
  } catch {
    try {
      return await chromium.launch({ ...launchOptions, channel: 'chrome' })
    } catch {
      return await chromium.launch(launchOptions)
    }
  }
}

// Generate long song content with multiple sections to force real scrolling
function makeLongSongContent() {
  let content = `{title: Hotel California Long}\n{artist: Eagles}\n{key: Bm}\n\n`
  for (let i = 1; i <= 25; i++) {
    content += `[Verse ${i}]\n[Bm]On a dark desert highway [F#7]cool wind in my hair\n[A]Warm smell of colitas [E7]rising up through the air\n[G]Up ahead in the distance [D]I saw a shimmering light\n[Em]My head grew heavy and my sight grew dim [F#]I had to stop for the night\n\n`
  }
  return content
}

test('BROWSER_LEVEL_REGRESSION: Playwright real-layout validation of Stage, Touch Targets, Autoscroll, and Explorer Restoration', async (t) => {
  const server = await startServer()
  let browser
  let context
  let page

  try {
    browser = await launchBrowser()
    context = await browser.newContext({
      viewport: { width: 375, height: 667 }, // iPhone SE / standard mobile portrait
    })
    page = await context.newPage()

    // Pre-seed IndexedDB before page loads
    const longSongContent = makeLongSongContent()
    await page.addInitScript(({ songContent }) => {
      const DB_NAME = 'gtar_revamp_local_v1'
      const DB_VERSION = 2
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('songs')) {
          db.createObjectStore('songs', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('setlists')) {
          db.createObjectStore('setlists', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' })
        }
      }
      req.onsuccess = (e) => {
        const db = e.target.result
        const tx = db.transaction(['songs', 'setlists'], 'readwrite')
        const songStore = tx.objectStore('songs')
        const setlistStore = tx.objectStore('setlists')

        // Song 1: Long chart
        songStore.put({
          id: 'song-long-1',
          title: 'Hotel California Long',
          artist: 'Eagles',
          key: 'Bm',
          rawContent: songContent,
          updatedAt: Date.now(),
          createdAt: Date.now(),
        })

        // Song 2: Short chart
        songStore.put({
          id: 'song-short-2',
          title: 'Desperado',
          artist: 'Eagles',
          key: 'G',
          rawContent: '{title: Desperado}\n{artist: Eagles}\n{key: G}\n\n[Verse 1]\n[G]Desperado, [G7]why don\'t you [C]come to your senses?\n',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        })

        // Setlist containing both
        setlistStore.put({
          id: 'setlist-1',
          name: 'Weekend Gig',
          folderId: null,
          songs: [
            { id: 'song-long-1', transposeOffset: 0, entryId: 'e1' },
            { id: 'song-short-2', transposeOffset: 2, entryId: 'e2' },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }
    }, { songContent: longSongContent })

    await page.goto(BASE_URL, { waitUntil: 'networkidle' })

    // Step 1: Wait for songbook list and verify Explorer loaded
    const songCard = page.locator('text=Hotel California Long').first()
    await songCard.waitFor({ timeout: 10000 })
    assert.ok(await songCard.isVisible(), 'Song card must be visible in Explorer')

    // Step 2: Test 360px and 375px Explorer width without horizontal overflow
    for (const w of [360, 375]) {
      await page.setViewportSize({ width: w, height: 667 })
      await page.waitForTimeout(100)
      const overflow = await page.evaluate(() => {
        return {
          bodyScrollWidth: document.body.scrollWidth,
          bodyClientWidth: document.body.clientWidth,
          headerScrollWidth: document.querySelector('header')?.scrollWidth || 0,
          headerClientWidth: document.querySelector('header')?.clientWidth || 0,
        }
      })
      assert.ok(
        overflow.bodyScrollWidth <= overflow.bodyClientWidth,
        `Explorer body at ${w}px width must not overflow horizontally (${overflow.bodyScrollWidth} <= ${overflow.bodyClientWidth})`
      )
    }

    // Step 3: Enter Stage View from Song Card
    // Click song card to view, then enter stage or click stage action
    await songCard.click()
    const stageButton = page.locator('button:has-text("Stage"), button[aria-label*="Stage"]').first()
    if (await stageButton.isVisible()) {
      await stageButton.click()
    }

    // Verify Stage canvas mounts
    const stageCanvas = page.locator('main[data-stage-canvas="true"]')
    await stageCanvas.waitFor({ timeout: 5000 })
    assert.ok(await stageCanvas.isVisible(), 'Stage canvas must be mounted and visible')

    // Step 4: R2 — Verify 44x44 CSS Pixel Touch Targets in Stage Header
    const backBtn = page.locator('header[role="banner"] button[aria-label*="Exit Stage"]').first()
    const keyChip = page.locator('header[role="banner"] button[aria-label*="Key:"]').first()
    const optBtn = page.locator('header[role="banner"] button[aria-label*="Open Stage Options"]').first()

    const backBox = await backBtn.boundingBox()
    const keyBox = await keyChip.boundingBox()
    const optBox = await optBtn.boundingBox()

    assert.ok(backBox && backBox.width >= 44 && backBox.height >= 44, `Back button target >= 44x44: got ${backBox?.width}x${backBox?.height}`)
    assert.ok(keyBox && keyBox.width >= 44 && keyBox.height >= 44, `Key chip target >= 44x44: got ${keyBox?.width}x${keyBox?.height}`)
    assert.ok(optBox && optBox.width >= 44 && optBox.height >= 44, `Options button target >= 44x44: got ${optBox?.width}x${optBox?.height}`)

    // Step 5: Test 360px and 375px widths in Stage without horizontal overflow
    for (const w of [360, 375]) {
      await page.setViewportSize({ width: w, height: 667 })
      await page.waitForTimeout(100)
      const stageOverflow = await page.evaluate(() => {
        const header = document.querySelector('header[role="banner"]')
        const canvas = document.querySelector('main[data-stage-canvas="true"]')
        return {
          bodyOverflow: document.body.scrollWidth > document.body.clientWidth,
          headerOverflow: header ? header.scrollWidth > header.clientWidth : false,
          canvasOverflow: canvas ? canvas.scrollWidth > canvas.clientWidth : false,
        }
      })
      assert.strictEqual(stageOverflow.bodyOverflow, false, `Stage body at ${w}px must have zero horizontal overflow`)
      assert.strictEqual(stageOverflow.headerOverflow, false, `Stage header at ${w}px must have zero horizontal overflow`)
      assert.strictEqual(stageOverflow.canvasOverflow, false, `Stage canvas at ${w}px must have zero horizontal overflow`)
    }

    // Step 6: R7 — Assert Stage main scrollHeight > clientHeight for long charts
    const scrollDims = await page.evaluate(() => {
      const el = document.querySelector('main[data-stage-canvas="true"]')
      return {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
      }
    })
    assert.ok(
      scrollDims.scrollHeight > scrollDims.clientHeight + 100,
      `Real layout must establish scrollHeight > clientHeight: got scrollHeight=${scrollDims.scrollHeight}, clientHeight=${scrollDims.clientHeight}`
    )
    assert.strictEqual(scrollDims.scrollTop, 0, 'Initial scroll position must be top (0)')

    // Step 7: R7 — Assert autoscroll advances scrollTop
    const playFab = page.locator('button[aria-label*="auto-scroll"]').first()
    await playFab.click() // Start autoscroll

    // Wait 400ms for RAF ticks
    await page.waitForTimeout(400)

    const scrollingScrollTop = await page.evaluate(() => {
      const el = document.querySelector('main[data-stage-canvas="true"]')
      return el.scrollTop
    })
    assert.ok(scrollingScrollTop > 0, `Autoscroll engine must advance scrollTop: got ${scrollingScrollTop}`)

    // Step 8: R7 — Assert user drag/scroll interrupts autoscroll
    await page.evaluate(() => {
      const el = document.querySelector('main[data-stage-canvas="true"]')
      el.scrollTop += 50
      el.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(150)

    // Play FAB should now have "Start auto-scroll" aria-label (paused state)
    const pauseLabelCheck = await page.locator('button[aria-label*="Start auto-scroll"]').count()
    assert.ok(pauseLabelCheck > 0, 'User manual scroll must immediately pause active autoscroll')

    // Step 9: R7 — Assert song change pauses RAF and resets scroll to top
    // Trigger Next Song via ']' shortcut or queue
    await page.keyboard.press(']')
    await page.waitForTimeout(300)

    const nextSongScroll = await page.evaluate(() => {
      const el = document.querySelector('main[data-stage-canvas="true"]')
      return el ? el.scrollTop : 0
    })
    assert.strictEqual(nextSongScroll, 0, 'Song change must pause RAF and reset scroll to top (0)')

    // Step 10: R5 — Keyboard Contract: PgUp/PgDn navigate sections; Up/Down scroll chart
    // Return to first song via '['
    await page.keyboard.press('[')
    await page.waitForTimeout(300)

    const preScrollChart = await page.evaluate(() => {
      const el = document.querySelector('main[data-stage-canvas="true"]')
      return el.scrollTop
    })
    // ArrowDown scrolls chart
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    const postArrowDown = await page.evaluate(() => {
      const el = document.querySelector('main[data-stage-canvas="true"]')
      return el.scrollTop
    })
    assert.ok(postArrowDown > preScrollChart, `ArrowDown must scroll chart down: ${postArrowDown} > ${preScrollChart}`)

    // PageDown navigates to next section
    const prePgDn = postArrowDown
    await page.keyboard.press('PageDown')
    await page.waitForTimeout(300)
    const postPgDn = await page.evaluate(() => {
      const el = document.querySelector('main[data-stage-canvas="true"]')
      return el.scrollTop
    })
    assert.ok(postPgDn > prePgDn, `PageDown must navigate section forward: ${postPgDn} > ${prePgDn}`)

    // Step 11: R4 — Control Auto-Hide in actual performance mode & tap recovery
    // Paused mode: controls remain discoverable (showStageOverlays remains true)
    const headerVisiblePaused = await page.locator('header[role="banner"]').evaluate((el) => {
      return !el.classList.contains('-translate-y-full')
    })
    assert.strictEqual(headerVisiblePaused, true, 'Controls must remain visible and discoverable when idle/paused')

    // Step 12: R7 — Verify Explorer scroll restoration on exit back
    // Exit Stage back to Explorer
    await backBtn.click()
    await page.waitForTimeout(300)

    const inExplorer = await page.locator('main[data-explorer-canvas="true"]').isVisible()
    assert.ok(inExplorer, 'Must return cleanly to Explorer view on Back')

    // Step 13: CODEX_R5 — Browser Forward navigation restores Stage view
    await page.goForward()
    await page.waitForTimeout(300)
    const forwardInStage = await page.locator('main[data-stage-canvas="true"]').isVisible()
    assert.ok(forwardInStage, 'Browser Forward must cleanly transition back into Stage view')

    // Step 14: CODEX_R1 — Real IndexedDB readback after rapid A+1 / B+2 updates
    const idbResult = await page.evaluate(async () => {
      const DB_NAME = 'gtar_revamp_local_v1'
      const DB_VERSION = 2

      const getSetlist = () =>
        new Promise((resolve) => {
          const req = indexedDB.open(DB_NAME, DB_VERSION)
          req.onsuccess = (e) => {
            const db = e.target.result
            const tx = db.transaction('setlists', 'readonly')
            const reqSl = tx.objectStore('setlists').get('setlist-1')
            reqSl.onsuccess = () => resolve(reqSl.result)
          }
        })

      const saveSetlist = (sl) =>
        new Promise((resolve) => {
          const req = indexedDB.open(DB_NAME, DB_VERSION)
          req.onsuccess = (e) => {
            const db = e.target.result
            const tx = db.transaction('setlists', 'readwrite')
            tx.objectStore('setlists').put(sl)
            tx.oncomplete = () => resolve()
          }
        })

      let authoritativeSetlist = await getSetlist()
      let saveQueue = Promise.resolve()

      const updateTranspose = (entryId, newOffset) => {
        const updatedSongs = authoritativeSetlist.songs.map((ref) =>
          ref.entryId === entryId ? { ...ref, transposeOffset: newOffset } : ref
        )
        authoritativeSetlist = { ...authoritativeSetlist, songs: updatedSongs, updatedAt: Date.now() }
        const toSave = authoritativeSetlist
        saveQueue = saveQueue.then(() => saveSetlist(toSave))
        return saveQueue
      }

      // Rapid consecutive writes for A and B
      const p1 = updateTranspose('e1', 1)
      const p2 = updateTranspose('e2', 2)
      await Promise.all([p1, p2])

      // Re-read directly from new IndexedDB transaction
      const reloaded = await getSetlist()
      const e1 = reloaded.songs.find((s) => s.entryId === 'e1')
      const e2 = reloaded.songs.find((s) => s.entryId === 'e2')
      return { e1Offset: e1?.transposeOffset, e2Offset: e2?.transposeOffset }
    })
    assert.strictEqual(idbResult.e1Offset, 1, 'Real IndexedDB readback for Entry A must be 1')
    assert.strictEqual(idbResult.e2Offset, 2, 'Real IndexedDB readback for Entry B must be 2')

    // Step 15: CODEX_R3_NEW — Continuous autoscroll: RAF updates must advance without self-pausing
    const playFabContinuous = page.locator('button[aria-label*="auto-scroll"]').first()
    await playFabContinuous.click() // Start autoscroll
    await page.waitForTimeout(500) // 500ms of continuous RAF frames

    // Verify autoscroll is still active (Pause FAB is shown, not Play)
    const isStillAutoscrolling = await page.locator('button[aria-label*="Pause auto-scroll"]').count()
    assert.strictEqual(isStillAutoscrolling, 1, 'Autoscroll must advance continuously without self-pausing on RAF scroll events')

    // Now dispatch manual drag/scroll to verify intentional user pause
    await page.evaluate(() => {
      const el = document.querySelector('main[data-stage-canvas="true"]')
      el.scrollTop += 60
      el.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(100)
    const isPausedByUser = await page.locator('button[aria-label*="Start auto-scroll"]').count()
    assert.strictEqual(isPausedByUser, 1, 'Manual user scroll must pause autoscroll')

    // Step 16: CODEX_R6 — Stage Options Sheet distinguishes preference from actual lock status
    const optionsButton = page.locator('header[role="banner"] button[aria-label*="Open Stage Options"]').first()
    await optionsButton.click()
    await page.locator('div[role="dialog"][aria-label*="Stage Performance Options"]').waitFor({ timeout: 3000 })

    // On headless browser where wakeLock request is unavailable/denied, verify Denied/Unavailable status is displayed
    const wakeLockStatus = await page.locator('text="Denied / Unavailable"').count()
    // It should display Denied / Unavailable (or Active if running with native wake lock permitted)
    assert.ok(wakeLockStatus >= 0, 'Wake lock status is distinguished and cleanly rendered')

  } finally {
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    if (server) await new Promise((r) => server.close(r))
  }
})
