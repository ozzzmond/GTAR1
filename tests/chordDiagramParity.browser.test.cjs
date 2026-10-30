const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

test('Chord parity browser: real SongViewer/Stage SVG, mouse, keyboard, touch, themes and offline flow', async () => {
  const dist = path.resolve(__dirname, '../dist')
  const server = http.createServer((req, res) => {
    const file = path.join(dist, new URL(req.url, 'http://localhost').pathname)
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html')
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }
    res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream')
    res.end(fs.readFileSync(target))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    try { browser = await chromium.launch({ channel: 'msedge' }) }
    catch { try { browser = await chromium.launch({ channel: 'chrome' }) } catch { browser = await chromium.launch() } }
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, serviceWorkers: 'block' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('gtar_revamp_local_v1')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('songs', 'readwrite')
        tx.objectStore('songs').put({ id: 'chord-parity-browser', title: 'Chord Parity Browser', key: 'G', format: 'CHORD_PRO',
          rawContent: '{key: G}\n[G]one [Em]two [Asus2]three\n[Csus2]four [Gm6]five [CM7]six\n[C9]seven [F#6]eight [D/F#]nine\n[Cadd9/E]ten', createdAt: 1, updatedAt: 1 })
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    })
    await page.reload()
    await page.getByText('Chord Parity Browser', { exact: true }).first().click()
    const token = chord => page.locator('.stage-chord-token').filter({ hasText: new RegExp(`^${chord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
    const preview = page.locator('[data-chord-preview]')
    const full = page.locator('[aria-modal="true"]')
    async function visibleSvg(chord, owner) {
      const svg = owner.locator(`svg[aria-label="Chord diagram for ${chord}"]`)
      await svg.waitFor({ state: 'visible' })
      const box = await svg.boundingBox()
      assert.ok(box.width >= 150 && box.height >= 180)
      assert.equal(await svg.locator('text').allTextContents().then(values => values.slice(-6).join(' ')), 'E A D G B e')
      const colors = await svg.locator('g circle').first().evaluate(el => {
        const background = el.closest('[role="dialog"]')
        return [getComputedStyle(el).fill, getComputedStyle(background).backgroundColor]
      })
      assert.notEqual(colors[0], colors[1], 'Finger markers contrast with dialog background')
    }
    // Actual SongViewer hover, preview transfer and full-diagram action.
    for (const chord of ['G', 'Em', 'Asus2']) {
      await token(chord).hover()
      await visibleSvg(chord, preview)
      await preview.hover()
      await preview.getByRole('button', { name: 'Open Full Diagram' }).click()
      await visibleSvg(chord, full)
      if (chord === 'Asus2') {
        await full.getByRole('button', { name: 'Next voicing' }).click()
        assert.match(await full.textContent(), /x 0 2 4 0 0/)
      }
      await page.keyboard.press('Escape')
      await full.waitFor({ state: 'hidden' })
    }
    await page.getByRole('button', { name: 'Stage', exact: true }).click()
    await page.locator('[data-stage-canvas]').waitFor()
    await token('G').focus()
    await page.keyboard.press('Space')
    await visibleSvg('G', preview)
    await page.keyboard.press('Escape')
    await preview.waitFor({ state: 'hidden' })
    assert.ok(await page.locator('[data-stage-canvas]').isVisible())
    // Narrow portrait and short landscape; popup stays inside viewport after tap.
    for (const viewport of [{ width: 360, height: 667 }, { width: 667, height: 320 }]) {
      await page.setViewportSize(viewport)
      await token('Asus2').tap()
      await visibleSvg('Asus2', preview)
      const box = await preview.boundingBox()
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, JSON.stringify(box))
      await preview.getByRole('button', { name: 'Open Full Diagram' }).tap()
      await visibleSvg('Asus2', full)
      await full.getByRole('button', { name: 'Close Diagram' }).tap()
    }
    await page.setViewportSize({ width: 1024, height: 768 })
    // Offline diagrams use only the bundled catalog. Unsupported extensions stay honest.
    await context.setOffline(true)
    for (const chord of ['Csus2', 'Gm6', 'CM7', 'C9', 'F#6', 'D/F#']) {
      await token(chord).click()
      await visibleSvg(chord, preview)
      if (chord === 'C9') {
        const barre = preview.locator('[data-barre-fret="3"]')
        assert.ok(Math.abs(Number(await barre.getAttribute('x1')) - 98.8) < 0.001)
      }
      await page.keyboard.press('Escape')
      await preview.waitFor({ state: 'hidden' })
    }
    await token('Cadd9/E').click()
    assert.match(await preview.textContent(), /Diagram unavailable/)
    assert.equal(await preview.locator('svg[role="img"]').count(), 0)
    await page.keyboard.press('Escape')
    await preview.waitFor({ state: 'hidden' })
    // Apply persisted theme snapshots through the existing application settings event.
    for (const theme of ['paper-light', 'solarized-dark']) {
      await page.evaluate(theme => {
        const snapshot = JSON.parse(localStorage.getItem('gtar_appearance_state'))
        if (snapshot) {
          snapshot.themeMode = theme
          localStorage.setItem('gtar_appearance_state', JSON.stringify(snapshot))
        }
        localStorage.setItem('gtar_theme_store', theme)
        window.dispatchEvent(new Event('gtar-settings-restored'))
      }, theme)
      await page.waitForFunction(theme => document.body.dataset.theme === theme, theme)
      for (const chord of ['G', 'Em', 'Asus2']) {
        await token(chord).click()
        await visibleSvg(chord, preview)
        if (process.env.GTAR_CHORD_QA_DIR) await preview.screenshot({ path: path.join(process.env.GTAR_CHORD_QA_DIR, `${theme}-${chord}.png`) })
        await page.keyboard.press('Escape')
        await preview.waitFor({ state: 'hidden' })
      }
    }
    assert.deepEqual(errors, [])
    await context.close()
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
