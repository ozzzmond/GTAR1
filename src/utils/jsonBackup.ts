import { MAX_BACKUP_BYTES, validateBackupInput } from './backupValidation'
/**
 * GTAR1 — Minimal JSON Export and Import
 * Clean round-trip serialization and schema validation.
 * Compatible with GTAR1, GTAR Revamp, and import-friendly with legacy GTAR export formats.
 */

import type {
  SongEntity,
  WebSetlist,
  SetlistFolder,
  GtarBackupPayload,
} from '../types/gtar'
import { GTAR1_VERSION } from '../types/gtar'
import { canonicalSongKey } from './musicalKey'
import { detectSongKey } from './songParser'
import { generateUUID } from './uuid'
import { normalizeTags } from './tags'
import { readBackupSettings, validateBackupSettings, type BackupSettings } from './backupSettings'

export interface ParsedBackupResult {
  isValid: boolean
  songs: SongEntity[]
  setlists: WebSetlist[]
  folders: SetlistFolder[]
  themeSettings?: BackupSettings
  partial?: boolean
  error?: string
}

export function createBackupPayload(
  songs: SongEntity[],
  setlists: WebSetlist[],
  folders: SetlistFolder[] = []
): GtarBackupPayload {
  const settings = readBackupSettings()
  return {
    app: 'GTAR1',
    schemaVersion: 1,
    version: GTAR1_VERSION,
    exportedAt: new Date().toISOString(),
    ...(settings.stageSettings ? { stageSettings: settings.stageSettings } : {}),
    ...(settings.themeMode ? { themeMode: settings.themeMode } : {}),
    ...(settings.customThemeColors ? { customThemeColors: settings.customThemeColors } : {}),
    ...(settings.factoryThemeOverrides ? { factoryThemeOverrides: settings.factoryThemeOverrides } : {}),
    songs: songs.map((s) => ({
      ...s,
      key: s.key ? canonicalSongKey(s.key) : undefined,
      originalKey: s.originalKey ? canonicalSongKey(s.originalKey) : undefined,
      tags: normalizeTags(s.tags),
    })),
    setlists: setlists.map((sl) => ({
      ...sl,
      folderId: sl.folderId ?? null,
      songs: sl.songs.map((ref, idx) => ({
        ...ref,
        entryId: ref.entryId || generateUUID(),
        position: typeof ref.position === 'number' ? ref.position : idx,
      })),
    })),
    folders: folders.map((f) => ({
      ...f,
      parentId: f.parentId ?? null,
    })),
  }
}

export function normalizeBackupSong(raw: any): SongEntity {
  const content = raw.rawContent ?? raw.content ?? ''
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generateUUID()
  const title = (raw.title || 'Untitled Song').trim()
  const artist = raw.artist ? String(raw.artist).trim() : ''
  const key = raw.key ? canonicalSongKey(raw.key) : detectSongKey(content)
  const originalKey = raw.originalKey ? canonicalSongKey(raw.originalKey) : undefined
  const confirmedChartKey = raw.confirmedChartKey ? canonicalSongKey(raw.confirmedChartKey) : undefined
  const capo = raw.capo ? String(raw.capo).trim() : undefined
  const bpm = raw.bpm ?? raw.tempo ? String(raw.bpm ?? raw.tempo).trim() : undefined
  const time = raw.time ? String(raw.time).trim() : undefined
  const year = raw.year ? String(raw.year).trim() : undefined
  const format = raw.format === 'TWO_LINE' || raw.format === 'PLAIN' ? raw.format : 'CHORD_PRO'
  const isFavorite = Boolean(raw.isFavorite)
  const transposeOffset = typeof raw.transposeOffset === 'number' ? raw.transposeOffset : 0
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : 0
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
  const tags = normalizeTags(raw.tags)

  return {
    ...raw,
    id,
    title,
    artist,
    key,
    originalKey,
    confirmedChartKey,
    capo,
    bpm,
    time,
    year,
    tags,
    rawContent: content,
    format,
    isFavorite,
    transposeOffset,
    createdAt,
    updatedAt,
  }
}

