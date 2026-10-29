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

export interface ParsedBackupResult {
  isValid: boolean
  songs: SongEntity[]
  setlists: WebSetlist[]
  folders: SetlistFolder[]
  error?: string
}

export function createBackupPayload(
  songs: SongEntity[],
  setlists: WebSetlist[],
  folders: SetlistFolder[] = []
): GtarBackupPayload {
  return {
    app: 'GTAR1',
    schemaVersion: 1,
    version: GTAR1_VERSION,
    exportedAt: new Date().toISOString(),
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
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
  const tags = normalizeTags(raw.tags)

  return {
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
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()

  const rawSongs = Array.isArray(raw.songs) ? raw.songs : []
  const songs = rawSongs.map((s: any, idx: number) => ({
    entryId: typeof s.entryId === 'string' && s.entryId.trim() ? s.entryId.trim() : generateUUID(),
    id: typeof s.id === 'string' ? s.id : generateUUID(),
    title: (s.title || 'Untitled Song').trim(),
    artist: s.artist ? String(s.artist).trim() : undefined,
    key: s.key ? canonicalSongKey(s.key) : undefined,
    position: typeof s.position === 'number' ? s.position : idx,
    transposeOffset: typeof s.transposeOffset === 'number' ? s.transposeOffset : undefined,
  }))

  return {
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
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()

  return {
    id,
    name,
    parentId,
    createdAt,
    updatedAt,
  }
}

export function parseBackupJson(jsonString: string): ParsedBackupResult {
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

  // Support array of songs directly or object with songs array
  const rawSongs = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.songs)
      ? parsed.songs
      : []

  const rawSetlists = Array.isArray(parsed.setlists) ? parsed.setlists : []
  const rawFolders = Array.isArray(parsed.folders) ? parsed.folders : []

  const songs = rawSongs.map(normalizeBackupSong)
  const setlists = rawSetlists.map(normalizeBackupSetlist)
  const folders = rawFolders.map(normalizeBackupFolder)

  return {
    isValid: true,
    songs,
    setlists,
    folders,
  }
}
