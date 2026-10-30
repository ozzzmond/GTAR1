const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

test('Multi-song setlist picker browser: Outlook search picker, Ctrl+K, multi-select, bulk add, touch, and persistence', async () => {
  const dist = path.resolve(__dirname, '../dist')
  const server = http.createServer((req, res) => {
    const file = path.join(dist, new URL(req.url, 'http://localhost').pathname)
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html')
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }
    res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream')
    res.end(fs.readFileSync(target))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser

  try {
    try {
      browser = await chromium.launch({ channel: 'msedge' })
    } catch {
      try {
        browser = await chromium.launch({ channel: 'chrome' })
      } catch {
        browser = await chromium.launch()
      }
    }

    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      hasTouch: true,
      serviceWorkers: 'block',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto(`http://127.0.0.1:${server.address().port}`)

    // 1. Seed IndexedDB with test setlist and songs
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('gtar_revamp_local_v1')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      // Seed songs and setlist
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['songs', 'setlists'], 'readwrite')
        const songStore = tx.objectStore('songs')
        const setlistStore = tx.objectStore('setlists')

        songStore.put({
          id: 'song-alpha',
          title: 'Morning Sun',
          artist: 'Acoustic Trio',
          key: 'D',
          format: 'CHORD_PRO',
          rawContent: '{title: Morning Sun}\n[D]Morning [G]sun shines',
          createdAt: 10,
          updatedAt: 10,
        })

        songStore.put({
          id: 'song-beta',
          title: 'River Flow',
          artist: 'Nature Sounds',
          key: 'Em',
          format: 'CHORD_PRO',
          rawContent: '{title: River Flow}\n[Em]River [C]flows [D]deep',
          createdAt: 20,
          updatedAt: 20,
        })

        songStore.put({
          id: 'song-gamma',
          title: 'Night Sky',
          artist: 'Star Gazers',
          key: 'A',
          format: 'CHORD_PRO',
          rawContent: '{title: Night Sky}\n[A]Stars in the [E]sky',
          createdAt: 30,
          updatedAt: 30,
        })

        setlistStore.put({
          id: 'setlist-trial',
          name: 'trial',
          folderId: null,
          createdAt: 100,
          updatedAt: 100,
          songs: [
            {
              entryId: 'existing-entry-1',
              id: 'song-alpha',
              title: 'Morning Sun',
              artist: 'Acoustic Trio',
              key: 'D',
              position: 0,
              transposeOffset: 0,
            },
          ],
        })

        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    })

    // Reload to hydrate from IndexedDB
    await page.reload()

    // 2. Navigate to SETLISTS tab in Header
    const setlistsTabBtn = page.getByRole('button', { name: /setlists/i }).first()
    await setlistsTabBtn.click()

    // Click 'trial' setlist in sidebar to ensure it is selected
    const setlistItem = page.locator('button', { hasText: 'trial' }).first()
    await setlistItem.waitFor({ state: 'visible', timeout: 5000 })
    await setlistItem.click()

    // Verify initial setlist contains 'Morning Sun'
    const morningSunInSetlist = page.locator('.ui-setlist-card button', { hasText: 'Morning Sun' }).first()
    await morningSunInSetlist.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await morningSunInSetlist.isVisible())

    // 3. Test keyboard shortcut Ctrl+K to open picker
    await page.keyboard.press('Control+k')

    // Wait for multi-song picker panel to become visible
    const picker = page.locator('[role="region"][aria-label="Multi-song search picker"]')
    await picker.waitFor({ state: 'visible', timeout: 3000 })
    assert.ok(await picker.isVisible(), 'Multi-song search picker opened via Ctrl+K')

    // 4. Test searching by artist "Nature"
    const searchInput = page.locator('#multi-song-search-input')
    await searchInput.fill('Nature')

    // Results should show River Flow
    await page.waitForSelector('text=River Flow', { timeout: 3000 })
    const betaRow = picker.locator('[role="option"]').filter({ hasText: 'River Flow' })
    await betaRow.waitFor({ state: 'visible', timeout: 3000 })
    assert.ok(await betaRow.isVisible(), 'River Flow displayed for artist query Nature')

    // 5. Select River Flow via touch / click
    await betaRow.click()

    // Counter updates to "1 song selected"
    await picker.locator('text=1 song selected').waitFor({ state: 'visible', timeout: 3000 })
    assert.ok(await picker.locator('text=1 song selected').isVisible())

    // 6. Clear search input and search for "Star"
    await searchInput.fill('Star')
    await page.waitForSelector('text=Night Sky', { timeout: 3000 })
    const gammaRow = picker.locator('[role="option"]').filter({ hasText: 'Night Sky' })
    await gammaRow.click()

    // Counter updates to "2 songs selected" (selection remained stable across filtering!)
    await picker.locator('text=2 songs selected').waitFor({ state: 'visible', timeout: 3000 })
    assert.ok(await picker.locator('text=2 songs selected').isVisible())

    // 7. Click "Add 2 Selected Songs"
    const addSelectedBtn = picker.getByRole('button', { name: /add 2 selected songs/i })
    await addSelectedBtn.click()

    // 8. Verify status confirmation message
    await page.waitForSelector('text=Added 2 songs to setlist', { timeout: 3000 })

    // Verify all 3 songs are now rendered in the setlist:
    // Morning Sun (pos 1), River Flow (pos 2), Night Sky (pos 3)
    const setlistCard = page.locator('.ui-setlist-card')
    await setlistCard.locator('button', { hasText: 'Morning Sun' }).first().waitFor({ state: 'visible', timeout: 3000 })
    await setlistCard.locator('button', { hasText: 'River Flow' }).first().waitFor({ state: 'visible', timeout: 3000 })
    await setlistCard.locator('button', { hasText: 'Night Sky' }).first().waitFor({ state: 'visible', timeout: 3000 })

    // 9. Reload page to verify IndexedDB persistence of bulk-added setlist songs
    await page.reload()
    await page.getByRole('button', { name: /setlists/i }).first().click()
    await page.locator('button', { hasText: 'trial' }).first().click()

    // All songs still present after browser refresh
    await page.locator('.ui-setlist-card button', { hasText: 'Morning Sun' }).first().waitFor({ state: 'visible', timeout: 3000 })
    await page.locator('.ui-setlist-card button', { hasText: 'River Flow' }).first().waitFor({ state: 'visible', timeout: 3000 })
    await page.locator('.ui-setlist-card button', { hasText: 'Night Sky' }).first().waitFor({ state: 'visible', timeout: 3000 })

    // 10. Test Escape dismissal
    const searchSongsBtn = page.getByRole('button', { name: /search songs/i }).first()
    await searchSongsBtn.click()
    await picker.waitFor({ state: 'visible', timeout: 3000 })

    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'hidden', timeout: 3000 })
    assert.ok(!(await picker.isVisible()), 'Picker dismissed via Escape key')

    // Verify zero unhandled exceptions
    assert.equal(errors.length, 0, `Browser console errors: ${errors.join(', ')}`)
  } finally {
    if (browser) await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
