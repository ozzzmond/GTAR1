/**
 * GTAR Revamp — Minimal JSON Export and Import
 * Clean round-trip serialization and schema validation.
 * Compatible with GTAR Revamp and import-friendly with legacy GTAR export formats.
 */

import type { SongEntity, WebSetlist, GtarBackupPayload } from '../types/gtar'
import { GTAR_REVAMP_VERSION } from '../types/gtar'
import { canonicalSongKey } from './musicalKey'
import { detectSongKey } from './songParser'
import { generateUUID } from './uuid'

export interface ParsedBackupResult {
  isValid: boolean
  songs: SongEntity[]
  setlists: WebSetlist[]
  error?: string
}

export function createBackupPayload(
  songs: SongEntity[],
  setlists: WebSetlist[]
): GtarBackupPayload {
  return {
    app: 'GTAR_REVAMP',
    schemaVersion: 1,
    version: GTAR_REVAMP_VERSION,
    exportedAt: new Date().toISOString(),
    songs: songs.map((s) => ({
      ...s,
      key: s.key ? canonicalSongKey(s.key) : undefined,
      originalKey: s.originalKey ? canonicalSongKey(s.originalKey) : undefined,
    })),
    setlists: setlists.map((sl) => ({
      ...sl,
      songs: sl.songs.map((ref, idx) => ({
        ...ref,
        position: idx,
      })),
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
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()

  const rawSongs = Array.isArray(raw.songs) ? raw.songs : []
  const songs = rawSongs.map((s: any, idx: number) => ({
    id: typeof s.id === 'string' ? s.id : generateUUID(),
    title: (s.title || 'Untitled Song').trim(),
    artist: s.artist ? String(s.artist).trim() : undefined,
    key: s.key ? canonicalSongKey(s.key) : undefined,
    position: typeof s.position === 'number' ? s.position : idx,
  }))

  return {
    id,
    name,
    createdAt,
    updatedAt,
    songs,
  }
}

export function parseBackupJson(jsonString: string): ParsedBackupResult {
  if (!jsonString || !jsonString.trim()) {
    return {
      isValid: false,
      songs: [],
      setlists: [],
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
      error: `Invalid JSON syntax: ${(err as Error).message}`,
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      isValid: false,
      songs: [],
      setlists: [],
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

  const songs = rawSongs.map(normalizeBackupSong)
  const setlists = rawSetlists.map(normalizeBackupSetlist)

  return {
    isValid: true,
    songs,
    setlists,
  }
}
