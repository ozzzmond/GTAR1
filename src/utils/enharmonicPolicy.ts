/**
 * Target-key aware enharmonic spelling policy for GTAR1
 * Ported from ozzzmond/GTAR@45ce8442859b66843f4755733e7f9a66984df51a
 */

import { PITCH_CLASS_MAP } from './chordParser'

export const CHROMATIC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const CHROMATIC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

const FLAT_KEYS = new Set([
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'
])

const KEY_SPELLING_TABLE: Record<string, readonly string[]> = {
  // Flat major keys
  'F':  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  'Bb': ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  'Eb': ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  'Ab': ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'C'],
  'Db': ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'C'],
  'Gb': ['Cb', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],

  // Flat minor keys
  'Dm':  ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
  'Gm':  ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
  'Cm':  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  'Fm':  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'C'],
  'Bbm': ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'C'],
  'Ebm': ['Cb', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],

  // Sharp/Natural major keys
  'C':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
  'G':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'D':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'A':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'E':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'B':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'F#': ['C', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'C#': ['B#', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B#'],

  // Sharp/Natural minor keys
  'Am':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
  'Em':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'Bm':  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'F#m': ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'C#m': ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'G#m': ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
}

export function keyPrefersFlats(key: string | null | undefined): boolean {
  if (!key) return false
  const clean = key.trim()
  if (FLAT_KEYS.has(clean)) return true
  const match = /^([A-Ga-g][#b]?)(.*)$/.exec(clean)
  if (!match) return false
  const root = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
  return root.includes('b') || root === 'F'
}

export function spellPitchClass(pitchClass: number, targetKey: string | null | undefined): string {
  const normPitch = ((pitchClass % 12) + 12) % 12
  if (targetKey) {
    const table = KEY_SPELLING_TABLE[targetKey]
    if (table && table[normPitch]) {
      return table[normPitch]
    }
    if (keyPrefersFlats(targetKey)) {
      return CHROMATIC_FLATS[normPitch]
    }
  }
  return CHROMATIC_SHARPS[normPitch]
}

export function transposeNoteWithKey(note: string, semitones: number, targetKey: string | null | undefined): string {
  const clean = note.trim()
  if (!(clean in PITCH_CLASS_MAP)) return note
  const currentPitch = PITCH_CLASS_MAP[clean]
  const newPitch = ((currentPitch + semitones) % 12 + 12) % 12
  return spellPitchClass(newPitch, targetKey)
}
