import type { SongEntity, WebSetlist, SetlistFolder } from '../types/gtar'
import { openRevampDB, closeRevampDB, STORES } from './storage'
import { validateBackupInput, MAX_BACKUP_BYTES } from './backupValidation'
import { captureSettings, planSettings, writeSettings, RESTORE_LOCK, RESTORE_JOURNAL_KEY, type SettingsImage } from './restoreSettings'
import { SETTINGS_CHANGED, type BackupSettings } from './backupSettings'
import { normalizeTags } from './tags'
import { generateUUID } from './uuid'

export interface LibraryImage { songs: SongEntity[]; setlists: WebSetlist[]; folders: SetlistFolder[] }
export type RestoreMode = 'MERGE' | 'REPLACE'
export type RestoreKind = RestoreMode | 'RECOVERY'
const stores = [STORES.SONGS, STORES.SETLISTS, STORES.FOLDERS] as const
const collections = ['songs', 'setlists', 'folders'] as const
export type LibraryCollection = typeof collections[number]
type RecordHashes = Record<LibraryCollection, Record<string, string>>

/** Single-slot, bounded recovery records kept in the existing restoreJournal store (no schema bump). */
export const SNAPSHOT_KEY = 'pre-restore-snapshot'
export const MARKER_KEY = 'restore-marker'

export interface RestoreSnapshot {
  id: typeof SNAPSHOT_KEY
  planId: string
  createdAt: number
  beforeDigest: string
  beforeImage: LibraryImage
  settingsBefore: SettingsImage
}
export interface RestoreMarker {
  id: typeof MARKER_KEY
  planId: string
  kind: RestoreKind
  committedAt: number
  beforeDigest: string
  afterDigest: string
  afterHashes: RecordHashes
  settingsAfter: SettingsImage
  verified: boolean
  acknowledged?: boolean
}
export type RestoreStatus = 'COMMITTED_VERIFIED' | 'COMMITTED_UNVERIFIED'
export interface RestoreResult { status: RestoreStatus; planId: string; image: LibraryImage; reason?: string }

