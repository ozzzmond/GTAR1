const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const DIST_DIR = path.resolve(__dirname, '../dist')
const PORT = 5197
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
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) })
    } catch (e) {
      if (!channel) throw e
    }
  }
}

test('BROWSER_UI_SIZING_AND_LAYERING: responsive viewport containment, modal scroll containment, body scroll lock, and zero overflow', async () => {
  const server = await startServer()
  let browser

  try {
    browser = await launchBrowser()
    const viewports = [
      { name: 'Desktop', width: 1280, height: 800 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Mobile Landscape', width: 667, height: 375 },
    ]

    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      await page.goto(BASE_URL, { waitUntil: 'networkidle' })

      // 1. Zero horizontal overflow check on page
      const pageOverflow = await page.evaluate(() => ({
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        headerScrollWidth: document.querySelector('header')?.scrollWidth || 0,
        headerClientWidth: document.querySelector('header')?.clientWidth || 0,
      }))
      assert.ok(
        pageOverflow.bodyScrollWidth <= pageOverflow.bodyClientWidth,
        `Page must not horizontally overflow in ${vp.name} (${pageOverflow.bodyScrollWidth} <= ${pageOverflow.bodyClientWidth})`
      )

      // 2. Open Local Profile Modal & check containment and body scroll lock
      await page.click('[data-debug-logs-opener]')
      await page.click('button:has-text("Edit Local Profile")')
      await page.waitForTimeout(100)

      const profileModalCheck = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-labelledby="local-profile-title"]')
        const modalBox = dialog ? dialog.querySelector('div') : null
        const rect = modalBox ? modalBox.getBoundingClientRect() : null
        return {
          bodyOverflow: document.body.style.overflow,
          rect: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height, width: rect.width } : null,
          viewportHeight: window.innerHeight,
          fitsViewport: rect ? rect.top >= 0 && rect.bottom <= window.innerHeight : false,
        }
      })
      assert.equal(profileModalCheck.bodyOverflow, 'hidden', `Body scroll must be locked when profile modal is open in ${vp.name}`)
      assert.ok(
        profileModalCheck.fitsViewport,
        `Profile modal must fit completely within viewport in ${vp.name} (top: ${profileModalCheck.rect.top}, bottom: ${profileModalCheck.rect.bottom}, vpHeight: ${profileModalCheck.viewportHeight})`
      )

      // Test Escape key closes modal & restores body scroll
      await page.keyboard.press('Escape')
      await page.waitForTimeout(100)
      const afterEscape = await page.evaluate(() => ({
        dialogCount: document.querySelectorAll('[role="dialog"][aria-labelledby="local-profile-title"]').length,
        bodyOverflow: document.body.style.overflow,
      }))
      assert.equal(afterEscape.dialogCount, 0, 'Escape must close LocalProfileModal')
      assert.notEqual(afterEscape.bodyOverflow, 'hidden', 'Body scroll must be restored after modal close')

      // 3. Open Backup Modal & check containment
      await page.click('[data-debug-logs-opener]')
      await page.click('button:has-text("Backup & Restore")')
      await page.waitForTimeout(100)

      const backupCheck = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-labelledby="backup-modal-title"]')
        const modalBox = dialog ? dialog.querySelector('div') : null
        const rect = modalBox ? modalBox.getBoundingClientRect() : null
        return {
          bodyOverflow: document.body.style.overflow,
          fitsViewport: rect ? rect.top >= 0 && rect.bottom <= window.innerHeight : false,
        }
      })
      assert.equal(backupCheck.bodyOverflow, 'hidden', 'Body scroll locked during backup modal')
      assert.ok(backupCheck.fitsViewport, `Backup modal must fit in ${vp.name}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(100)

      // 4. Open Browse Song Sources Modal & check wide proportion
      await page.click('[data-debug-logs-opener]')
      await page.click('button:has-text("Browse Song Sources")')
      await page.waitForTimeout(100)

      const sourcesCheck = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-labelledby="browse-sources-modal-title"]')
        const modalBox = dialog ? dialog.querySelector('div') : null
        const rect = modalBox ? modalBox.getBoundingClientRect() : null
        return {
          bodyOverflow: document.body.style.overflow,
          width: rect?.width || 0,
          fitsViewport: rect ? rect.top >= 0 && rect.bottom <= window.innerHeight : false,
        }
      })
      assert.equal(sourcesCheck.bodyOverflow, 'hidden', 'Body scroll locked during sources modal')
      assert.ok(sourcesCheck.fitsViewport, `Sources modal must fit in ${vp.name}`)
      if (vp.width >= 1024) {
        assert.ok(sourcesCheck.width >= 700, `Sources modal must be wide on desktop (got ${sourcesCheck.width}px)`)
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(100)

      await context.close()
    }
  } finally {
    if (browser) await browser.close()
    server.close()
  }
})
