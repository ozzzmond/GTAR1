/**
 * stagePerformance.ts
 *
 * Cross-platform performance controllers for GTAR1 Stage View:
 *   1. Fullscreen — safe feature-detection wrapper with iOS / iOS-PWA awareness.
 *   2. Screen Wake Lock — centralized controller keeping screen awake during gigs,
 *      handling visibility re-acquisition and clean release on unmount.
 */

type VendorDocument = Document & {
  webkitFullscreenEnabled?: boolean
  mozFullScreenEnabled?: boolean
  msFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element
  mozFullScreenElement?: Element
  msFullscreenElement?: Element
  webkitExitFullscreen?: () => void
  mozCancelFullScreen?: () => void
  msExitFullscreen?: () => void
}

type VendorElement = HTMLElement & {
  webkitRequestFullscreen?: () => void
  mozRequestFullScreen?: () => void
  msRequestFullscreen?: () => void
}

/**
 * Returns true when running on iOS device.
 */
export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  const ua = navigator.userAgent || ''
  const platform = (navigator as unknown as { platform?: string }).platform || ''

  if (/iPhone|iPad|iPod/i.test(ua)) return true
  if (/iPhone|iPad|iPod/i.test(platform)) return true

  const touchPoints = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0
  const hasTouch =
    touchPoints > 0 ||
    (typeof window !== 'undefined' && 'ontouchstart' in window) ||
    (typeof document !== 'undefined' && 'ontouchend' in document)
  if (/Macintosh|MacIntel/i.test(platform) && hasTouch) return true
  if (/Macintosh/i.test(ua) && hasTouch) return true

  if ('standalone' in navigator) return true

  return false
}

/**
 * Returns true when running as an installed standalone PWA.
 */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
  try {
    return window.matchMedia('(display-mode: standalone)').matches
  } catch {
    return false
  }
}

/**
 * Returns true when native Fullscreen API is supported.
 */
export function isFullscreenApiSupported(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(
    document.fullscreenEnabled ||
      (document as VendorDocument).webkitFullscreenEnabled ||
      (document as VendorDocument).mozFullScreenEnabled ||
      (document as VendorDocument).msFullscreenEnabled
  )
}

// ---------------------------------------------------------------------------
// 1. Fullscreen Controller
// ---------------------------------------------------------------------------

export interface FullscreenController {
  toggle(): void
  readonly isSupported: boolean
  onChange(callback: (isFullscreen: boolean) => void): () => void
  cleanup(): void
}

export function createFullscreenController(): FullscreenController {
  const supported = isFullscreenApiSupported()
  let simulatedFullscreen = false
  const listeners: Array<(isFullscreen: boolean) => void> = []

  const getCurrentState = (): boolean => {
    if (typeof document === 'undefined') return false
    if (!supported) return simulatedFullscreen
    return Boolean(
      document.fullscreenElement ||
        (document as VendorDocument).webkitFullscreenElement ||
        (document as VendorDocument).mozFullScreenElement ||
        (document as VendorDocument).msFullscreenElement
    )
  }

  const dispatchChange = () => {
    const isFs = getCurrentState()
    listeners.forEach((cb) => {
      try {
        cb(isFs)
      } catch {
        // Guard listener failures
      }
    })
  }

  const EVENTS = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']

  if (supported && typeof document !== 'undefined') {
    EVENTS.forEach((evt) => document.addEventListener(evt, dispatchChange))
  }

  return {
    get isSupported() {
      return supported
    },

    toggle() {
      if (typeof document === 'undefined') return
      if (!supported) {
        // Fallback: distraction-free fullscreen simulated state
        simulatedFullscreen = !simulatedFullscreen
        dispatchChange()
        return
      }
      try {
        if (getCurrentState()) {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {})
          } else if ((document as VendorDocument).webkitExitFullscreen) {
            ;(document as VendorDocument).webkitExitFullscreen?.()
          } else if ((document as VendorDocument).mozCancelFullScreen) {
            ;(document as VendorDocument).mozCancelFullScreen?.()
          } else if ((document as VendorDocument).msExitFullscreen) {
            ;(document as VendorDocument).msExitFullscreen?.()
          }
        } else {
          const el = document.documentElement
          if (el.requestFullscreen) {
            el.requestFullscreen().catch(() => {})
          } else if ((el as VendorElement).webkitRequestFullscreen) {
            ;(el as VendorElement).webkitRequestFullscreen?.()
          } else if ((el as VendorElement).mozRequestFullScreen) {
            ;(el as VendorElement).mozRequestFullScreen?.()
          } else if ((el as VendorElement).msRequestFullscreen) {
            ;(el as VendorElement).msRequestFullscreen?.()
          }
        }
      } catch {
        // Ignore synchronous permission or gesture errors
      }
    },

    onChange(callback) {
      listeners.push(callback)
      return () => {
        const idx = listeners.indexOf(callback)
        if (idx !== -1) listeners.splice(idx, 1)
      }
    },

    cleanup() {
      if (supported && typeof document !== 'undefined') {
        EVENTS.forEach((evt) => document.removeEventListener(evt, dispatchChange))
        try {
          if (getCurrentState()) {
            if (document.exitFullscreen) {
              document.exitFullscreen().catch(() => {})
            } else if ((document as VendorDocument).webkitExitFullscreen) {
              ;(document as VendorDocument).webkitExitFullscreen?.()
            }
          }
        } catch {
          // Ignore exit error during cleanup
        }
      } else {
        simulatedFullscreen = false
      }
      listeners.length = 0
    },
  }
}

