/**
 * Song text and ChordPro parser for GTAR1
 * Supports ChordPro bracketed inline chords, directives, sections, and 2-line layouts.
 * Ported from ozzzmond/GTAR@45ce8442859b66843f4755733e7f9a66984df51a
 */

import type {
  ChordSegment,
  SongFormat,
  SongLine,
  ParsedGtarSong,
} from '../types/gtar'
import {
  CHORD_TOKEN_REGEX,
  transposeChordToken,
  transposeChordLine,
  transposeChordProText,
} from './chordTransposer'

export { CHORD_TOKEN_REGEX } from './chordTransposer'

const SECTION_KEYWORDS = [
  'intro',
  'verse',
  'chorus',
  'bridge',
  'pre-chorus',
  'post-chorus',
  'outro',
  'solo',
  'interlude',
  'hook',
  'ending',
  'riff',
  'instrumental',
  'refrain',
  'transposed',
  'repeat',
  'adlib',
  'breakdown',
  'coda',
  'tag',
]

export const TAB_LINE_REGEX = /^[eEaAdDgGbB]\|[0-9-xpbrh~/\\|\s]+$/

export function isTabChartLine(line: string): boolean {
  const trimmed = line.trim()
  if (TAB_LINE_REGEX.test(trimmed)) return true
  if (/-(?:[0-9]+|x)-/i.test(line)) return true
  if (/^\s*(?:chords?|chord\s+(?:chart|diagrams?|definitions?))\s*:/i.test(line)) return true
  if (/^[0-9xX](?:\s+[0-9xX]){3,}$/.test(trimmed)) return true
  return false
}

function cleanChordWrapper(token: string): string {
  if (token.startsWith('(') && token.endsWith(')')) {
    return token.substring(1, token.length - 1).trim()
  }
  return token.replace(/[[\]<>{},;:]/g, '').trim()
}

export function isSectionHeader(line: string): boolean {
  const trimmed = line.trim().replace(/^\((.*)\)$/, '$1')
  if (!trimmed || trimmed.length > 50) return false
  if (TAB_LINE_REGEX.test(trimmed)) return false

  const bracketMatch = /^[[<]([^\]>]+)[\]>]$/.exec(trimmed)
  if (bracketMatch) {
    const inside = bracketMatch[1].trim().toLowerCase()
    if (CHORD_TOKEN_REGEX.test(bracketMatch[1].trim())) {
      return false
    }
    if (isChordLine(inside)) {
      return false
    }
    return true
  }

  const bareMatch = /^([A-Za-z-]+)(?:\s+[0-9A-Za-z]+)?:?$/.exec(trimmed)
  if (bareMatch) {
    const word = bareMatch[1].toLowerCase()
    return SECTION_KEYWORDS.includes(word)
  }

  return false
}

export function normalizeSectionMarkers(text: string): string {
  return text
    .split('\n')
    .flatMap((line) => {
      const match = /^\s*\[([^\]]+)\][ \t]*:?[ \t]*(.*)$/.exec(line)
      if (!match || !isSectionHeader(`[${match[1]}]`)) return [line]
      let title = match[1].trim()
      const keyword = SECTION_KEYWORDS.find(
        (word) => title.toLowerCase() === word || title.toLowerCase().startsWith(word + ' ')
      )
      if (keyword) {
        title =
          keyword.replace(/(^|-)[a-z]/g, (value) => value.toUpperCase()) +
          title.slice(keyword.length)
      }
      return match[2] ? [`[${title}]`, match[2]] : [`[${title}]`]
    })
    .join('\n')
}

