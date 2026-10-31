const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const { chromium } = require('playwright')

test('Real IndexedDB: baseline R1/R2/R6 and adversarial restore verification in disposable Chromium context', { timeout: 120000 }, async t => {
  const { createServer } = await import('vite')
  let baseline = ''
  try { baseline = execFileSync('git', ['show', 'cb39e680413d1ec6dd2f09b0f97ab13544f9d273:src/utils/storage.ts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch {}
  const oldStorage = ts.transpileModule(baseline.replaceAll("'./", "'/src/utils/").replaceAll("'../types/", "'/src/types/"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, plugins: [{ name: 'restore-fixtures', configureServer(server) {
  server.middlewares.use((req, res, next) => {
    if (req.url === '/restore-fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Disposable restore fixture</title>'); return }
    if (req.url === '/baseline-storage.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(oldStorage); return }
    next()
  })
  } }] })
  await server.listen()
  let browser
  try {
    try { browser = await chromium.launch({ headless: true }) }
    catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }) }
    const context = await browser.newContext()
    const page = await context.newPage()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    await page.goto(`${origin}/restore-fixture`)
    const results = await page.evaluate(async hasBaseline => {
      const fixtureSong = (id, title = id) => ({ id, title, rawContent: 'Synthetic fixture only', format: 'PLAIN', tags: [], createdAt: 1, updatedAt: 1 })
      const local = fixtureSong('local')
      let r1 = null, r2 = null, r6 = null
      if (hasBaseline) {
      const old = await import('/baseline-storage.js')
      await old.saveSong(local)
      await old.saveAllSongs([fixtureSong('local', 'overwritten')])
      r1 = (await old.loadAllSongs())[0].title === 'overwritten'
      await old.saveAllSongs([fixtureSong('partial')])
      const dbOld = await old.openRevampDB(), originalTx = dbOld.transaction.bind(dbOld)
      dbOld.transaction = (...args) => { if (args[0] === 'setlists') throw new Error('Injected second-store failure'); return originalTx(...args) }
      try { await old.saveAllSetlists([{ id: 'l', name: 'fixture', songs: [] }]) } catch {}
      dbOld.transaction = originalTx
      r2 = (await old.loadAllSongs()).some(s => s.id === 'partial')
      await old.saveAllSongs([fixtureSong('replacement')])
      r6 = (await old.loadAllSongs()).length === 3
      old.closeRevampDB()
      // Reset only this ephemeral browser context's isolated GTAR1 database.
      await new Promise((resolve, reject) => { const q = indexedDB.deleteDatabase(old.DB_NAME); q.onsuccess = resolve; q.onerror = reject })
      }
      const storage = await import('/src/utils/storage.ts')
      const restore = await import('/src/utils/restoreLibrary.ts')
      const parser = await import('/src/utils/jsonBackup.ts')
      const settings = await import('/src/utils/restoreSettings.ts')
      const empty = { songs: [], setlists: [], folders: [] }
      const incoming = parser.parseBackupJson(JSON.stringify({ songs: [fixtureSong('incoming')], setlists: [{ id: 'set', name: 'fixture', folderId: 'folder', songs: [{ id: 'incoming', title: 'incoming' }] }], folders: [{ id: 'folder', name: 'Synthetic folder', parentId: null }] }))
      const data = { songs: incoming.songs, setlists: incoming.setlists, folders: incoming.folders }
      await storage.saveSong(local)
      await storage.saveFolder({ id: 'old-folder', name: 'Old synthetic folder', parentId: null, createdAt: 1, updatedAt: 1 })
      const current = { songs: await storage.loadAllSongs(), setlists: [], folders: await storage.loadAllFolders() }
      const digest = async () => restore.libraryDigest({ songs: await storage.loadAllSongs(), setlists: await storage.loadAllSetlists(), folders: await storage.loadAllFolders() })
      const original = await digest()
      localStorage.setItem('gtar_theme_store', 'oled-black')
      const originalSettings = JSON.stringify(settings.captureSettings())
      const checks = []
      async function unchanged(name, action, pattern) {
        let error
        try { await action() } catch (err) { error = err }
        if (!error || !pattern.test(error.message)) throw new Error(`${name}: expected rejection, got ${error?.message}`)
        if (await digest() !== original) throw new Error(`${name}: library mutated`)
        if (JSON.stringify(settings.captureSettings()) !== originalSettings) throw new Error(`${name}: settings mutated`)
        checks.push(name)
      }
      await unchanged('A11 validation writes nothing', () => restore.restoreLibrary({ ...data, songs: [] }, 'REPLACE', current), /referenced/)
      await unchanged('A4 merge collision keeps musician data', () => restore.restoreLibrary({ ...empty, songs: [fixtureSong('local', 'conflict')] }, 'MERGE', current), /conflict/)
      await unchanged('A4 cross-type collision', () => restore.restoreLibrary({ ...empty, folders: [{ id: 'local', name: 'cross', parentId: null }] }, 'MERGE', current), /cross-type/)
      await unchanged('A7 stale preview', () => restore.restoreLibrary(data, 'REPLACE', empty), /changed since preview/)
      const put = IDBObjectStore.prototype.put
      for (const kind of ['enqueue', 'quota', 'abort', 'request', 'folder']) {
        IDBObjectStore.prototype.put = function(value) {
          if (this.name === (kind === 'folder' ? 'folders' : 'setlists')) {
            if (kind === 'folder') throw new Error('Injected folder failure')
            if (kind === 'quota') throw new DOMException('Injected quota failure', 'QuotaExceededError')
            if (kind === 'enqueue') throw new Error('Injected enqueue failure')
            if (kind === 'abort') { this.transaction.abort(); return put.call(this, value) }
            // Real asynchronous ConstraintError after writes to the first store.
            put.call(this, value); return this.add(value)
          }
          return put.call(this, value)
        }
        try { await unchanged(`A6 ${kind}`, () => restore.restoreLibrary(data, 'REPLACE', current, { themeMode: 'paper-light' }), /quota|enqueue|abort|transaction|constraint|folder/i) }
        finally { IDBObjectStore.prototype.put = put }
      }
      const add = IDBObjectStore.prototype.add
      IDBObjectStore.prototype.add = function(value) {
        if (this.name === 'restoreJournal') throw new DOMException('Journal quota', 'QuotaExceededError')
        return add.call(this, value)
      }
      try { await unchanged('A6 recovery journal quota aborts before writes', () => restore.restoreLibrary(data, 'REPLACE', current), /quota/i) }
      finally { IDBObjectStore.prototype.add = add }
      const getAll = IDBObjectStore.prototype.getAll
      for (const kind of ['throw', 'mismatch']) {
        let reads = 0
        IDBObjectStore.prototype.getAll = function(...args) {
          if (this.name === 'songs' && ++reads === 3) {
            if (kind === 'throw') throw new Error('Injected readback failure')
            const req = getAll.apply(this, args)
            Object.defineProperty(req, 'result', { get: () => [] })
            return req
          }
          return getAll.apply(this, args)
        }
        try { await unchanged(`A7 readback ${kind}`, () => restore.restoreLibrary(data, 'REPLACE', current), /readback/) }
        finally { IDBObjectStore.prototype.getAll = getAll }
      }
      const setItem = Storage.prototype.setItem
      let failed = false
      Storage.prototype.setItem = function(key, value) {
        if (!failed && key === 'gtar_appearance_state') { failed = true; throw new DOMException('Settings quota', 'QuotaExceededError') }
        return setItem.call(this, key, value)
      }
      try { await unchanged('A6 settings partial write rollback', () => restore.restoreLibrary(data, 'REPLACE', current, { themeMode: 'paper-light' }), /quota/i) }
      finally { Storage.prototype.setItem = setItem }
      const deleteRecord = IDBObjectStore.prototype.delete
      let abortOnce = true
      IDBObjectStore.prototype.delete = function(key) {
        if (this.name === 'restoreJournal' && abortOnce) { abortOnce = false; throw new Error('Injected failure after settings readback') }
        return deleteRecord.call(this, key)
      }
      try { await unchanged('A6 abort after settings verification rolls back both domains', () => restore.restoreLibrary(data, 'REPLACE', current, { themeMode: 'paper-light' }), /after settings/) }
      finally { IDBObjectStore.prototype.delete = deleteRecord }
      const merged = await restore.restoreLibrary(data, 'MERGE', current)
      if (merged.songs.length !== 2) throw new Error('Merge lost local song')
      const repeated = await restore.restoreLibrary(data, 'MERGE', merged)
      if (repeated.songs.length !== 2 || repeated.setlists.length !== 1) throw new Error('Repeated merge accumulated duplicates')
      checks.push('A8 idempotent merge')
      const replaced = await restore.restoreLibrary(data, 'REPLACE', repeated, { themeMode: 'paper-light', stageSettings: { fontSizePx: 24 } })
      if (replaced.songs.length !== 1 || replaced.folders.length !== 1 || (await storage.loadAllFolders()).some(f => f.id === 'old-folder') || (await storage.loadAllSongs()).some(s => s.id === 'local')) throw new Error('Hidden record survived replace')
      if (localStorage.getItem('gtar_theme_store') !== 'paper-light') throw new Error('Settings did not commit')
      storage.closeRevampDB()
      if (await digest() !== restore.libraryDigest(replaced)) throw new Error('Reopen differs from committed readback')
      checks.push('A10 exact replace and reopen; no hidden records')
      // Simulate crash after durable journal + settings writes but before library commit.
      const before = settings.captureSettings(), after = settings.planSettings(before, { themeMode: 'amber-stage' })
      const db = await storage.openRevampDB()
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storage.STORES.RESTORE, 'readwrite')
        tx.objectStore(storage.STORES.RESTORE).add({ id: 'pending-restore', settingsBefore: before, settingsAfter: after })
        tx.oncomplete = resolve; tx.onerror = reject
      })
      settings.writeSettings(after)
      storage.closeRevampDB()
      return { baseline: { r1, r2, r6 }, checks, recoveryExpected: before, committed: restore.libraryDigest(replaced) }
    }, !!baseline)
    if (baseline) assert.deepEqual(results.baseline, { r1: true, r2: true, r6: true }, 'baseline confirms silent overwrite, partial mutation, hidden survivors')
    await page.reload()
    const recovered = await page.evaluate(async () => {
      const storage = await import('/src/utils/storage.ts'), restore = await import('/src/utils/restoreLibrary.ts'), settings = await import('/src/utils/restoreSettings.ts')
      const image = { songs: await storage.loadAllSongs(), setlists: await storage.loadAllSetlists(), folders: await storage.loadAllFolders() }
      return { settings: settings.captureSettings(), digest: restore.libraryDigest(image) }
    })
    assert.deepEqual(recovered.settings, results.recoveryExpected, 'A7 interrupted restore settings recover on new page')
    assert.equal(recovered.digest, results.committed, 'A7 recovery preserves original committed library')
    t.diagnostic(`${baseline ? 'Baseline R1/R2/R6 expected safe=false, actual unsafe=true' : 'Pinned baseline unavailable in shallow checkout (local reproduction recorded in PR)'}; corrected: ${results.checks.join('; ')}; interrupted recovery PASS`)
    // Exercise the real React modal as well as storage APIs. This browser context
    // contains synthetic records only and is destroyed at the end of this test.
    await page.goto(origin)
    const backupBtn = page.getByRole('button', { name: 'Backup and Restore', exact: true })
    await backupBtn.waitFor({ state: 'visible', timeout: 60000 })
    await backupBtn.click()
    await page.getByRole('button', { name: 'Restore From File / JSON' }).click()
    const beforePreview = await page.evaluate(() => JSON.stringify(localStorage))
    const uiBackup = { songs: [{ id: 'ui-new', title: 'UI synthetic new', rawContent: '', format: 'PLAIN', createdAt: 1, updatedAt: 1 }], setlists: [{ id: 'ui-list', name: 'UI synthetic list', songs: [] }], folders: [], themeMode: 'oled-black' }
    await page.locator('textarea').fill(JSON.stringify(uiBackup))
    await page.getByText('Valid Backup Payload Ready for Restoration', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), beforePreview, 'A12 preview does not mutate settings')
    const previewDigest = await page.evaluate(async () => {
      const storage = await import('/src/utils/storage.ts'), restore = await import('/src/utils/restoreLibrary.ts')
      return restore.libraryDigest({ songs: await storage.loadAllSongs(), setlists: await storage.loadAllSetlists(), folders: await storage.loadAllFolders() })
    })
    assert.equal(previewDigest, results.committed, 'A12 preview leaves every persistent library store unchanged')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), beforePreview, 'A12 cancel does not mutate settings')
    await backupBtn.waitFor({ state: 'visible', timeout: 60000 })
    await backupBtn.click()
    await page.getByRole('button', { name: 'Restore From File / JSON' }).click()
    await page.locator('textarea').fill(JSON.stringify(uiBackup))
    await page.getByRole('combobox', { name: 'Restore behavior' }).selectOption('REPLACE')
    await page.evaluate(() => {
      window.originalPut = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function(value) {
        if (this.name === 'setlists') throw new Error('Injected UI restore failure')
        return window.originalPut.call(this, value)
      }
    })
    const dialogs = []
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept() })
    await page.getByRole('button', { name: 'Restore Library', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('button:not([disabled])') && document.body.innerText.includes('Restore Library'))
    await page.getByRole('button', { name: 'Restore Library', exact: true }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('textarea').disabled)
    assert.ok(dialogs.some(message => /Import error.*Injected UI restore failure/.test(message)))
    assert.equal(await page.getByText('UI synthetic new', { exact: true }).count(), 0, 'Failed restore publishes no new song')
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), beforePreview)
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalPut })
    await page.getByRole('button', { name: 'Restore Library', exact: true }).click()
    await page.getByText('UI synthetic new', { exact: true }).first().waitFor()
    assert.ok(dialogs.some(message => /Successfully restored/.test(message)))

    // R1 Hardening Test: Interrupted restore with post-interruption settings conflict
    // 1. Capture settings before and create pending-restore journal representing interruption
    await page.evaluate(async () => {
      const storage = await import('/src/utils/storage.ts');
      const settings = await import('/src/utils/restoreSettings.ts');
      const beforeImg = settings.captureSettings();
      const afterImg = settings.planSettings(beforeImg, { themeMode: 'paper-light' });
      const db = await storage.openRevampDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storage.STORES.RESTORE, 'readwrite');
        tx.objectStore(storage.STORES.RESTORE).put({ id: 'pending-restore', settingsBefore: beforeImg, settingsAfter: afterImg });
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      storage.closeRevampDB();
      // 2. Modify gtar_stage_font_size to 42, differing from both journal images
      localStorage.setItem('gtar_stage_font_size', '42');
    });

    // 3. Reload page - application startup must NOT reject or strand the musician
    await page.reload();

    // 4. Recovery Conflict Review modal must be displayed
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    assert.ok(await page.getByText(/Settings Conflict Review/i).isVisible(), 'Recovery conflict modal is visible');
    assert.ok(await page.getByText(/stage font size/i).isVisible(), 'Conflicting setting is displayed');

    // 5. Active newer settings must NOT be overwritten silently
    assert.equal(await page.evaluate(() => localStorage.getItem('gtar_stage_font_size')), '42', 'Newer font size setting 42 is preserved');

    // 6. Test recoverable data export button
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Export Recoverable Library/i }).click(),
    ]);
    assert.ok(download.suggestedFilename().includes('gtar1-recovery-rescue'), 'Export file triggered');

    // 7. Repeated reload still preserves recovery access without loop or dead-end
    await page.reload();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => localStorage.getItem('gtar_stage_font_size')), '42');

    // 8. Explicitly choose Keep Newer Active Settings and apply resolution
    await page.getByLabel(/Keep newer active settings/i).check();
    await page.getByRole('button', { name: /Apply Resolution & Continue/i }).click();

    // 9. Modal closes, normal app remains usable and journal is cleaned
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const journalAfter = await page.evaluate(async () => {
      const storage = await import('/src/utils/storage.ts');
      const settings = await import('/src/utils/restoreSettings.ts');
      const db = await storage.openRevampDB();
      const j = await settings.getPendingRestoreJournal(db, storage.STORES.RESTORE);
      storage.closeRevampDB();
      return j;
    });
    assert.equal(journalAfter, null, 'Pending restore journal cleared upon explicit resolution');
    assert.equal(await page.evaluate(() => localStorage.getItem('gtar_stage_font_size')), '42', 'Settings retained after explicit resolution');

    // Failure safety check: inject transaction abort during conflict resolution
    await page.evaluate(async () => {
      const storage = await import('/src/utils/storage.ts');
      const settings = await import('/src/utils/restoreSettings.ts');
      const beforeImg = settings.captureSettings();
      const afterImg = settings.planSettings(beforeImg, { themeMode: 'e-ink-paper' });
      const db = await storage.openRevampDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storage.STORES.RESTORE, 'readwrite');
        tx.objectStore(storage.STORES.RESTORE).put({ id: 'pending-restore', settingsBefore: beforeImg, settingsAfter: afterImg });
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      storage.closeRevampDB();
      localStorage.setItem('gtar_stage_font_size', '99');
    });
    await page.reload();
    await page.getByRole('dialog').waitFor({ state: 'visible' });

    // Inject IDBObjectStore.prototype.delete failure during resolution transaction
    await page.evaluate(() => {
      window.originalJournalDelete = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete = function(key) {
        if (this.name === 'restoreJournal') {
          this.transaction.abort();
          throw new DOMException('Injected conflict resolution delete failure', 'AbortError');
        }
        return window.originalJournalDelete.call(this, key);
      };
    });

    // Attempt resolution; should fail safely without destroying recovery evidence or active settings
    await page.getByLabel(/Roll back to pre-restore baseline/i).check();
    await page.getByRole('button', { name: /Apply Resolution & Continue/i }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Resolution failed') || document.body.innerText.includes('Injected'));
    assert.equal(await page.evaluate(() => localStorage.getItem('gtar_stage_font_size')), '99', 'Active settings preserved when resolution transaction fails');

    // Restore delete implementation and verify retry succeeds
    await page.evaluate(() => {
      IDBObjectStore.prototype.delete = window.originalJournalDelete;
    });
    await page.getByLabel(/Keep newer active settings/i).check();
    await page.getByRole('button', { name: /Apply Resolution & Continue/i }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => localStorage.getItem('gtar_stage_font_size')), '99', 'Retry resolution succeeds and retains musician active settings');

    // Failure safety check 2: localStorage write/quota failure leaves journal in IDB
    await page.evaluate(async () => {
      const storage = await import('/src/utils/storage.ts');
      const settings = await import('/src/utils/restoreSettings.ts');
      const beforeImg = settings.captureSettings();
      const afterImg = settings.planSettings(beforeImg, { themeMode: 'crimson-stage' });
      const db = await storage.openRevampDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storage.STORES.RESTORE, 'readwrite');
        tx.objectStore(storage.STORES.RESTORE).put({ id: 'pending-restore', settingsBefore: beforeImg, settingsAfter: afterImg });
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      storage.closeRevampDB();
      localStorage.setItem('gtar_stage_font_size', '77');
    });
    await page.reload();
    await page.getByRole('dialog').waitFor({ state: 'visible' });

    // Inject localStorage write failure during settings application
    await page.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      let failedOnce = false;
      Storage.prototype.setItem = function(key, val) {
        if (!failedOnce && key.startsWith('gtar')) {
          failedOnce = true;
          throw new DOMException('Injected quota error during resolution', 'QuotaExceededError');
        }
        return window.originalSetItem.call(this, key, val);
      };
    });

    await page.getByLabel(/Apply interrupted backup settings/i).check();
    await page.getByRole('button', { name: /Apply Resolution & Continue/i }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Resolution failed') || document.body.innerText.includes('Injected quota error'));

    // Journal MUST still be present in IndexedDB (never lost when write fails)
    const journalAfterWriteFail = await page.evaluate(async () => {
      const storage = await import('/src/utils/storage.ts');
      const settings = await import('/src/utils/restoreSettings.ts');
      const db = await storage.openRevampDB();
      const j = await settings.getPendingRestoreJournal(db, storage.STORES.RESTORE);
      storage.closeRevampDB();
      return j;
    });
    assert.ok(journalAfterWriteFail !== null, 'Journal preserved in IDB after localStorage write failure');

    // Restore setItem and test concurrent cross-tab race guard
    await page.evaluate(() => {
      Storage.prototype.setItem = window.originalSetItem;
      // Simulate another tab modifying settings during conflict review
      localStorage.setItem('gtar_stage_font_size', '88');
    });

    await page.getByRole('button', { name: /Apply Resolution & Continue/i }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Settings changed in another tab'));
    assert.equal(await page.evaluate(() => localStorage.getItem('gtar_stage_font_size')), '88', 'Newer cross-tab edit 88 protected from stale conflict overwrite');
    t.diagnostic('A12 real modal preview/cancel settings unchanged; failed restore publishes no UI; successful restore publishes committed library')
    await context.close()
  } finally { if (browser) await browser.close(); await server.close() }
})
