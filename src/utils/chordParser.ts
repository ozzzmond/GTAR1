/**
 * Deterministic Chord Model and Parser for GTAR1
 * Ported from ozzzmond/GTAR@45ce8442859b66843f4755733e7f9a66984df51a
 */

export interface ParsedChord {
  root: string
  quality: string
  bass?: string
  bassQuality?: string
  raw: string
  isKnown: boolean
}

export const CHROMATIC_ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'] as const

export const PITCH_CLASS_MAP: Record<string, number> = {
  'B#': 0, 'C': 0, 'Dbb': 0,
  'C#': 1, 'Db': 1, 'B##': 1,
  'D': 2, 'C##': 2, 'Ebb': 2,
  'D#': 3, 'Eb': 3, 'Fbb': 3,
  'E': 4, 'Fb': 4, 'D##': 4,
  'E#': 5, 'F': 5, 'Gbb': 5,
  'F#': 6, 'Gb': 6, 'E##': 6,
  'G': 7, 'F##': 7, 'Abb': 7,
  'G#': 8, 'Ab': 8,
  'A': 9, 'G##': 9, 'Bbb': 9,
  'A#': 10, 'Bb': 10, 'Cbb': 10,
  'B': 11, 'Cb': 11, 'A##': 11,
}

const REJECTED_WORDS = new Set([
  'an', 'and', 'as', 'at', 'all', 'are', 'about', 'above', 'after', 'again', 'against',
  'be', 'been', 'being', 'before', 'between', 'below', 'behind', 'by', 'but', 'because',
  'can', 'could', 'come', 'came',
  'do', 'did', 'does', 'done', 'down', 'during',
  'each', 'even', 'every',
  'for', 'from', 'first',
  'go', 'get', 'got', 'give', 'gave', 'good', 'great',
  'intro', 'verse', 'chorus', 'bridge', 'outro', 'solo', 'pre-chorus', 'post-chorus', 'tab'
])

export function isValidRootNote(root: string): boolean {
  return root in PITCH_CLASS_MAP
}

export function normalizeRootNote(root: string): string {
  if (!root) return ''
  return root.charAt(0).toUpperCase() + root.slice(1).toLowerCase()
}

const QUAL_ATOM = '(?:maj(?:or)?|min(?:or)?|dim(?:inished)?|aug(?:mented)?|sus[24]?|add(?:2|4|9|11|13)?|alt|M|m|[0-9]+|[b#][0-9]+|[Δ°ø+])'
const EXT_ATOM = '(?:\((?:b5|#5|b9|#9|#11|b13|add9|sus4|maj7|m7|[0-9]+|[b#][0-9]+)\))'
const CHORD_QUALITY_REGEX = new RegExp(`^(?:${QUAL_ATOM}|${EXT_ATOM})*$`, 'i')

export function parseChord(token: string): ParsedChord | null {
  if (!token) return null
  const trimmed = token.trim()
  if (!trimmed || trimmed.length > 25) return null

  if (REJECTED_WORDS.has(trimmed.toLowerCase())) {
    return null
  }

  const slashIdx = trimmed.indexOf('/')
  let mainChordStr = trimmed
  let bassStr: string | undefined = undefined

  if (slashIdx !== -1) {
    mainChordStr = trimmed.slice(0, slashIdx).trim()
    bassStr = trimmed.slice(slashIdx + 1).trim()
    if (!mainChordStr || !bassStr) return null
  }

  const rootMatch = /^([A-G][#b]?)(.*)$/i.exec(mainChordStr)
  if (!rootMatch) return null

  const rawRoot = rootMatch[1]
  const quality = rootMatch[2]
  const normalizedRoot = normalizeRootNote(rawRoot)
  if (!isValidRootNote(normalizedRoot)) return null

  if (quality && !CHORD_QUALITY_REGEX.test(quality)) {
    return null
  }

  let normalizedBass: string | undefined = undefined
  let bassQuality: string | undefined = undefined

  if (bassStr !== undefined) {
    const bassMatch = /^([A-G][#b]?)(.*)$/i.exec(bassStr)
    if (!bassMatch) return null
    normalizedBass = normalizeRootNote(bassMatch[1])
    if (!isValidRootNote(normalizedBass)) return null
    bassQuality = bassMatch[2] || undefined
  }

  return {
    root: normalizedRoot,
    quality,
    bass: normalizedBass,
    bassQuality,
    raw: trimmed,
    isKnown: true,
  }
}

export function isChordToken(token: string): boolean {
  return parseChord(token) !== null
}