export function normalizeBackupSetlist(raw: any): WebSetlist {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generateUUID()
  const name = (raw.name || 'Untitled Setlist').trim()
  const folderId = typeof raw.folderId === 'string' && raw.folderId.trim() ? raw.folderId.trim() : null
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : 0
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0

  const rawSongs = Array.isArray(raw.songs) ? raw.songs : []
  const songs = rawSongs.map((s: any, idx: number) => ({
    ...s,
    entryId: typeof s.entryId === 'string' && s.entryId.trim() ? s.entryId.trim() : generateUUID(),
    id: typeof s.id === 'string' ? s.id : generateUUID(),
    title: (s.title || 'Untitled Song').trim(),
    artist: s.artist ? String(s.artist).trim() : undefined,
    key: s.key ? canonicalSongKey(s.key) : undefined,
    position: typeof s.position === 'number' ? s.position : idx,
    transposeOffset: typeof s.transposeOffset === 'number' ? s.transposeOffset : undefined,
  }))

  return {
    ...raw,
    id,
    name,
    folderId,
    createdAt,
    updatedAt,
    songs,
  }
}

export function normalizeBackupFolder(raw: any): SetlistFolder {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generateUUID()
  const name = (raw.name || 'Untitled Folder').trim()
  const parentId = typeof raw.parentId === 'string' && raw.parentId.trim() ? raw.parentId.trim() : null
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : 0
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0

  return {
    ...raw,
    id,
    name,
    parentId,
    createdAt,
    updatedAt,
  }
}

export function parseBackupJson(jsonString: string): ParsedBackupResult {
  if (jsonString && (jsonString.length > MAX_BACKUP_BYTES || new TextEncoder().encode(jsonString).length > MAX_BACKUP_BYTES)) return { isValid: false, songs: [], setlists: [], folders: [], error: 'Backup exceeds 20 MiB limit' }
  if (!jsonString || !jsonString.trim()) {
    return {
      isValid: false,
      songs: [],
      setlists: [],
      folders: [],
      error: 'Empty backup input',
    }
  }

  let parsed: any
  try {
    parsed = JSON.parse(jsonString)
  } catch (err) {
    return {
      isValid: false,
      songs: [],
      setlists: [],
      folders: [],
      error: `Invalid JSON syntax: ${(err as Error).message}`,
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      isValid: false,
      songs: [],
      setlists: [],
      folders: [],
      error: 'Backup payload must be a JSON object',
    }
  }

  let rawSongs: any[], rawSetlists: any[], rawFolders: any[]
  try {
    ({ songs: rawSongs, setlists: rawSetlists, folders: rawFolders } = validateBackupInput(parsed))
  } catch (error) {
    return { isValid: false, songs: [], setlists: [], folders: [], error: (error as Error).message }
  }

  const songs = rawSongs.map(normalizeBackupSong)
  const setlists = rawSetlists.map(normalizeBackupSetlist)
  const folders = rawFolders.map(normalizeBackupFolder)

  let themeSettings: BackupSettings | undefined
  const settingsCandidate: Record<string, unknown> = {}
  if ('stageSettings' in parsed) settingsCandidate.stageSettings = parsed.stageSettings
  if ('themeMode' in parsed) settingsCandidate.themeMode = parsed.themeMode
  if ('customThemeColors' in parsed) settingsCandidate.customThemeColors = parsed.customThemeColors
  if ('factoryThemeOverrides' in parsed) settingsCandidate.factoryThemeOverrides = parsed.factoryThemeOverrides
  if (Object.keys(settingsCandidate).length > 0) {
    const errors = validateBackupSettings(settingsCandidate)
    if (errors.length === 0) {
      themeSettings = settingsCandidate as BackupSettings
    }
  }

  return {
    isValid: true,
    partial: Array.isArray(parsed) || !Array.isArray(parsed.setlists),
    songs,
    setlists,
    folders,
    ...(themeSettings ? { themeSettings } : {}),
  }
}
