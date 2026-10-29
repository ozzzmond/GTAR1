/**
 * GTAR1 — Local First Core Types
 * Semantic Versioning: 0.1.0-dev (Semver, no 'v' prefix)
 */

export const GTAR1_VERSION = '0.1.0-dev'
export const GTAR_REVAMP_VERSION = GTAR1_VERSION

export type SongFormat = 'CHORD_PRO' | 'TWO_LINE' | 'PLAIN'

export interface SongEntity {
  id: string
  title: string
  artist?: string
  key?: string
  originalKey?: string
  confirmedChartKey?: string
  capo?: string
  bpm?: string
  time?: string
  year?: string
  rawContent: string
  format: SongFormat
  isFavorite?: boolean
  transposeOffset?: number
  createdAt: number
  updatedAt: number
}

export interface WebSetlistSongRef {
  id: string
  title: string
  artist?: string
  key?: string
  position: number
}

export interface WebSetlist {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  songs: WebSetlistSongRef[]
}

export interface ChordSegment {
  chord: string | null
  text: string
}

export interface EmptyLine {
  type: 'EMPTY'
}

export interface SectionHeaderLine {
  type: 'SECTION_HEADER'
  title: string
}

export interface TabLine {
  type: 'TAB'
  content: string
}

export interface ChordRowLine {
  type: 'CHORD_ROW'
  chords: string[]
  raw: string
}

export interface LyricLine {
  type: 'LYRIC'
  lyrics: string
}

export interface ChordProLine {
  type: 'CHORD_PRO'
  raw: string
  segments: ChordSegment[]
}

export type SongLine =
  | EmptyLine
  | SectionHeaderLine
  | TabLine
  | ChordRowLine
  | LyricLine
  | ChordProLine

export interface ParsedGtarSong {
  title: string
  artist: string
  key: string
  originalKey?: string
  confirmedChartKey?: string
  capo?: string
  bpm?: string
  time?: string
  year?: string
  tags?: string
  format: SongFormat
  lines: SongLine[]
}

export interface GtarBackupMetadata {
  app: 'GTAR1' | 'GTAR_REVAMP'
  version: string
  exportedAt: string
  songCount: number
  setlistCount: number
}

export interface GtarBackupPayload {
  app: 'GTAR1' | 'GTAR_REVAMP'
  schemaVersion: 1
  version: string
  exportedAt: string
  songs: SongEntity[]
  setlists: WebSetlist[]
}
