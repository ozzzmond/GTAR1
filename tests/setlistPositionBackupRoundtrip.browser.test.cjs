const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

// GTAR1: Setlist position backup round-trip, noncontiguous positions, validation, and restore/undo in real Chromium.
test('Real Chromium: setlist position backup roundtrip, noncontiguous positions, restore and undo', async () => {
  const dist = path.resolve(__dirname, '../dist')
  const server = http.createServer((req, res) => {
    const file = path.join(dist, new URL(req.url, 'http://localhost').pathname)
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html')
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }
    res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream')
    res.end(fs.readFileSync(target))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  let browser
  try {
    try {
      browser = await chromium.launch({ headless: true })
    } catch {
      browser = await chromium.launch({ headless: true, channel: 'msedge' })
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()
    const dialogs = []
    let confirmAnswer = true
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      if (dialog.type() === 'confirm' && !confirmAnswer) {
        await dialog.dismiss()
      } else {
        await dialog.accept()
      }
    })

    // Seed synthetic song and setlist into isolated IndexedDB
    await page.goto(`http://127.0.0.1:${port}`)
    await page.waitForSelector('main[data-explorer-canvas]')

    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('gtar_revamp_local_v1')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      await new Promise((resolve, reject) => {
        const tx = db.transaction(['songs', 'setlists'], 'readwrite')
        const songStore = tx.objectStore('songs')
        const setlistStore = tx.objectStore('setlists')

        songStore.put({
          id: 'synth-1',
          title: 'Morning Light',
          artist: 'Acoustic Praise',
          key: 'D',
          format: 'CHORD_PRO',
          rawContent: '{title: Morning Light}\n[D]Morning light [G]shines',
          tags: ['worship'],
          isFavorite: false,
          transposeOffset: 0,
          createdAt: 100,
          updatedAt: 100,
        })

        songStore.put({
          id: 'synth-2',
          title: 'Evening Song',
          artist: 'Acoustic Praise',
          key: 'A',
          format: 'CHORD_PRO',
          rawContent: '{title: Evening Song}\n[A]Evening stars [E]glow',
          tags: ['evening'],
          isFavorite: false,
          transposeOffset: 0,
          createdAt: 100,
          updatedAt: 100,
        })

        // Setlist with noncontiguous positions and repeated song reference
        setlistStore.put({
          id: 'setlist-synth',
          name: 'Sunday Morning Gig',
          folderId: null,
          createdAt: 100,
          updatedAt: 100,
          songs: [
            {
              entryId: 'entry-opener',
              id: 'synth-1',
              title: 'Morning Light (Opener)',
              artist: 'Acoustic Praise',
              key: 'D',
              position: 0,
              transposeOffset: 0,
            },
            {
              entryId: 'entry-middle',
              id: 'synth-2',
              title: 'Evening Song',
              artist: 'Acoustic Praise',
              key: 'A',
              position: 5, // Noncontiguous gap position
              transposeOffset: 1,
            },
            {
              entryId: 'entry-encore',
              id: 'synth-1',
              title: 'Morning Light (Encore)',
              artist: 'Acoustic Praise',
              key: 'D',
              position: 12, // Noncontiguous gap position with repeated song reference
              transposeOffset: 3,
            },
          ],
        })

        // Also seed an empty setlist
        setlistStore.put({
          id: 'setlist-empty',
          name: 'Empty Placeholder Setlist',
          folderId: null,
          createdAt: 100,
          updatedAt: 100,
          songs: [],
        })

        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    })

    // Reload page to rehydrate state from storage
    await page.reload()
    await page.waitForSelector('main[data-explorer-canvas]')

    // 1. Export GTAR1 JSON backup via BackupModal
    const backupBtn = page.getByRole('button', { name: /Backup and Restore/i }).first()
    await backupBtn.click()
    await page.waitForSelector('textarea')
    const exportedJson = await page.locator('textarea').inputValue()
    assert.ok(exportedJson.includes('GTAR1'), 'Backup JSON contains app header')
    assert.ok(exportedJson.includes('Sunday Morning Gig'), 'Backup JSON contains setlist')
    assert.ok(exportedJson.includes('"position": 5'), 'Backup JSON preserves noncontiguous position 5')
    assert.ok(exportedJson.includes('"position": 12'), 'Backup JSON preserves noncontiguous position 12')

    // Close Backup modal
    await page.getByRole('button', { name: /Cancel|Close/i }).last().click()

    // 2. Test Fresh export -> Merge preview & Replace preview
    await backupBtn.click()
    const restoreTab = page.getByRole('button', { name: /Restore From File \/ JSON/i })
    await restoreTab.click()
    await page.locator('textarea').fill(exportedJson)
    await page.waitForSelector('text=Valid Backup Payload Ready for Restoration')
    assert.ok(await page.locator('text=Valid Backup Payload Ready for Restoration').isVisible(), 'Freshly exported backup accepted by validator')
    assert.ok(await page.locator('text=Contains 2 songs, 2 setlists, and 0 folders.').isVisible())

    // Close modal
    await page.getByRole('button', { name: /Cancel|Close/i }).last().click()

    // 3. Edit song in library
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('gtar_revamp_local_v1')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['songs'], 'readwrite')
        tx.objectStore('songs').put({
          id: 'synth-1',
          title: 'Morning Light (Edited Later)',
          artist: 'Acoustic Praise',
          key: 'D',
          format: 'CHORD_PRO',
          rawContent: '{title: Morning Light}\n[D]Morning light [G]shines edited',
          tags: ['worship'],
          isFavorite: false,
          transposeOffset: 0,
          createdAt: 100,
          updatedAt: 200,
        })
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    })
    await page.reload()
    await page.waitForSelector('main[data-explorer-canvas]')

    // 4. Import freshly exported backup after edit
    await backupBtn.click()
    await page.getByRole('button', { name: /Restore From File \/ JSON/i }).click()
    await page.locator('textarea').fill(exportedJson)
    await page.waitForSelector('text=Valid Backup Payload Ready for Restoration')

    // 4a. In Merge mode, song conflict is cleanly detected
    await page.getByRole('combobox', { name: 'Restore behavior' }).selectOption('MERGE')
    await page.waitForSelector('text=Merge conflict: songs ID synth-1')
    assert.ok(await page.locator('text=Merge conflict: songs ID synth-1').isVisible())

    // 4b. In Replace mode, plan summary confirms replacement of local library
    await page.getByRole('combobox', { name: 'Restore behavior' }).selectOption('REPLACE')
    await page.waitForSelector('text=4 local records replaced by 4 backup records.')
    assert.ok(await page.locator('text=4 local records replaced by 4 backup records.').isVisible())

    // 5. Execute Replace restore
    confirmAnswer = true
    await page.getByRole('button', { name: 'Restore Library', exact: true }).click()
    const startRestore = Date.now()
    while (!dialogs.some((d) => /Successfully restored and verified/.test(d)) && Date.now() - startRestore < 10000) {
      await page.waitForTimeout(100)
    }
    assert.ok(dialogs.some((d) => /Successfully restored and verified/.test(d)), 'Restore verified dialog shown')

    // Verify restored song title is reverted to unedited backup title
    await page.reload()
    await page.waitForSelector('main[data-explorer-canvas]')
    const restoredSongTitle = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open('gtar_revamp_local_v1')
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
      return new Promise((res) => {
        const tx = db.transaction(['songs'], 'readonly')
        const req = tx.objectStore('songs').get('synth-1')
        req.onsuccess = () => {
          db.close()
          res(req.result?.title)
        }
      })
    })
    assert.equal(restoredSongTitle, 'Morning Light', 'Song reverted to original backup version')

    // 6. Test Undo last restore
    await backupBtn.click()
    await page.getByRole('button', { name: /Restore From File \/ JSON/i }).click()
    const undoBtn = page.getByRole('button', { name: /Undo last restore/i })
    await undoBtn.waitFor({ state: 'visible' })
    await undoBtn.click()

    // Library Recovery Modal opens
    await page.getByRole('dialog', { name: 'Library Recovery' }).waitFor()
    const confirmUndoBtn = page.getByRole('button', { name: 'Undo restore', exact: true })
    await confirmUndoBtn.click()
    const startRecovery = Date.now()
    while (!dialogs.some((d) => /Library recovered and verified/.test(d)) && Date.now() - startRecovery < 10000) {
      await page.waitForTimeout(100)
    }
    assert.ok(dialogs.some((d) => /Library recovered and verified/.test(d)), 'Recovery dialog shown')

    // Verify Undo restored the pre-restore state with the edited song!
    await page.reload()
    await page.waitForSelector('main[data-explorer-canvas]')
    const undoneSongTitle = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open('gtar_revamp_local_v1')
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
      return new Promise((res) => {
        const tx = db.transaction(['songs'], 'readonly')
        const req = tx.objectStore('songs').get('synth-1')
        req.onsuccess = () => {
          db.close()
          res(req.result?.title)
        }
      })
    })
    assert.equal(undoneSongTitle, 'Morning Light (Edited Later)', 'Undo restored pre-restore library with edited song')
  } finally {
    if (browser) await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
