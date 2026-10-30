// Issue #13 recovery scenarios. Self-contained so the same function runs in real
// Chromium IndexedDB (restoreRecovery.browser.test.cjs). Synthetic records only.
module.exports = async function runRestoreRecoveryScenarios({ storage, restore, settings }) {
  const checks = []
  const ok = (cond, message) => { if (!cond) throw new Error(message) }
  const song = (id, title = id, extra = {}) => ({ id, title, rawContent: `Synthetic ${title}`, format: 'PLAIN', tags: [], createdAt: 1, updatedAt: 1, ...extra })
  const read = () => restore.readLibraryImage()
  const digest = async () => restore.libraryDigest(await read())
  const db = await storage.openRevampDB()
  const journal = key => new Promise((resolve, reject) => {
    const req = db.transaction(storage.STORES.RESTORE, 'readonly').objectStore(storage.STORES.RESTORE).get(key)
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error)
  })
  const snapshot = () => journal(restore.SNAPSHOT_KEY)
  const marker = () => journal(restore.MARKER_KEY)

  // Baseline library A
  await storage.saveSong(song('a1', 'Alpha one'))
  await storage.saveSong(song('a2', 'Alpha two'))
  await storage.saveFolder({ id: 'fa', name: 'Folder A', parentId: null, createdAt: 1, updatedAt: 1 })
  localStorage.setItem('gtar_theme_store', 'oled-black')
  const libraryA = await read(), digestA = restore.libraryDigest(libraryA), settingsA = settings.captureSettings()
  const backupB = { songs: [song('b1', 'Beta one'), song('b2', 'Beta two')], setlists: [{ id: 'lb', name: 'Beta set', folderId: null, songs: [{ id: 'b1', title: 'Beta one', entryId: 'e1', position: 0 }] }], folders: [] }

  // R1 snapshot + marker written atomically with a verified commit
  const r1 = await restore.restoreLibraryWithStatus(backupB, 'REPLACE', libraryA, { themeMode: 'paper-light' })
  ok(r1.status === 'COMMITTED_VERIFIED', `R1 status ${r1.status}`)
  const snap1 = await snapshot(), mark1 = await marker()
  ok(snap1 && snap1.planId === r1.planId && snap1.beforeDigest === digestA && restore.libraryDigest(snap1.beforeImage) === digestA, 'R1 snapshot must hold verified before-state')
  ok(JSON.stringify(snap1.settingsBefore) === JSON.stringify(settingsA), 'R1 snapshot settings')
  ok(mark1 && mark1.planId === r1.planId && mark1.verified === true && mark1.afterDigest === await digest(), 'R1 marker verified')
  ok(await journal('pending-restore') === null, 'R1 journal cleared')
  checks.push('R1 verified snapshot+marker; COMMITTED_VERIFIED')

  const libraryB = await read(), digestB = restore.libraryDigest(libraryB), settingsB = JSON.stringify(settings.captureSettings())
  const backupC = { songs: [song('c1', 'Gamma one')], setlists: [], folders: [] }
  async function unchanged(name, action, pattern) {
    let error
    try { await action() } catch (err) { error = err }
    ok(error && pattern.test(error.message), `${name}: expected rejection, got ${error && error.message}`)
    ok(await digest() === digestB, `${name}: library mutated`)
    ok(JSON.stringify(settings.captureSettings()) === settingsB, `${name}: settings mutated`)
    ok((await snapshot()).planId === r1.planId, `${name}: previous snapshot lost`)
    ok((await marker()).planId === r1.planId, `${name}: marker replaced`)
    ok(await journal('pending-restore') === null, `${name}: journal left behind`)
    checks.push(name)
  }
  const put = IDBObjectStore.prototype.put, get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll
  try {
    IDBObjectStore.prototype.put = function (value) {
      if (this.name === 'restoreJournal' && value && value.id === restore.SNAPSHOT_KEY) throw new DOMException('Injected snapshot quota', 'QuotaExceededError')
      return put.call(this, value)
    }
    await unchanged('R2 snapshot quota fails closed', () => restore.restoreLibraryWithStatus(backupC, 'REPLACE', libraryB, { themeMode: 'amber-stage' }), /quota/i)
  } finally { IDBObjectStore.prototype.put = put }
  try {
    IDBObjectStore.prototype.get = function (key) {
      const req = get.call(this, key)
      if (this.name === 'restoreJournal' && key === restore.SNAPSHOT_KEY && this.transaction.mode === 'readwrite') Object.defineProperty(req, 'result', { get: () => undefined, set() {}, configurable: true })
      return req
    }
    await unchanged('R2 snapshot validation failure fails closed', () => restore.restoreLibraryWithStatus(backupC, 'REPLACE', libraryB), /snapshot verification/i)
  } finally { IDBObjectStore.prototype.get = get }
  for (const kind of ['second-store', 'abort']) {
    IDBObjectStore.prototype.put = function (value) {
      if (this.name === 'setlists') {
        if (kind === 'abort') { this.transaction.abort(); return put.call(this, value) }
        throw new Error('Injected second-store failure')
      }
      return put.call(this, value)
    }
    const withSetlist = { ...backupC, songs: [...backupC.songs], setlists: [{ id: 'lc', name: 'Gamma set', folderId: null, songs: [{ id: 'c1', title: 'Gamma one', entryId: 'ec', position: 0 }] }] }
    try { await unchanged(`R3 ${kind} rolls back snapshot and library`, () => restore.restoreLibraryWithStatus(withSetlist, 'REPLACE', libraryB), /second-store|abort|transaction/i) }
    finally { IDBObjectStore.prototype.put = put }
  }
  await unchanged('R4 stale preview rejected', () => restore.restoreLibraryWithStatus(backupC, 'REPLACE', libraryA), /changed since preview/)

  // R5 concurrent edit between preview and commit (another tab writes through IndexedDB)
  const preview = await read()
  await storage.saveSong(song('b2', 'Beta two edited elsewhere'))
  const edited = await digest()
  let staleError
  try { await restore.restoreLibraryWithStatus(backupC, 'REPLACE', preview) } catch (err) { staleError = err }
  ok(staleError && /changed since preview/.test(staleError.message) && await digest() === edited, 'R5 concurrent edit must reject and keep the newer edit')
  ok((await snapshot()).planId === r1.planId, 'R5 snapshot kept')
  checks.push('R5 concurrent edit invalidates preview; newer edit kept')

  // R6 post-commit readback mismatch -> COMMITTED_UNVERIFIED, no false success, recovery offered
  const beforeR6 = await read(), beforeR6Digest = restore.libraryDigest(beforeR6)
  let reads = 0
  IDBObjectStore.prototype.getAll = function (...args) {
    const req = getAll.apply(this, args)
    if (this.name === 'songs' && ++reads === 4) Object.defineProperty(req, 'result', { get: () => [], set() {}, configurable: true })
    return req
  }
  let r6Error
  try { await restore.restoreLibrary(backupC, 'REPLACE', beforeR6) } catch (err) { r6Error = err } finally { IDBObjectStore.prototype.getAll = getAll }
  const r6 = r6Error && r6Error.result
  ok(r6 && r6.status === 'COMMITTED_UNVERIFIED' && /does not match/.test(r6.reason), `R6 expected unverified, got ${r6Error && r6Error.message}`)
  ok((await marker()).verified === false && (await snapshot()).beforeDigest === beforeR6Digest, 'R6 marker unverified, snapshot kept')
  let thrown
  try { await restore.restoreLibrary(backupB, 'REPLACE', await read()) } catch (err) { thrown = err }
  ok(thrown && /could not be verified/.test(thrown.message), 'R6 new restore blocked while previous restore unverified')
  checks.push('R6 readback mismatch -> COMMITTED_UNVERIFIED; restores blocked')

  // R7 crash/reload after commit, before verification: reopen re-verifies intact data
  storage.closeRevampDB()
  const startup = await restore.verifyPendingRestore()
  ok(startup.needsRecovery === false, 'R7 intact data verifies on reopen')
  const reopened = await storage.openRevampDB()
  const verifiedMarker = await new Promise(r => { const q = reopened.transaction('restoreJournal').objectStore('restoreJournal').get(restore.MARKER_KEY); q.onsuccess = () => r(q.result) })
  ok(verifiedMarker.verified === true, 'R7 marker verified after reopen')
  checks.push('R7 crash after commit -> startup verification')

  // R8 clean recovery returns the exact pre-restore library and settings
  const db2 = await storage.openRevampDB()
  const snapshotOf = key => new Promise(r => { const q = db2.transaction('restoreJournal').objectStore('restoreJournal').get(key); q.onsuccess = () => r(q.result) })
  const preRecoveryDigest = await digest()
  const cleanPlan = await restore.loadRecoveryPlan()
  ok(cleanPlan && cleanPlan.conflicts.length === 0, 'R8 clean plan has no conflicts')
  const cleanTarget = (await snapshotOf(restore.SNAPSHOT_KEY)).beforeDigest
  const rc = await restore.recoverLastRestore(cleanPlan)
  ok(rc.status === 'COMMITTED_VERIFIED' && await digest() === cleanTarget, 'R8 clean recovery restores exact snapshot')
  ok((await snapshotOf(restore.SNAPSHOT_KEY)).beforeDigest === preRecoveryDigest, 'R8 recovery is itself undoable')
  checks.push('R8 clean recovery exact + undoable')

  // R9 recovery with newer edits: default keep-current, explicit choice honoured, stale plan rejected
  const base9 = await read()
  const r9 = await restore.restoreLibraryWithStatus({ songs: [song('d1', 'Delta one'), song('d2', 'Delta two')], setlists: [], folders: [] }, 'MERGE', base9, { themeMode: 'paper-light' })
  ok(r9.status === 'COMMITTED_VERIFIED', 'R9 restore verified')
  await storage.saveSong(song('d1', 'Delta one edited after restore'))
  await storage.saveSong(song('n1', 'New after restore'))
  localStorage.setItem('gtar_theme_store', 'crimson-stage')
  const plan9 = await restore.loadRecoveryPlan()
  const keys = plan9.conflicts.map(c => c.key).sort()
  ok(JSON.stringify(keys) === JSON.stringify(['settings:gtar_theme_store', 'songs:d1', 'songs:n1']), `R9 conflicts ${keys}`)
  await storage.saveSong(song('n2', 'Edited during review'))
  let stalePlan
  try { await restore.recoverLastRestore(plan9) } catch (err) { stalePlan = err }
  ok(stalePlan && /changed since preview/.test(stalePlan.message) && (await read()).songs.some(s => s.id === 'n2'), 'R9 stale recovery plan rejected; newest edit kept')
  const plan9b = await restore.loadRecoveryPlan()
  const out = await restore.recoverLastRestore(plan9b, { 'songs:n1': 'USE_PRE_RESTORE' })
  const after9 = await read(), ids = after9.songs.map(s => s.id).sort()
  ok(out.status === 'COMMITTED_VERIFIED', 'R9 recovery verified')
  ok(after9.songs.find(s => s.id === 'd1')?.title === 'Delta one edited after restore', 'R9 edited record kept by default')
  ok(!ids.includes('d2') && !ids.includes('n1') && ids.includes('n2'), `R9 untouched restore record reverted, explicit choice applied: ${ids}`)
  ok(localStorage.getItem('gtar_theme_store') === 'crimson-stage', 'R9 newer setting kept by default')
  checks.push('R9 conflicts default keep-current; explicit choice; stale plan rejected')

  // R10 references stay valid when a kept setlist points at a reverted song
  const base10 = await read()
  await restore.restoreLibraryWithStatus({ songs: [song('e1', 'Echo one')], setlists: [], folders: [] }, 'MERGE', base10)
  const setlistAfter = { id: 'le', name: 'Echo set', folderId: null, songs: [{ id: 'e1', title: 'Echo one', entryId: 'ee', position: 0 }], createdAt: 1, updatedAt: 1 }
  await storage.saveSetlist(setlistAfter)
  const plan10 = await restore.loadRecoveryPlan()
  const r10 = await restore.recoverLastRestore(plan10)
  const after10 = await read()
  ok(r10.status === 'COMMITTED_VERIFIED' && after10.setlists.some(s => s.id === 'le') && after10.songs.some(s => s.id === 'e1'), 'R10 kept setlist keeps its referenced song')
  checks.push('R10 recovery keeps reference graph valid')

  // R11 preview/cancel performs no writes
  const before11 = await digest(), snap11 = (await snapshotOf(restore.SNAPSHOT_KEY)).planId
  await restore.readLibraryImage(); restore.planLibraryRestore(await read(), backupB, 'REPLACE')
  ok(await digest() === before11 && (await snapshotOf(restore.SNAPSHOT_KEY)).planId === snap11, 'R11 preview writes nothing')
  checks.push('R11 preview/cancel side-effect free')
  return checks
}