/** Thrown by restoreLibrary() when data committed but independent readback did not verify it. */
export class RestoreUnverifiedError extends Error {
  constructor(public result: RestoreResult) { super(`Restore saved but not verified: ${result.reason || 'readback failed'}. Recovery is available.`) }
}

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, stable(value[k])]))
  return value
}
export const recordDigest = (value: unknown) => JSON.stringify(stable(value))
export function libraryDigest(image: LibraryImage): string {
  return recordDigest({
    songs: image.songs.map(s => ({ ...s, tags: normalizeTags(s.tags) })).sort((a, b) => a.id.localeCompare(b.id)),
    setlists: image.setlists.map(sl => ({ ...sl, folderId: sl.folderId ?? null })).sort((a, b) => a.id.localeCompare(b.id)),
    folders: [...image.folders].sort((a, b) => a.id.localeCompare(b.id)),
  })
}
/** Compact 64-bit fingerprint of one stored record; used only to detect edits made after a restore. */
export function recordHash(value: unknown): string {
  const text = recordDigest(value)
  let a = 0x811c9dc5, b = 0x9e3779b9
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 0x01000193); b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b) }
  return `${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}:${text.length}`
}
function hashImage(image: LibraryImage): RecordHashes {
  const out = {} as RecordHashes
  for (const key of collections) out[key] = Object.fromEntries((image[key] as Array<{ id: string }>).map(r => [r.id, recordHash(r)]))
  return out
}
function readImage(tx: IDBTransaction, ready: (image: LibraryImage) => void) {
  const image: LibraryImage = { songs: [], setlists: [], folders: [] }
  let remaining = stores.length
  stores.forEach((name, i) => {
    const request = tx.objectStore(name).getAll()
    request.onsuccess = () => {
      Object.assign(image, { [collections[i]]: request.result })
      if (!--remaining) ready(image)
    }
  })
}
function runTx(db: IDBDatabase, scope: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction, abort: (error: unknown) => void) => void, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = mode === 'readwrite' ? db.transaction(scope, mode, { durability: 'strict' }) : db.transaction(scope, mode)
    let failure: unknown
    const abort = (error: unknown) => { failure = error; try { tx.abort() } catch { /* already finished */ } }
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error(label))
    try { body(tx, abort) } catch (err) { abort(err) }
  })
}
const requireLocks = () => { if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Safe restore requires browser Web Locks support') }

/** Authoritative library image for previews, read from IndexedDB rather than UI state. */
export async function readLibraryImage(): Promise<LibraryImage> {
  const db = await openRevampDB()
  let image: LibraryImage | undefined
  await runTx(db, [...stores], 'readonly', tx => readImage(tx, result => { image = result }), 'Could not read library')
  return image!
}

export function planLibraryRestore(current: LibraryImage, incoming: LibraryImage, mode: RestoreMode): LibraryImage {
  if (mode !== 'MERGE' && mode !== 'REPLACE') throw new Error('Choose Merge or Replace explicitly')
  validateBackupInput(incoming)
  if (mode === 'REPLACE') return structuredClone(incoming)
  const result = structuredClone(current)
  for (const key of collections) {
    const target = result[key] as Array<{ id: string }>
    const byID = new Map(target.map(r => [r.id, r]))
    for (const item of incoming[key]) {
      const existing = byID.get(item.id)
      if (existing && recordDigest(existing) !== recordDigest(item)) throw new Error(`Merge conflict: ${key} ID ${item.id}. Local data kept. Use Replace only if you intend to discard the local library.`)
      if (!existing) target.push(structuredClone(item))
    }
  }
  validateBackupInput(result)
  if (recordDigest(result).length > MAX_BACKUP_BYTES) throw new Error('Merged library exceeds restore size limit')
  return result
}

interface RestoreJob {
  incoming: LibraryImage
  mode: RestoreMode
  kind: RestoreKind
  expected: LibraryImage
  settingsAfter: (before: SettingsImage) => SettingsImage
  expectedSettings?: SettingsImage
}

/** Library restore that only resolves after commit; throws when nothing was applied. */
export async function restoreLibraryWithStatus(incoming: LibraryImage, mode: RestoreMode, expected: LibraryImage, settings?: BackupSettings): Promise<RestoreResult> {
  incoming = structuredClone(incoming)
  validateBackupInput(incoming)
  if (recordDigest(incoming).length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds restore size limit')
  return runRestore({ incoming, mode, kind: mode, expected, settingsAfter: before => planSettings(before, settings) })
}

/** Compatibility wrapper: resolves only for COMMITTED_VERIFIED. */
export async function restoreLibrary(incoming: LibraryImage, mode: RestoreMode, expected: LibraryImage, settings?: BackupSettings): Promise<LibraryImage> {
  const result = await restoreLibraryWithStatus(incoming, mode, expected, settings)
  if (result.status !== 'COMMITTED_VERIFIED') throw new RestoreUnverifiedError(result)
  return result.image
}

async function assertStorageHeadroom(bytes: number) {
  let estimate: StorageEstimate | undefined
  try { estimate = await navigator.storage?.estimate?.() } catch { return }
  if (!estimate?.quota || estimate.usage == null) return
  // Snapshot + new library + journal must fit; IndexedDB's own quota error remains authoritative.
  if (estimate.quota - estimate.usage < bytes * 2) throw new DOMException('Not enough free storage for a safe restore with a recovery snapshot. Nothing was changed.', 'QuotaExceededError')
}

async function runRestore(job: RestoreJob): Promise<RestoreResult> {
  const db = await openRevampDB()
  requireLocks()
  await assertStorageHeadroom(recordDigest(job.expected).length + recordDigest(job.incoming).length)
  return navigator.locks.request(RESTORE_LOCK, () => commitRestore(db, job))
}

/** Journal settings before touching localStorage; delete journal WITH library commit.
 * Snapshot, library writes, readback, marker and journal deletion share one readwrite
 * transaction: any failure aborts and preserves the original library and previous snapshot.
 * A separate transaction then independently re-reads the committed data before success.
 */
async function commitRestore(db: IDBDatabase, job: RestoreJob): Promise<RestoreResult> {
  const { incoming, mode, kind } = job
  const expectedDigest = libraryDigest(job.expected)
  const settingsBefore = captureSettings()
  if (job.expectedSettings && recordDigest(settingsBefore) !== recordDigest(job.expectedSettings)) throw new Error('Settings changed since recovery review. Reopen recovery.')
  const settingsAfter = job.settingsAfter(settingsBefore)
  const planId = generateUUID()
  // Persist a bounded recovery record before any nontransactional settings change.
  await runTx(db, [...stores, STORES.RESTORE], 'readwrite', (tx, abort) => {
    const journal = tx.objectStore(STORES.RESTORE)
    const request = journal.get(RESTORE_JOURNAL_KEY)
    const markerRequest = journal.get(MARKER_KEY)
    request.onsuccess = () => {
      try {
        if (request.result) throw new Error('Another restore requires recovery; reload before restoring')
        readImage(tx, before => {
          try {
            const marker = markerRequest.result as RestoreMarker | undefined
            if (kind !== 'RECOVERY' && marker && !marker.verified && !marker.acknowledged) throw new Error('The previous restore could not be verified. Open Library Recovery before restoring again.')
            if (libraryDigest(before) !== expectedDigest) throw new Error('Library changed since preview. Reopen backup preview.')
            planLibraryRestore(before, incoming, mode)
            journal.add({ id: RESTORE_JOURNAL_KEY, settingsBefore, settingsAfter })
          } catch (err) { abort(err) }
        })
      } catch (err) { abort(err) }
    }
  }, 'Could not create restore journal')
  let output: LibraryImage | undefined
  let afterDigest = ''
  let changedSettings = false
  try {
    await runTx(db, [...stores, STORES.RESTORE], 'readwrite', (tx, abort) => {
      let snapshotVerified = false
      readImage(tx, before => {
        try {
          if (libraryDigest(before) !== expectedDigest) throw new Error('Library changed since preview. Reopen backup preview.')
          output = planLibraryRestore(before, incoming, mode)
          if (recordDigest(before).length > MAX_BACKUP_BYTES) throw new Error('Local library is too large for a recovery snapshot. Export a backup first; nothing was changed.')
          const beforeDigest = libraryDigest(before)
          const journal = tx.objectStore(STORES.RESTORE)
          const snapshot: RestoreSnapshot = { id: SNAPSHOT_KEY, planId, createdAt: Date.now(), beforeDigest, beforeImage: before, settingsBefore }
          journal.put(snapshot)
          const check = journal.get(SNAPSHOT_KEY)
          check.onsuccess = () => {
            try {
              const saved = check.result as RestoreSnapshot | undefined
              if (!saved || saved.planId !== planId || libraryDigest(saved.beforeImage) !== beforeDigest || recordDigest(saved.settingsBefore) !== recordDigest(settingsBefore)) throw new Error('Recovery snapshot verification failed; nothing was changed')
              snapshotVerified = true
            } catch (err) { abort(err) }
          }
          stores.forEach((name, i) => {
            const store = tx.objectStore(name)
            if (mode === 'REPLACE') store.clear()
            for (const record of output![collections[i]]) store.put(record)
          })
          readImage(tx, verified => {
            try {
              if (!snapshotVerified) throw new Error('Recovery snapshot verification failed; nothing was changed')
              if (libraryDigest(verified) !== libraryDigest(output!)) throw new Error('Restore readback mismatch')
              if (recordDigest(captureSettings()) !== recordDigest(settingsBefore)) throw new Error('Settings changed since preview; retry restore')
              changedSettings = true
              writeSettings(settingsAfter)
              afterDigest = libraryDigest(verified)
              const marker: RestoreMarker = { id: MARKER_KEY, planId, kind, committedAt: Date.now(), beforeDigest, afterDigest, afterHashes: hashImage(verified), settingsAfter, verified: false }
              journal.put(marker)
              journal.delete(RESTORE_JOURNAL_KEY)
              output = verified
            } catch (err) { abort(err) }
          })
        } catch (err) { abort(err) }
      })
    }, 'Restore transaction aborted; local data kept')
  } catch (error) {
    // Recovery failure leaves the durable journal intact and blocks further access
    // until startup recovery succeeds; no success or UI state is published.
    try {
      if (changedSettings) writeSettings(settingsBefore)
      await runTx(db, [STORES.RESTORE], 'readwrite', tx => { tx.objectStore(STORES.RESTORE).delete(RESTORE_JOURNAL_KEY) }, 'Could not clear restore journal')
    } catch { closeRevampDB(); throw new Error('Restore aborted. Settings recovery is pending; reload before editing.') }
    throw error
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SETTINGS_CHANGED))
  // Committed. Independently re-read in a new transaction; never claim success without it.
  const check = await verifyCommitted(db, planId)
  if (check.verified) return { status: 'COMMITTED_VERIFIED', planId, image: check.image! }
  return { status: 'COMMITTED_UNVERIFIED', planId, image: check.image || output!, reason: check.reason }
}

async function verifyCommitted(db: IDBDatabase, planId: string): Promise<{ verified: boolean; image?: LibraryImage; reason?: string }> {
  let image: LibraryImage | undefined
  let verified = false
  let reason = 'Committed data could not be read back'
  try {
    await runTx(db, [...stores, STORES.RESTORE], 'readwrite', tx => {
      const journal = tx.objectStore(STORES.RESTORE)
      const markerRequest = journal.get(MARKER_KEY)
      readImage(tx, current => {
        image = current
        const marker = markerRequest.result as RestoreMarker | undefined
        if (!marker || marker.planId !== planId) { reason = 'Restore marker missing'; return }
        if (libraryDigest(current) !== marker.afterDigest) { reason = 'Committed library does not match the restored library'; return }
        journal.put({ ...marker, verified: true })
        verified = true
      })
    }, 'Restore verification failed')
  } catch (err) { verified = false; reason = (err as Error)?.message || reason }
  return { verified, image, reason: verified ? undefined : reason }
}

export interface LastRestoreInfo { planId: string; kind: RestoreKind; committedAt: number; verified: boolean; acknowledged: boolean; snapshotAt: number }
async function readRecoveryRecords(db: IDBDatabase): Promise<{ snapshot?: RestoreSnapshot; marker?: RestoreMarker; current?: LibraryImage }> {
  const out: { snapshot?: RestoreSnapshot; marker?: RestoreMarker; current?: LibraryImage } = {}
  await runTx(db, [...stores, STORES.RESTORE], 'readonly', tx => {
    const journal = tx.objectStore(STORES.RESTORE)
    const s = journal.get(SNAPSHOT_KEY), m = journal.get(MARKER_KEY)
    s.onsuccess = () => { out.snapshot = s.result }
    m.onsuccess = () => { out.marker = m.result }
    readImage(tx, image => { out.current = image })
  }, 'Could not read recovery snapshot')
  return out
}
export async function getLastRestoreInfo(): Promise<LastRestoreInfo | null> {
  const db = await openRevampDB()
  const { snapshot, marker } = await readRecoveryRecords(db)
  if (!snapshot || !marker || snapshot.planId !== marker.planId) return null
  return { planId: marker.planId, kind: marker.kind, committedAt: marker.committedAt, verified: marker.verified, acknowledged: !!marker.acknowledged, snapshotAt: snapshot.createdAt }
}

/** Startup check: re-verify a commit whose post-commit verification never completed. */
export async function verifyPendingRestore(): Promise<{ needsRecovery: boolean; reason?: string }> {
  const db = await openRevampDB()
  const { marker } = await readRecoveryRecords(db)
  if (!marker || marker.verified || marker.acknowledged) return { needsRecovery: false }
  requireLocks()
  const check = await navigator.locks.request(RESTORE_LOCK, () => verifyCommitted(db, marker.planId))
  return check.verified ? { needsRecovery: false } : { needsRecovery: true, reason: check.reason }
}

export async function acknowledgeUnverifiedRestore(planId: string): Promise<void> {
  const db = await openRevampDB()
  requireLocks()
  await navigator.locks.request(RESTORE_LOCK, () => runTx(db, [STORES.RESTORE], 'readwrite', (tx, abort) => {
    const journal = tx.objectStore(STORES.RESTORE)
    const m = journal.get(MARKER_KEY)
    m.onsuccess = () => {
      if (!m.result || m.result.planId !== planId) return abort(new Error('Recovery state changed; reopen recovery'))
      journal.put({ ...m.result, acknowledged: true })
    }
  }, 'Could not record recovery decision'))
}

export type RecoveryChoice = 'KEEP_CURRENT' | 'USE_PRE_RESTORE'
export interface RecoveryConflict { key: string; collection: LibraryCollection | 'settings'; id: string; label: string; change: 'EDITED' | 'ADDED' | 'DELETED' }
export interface RecoveryPlan {
  snapshot: RestoreSnapshot
  marker: RestoreMarker
  current: LibraryImage
  currentSettings: SettingsImage
  conflicts: RecoveryConflict[]
  revertCount: number
}
export interface RecoveryOutcome { image: LibraryImage; settings: SettingsImage; conflicts: RecoveryConflict[]; revertCount: number; keptForReferences: number }

const labelOf = (record: any) => String(record?.title ?? record?.name ?? record?.id ?? '')

/** Pure three-way plan: records untouched since the restore return to the snapshot;
 * records edited afterwards are conflicts that default to KEEP_CURRENT. */
export function planRecoveryImage(snapshot: RestoreSnapshot, marker: RestoreMarker, current: LibraryImage, currentSettings: SettingsImage, choices: Record<string, RecoveryChoice> = {}): RecoveryOutcome {
  if (snapshot.planId !== marker.planId) throw new Error('Recovery snapshot does not match the last restore')
  const image: LibraryImage = { songs: [], setlists: [], folders: [] }
  const conflicts: RecoveryConflict[] = []
  let revertCount = 0
  const pools: Record<LibraryCollection, Map<string, any>> = { songs: new Map(), setlists: new Map(), folders: new Map() }
  for (const c of collections) {
    const before = new Map((snapshot.beforeImage[c] as Array<{ id: string }>).map(r => [r.id, r]))
    const now = new Map((current[c] as Array<{ id: string }>).map(r => [r.id, r]))
    const after = marker.afterHashes[c] || {}
    const out = image[c] as any[]
    for (const id of new Set([...before.keys(), ...Object.keys(after), ...now.keys()])) {
      const b = before.get(id), cur = now.get(id)
      if (cur) pools[c].set(id, cur); else if (b) pools[c].set(id, b)
      const curHash = cur ? recordHash(cur) : undefined
      const beforeHash = b ? recordHash(b) : undefined
      if (curHash === after[id]) {
        if (beforeHash !== curHash) revertCount++
        if (b) out.push(structuredClone(b))
        continue
      }
      if (beforeHash === curHash) { if (cur) out.push(structuredClone(cur)); continue }
      const key = `${c}:${id}`
      conflicts.push({ key, collection: c, id, label: labelOf(cur ?? b), change: !cur ? 'DELETED' : after[id] === undefined ? 'ADDED' : 'EDITED' })
      const pick = choices[key] === 'USE_PRE_RESTORE' ? b : cur
      if (pick) out.push(structuredClone(pick))
    }
  }
  // Keep the graph valid: a kept record never loses the songs/folders it references.
  let keptForReferences = 0
  const present: Record<LibraryCollection, Set<string>> = { songs: new Set(image.songs.map(r => r.id)), setlists: new Set(image.setlists.map(r => r.id)), folders: new Set(image.folders.map(r => r.id)) }
  for (let changed = true; changed;) {
    changed = false
    const need = (c: LibraryCollection, id: string | null | undefined) => {
      if (id == null || present[c].has(id) || !pools[c].has(id)) return
      ;(image[c] as any[]).push(structuredClone(pools[c].get(id))); present[c].add(id); keptForReferences++; changed = true
    }
    for (const sl of image.setlists) { need('folders', sl.folderId); for (const ref of sl.songs || []) need('songs', ref.id) }
    for (const f of image.folders) need('folders', f.parentId)
  }
  const settings: SettingsImage = {}
  for (const key of new Set([...Object.keys(currentSettings), ...Object.keys(snapshot.settingsBefore)])) {
    const cur = currentSettings[key] ?? null, b = snapshot.settingsBefore[key] ?? null, a = marker.settingsAfter[key] ?? null
    if (cur === a || cur === b) { settings[key] = b; if (cur !== b) revertCount++; continue }
    const ckey = `settings:${key}`
    conflicts.push({ key: ckey, collection: 'settings', id: key, label: key.replace(/^gtar_/, '').replace(/_/g, ' '), change: 'EDITED' })
    settings[key] = choices[ckey] === 'USE_PRE_RESTORE' ? b : cur
  }
  return { image, settings, conflicts, revertCount, keptForReferences }
}

export async function loadRecoveryPlan(): Promise<RecoveryPlan | null> {
  const db = await openRevampDB()
  const { snapshot, marker, current } = await readRecoveryRecords(db)
  if (!snapshot || !marker || !current || snapshot.planId !== marker.planId) return null
  const currentSettings = captureSettings()
  const outcome = planRecoveryImage(snapshot, marker, current, currentSettings)
  return { snapshot, marker, current, currentSettings, conflicts: outcome.conflicts, revertCount: outcome.revertCount }
}

/** Undo the last restore through the same atomic executor (which snapshots the pre-recovery state). */
export async function recoverLastRestore(plan: RecoveryPlan, choices: Record<string, RecoveryChoice> = {}): Promise<RestoreResult> {
  const outcome = planRecoveryImage(plan.snapshot, plan.marker, plan.current, plan.currentSettings, choices)
  try { validateBackupInput(outcome.image) } catch (err) { throw new Error(`Recovery choices would leave an invalid library (${(err as Error).message}). Nothing was changed.`) }
  if (recordDigest(outcome.image).length > MAX_BACKUP_BYTES) throw new Error('Recovery exceeds restore size limit. Nothing was changed.')
  return runRestore({ incoming: outcome.image, mode: 'REPLACE', kind: 'RECOVERY', expected: plan.current, settingsAfter: () => outcome.settings, expectedSettings: plan.currentSettings })
}
