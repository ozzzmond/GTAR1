import { validateBackupSettings } from './backupSettings'

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const MAX_RECORDS = 50_000
const object = (v: any) => v && typeof v === 'object' && !Array.isArray(v)
function requireValid(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message)
}
function identity(value: any): string {
  requireValid((typeof value === 'string' && !!value.trim() && value === value.trim()) || Number.isSafeInteger(value), 'Invalid record ID')
  return String(value)
}
function fields(record: any) {
  requireValid(object(record), 'Record must be an object')
  for (const key of ['createdAt', 'updatedAt', 'transposeOffset', 'position']) {
    if (record[key] !== undefined) requireValid(Number.isSafeInteger(record[key]), `Invalid ${key}`)
  }
  for (const key of ['artist', 'key', 'originalKey', 'confirmedChartKey', 'entryId']) {
    if (record[key] !== undefined) requireValid(typeof record[key] === 'string', `Invalid ${key}`)
  }
  if (record.isFavorite !== undefined) requireValid(typeof record.isFavorite === 'boolean', 'Invalid favorite flag')
  if (record.tags !== undefined) requireValid(typeof record.tags === 'string' || (Array.isArray(record.tags) && record.tags.every((t: any) => typeof t === 'string')), 'Invalid tags')
  for (const key of ['capo', 'bpm', 'tempo', 'time', 'year']) {
    if (record[key] !== undefined) requireValid(typeof record[key] === 'string' || (typeof record[key] === 'number' && Number.isFinite(record[key])), `Invalid ${key}`)
  }
}

