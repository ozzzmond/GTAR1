const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { chromium } = require('playwright')

async function launchBrowser() {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) }) } catch (error) {
      if (!channel) throw error
    }
  }
}

test('DEV mobile browser: manual export, offline, reload, bounded log, storage denial, keyboard and PROD artifact separation', async () => {
  const { createServer } = await import('vite')
  const saved = { GTAR_ENV: process.env.GTAR_ENV, VITE_APP_ENV: process.env.VITE_APP_ENV }
  process.env.GTAR_ENV = 'development'
  delete process.env.VITE_APP_ENV
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtar1-diagnostics-vite-'))
  let server, browser
  try {
    server = await createServer({ root: path.resolve(__dirname, '..'), cacheDir, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, clearScreen: false })
    await server.listen()
    const address = server.httpServer.address()
    browser = await launchBrowser()
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, acceptDownloads: true })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const externalRequests = []
    page.on('request', request => { if (!request.url().startsWith(`http://127.0.0.1:${address.port}`)) externalRequests.push(request.url()) })
    const downloads = []
    page.on('download', download => downloads.push(download))
    await page.goto(`http://127.0.0.1:${address.port}`)
    for (const [target, source] of Object.entries({
      'pwa-192x192.png': 'pwa-192.png', 'pwa-512x512.png': 'pwa-512.png',
      'apple-touch-icon.png': 'apple-touch-icon-180.png', 'favicon.ico': 'favicon.ico',
      'favicon.png': 'favicon-32x32.png', 'favicon-16x16.png': 'favicon-16x16.png',
      'favicon-32x32.png': 'favicon-32x32.png', 'favicon-48x48.png': 'favicon-48x48.png',
    })) {
      const response = await context.request.get(`http://127.0.0.1:${address.port}/${target}?dev-icon-check`)
      assert.equal(response.status(), 200)
      assert.ok((await response.body()).equals(fs.readFileSync(path.resolve(__dirname, '../public/mascots/bebegirl2-yellow-dev', source))), `DEV server preserves yellow ${target}`)
    }
    const opener = page.getByRole('button', { name: 'DEV diagnostics', exact: true })
    await opener.click()
    const entries = page.getByRole('list', { name: 'Diagnostic entries' }).getByRole('listitem')
    assert.equal(await entries.count(), 1)
    assert.match(await entries.first().innerText(), /SESSION_STARTED/)
    assert.equal(downloads.length, 0, 'No automatic export')
    const box = await page.getByRole('region', { name: 'Diagnostic log' }).boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= 375 && box.y >= 0 && box.y + box.height <= 667)
    for (const button of await page.getByRole('complementary', { name: 'DEV diagnostics' }).getByRole('button').all()) {
      const bounds = await button.boundingBox()
      assert.ok(bounds.width >= 44 && bounds.height >= 44)
    }
    await page.evaluate(async () => {
      const { diagnostics } = await import('/src/diagnostics/runtime.ts')
      window.testDiagnostics = diagnostics
      const secret = 'PRIVATE_TITLE lyrics [Am] token=SECRET https://host/path?q=secret'
      diagnostics.record(new Error(secret))
      diagnostics.record(secret)
      for (let i = 0; i < 25; i++) diagnostics.record('BROWSER_ONLINE')
    })
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Diagnostic entries"] li').length === 20)
    assert.equal(await entries.count(), 20)
    assert.doesNotMatch(await entries.first().innerText(), /SESSION_STARTED/)
    await page.getByRole('button', { name: 'Clear logs', exact: true }).click()
    assert.equal(await entries.count(), 0)
    await context.setOffline(true)
    await page.waitForFunction(() => document.querySelector('[aria-label="Diagnostic entries"]').textContent.includes('BROWSER_OFFLINE'))
    const exportOnce = async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export logs', exact: true }).click()])
      const text = fs.readFileSync(await download.path(), 'utf8')
      assert.match(download.suggestedFilename(), /^GTAR1_DEV_[A-Za-z]+_[A-Za-z]+_[A-Za-z]+_\d{8}T\d{6}Z_[a-f0-9]{32}-[a-z0-9]+\.log$/)
      assert.match(text, /BROWSER_OFFLINE/)
      assert.match(text, /schema: 1/)
      assert.doesNotMatch(text, /PRIVATE_TITLE|SECRET|https:\/\/host|\[Am\]/)
      assert.ok(Buffer.byteLength(text) <= 16384)
      return download.suggestedFilename()
    }
    assert.notEqual(await exportOnce(), await exportOnce())
    await page.getByRole('button', { name: 'Clear logs', exact: true }).focus()
    await page.keyboard.press('Escape')
    assert.equal(await opener.getAttribute('aria-expanded'), 'false')
    assert.equal(await opener.evaluate(element => element === document.activeElement), true)
    await opener.click()
    assert.equal(await entries.count(), 1, 'Closing panel retains entries')
    await context.setOffline(false)
    await page.reload()
    await opener.click()
    assert.equal(await entries.count(), 1, 'Reload starts a new session')
    assert.match(await entries.innerText(), /SESSION_STARTED/)

    // Startup failure must leave diagnostics usable without touching browser storage.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('PRIVATE_STORAGE_DATA', 'SecurityError') } })
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('PRIVATE_STORAGE_DATA', 'QuotaExceededError') } })
    })
    await page.reload()
    await opener.click()
    await page.waitForFunction(() => document.querySelector('[aria-label="Diagnostic entries"]').textContent.includes('INITIAL_LOAD_FAILED'))
    const [failureDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export logs', exact: true }).click()])
    const failureLog = fs.readFileSync(await failureDownload.path(), 'utf8')
    assert.match(failureLog, /INITIAL_LOAD_FAILED/)
    assert.doesNotMatch(failureLog, /PRIVATE_STORAGE_DATA/)

    // Blob creation/download denial is a fixed event, never raw exception content.
    await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('PRIVATE_EXPORT_ERROR') } })
    await page.getByRole('button', { name: 'Export logs', exact: true }).click()
    assert.match(await entries.allTextContents().then(lines => lines.join('\n')), /EXPORT_FAILED/)
    assert.doesNotMatch(await page.getByRole('complementary', { name: 'DEV diagnostics' }).innerText(), /PRIVATE_EXPORT_ERROR/)
    assert.deepEqual(errors, [])
    assert.deepEqual(externalRequests, [])
    await context.close()

    const dist = path.resolve(__dirname, '../dist')
    if (fs.existsSync(path.join(dist, 'manifest.webmanifest'))) {
      const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'))
      const scripts = fs.readdirSync(path.join(dist, 'assets')).filter(file => file.endsWith('.js'))
      const bundle = scripts.map(file => fs.readFileSync(path.join(dist, 'assets', file), 'utf8')).join('\n')
      if (manifest.short_name === 'GTAR') {
        assert.doesNotMatch(bundle, /GTAR1 DEV diagnostics|DEV diagnostics|SESSION_STARTED|INITIAL_LOAD_FAILED|METRONOME_START_FAILED|GTAR1_DEV_|createDiagnosticSession/)
        assert.equal(scripts.some(file => /mount-|DiagnosticsPanel/.test(file)), false)
        assert.doesNotMatch(fs.readFileSync(path.join(dist, 'sw.js'), 'utf8'), /mount-|DiagnosticsPanel/)
      } else {
        assert.match(bundle, /GTAR1 DEV diagnostics/)
      }
    }
  } finally {
    if (browser) await browser.close()
    if (server) await server.close()
    fs.rmSync(cacheDir, { recursive: true, force: true })
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
})
