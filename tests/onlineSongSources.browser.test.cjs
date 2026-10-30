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

test('compact header: inline responsive local search, offline use and provider navigation through Sources', { timeout: 120000 }, async () => {
  const { createServer } = await import('vite')
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtar1-compact-search-'))
  let server, browser
  try {
    server = await createServer({ root: path.resolve(__dirname, '..'), cacheDir, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, clearScreen: false })
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    browser = await launchBrowser()
    for (const width of [1920, 1440, 1280, 1024, 768, 640, 430, 390, 375, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 640 })
      const page = await context.newPage()
      const errors = [], externalRequests = []
      page.on('pageerror', error => errors.push(error.message))
      await context.route(/^https:\/\//, async route => {
        externalRequests.push(route.request().url())
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Provider fixture</title>' })
      })
      await page.goto(origin)
      const query = page.getByLabel('Global search', { exact: true })
      await query.waitFor()
      await page.evaluate(async () => {
        const core = await import('/src/utils/storage.ts')
        for (const [id, title] of [['compact-alpha', 'Alpha Grace'], ['compact-beta', 'Beta Song']]) {
          await core.saveSong({ id, title, artist:'Local musician', format:'CHORD_PRO', rawContent:'[G]Local chart', tags:['Gig'], isFavorite:id === 'compact-alpha', createdAt:1, updatedAt:1 })
        }
        await core.saveSetlist({ id:'compact-gig', name:'Compact Gig', songs:[], createdAt:1, updatedAt:1 })
      })
      await page.reload()
      const main = page.locator('main[data-explorer-canvas]')
      await main.getByText('Alpha Grace', { exact:true }).waitFor()
      const records = () => page.evaluate(async () => {
        const core = await import('/src/utils/storage.ts')
        return [await core.loadAllSongs(), await core.loadAllSetlists()]
      })
      const before = await records()
      const header = page.locator('header').first()
      assert.equal(await header.locator('input').count(), 1)
      assert.equal(await header.locator('select').count(), 0, 'No search scope or provider selector')
      const bounds = await Promise.all([query, header.getByRole('button', {name:'New Song', exact:true}), header.getByRole('button', {name:'Browse Song Sources', exact:true}), header.getByRole('button', {name:'Backup and Restore', exact:true}), header.getByRole('button', {name:/Musician Profile:/})].map(control => control.boundingBox()))
      assert.ok(bounds[0].width >= 60, `Search remains usable at ${width}px`)
      for (let i = 0; i < bounds.length; i++) {
        const box = bounds[i]
        assert.ok(box.x >= 0 && box.x + box.width <= width, `Control fits ${width}px`)
        assert.ok(Math.abs(box.y + box.height / 2 - bounds[0].y - bounds[0].height / 2) < 1, 'Single toolbar row')
        if (i) assert.ok(box.x + .1 >= bounds[i-1].x + bounds[i-1].width, `No overlapping controls at ${width}px: ${JSON.stringify(bounds)}`)
      }
      assert.ok(await header.evaluate(el => el.offsetHeight <= 65), 'Compact header height')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow')
      await query.focus()
      await query.press('Tab')
      assert.equal(await header.getByRole('button', {name:'New Song', exact:true}).evaluate(el => el === document.activeElement), width < 640)
      await context.setOffline(true)
      await query.fill('Beta')
      await main.getByText('Beta Song', {exact:true}).waitFor()
      assert.equal(await main.getByText('Alpha Grace', {exact:true}).count(), 0, 'Offline filtering includes nonfavorites')
      await query.press('Enter')
      assert.equal(await query.inputValue(), 'Beta')
      await query.press('Escape')
      assert.equal(await query.inputValue(), '')
      await main.getByText('Alpha Grace', {exact:true}).waitFor()
      await query.press('Escape')
      assert.equal(await query.evaluate(el => el === document.activeElement), false)
      await query.fill('Alpha')
      await header.getByRole('button', {name:'Clear search query', exact:true}).click()
      assert.equal(await query.inputValue(), '')
      assert.equal(await query.evaluate(el => el === document.activeElement), true)
      const term = 'Amazing Grace & John Newton'
      await query.fill(term)
      await header.getByRole('button', {name:'Browse Song Sources', exact:true}).click()
      const dialog = page.getByRole('dialog', {name:'Browse Song Sources', exact:true})
      const provider = dialog.getByLabel('Provider', {exact:true})
      await dialog.getByRole('button', {name:'Search Online', exact:true}).click()
      await dialog.getByRole('alert').filter({hasText:'You are offline'}).waitFor()
      assert.deepEqual(externalRequests, [])
      await context.setOffline(false)
      const openProvider = async name => {
        const [popup] = await Promise.all([context.waitForEvent('page'), dialog.getByRole('button', {name, exact:true}).click()])
        await popup.waitForLoadState('domcontentloaded')
        assert.equal(await popup.evaluate(() => window.opener), null)
        const url = new URL(popup.url())
        await popup.close()
        return url
      }
      let url = await openProvider('Search Online')
      assert.equal(url.hostname, 'www.ultimate-guitar.com')
      assert.equal(url.searchParams.get('value'), term)
      await provider.selectOption('chordie')
      url = await openProvider('Search Online')
      assert.equal(url.hostname, 'www.chordie.com')
      assert.equal(url.searchParams.get('q'), term)
      for (const [id, host] of [['songselect', 'songselect.ccli.com'], ['opmtunes', 'www.opmtunes.com']]) {
        await provider.selectOption(id)
        url = await openProvider('Open Website')
        assert.equal(url.hostname, host)
        assert.equal(url.pathname, '/')
        assert.equal(url.search, '')
      }
      await provider.selectOption('chordie')
      await dialog.getByRole('button', {name:'Manual import', exact:true}).first().click()
      await page.locator('#import-raw-text-input').waitFor()
      await dialog.getByRole('button', {name:'Close browse song sources dialog', exact:true}).click()
      assert.equal(await query.inputValue(), term)
      await query.fill('Beta')
      await main.getByText('Beta Song', {exact:true}).waitFor()
      if (process.env.GTAR1_SOURCES_VISUAL_QA) await page.screenshot({path:path.join(os.tmpdir(), `gtar1-compact-search-${width}.png`)})
      assert.equal(externalRequests.length, 4, 'Only explicit provider actions navigate')
      assert.deepEqual(await records(), before, 'Search leaves favorites, tags and setlists intact')
      await page.reload()
      await query.waitFor()
      assert.equal(await query.inputValue(), '', 'Query remains session-only')
      await header.getByRole('button', {name:'Browse Song Sources', exact:true}).click()
      assert.equal(await provider.inputValue(), 'chordie', 'Provider preference persists')
      assert.deepEqual(errors, [])
      await context.close()
    }
  } finally {
    if (browser) await browser.close()
    if (server) await server.close()
    fs.rmSync(cacheDir, { recursive:true, force:true })
  }
})
