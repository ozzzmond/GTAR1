const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

async function launchBrowser() {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) }) }
    catch (error) { if (!channel) throw error }
  }
}

test('provider search browser: Enter/button, reload preference, safe popups, offline and responsive Sources', { timeout: 90000 }, async () => {
  const { createServer } = await import('vite')
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtar1-source-search-'))
  let server, browser
  try {
    server = await createServer({ root: path.resolve(__dirname, '..'), cacheDir, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, clearScreen: false })
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    browser = await launchBrowser()
    for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 667 }]) {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      const errors = [], externalRequests = []
      page.on('pageerror', error => errors.push(error.message))
      // Navigation is deterministic in CI; live endpoint checks are separate preflight evidence.
      await context.route(/^https:\/\//, async route => {
        externalRequests.push(route.request().url())
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Provider website fixture</title>' })
      })
      await page.goto(origin)
      const openSources = async () => page.getByRole('button', { name: 'Browse Song Sources', exact: true }).click()
      await openSources()
      const dialog = page.getByRole('dialog', { name: 'Browse Song Sources', exact: true })
      await dialog.waitFor()
      const provider = page.getByLabel('Provider', { exact: true })
      const query = page.getByLabel('Song or artist', { exact: true })
      const search = dialog.getByRole('button', { name: 'Search', exact: true })
      assert.equal(await provider.inputValue(), 'ultimate_guitar')
      assert.deepEqual(externalRequests, [], 'Opening Sources never calls a provider')
      await search.click()
      await page.getByRole('alert').filter({ hasText: 'Enter a song or artist' }).waitFor()
      const term = 'Amazing Grace & John Newton'
      await query.fill(term)
      const openProvider = async action => {
        const [popup] = await Promise.all([context.waitForEvent('page'), action()])
        await popup.waitForLoadState('domcontentloaded')
        assert.equal(await popup.evaluate(() => window.opener), null, 'Provider cannot access the app window')
        const url = popup.url()
        await popup.close()
        return new URL(url)
      }
      let url = await openProvider(() => query.press('Enter'))
      assert.equal(url.hostname, 'www.ultimate-guitar.com')
      assert.equal(url.pathname, '/search.php')
      assert.equal(url.searchParams.get('value'), term)
      await provider.selectOption('chordie')
      assert.equal(await query.inputValue(), term)
      url = await openProvider(() => search.click())
      assert.equal(url.hostname, 'www.chordie.com')
      assert.equal(url.pathname, '/result.php')
      assert.equal(url.searchParams.get('q'), term)
      for (const [id, hostname] of [['songselect', 'songselect.ccli.com'], ['opmtunes', 'www.opmtunes.com']]) {
        await provider.selectOption(id)
        assert.equal(await query.inputValue(), term)
        assert.match(await dialog.innerText(), /Direct search link unavailable/)
        url = await openProvider(() => search.click())
        assert.equal(url.hostname, hostname)
        assert.equal(url.pathname, '/')
        assert.equal(url.search, '')
      }
      await provider.selectOption('chordie')
      const settings = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
      assert.equal(settings.gtar1_song_source_provider, 'chordie')
      assert.ok(!JSON.stringify(settings).includes(term), 'Query is not persisted')
      await page.reload()
      await openSources()
      assert.equal(await provider.inputValue(), 'chordie')
      assert.equal(await query.inputValue(), '')
      await query.fill(term)
      await context.setOffline(true)
      await search.click()
      await page.getByRole('alert').filter({ hasText: 'You are offline' }).waitFor()
      assert.equal(await query.inputValue(), term)
      assert.equal(externalRequests.length, 4, 'Offline search makes no request')
      await context.setOffline(false)
      const box = await dialog.boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1)
      assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1)
      for (const control of [provider, query, search]) {
        const bounds = await control.boundingBox()
        assert.ok(bounds.height >= 44)
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1)
      }
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'Sources has no horizontal overflow')
      if (process.env.GTAR1_SOURCES_VISUAL_QA) await page.screenshot({ path: path.join(os.tmpdir(), `gtar1-source-search-${viewport.width}.png`) })
      await dialog.getByRole('button', { name: 'Manual import', exact: true }).first().click()
      await page.locator('#import-raw-text-input').waitFor()
      await page.getByRole('tab', { name: 'Browse Websites', exact: true }).click()
      assert.equal(await query.inputValue(), term)
      await page.getByRole('button', { name: 'Close browse song sources dialog' }).click()
      await page.evaluate(() => localStorage.setItem('gtar1_song_source_provider', 'removed-provider'))
      await page.reload()
      await openSources()
      assert.equal(await provider.inputValue(), 'ultimate_guitar')
      assert.deepEqual(errors, [])
      await context.close()
    }
  } finally {
    if (browser) await browser.close()
    if (server) await server.close()
    fs.rmSync(cacheDir, { recursive: true, force: true })
  }
})
