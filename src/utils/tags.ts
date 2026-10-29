/**
 * Normalizes a list of tag strings:
 * - Trims whitespace
 * - Converts to lowercase for case-insensitive deduplication
 * - Deduplicates while preserving order
 * - Filters out empty strings
 */
export function normalizeTags(tags?: unknown): string[] {
  if (!tags) return []

  let rawList: unknown[] = []
  if (Array.isArray(tags)) {
    rawList = tags
  } else if (typeof tags === 'string') {
    rawList = tags.split(/[,;\n]/)
  } else {
    return []
  }

  const seen = new Set<string>()
  const result: string[] = []

  for (const item of rawList) {
    if (typeof item === 'string') {
      const trimmed = item.trim().toLowerCase()
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed)
        result.push(trimmed)
      }
    }
  }

  return result
}

/**
 * Checks if a song has a specific tag (case-insensitive).
 */
export function songHasTag(songTags: string[] | undefined, targetTag: string): boolean {
  if (!songTags || !Array.isArray(songTags)) return false
  const normTarget = targetTag.trim().toLowerCase()
  return songTags.some((t) => t.trim().toLowerCase() === normTarget)
}

/**
 * Replaces an old tag name with a new tag name across a list of tags.
 * Deduplicates and returns normalized tags.
 */
export function renameTagInList(tags: string[] | undefined, oldTag: string, newTag: string): string[] {
  const normOld = oldTag.trim().toLowerCase()
  const normNew = newTag.trim().toLowerCase()
  if (!tags || !Array.isArray(tags)) return []

  const mapped = tags.map((t) => {
    if (t.trim().toLowerCase() === normOld) {
      return normNew
    }
    return t
  })

  return normalizeTags(mapped)
}

/**
 * Removes a tag from a list of tags.
 */
export function removeTagFromList(tags: string[] | undefined, tagToRemove: string): string[] {
  if (!tags || !Array.isArray(tags)) return []
  const normRemove = tagToRemove.trim().toLowerCase()
  return tags.filter((t) => t.trim().toLowerCase() !== normRemove)
}
