/**
 * Musical chord and key transposition utilities for GTAR1
 * Preserves authored spellings on zero offset, honors flat keys, and handles -11 to +11 semitones.
 * Ported from ozzzmond/GTAR@45ce8442859b66843f4755733e7f9a66984df51a
 */

import { parseChord, type ParsedChord } from './chordParser'
import {
  transposeNoteWithKey,
  keyPrefersFlats,
  CHROMATIC_SHARPS,
  CHROMATIC_FLATS,
} from './enharmonicPolicy'

export {
  parseChord,
  isChordToken,
  isValidRootNote,
  normalizeRootNote,
  type ParsedChord,
} from './chordParser'

export {
  keyPrefersFlats,
  spellPitchClass,
  transposeNoteWithKey,
} from './enharmonicPolicy'

export const CHORD_TOKEN_REGEX = {
  test(token: string): boolean {
    return parseChord(token) !== null
  },
}

const NOTE_ALIASES: Record<string, number> = {
  'B#': 0, 'C': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'E#': 5, 'F': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
}

export function transposeNote(note: string, semitones: number, preferFlats = false): string {
  const clean = note.trim()
  if (!(clean in NOTE_ALIASES)) return note

  const currentIdx = NOTE_ALIASES[clean]
  const newIdx = ((currentIdx + semitones) % 12 + 12) % 12
  const scale = preferFlats ? CHROMATIC_FLATS : CHROMATIC_SHARPS
  return scale[newIdx]
}

export function transposeKey(key: string | null | undefined, semitones: number): string {
  if (!key || semitones === 0) return key || ''
  const trimmed = key.trim()
  const match = trimmed.match(/^([A-Ga-g][#b]?)(.*)$/)
  if (!match) return key

  const root = match[1]
  const quality = match[2]
  const isMinor = quality.toLowerCase().startsWith('m')

  const currentIdx = NOTE_ALIASES[root.charAt(0).toUpperCase() + root.slice(1).toLowerCase()]
  if (currentIdx === undefined) return key

  const newIdx = ((currentIdx + semitones) % 12 + 12) % 12

  // Musician conventional key choice:
  // Major keys prefer Bb, Eb, Ab, Db, Gb rather than A#, D#, G#, C#, F# (except F# is common)
  const conventionalMajorKeys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  const conventionalMinorKeys = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']

  const newRoot = isMinor
    ? conventionalMinorKeys[newIdx].replace(/m$/, '')
    : conventionalMajorKeys[newIdx]

  return `${newRoot}${quality}`
}

export function transposeChordToken(
  token: string,
  semitones: number,
  targetKey?: string | null
): string {
  if (!token) return ''
  const trimmed = token.trim()
  if (!trimmed || semitones === 0) return trimmed

  const parsed = parseChord(trimmed)
  if (!parsed) return trimmed

  const effectiveKey = targetKey || (keyPrefersFlats(parsed.root) ? 'F' : 'C')

  const newRoot = transposeNoteWithKey(parsed.root, semitones, effectiveKey)
  let newBass: string | undefined = undefined
  if (parsed.bass) {
    newBass = transposeNoteWithKey(parsed.bass, semitones, effectiveKey)
    if (parsed.bassQuality) {
      newBass = `${newBass}${parsed.bassQuality}`
    }
  }

  return `${newRoot}${parsed.quality}${newBass ? `/${newBass}` : ''}`
}

export function transposeChordLine(line: string, semitones: number, targetKey?: string | null): string {
  if (semitones === 0) return line
  return line.replace(/\[([^\]]+)\]/g, (match, chordToken) => {
    const transposed = transposeChordToken(chordToken, semitones, targetKey)
    return `[${transposed}]`
  })
}

export function transposeChordProText(content: string, semitones: number, targetKey?: string | null): string {
  if (semitones === 0) return content
  const lines = content.split(/\r?\n/)
  const isCrlf = content.includes('\r\n')
  const lineEnding = isCrlf ? '\r\n' : '\n'

  const transposedLines = lines.map((line) => {
    const trimmed = line.trim()
    // Don't transpose directive values except key directives if needed
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const match = trimmed.match(/^\{([a-zA-Z_]+)(?::\s*(.*?))?\}$/)
      if (match) {
        const name = match[1].toLowerCase()
        if (name === 'key' || name === 'k') {
          const transposedK = transposeKey(match[2], semitones)
          return `{${match[1]}: ${transposedK}}`
        }
      }
      return line
    }
    return transposeChordLine(line, semitones, targetKey)
  })

  return transposedLines.join(lineEnding)
}