// ---------------------------------------------------------------------------
// 2. Screen Wake Lock Controller
// ---------------------------------------------------------------------------

export interface WakeLockSentinelLike {
  released: boolean
  release(): Promise<void>
  addEventListener?(type: string, listener: () => void): void
}

export type WakeLockStatus = 'active' | 'denied' | 'unsupported' | 'disabled' | 'acquiring' | 'inactive'

export interface WakeLockController {
  acquire(): Promise<boolean>
  release(): Promise<void>
  cleanup(): Promise<void>
  readonly isSupported: boolean
  readonly isAcquired: boolean
  readonly isDenied: boolean
  readonly status: WakeLockStatus
  onChange(callback: (isAcquired: boolean, status?: WakeLockStatus) => void): () => void
}

export function createWakeLockController(): WakeLockController {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  let sentinel: WakeLockSentinelLike | null = null
  let visibilityHandler: (() => void) | null = null
  let destroyed = false
  let enabled = false
  let denied = false
  const listeners: Array<(isAcquired: boolean, status?: WakeLockStatus) => void> = []

  let isAcquiring = false
  let isSystemReleased = false
  let pending: Promise<boolean> | null = null
  let activeGeneration = 0

  function getCurrentStatus(): WakeLockStatus {
    if (!enabled) return 'disabled'
    if (!supported) return 'unsupported'
    if (sentinel && !sentinel.released) return 'active'
    if (isAcquiring) return 'acquiring'
    if (denied) return 'denied'
    if (isSystemReleased) return 'inactive'
    return 'inactive'
  }

  function dispatchChange() {
    const acquired = Boolean(sentinel && !sentinel.released)
    const currentStatus = getCurrentStatus()
    listeners.forEach((fn) => {
      try {
        fn(acquired, currentStatus)
      } catch {}
    })
  }

  function acquireInternal(): Promise<boolean> {
    if (!supported) {
      denied = false
      isAcquiring = false
      isSystemReleased = false
      dispatchChange()
      return Promise.resolve(false)
    }
    if (destroyed || !enabled) {
      denied = false
      isAcquiring = false
      return Promise.resolve(false)
    }
    if (sentinel && !sentinel.released) {
      denied = false
      isAcquiring = false
      isSystemReleased = false
      return Promise.resolve(true)
    }
    if (pending) return pending

    activeGeneration++
    const generation = activeGeneration
    isAcquiring = true
    denied = false
    isSystemReleased = false
    dispatchChange()

    pending = (async () => {
      try {
        const acquired = await (navigator as any).wakeLock.request('screen')
        if (destroyed || !enabled || generation !== activeGeneration) {
          try {
            await acquired.release()
          } catch {}
          return false
        } else {
          sentinel = acquired
          denied = false
          isAcquiring = false
          isSystemReleased = false
          if (typeof acquired.addEventListener === 'function') {
            acquired.addEventListener('release', () => {
              if (sentinel === acquired) {
                sentinel = null
                if (enabled && !destroyed) {
                  isSystemReleased = true
                }
                dispatchChange()
              }
            })
          }
          dispatchChange()
          return true
        }
      } catch {
        // Page hidden, battery saver, or permission denied
        if (generation === activeGeneration) {
          sentinel = null
          denied = true
          isAcquiring = false
          isSystemReleased = false
          dispatchChange()
        }
        return false
      } finally {
        if (generation === activeGeneration) {
          isAcquiring = false
          pending = null
        }
      }
    })()
    return pending
  }

  async function releaseInternal(): Promise<void> {
    activeGeneration++
    denied = false
    isAcquiring = false
    isSystemReleased = false
    pending = null
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release()
      } catch {
        // Guard release
      }
    }
    sentinel = null
    dispatchChange()
  }

  function setupVisibilityListener() {
    if (!supported || typeof document === 'undefined') return
    visibilityHandler = () => {
      if (document.visibilityState === 'visible' && !destroyed && enabled) {
        acquireInternal().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  function teardownVisibilityListener() {
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  setupVisibilityListener()

  return {
    get isSupported() {
      return supported
    },

    get isAcquired() {
      return Boolean(sentinel && !sentinel.released)
    },

    get isDenied() {
      return denied
    },

    get status() {
      return getCurrentStatus()
    },

    onChange(callback: (isAcquired: boolean, status?: WakeLockStatus) => void) {
      listeners.push(callback)
      return () => {
        const idx = listeners.indexOf(callback)
        if (idx !== -1) listeners.splice(idx, 1)
      }
    },

    async acquire(): Promise<boolean> {
      enabled = true
      return acquireInternal()
    },

    async release() {
      enabled = false
      await releaseInternal()
    },

    async cleanup() {
      enabled = false
      destroyed = true
      teardownVisibilityListener()
      await releaseInternal()
    },
  }
}