export function normalizeAngleBrackets(text: string): string {
  text = text.replace(/\{([^{}]+)\}/g, (match, chord: string) =>
    CHORD_TOKEN_REGEX.test(chord.trim()) ? `[${chord.trim()}]` : match
  )
  let res = text.replace(
    /<([A-G][b#]?[^>]*)-([A-G][b#]?[^>]*)>/gi,
    (match, c1, c2) => {
      if (CHORD_TOKEN_REGEX.test(c1.trim()) && CHORD_TOKEN_REGEX.test(c2.trim())) {
        return `[${c1.trim()}]-[${c2.trim()}]`
      }
      return match
    }
  )

  res = res.replace(/<([A-G][b#]?[^>]*)>/gi, (match, chord) => {
    const trimmed = chord.trim()
    if (CHORD_TOKEN_REGEX.test(trimmed)) {
      return `[${trimmed}]`
    }
    return match
  })

  return res
}

export function isChordLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (
    TAB_LINE_REGEX.test(trimmed) ||
    (trimmed.startsWith('|') && trimmed.includes('-|') && !trimmed.includes(' '))
  ) {
    return false
  }

  const rawTokens = trimmed.split(/\s+/).filter(Boolean)
  if (rawTokens.length === 0) return false

  let chordCount = 0
  let lyricCount = 0
  let hasProseWord = false

  for (const rawToken of rawTokens) {
    const clean = cleanChordWrapper(rawToken)
    if (!clean) continue
    if (CHORD_TOKEN_REGEX.test(clean)) {
      chordCount++
    } else {
      if (/^[a-zA-Z]{4,}$/.test(clean)) {
        hasProseWord = true
      }
      lyricCount++
    }
  }

  if (hasProseWord) return false
  if (chordCount === 0) return false
  if (lyricCount === 0) return true

  return lyricCount <= 1 && chordCount / (chordCount + lyricCount) >= 0.85
}

export function extractChordTokensFromLine(line: string): string[] {
  const bracketRegex = /\[([A-G][b#]?[^\]]*)\]/g
  let match: RegExpExecArray | null
  const bracketMatches: string[] = []

  while ((match = bracketRegex.exec(line)) !== null) {
    const c = match[1].trim()
    if (CHORD_TOKEN_REGEX.test(c)) {
      bracketMatches.push(c)
    }
  }

  if (bracketMatches.length > 0) {
    return bracketMatches
  }

  const tokens: string[] = []
  const rawParts = line.split(/\s+/).filter(Boolean)
  for (const part of rawParts) {
    const subParts = part.split(/[-|–—]/).map((p) => cleanChordWrapper(p)).filter(Boolean)
    for (const sub of subParts) {
      if (CHORD_TOKEN_REGEX.test(sub)) {
        tokens.push(sub)
      }
    }
  }

  return tokens
}

interface BracketedMatch {
  chord: string
  startIndex: number
  endIndex: number
}

function findBracketedChords(line: string): BracketedMatch[] {
  const regex = /\[([A-G][b#]?[^\]]*)\]|<([A-G][b#]?[^>]*)>/g
  const matches: BracketedMatch[] = []
  let m: RegExpExecArray | null

  while ((m = regex.exec(line)) !== null) {
    const candidate = (m[1] || m[2] || '').trim()
    if (CHORD_TOKEN_REGEX.test(candidate)) {
      matches.push({
        chord: candidate,
        startIndex: m.index,
        endIndex: regex.lastIndex,
      })
    }
  }

  return matches
}

export function parseChordProLine(line: string, transposeOffset = 0): ChordSegment[] {
  const matches = findBracketedChords(normalizeAngleBrackets(line))
  line = normalizeAngleBrackets(line)
  if (!matches.length) return [{ chord: null, text: line }]
  const segments: ChordSegment[] = []
  if (matches[0].startIndex > 0) {
    segments.push({ chord: null, text: line.slice(0, matches[0].startIndex) })
  }
  matches.forEach((match, index) =>
    segments.push({
      chord: transposeChordToken(match.chord, transposeOffset),
      text: line.slice(match.endIndex, matches[index + 1]?.startIndex ?? line.length),
    })
  )
  return segments
}

function hasInlineLyricContent(line: string, bracketed: BracketedMatch[]): boolean {
  let lyricOnly = ''
  let lastIdx = 0

  for (const b of bracketed) {
    lyricOnly += line.substring(lastIdx, b.startIndex)
    lastIdx = b.endIndex
  }
  lyricOnly += line.substring(lastIdx)

  const cleaned = lyricOnly.replace(/[\s\-|:,/\\~]+/g, '')
  return cleaned.length > 0
}

export function normalizeChordLineBrackets(line: string, matches: BracketedMatch[]): string {
  if (matches.length === 0) return line
  let result = ''
  let lastIdx = 0

  for (const match of matches) {
    const chord = match.chord
    const start = match.startIndex
    const end = match.endIndex

    const prefix = start > lastIdx ? line.substring(lastIdx, start) : ''
    if (prefix.trim().length > 0) {
      while (result.length < lastIdx) {
        result += ' '
      }
      result += prefix
    }

    while (result.length < start) {
      result += ' '
    }

    result += chord
    lastIdx = end
  }

  if (lastIdx < line.length) {
    const suffix = line.substring(lastIdx)
    if (suffix.trim().length > 0) {
      while (result.length < lastIdx) {
        result += ' '
      }
      result += suffix
    }
  }

  return result
}

export function parseGtarSong(rawText: string, transposeOffset = 0): ParsedGtarSong {
  const normalizedText = normalizeSectionMarkers(normalizeAngleBrackets(rawText))
  const lines = normalizedText.split('\n')

  let title = 'Untitled Song'
  let artist = ''
  let key = ''
  let originalKey = ''
  let capo = ''
  let bpm = ''
  let time = ''
  let year = ''
  let tags: string[] = []

  const parsedLines: SongLine[] = []
  let chordProCount = 0
  let twoLineCount = 0

  let explicitTab = false
  let chartBlock = false
  for (const sourceLine of lines) {
    if (/^\s*\{(?:sot|start_of_tab)\}\s*$/i.test(sourceLine)) {
      explicitTab = true
      continue
    }
    if (/^\s*\{(?:eot|end_of_tab)\}\s*$/i.test(sourceLine)) {
      explicitTab = false
      chartBlock = false
      continue
    }
    if (!sourceLine.trim() || isSectionHeader(sourceLine)) chartBlock = false
    if (explicitTab || chartBlock || isTabChartLine(sourceLine)) {
      parsedLines.push({ type: 'TAB', content: sourceLine })
      chartBlock =
        chartBlock ||
        /^\s*(?:chords?|chord\s+(?:chart|diagrams?|definitions?))\s*:/i.test(sourceLine)
      continue
    }
    const rawLine = sourceLine.replace(/\{([^{}]*)\}/g, (match) =>
      sourceLine.trim() === match ? match : ''
    )
    const trimmed = rawLine.trim()

    if (!trimmed) {
      parsedLines.push({ type: 'EMPTY' })
      continue
    }

    const directiveMatch = /^\{([a-zA-Z_-]+)(?::\s*([^}]+))?\}$/.exec(trimmed)
    if (directiveMatch) {
      const tag = directiveMatch[1].toLowerCase()
      const value = (directiveMatch[2] || '').trim()

      switch (tag) {
        case 'soc':
        case 'start_of_chorus':
          parsedLines.push({ type: 'SECTION_HEADER', title: value || 'Chorus' })
          break
        case 't':
        case 'title':
          title = value
          break
        case 'a':
        case 'artist':
        case 'subtitle':
        case 'st':
          artist = value
          break
        case 'k':
        case 'key':
          key = value
          break
        case 'original_key':
        case 'originalkey':
          originalKey = value
          break
        case 'capo':
          capo = value
          break
        case 'tempo':
        case 'bpm':
          bpm = value
          break
        case 'time':
          time = value
          break
        case 'year':
          year = value
          break
        case 'tags':
        case 'tag':
        case 'genre':
          tags = value ? value.split(/[,;\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean) : []
          break
        case 'c':
        case 'comment':
          parsedLines.push({ type: 'SECTION_HEADER', title: value })
          break
      }
      chordProCount++
      continue
    }

    if (TAB_LINE_REGEX.test(trimmed) && trimmed.length > 4) {
      parsedLines.push({ type: 'TAB', content: rawLine })
      continue
    }

    const combinedMatch =
      /^(?:(\[[^\]]+\]:?)|((?:Intro|Verse|Chorus|Bridge|Pre-Chorus|Post-Chorus|Outro|Solo|Interlude|Hook|Ending|Riff|Instrumental|Refrain|Transposed|Repeat|Adlib|Breakdown|Coda)(?:\s+[0-9A-Za-z\-_/]+)?:?))\s+(.+)$/i.exec(
        trimmed
      )
    const hasLineBrackets = findBracketedChords(trimmed).length > 0
    if (combinedMatch && (!hasLineBrackets || Boolean(combinedMatch[1]))) {
      const headerRaw = combinedMatch[1] || combinedMatch[2]
      const restPart = combinedMatch[3].trim()
      const headerPart = headerRaw.replace(/[[\]<>:]/g, '').trim()

      if (isSectionHeader(`[${headerPart}]`)) {
        parsedLines.push({ type: 'SECTION_HEADER', title: headerPart })

        const restBrackets = findBracketedChords(restPart)
        if (restBrackets.length > 0) {
          if (!hasInlineLyricContent(restPart, restBrackets)) {
            const chordTokens = restBrackets.map((b) =>
              transposeOffset !== 0 ? transposeChordToken(b.chord, transposeOffset) : b.chord
            )
            const normalized = normalizeChordLineBrackets(restPart, restBrackets)
            const transposedRaw =
              transposeOffset !== 0 ? transposeChordLine(normalized, transposeOffset) : normalized
            parsedLines.push({
              type: 'CHORD_ROW',
              chords: chordTokens,
              raw: transposedRaw,
            })
          } else {
            const transposedRaw =
              transposeOffset !== 0 ? transposeChordProText(restPart, transposeOffset) : restPart
            parsedLines.push({
              type: 'CHORD_PRO',
              raw: transposedRaw,
              segments: parseChordProLine(restPart, transposeOffset),
            })
          }
          chordProCount++
          continue
        } else if (isChordLine(restPart)) {
          const rawTokens = extractChordTokensFromLine(restPart)
          const chordTokens = rawTokens.map((t) =>
            transposeOffset !== 0 ? transposeChordToken(t, transposeOffset) : t
          )
          const transposedRaw =
            transposeOffset !== 0 ? transposeChordLine(restPart, transposeOffset) : restPart
          parsedLines.push({
            type: 'CHORD_ROW',
            chords: chordTokens,
            raw: transposedRaw,
          })
          twoLineCount++
          continue
        }
      }
    }

    if (isSectionHeader(trimmed)) {
      const cleanTitle = trimmed.replace(/[[\]<>():]/g, '').trim()
      parsedLines.push({ type: 'SECTION_HEADER', title: cleanTitle })
      continue
    }

    const bracketed = findBracketedChords(rawLine)
    if (bracketed.length > 0) {
      if (!hasInlineLyricContent(rawLine, bracketed)) {
        const chordTokens = bracketed.map((b) =>
          transposeOffset !== 0 ? transposeChordToken(b.chord, transposeOffset) : b.chord
        )
        const normalized = normalizeChordLineBrackets(rawLine, bracketed)
        const transposedRaw =
          transposeOffset !== 0 ? transposeChordLine(normalized, transposeOffset) : normalized

        parsedLines.push({
          type: 'CHORD_ROW',
          chords: chordTokens,
          raw: transposedRaw,
        })
        chordProCount++
      } else {
        const transposedRaw =
          transposeOffset !== 0 ? transposeChordProText(rawLine, transposeOffset) : rawLine
        parsedLines.push({
          type: 'CHORD_PRO',
          raw: transposedRaw,
          segments: parseChordProLine(rawLine, transposeOffset),
        })
        chordProCount++
      }
      continue
    }

    if (isChordLine(rawLine)) {
      const tokens = extractChordTokensFromLine(rawLine)
      const transposedTokens = tokens.map((t) =>
        transposeOffset !== 0 ? transposeChordToken(t, transposeOffset) : t
      )
      const transposedRaw =
        transposeOffset !== 0 ? transposeChordLine(rawLine, transposeOffset) : rawLine
      parsedLines.push({
        type: 'CHORD_ROW',
        chords: transposedTokens,
        raw: transposedRaw,
      })
      twoLineCount++
      continue
    }

    parsedLines.push({ type: 'LYRIC', lyrics: rawLine })
  }

  for (let i = 0; i < parsedLines.length; i++) {
    const line = parsedLines[i]
    if (line.type === 'CHORD_ROW') {
      const nextLine = parsedLines[i + 1]
      ;(line as any).isOverLyric = Boolean(nextLine && nextLine.type === 'LYRIC')
    }
  }

  const format: SongFormat =
    chordProCount > twoLineCount ? 'CHORD_PRO' : twoLineCount > 0 ? 'TWO_LINE' : 'PLAIN'

  const effectiveKey = key || detectSongKey(rawText)

  return {
    title,
    artist,
    key: effectiveKey,
    originalKey,
    capo,
    bpm,
    time: time || undefined,
    year,
    tags,
    format,
    lines: parsedLines,
  }
}

function parseChordRootAndQuality(chord: string): string | null {
  if (!chord) return null
  const clean = chord.trim().replace(/^\[|\]$/g, '')
  const match = /^([A-Ga-g][#b]?)(m|min|maj)?/i.exec(clean)
  if (!match) return null

  const root = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
  const quality = (match[2] || '').toLowerCase()
  const isMinor = quality === 'm' || quality === 'min'

  return isMinor ? `${root}m` : root
}

export function detectSongKey(rawContent: string): string {
  if (!rawContent || !rawContent.trim()) return 'C'

  const directiveMatch = /\{(?:key|k):\s*([A-Ga-g][#b]?(?:m|maj|min)?(?:\b|[^\s}]))\s*\}/i.exec(rawContent)
  if (directiveMatch && directiveMatch[1]) {
    const parsedKey = parseChordRootAndQuality(directiveMatch[1].trim())
    if (parsedKey) return parsedKey
  }

  const metaMatch = /^\s*(?:original\s+)?key(?:\s+of)?\s*:\s*([A-Ga-g][#b]?(?:m|maj|min)?(?:\b|[^\s\n\r]))/im.exec(rawContent)
  if (metaMatch && metaMatch[1]) {
    const parsedKey = parseChordRootAndQuality(metaMatch[1].trim())
    if (parsedKey) return parsedKey
  }

  const lines = rawContent.split(/\r?\n/)
  const allChords: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('{') || isTabChartLine(line)) continue

    const bracketed = findBracketedChords(line)
    if (bracketed.length > 0) {
      for (const b of bracketed) {
        const root = parseChordRootAndQuality(b.chord)
        if (root) allChords.push(root)
      }
      if (allChords.length >= 8) break
      continue
    }

    if (isChordLine(line)) {
      const tokens = extractChordTokensFromLine(line)
      for (const t of tokens) {
        const root = parseChordRootAndQuality(t)
        if (root) allChords.push(root)
      }
      if (allChords.length >= 8) break
    }
  }

  if (allChords.length > 0) {
    return allChords[0]
  }

  return 'C'
}
