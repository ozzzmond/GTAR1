/**
 * Local Profile Storage & Validation
 * Isolated to localStorage namespace 'gtar1_local_profile'
 * NO Google SDK, email, login/logout, or network dependencies.
 */

export interface LocalUserProfile {
  displayName: string
  avatarBase64?: string
  updatedAt: number
}

export const DEFAULT_AVATAR_PATH = '/avatars/default-avatar.png'

const PROFILE_STORAGE_KEY = 'gtar1_local_profile'
const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2MB limit
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function loadLocalProfile(): LocalUserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        displayName: typeof parsed.displayName === 'string' && parsed.displayName.trim() ? parsed.displayName.trim() : 'Musician',
        avatarBase64: typeof parsed.avatarBase64 === 'string' && parsed.avatarBase64.startsWith('data:image/') ? parsed.avatarBase64 : undefined,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      }
    }
  } catch {
    // Fall back to default on parse error
  }

  return {
    displayName: 'Musician',
    updatedAt: Date.now(),
  }
}

export function saveLocalProfile(profile: LocalUserProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch (err) {
    console.warn('Failed to persist local profile to localStorage', err)
  }
}

export function getInitials(name: string): string {
  if (!name || !name.trim()) return 'GT'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported image format (${file.type || 'unknown'}). Please choose JPEG, PNG, WEBP, or GIF.`,
    }
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      valid: false,
      error: `Image size exceeds 2MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
    }
  }
  return { valid: true }
}
