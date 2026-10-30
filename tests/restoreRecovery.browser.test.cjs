const test = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const scenarios = require('./fixtures/restoreRecoveryScenarios.cjs')

// Issue #13: recovery snapshot, post-commit verification and safe undo in real Chromium IndexedDB.
// Every browser context is disposable and holds synthetic records only.
test('Real IndexedDB: recovery snapshot, verification marker, quota, crash/reload and safe undo', { timeout: 180000 }, async t => {
  const { createServer } = await import('vite')
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, plugins: [{ name: 'recovery-fixture', configureServer(s) {
    s.middlewares.use((req, res, next) => {
      if (req.url === '/recovery-fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Disposable recovery fixture</title>'); return }
      next()
    })
  } }] })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  let browser
  try {
    try { browser = await chromium.launch({ headless: true }) }
    catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }) }

    // 1. Storage-level scenarios R1-R11 (shared with the local harness).
    {
      const context = await browser.newContext(), page = await context.newPage()
      await page.goto(`${origin}/recovery-fixture`)
      const checks = await page.evaluate(async src => {
        const run = (0, eval)(`(() => { const module = {}; ${src}; return module.exports })()`)
        return run({ storage: await import('/src/utils/storage.ts'), restore: await import('/src/utils/restoreLibrary.ts'), settings: await import('/src/utils/restoreSettings.ts') })
      }, `module.exports = ${scenarios.toString()}`)
      assert.equal(checks.length, 13, checks.join('; '))
      t.diagnostic(`storage scenarios PASS: ${checks.join('; ')}`)
      await context.close()
    }

    // 2. Low storage headroom fails closed before any write (IndexedDB QuotaExceededError
    //    during the commit itself is covered by scenario R2 and restoreIntegrity A6).
    //    CDP quota overrides are not honoured in headless Chromium, so the estimate is stubbed.
    {
      const context = await browser.newContext(), page = await context.newPage()
      await page.goto(`${origin}/recovery-fixture`)
      const quota = await page.evaluate(async () => {
        const storage = await import('/src/utils/storage.ts'), restore = await import('/src/utils/restoreLibrary.ts')
        await storage.saveSong({ id: 'q1', title: 'Quota local', rawContent: 'Synthetic', format: 'PLAIN', tags: [], createdAt: 1, updatedAt: 1 })
        const before = restore.libraryDigest(await restore.readLibraryImage())
        const estimate = StorageManager.prototype.estimate
        StorageManager.prototype.estimate = async () => ({ quota: 200 * 1024, usage: 150 * 1024 })
        const songs = Array.from({ length: 100 }, (_, i) => ({ id: `big${i}`, title: `Large synthetic ${i}`, rawContent: 'x'.repeat(1000), format: 'PLAIN', tags: [], createdAt: 1, updatedAt: 1 }))
        let error
        try { await restore.restoreLibraryWithStatus({ songs, setlists: [], folders: [] }, 'REPLACE', await restore.readLibraryImage()) } catch (err) { error = `${err.name}: ${err.message}` }
        finally { StorageManager.prototype.estimate = estimate }
        return { error, unchanged: restore.libraryDigest(await restore.readLibraryImage()) === before, info: await restore.getLastRestoreInfo() }
      })
      assert.match(quota.error || '', /QuotaExceededError/, 'insufficient storage must reject the restore')
      assert.equal(quota.unchanged, true, 'quota failure leaves library unchanged')
      assert.equal(quota.info, null, 'quota failure writes no snapshot or marker')
      t.diagnostic(`storage headroom fail-closed PASS (${quota.error})`)
      await context.close()
    }

    // 3. Real app UI: DB-backed preview, cancellation, verified success, undo, crash/reload recovery with conflicts.
    {
      const context = await browser.newContext(), page = await context.newPage()
      const dialogs = []
      let confirmAnswer = true
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); if (dialog.type() === 'confirm' && !confirmAnswer) await dialog.dismiss(); else await dialog.accept() })
      await page.goto(origin)
      await page.getByRole('button', { name: 'Backup and Restore', exact: true }).waitFor()
      // Records written outside React state: the preview must still count them.
      const original = await page.evaluate(async () => {
        const storage = await import('/src/utils/storage.ts'), restore = await import('/src/utils/restoreLibrary.ts')
        await storage.saveSong({ id: 'u1', title: 'Synthetic local one', rawContent: 'Synthetic', format: 'PLAIN', tags: [], createdAt: 1, updatedAt: 1 })
        await storage.saveSong({ id: 'u2', title: 'Synthetic local two', rawContent: 'Synthetic', format: 'PLAIN', tags: [], createdAt: 1, updatedAt: 1 })
        return restore.libraryDigest(await restore.readLibraryImage())
      })
      const digest = () => page.evaluate(async () => { const r = await import('/src/utils/restoreLibrary.ts'); return r.libraryDigest(await r.readLibraryImage()) })
      const lastRestore = () => page.evaluate(async () => (await import('/src/utils/restoreLibrary.ts')).getLastRestoreInfo())
      const backup = { songs: [{ id: 'ui1', title: 'Incoming synthetic', rawContent: '', format: 'PLAIN', createdAt: 1, updatedAt: 1 }], setlists: [], folders: [] }
      const openRestore = async () => {
        await page.getByRole('button', { name: 'Backup and Restore', exact: true }).click()
        await page.getByRole('button', { name: 'Restore From File / JSON' }).click()
      }
      await openRestore()
      await page.locator('textarea').fill(JSON.stringify(backup))
      await page.getByRole('combobox', { name: 'Restore behavior' }).selectOption('REPLACE')
      confirmAnswer = false
      await page.getByRole('button', { name: 'Restore Library', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('textarea').disabled)
      assert.ok(dialogs.some(m => /Replace the entire local library \(2 songs/.test(m)), 'confirm counts the IndexedDB baseline, not UI state')
      assert.equal(await digest(), original, 'cancelled confirm writes nothing')
      assert.equal(await lastRestore(), null, 'cancelled confirm writes no snapshot')
      confirmAnswer = true
      await page.getByRole('button', { name: 'Restore Library', exact: true }).click()
      await page.getByText('Incoming synthetic', { exact: true }).first().waitFor()
      assert.ok(dialogs.some(m => /Successfully restored and verified/.test(m)), 'success only after verification')
      // Undo the restore through the UI.
      await openRestore()
      await page.getByRole('button', { name: 'Undo last restore…' }).click()
      await page.getByRole('dialog', { name: 'Library Recovery' }).waitFor()
      await page.getByRole('button', { name: 'Undo restore', exact: true }).click()
      await page.getByRole('dialog', { name: 'Library Recovery' }).waitFor({ state: 'hidden' })
      assert.ok(dialogs.some(m => /Library recovered and verified/.test(m)))
      assert.equal(await digest(), original, 'undo returns the exact pre-restore library')

      // Crash after commit, before verification; another edit lands before reload.
      const unverified = await page.evaluate(async incoming => {
        const storage = await import('/src/utils/storage.ts'), restore = await import('/src/utils/restoreLibrary.ts')
        const baseline = await restore.readLibraryImage()
        const getAll = IDBObjectStore.prototype.getAll
        let reads = 0
        IDBObjectStore.prototype.getAll = function (...args) {
          const req = getAll.apply(this, args)
          if (this.name === 'songs' && ++reads === 4) Object.defineProperty(req, 'result', { get: () => [], set() {}, configurable: true })
          return req
        }
        let result
        try { result = await restore.restoreLibraryWithStatus(incoming, 'MERGE', baseline) } finally { IDBObjectStore.prototype.getAll = getAll }
        await storage.saveSong({ id: 'u1', title: 'Edited after interrupted restore', rawContent: 'Synthetic', format: 'PLAIN', tags: [], createdAt: 1, updatedAt: 2 })
        return result.status
      }, { songs: [{ id: 'ui2', title: 'Interrupted incoming', rawContent: '', format: 'PLAIN', createdAt: 1, updatedAt: 1 }], setlists: [], folders: [] })
      assert.equal(unverified, 'COMMITTED_UNVERIFIED')
      await page.reload()
      const recovery = page.getByRole('dialog', { name: 'Library Recovery' })
      await recovery.waitFor()
      assert.ok(await recovery.getByText(/could not be verified/).isVisible(), 'unverified restore is reported, not claimed as success')
      const choice = recovery.getByRole('combobox', { name: 'Recovery choice for Edited after interrupted restore' })
      assert.equal(await choice.inputValue(), 'KEEP_CURRENT', 'newer edit defaults to keep-current')
      await recovery.getByRole('button', { name: 'Undo restore', exact: true }).click()
      await recovery.waitFor({ state: 'hidden' })
      const final = await page.evaluate(async () => (await (await import('/src/utils/restoreLibrary.ts')).readLibraryImage()).songs.map(s => `${s.id}:${s.title}`).sort())
      assert.deepEqual(final, ['u1:Edited after interrupted restore', 'u2:Synthetic local two'], 'restore reverted; newer edit preserved')
      t.diagnostic('UI: DB baseline, cancel, verified success, undo, crash/reload unverified recovery with keep-current PASS')
      await context.close()
    }
  } finally { if (browser) await browser.close(); await server.close() }
})