/** Validate source graph before normalization. Numeric legacy IDs share one string namespace. */
export function validateBackupInput(input: any): { songs: any[]; setlists: any[]; folders: any[] } {
  requireValid(object(input) || Array.isArray(input), 'Backup payload must be a JSON object')
  const array = Array.isArray(input)
  if (!array) {
    requireValid(Array.isArray(input.songs), 'Missing required songs array')
    if ('app' in input) requireValid(['GTAR1', 'GTAR_REVAMP', 'GTAR'].includes(input.app), 'Unsupported backup app/scope')
    if ('schemaVersion' in input) requireValid([1, 2].includes(input.schemaVersion) && (!(input.app === 'GTAR1' || input.app === 'GTAR_REVAMP') || input.schemaVersion === 1), 'Unsupported backup schema version')
    if ('type' in input) requireValid(input.type === 'FULL_BACKUP', 'Unsupported backup scope')
    if ('exportedAt' in input) requireValid(typeof input.exportedAt === 'string' && Number.isFinite(Date.parse(input.exportedAt)), 'Invalid export timestamp')
    if (input.app === 'GTAR1' || input.app === 'GTAR_REVAMP') requireValid(input.schemaVersion === 1 && Array.isArray(input.setlists) && typeof input.version === 'string' && !!input.version && typeof input.exportedAt === 'string', 'Incomplete native backup')
    for (const key of ['setlists', 'folders']) if (key in input) requireValid(Array.isArray(input[key]), `Invalid ${key}`)
    const settings: Record<string, unknown> = {}
    for (const key of ['themeMode', 'customThemeColors', 'factoryThemeOverrides', 'stageSettings']) if (key in input) settings[key] = input[key]
    const errors = validateBackupSettings(settings)
    requireValid(!errors.length, errors.join('; '))
    // Unknown root sections cannot be silently discarded by a library restore.
    const allowed = ['app', 'schemaVersion', 'version', 'exportedAt', 'metadata', 'type', 'songs', 'setlists', 'folders', ...Object.keys(settings)]
    requireValid(Object.keys(input).every(k => allowed.includes(k)), 'Unsupported backup section; restore would lose data')
  }
  const songs = structuredClone(array ? input : input.songs)
  const setlists = structuredClone(input.setlists ?? [])
  const folders = structuredClone(input.folders ?? [])
  requireValid(songs.length + setlists.length + folders.length <= MAX_RECORDS, 'Too many backup records')
  // Older loose-song exports had no identities. Derive a deterministic identity
  // from the complete source record; never merge by song name or allocate on preview.
  if (array || (!input.app && !setlists.length)) for (const song of songs) {
    if (object(song) && !('id' in song)) {
      const text = JSON.stringify(song)
      let a = 0x811c9dc5, b = 0x9e3779b9
      for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 0x01000193); b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b) }
      song.id = `legacy-song:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`
    }
  }
  const allIDs = new Set<string>()
  function records(list: any[], name: string) {
    const ids = new Set<string>()
    for (const r of list) {
      fields(r)
      r.id = identity(r.id)
      requireValid(!allIDs.has(r.id), 'Duplicate or cross-type record ID')
      allIDs.add(r.id); ids.add(r.id)
      requireValid(typeof r[name] === 'string' && !!r[name].trim(), `Missing ${name}`)
    }
    return ids
  }
  const songIDs = records(songs, 'title')
  for (const song of songs) {
    requireValid(typeof (song.rawContent ?? song.content) === 'string', 'Missing chart body (blank strings are supported)')
    if ('rawContent' in song && 'content' in song) requireValid(song.rawContent === song.content, 'Ambiguous chart bodies')
    if ('format' in song) requireValid(['CHORD_PRO', 'TWO_LINE', 'PLAIN'].includes(song.format), 'Unsupported chart format')
  }
  records(setlists, 'name')
  const folderIDs = records(folders, 'name')
  let occurrences = 0
  for (const sl of setlists) {
    requireValid(Array.isArray(sl.songs), 'Missing setlist songs')
    occurrences += sl.songs.length
    requireValid(occurrences <= MAX_RECORDS, 'Too many setlist occurrences')
    if (sl.folderId != null) { sl.folderId = identity(sl.folderId); requireValid(folderIDs.has(sl.folderId), 'Missing setlist folder') }
    const entries = new Set<string>()
    sl.songs.forEach((ref: any, i: number) => {
      fields(ref); ref.id = identity(ref.id)
      requireValid(songIDs.has(ref.id), 'Missing referenced song')
      requireValid(typeof ref.title === 'string' && !!ref.title.trim(), 'Missing reference title')
      if ('position' in ref) requireValid(ref.position === i, 'Setlist order/position mismatch')
      // Deterministic legacy occurrence identity makes repeated imports idempotent.
      ref.entryId ??= `legacy-entry:${sl.id}:${i}`
      requireValid(!!ref.entryId.trim() && !entries.has(ref.entryId), 'Duplicate or invalid setlist entry ID')
      entries.add(ref.entryId)
    })
  }
  const parents = new Map<string, string | null>()
  for (const f of folders) {
    f.parentId = f.parentId == null ? null : identity(f.parentId)
    requireValid(f.parentId === null || folderIDs.has(f.parentId), 'Missing parent folder')
    parents.set(f.id, f.parentId)
  }
  const completed = new Set<string>()
  for (const f of folders) {
    const seen = new Set<string>(); let id: string | null = f.id
    while (id !== null && !completed.has(id)) { requireValid(!seen.has(id), 'Folder cycle'); seen.add(id); id = parents.get(id) ?? null }
    for (const visited of seen) completed.add(visited)
  }
  if (!array && input.metadata != null) {
    requireValid(object(input.metadata), 'Invalid metadata')
    for (const [key, count] of [['songCount', songs.length], ['setlistCount', setlists.length], ['folderCount', folders.length]] as const) {
      if (key in input.metadata) requireValid(input.metadata[key] === count, `Metadata ${key} mismatch`)
    }
    if ('schemaVersion' in input.metadata) requireValid([1, 2].includes(input.metadata.schemaVersion), 'Unsupported metadata schema version')
  }
  return { songs, setlists, folders }
}
