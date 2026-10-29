import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import type { SongEntity } from '../types/gtar'
import { parseGtarSong, splitSongLinesForColumns } from '../utils/songParser'
import { transposeContext } from '../utils/songKeySemantics'
import {
  NOTATION_STORAGE_KEY,
  getTrustworthySongKey,
  type StageNotationMode,
} from '../utils/nashvilleNotation'
import {
  createFullscreenController,
  createWakeLockController,
  type WakeLockStatus,
  isIosDevice,
  isStandalonePwa,
} from '../utils/stagePerformance'
import {
  SongLineRenderer,
  type StageChordScale,
  type StageFontWeight,
  type StageLineSpacing,
} from './SongLineRenderer'
import { StageControlDock } from './StageControlDock'
import { StageToolsModal } from './StageToolsModal'
import { StageOptionsSheet } from './StageOptionsSheet'
import { KeyPickerModal } from './KeyPickerModal'
import {
  ArrowLeft,
  Sliders,
  Gauge,
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  Minus,
  Plus,
  Maximize,
  Minimize,
  Columns2,
  Check,
  ListMusic,
} from 'lucide-react'

export const STAGE_CONTROLS_AUTO_HIDE_KEY = 'gtar1_stage_auto_hide'
const STAGE_AUTO_SCROLL_SPEED_KEY = 'gtar1_stage_auto_scroll_speed'
const STAGE_FONT_SIZE_KEY = 'gtar1_stage_font_size'
const STAGE_CHORD_SCALE_KEY = 'gtar1_stage_chord_scale'
const STAGE_FONT_WEIGHT_KEY = 'gtar1_stage_font_weight'
const STAGE_LINE_SPACING_KEY = 'gtar1_stage_line_spacing'
const STAGE_FONT_FAMILY_KEY = 'gtar1_stage_font_family'
const STAGE_TWO_COLUMN_KEY = 'gtar1_stage_two_column'
const STAGE_SHOW_DOCK_KEY = 'gtar1_stage_show_dock'
const STAGE_WAKE_LOCK_KEY = 'gtar1_stage_wake_lock'

export interface StageQueueItem {
  song: SongEntity
  transposeOffset: number
  entryId?: string
}

export interface StageViewProps {
  song: SongEntity
  transposeOffset: number
  onTransposeChange: (newOffset: number) => void
  onBack: () => void

  // Setlist / Queue Navigation
  queue?: StageQueueItem[]
  currentQueueIndex?: number
  onSelectQueueIndex?: (index: number) => void
  setlistName?: string

  // Optional library navigation fallback
  onPrevSong?: () => void
  onNextSong?: () => void
  canPrevSong?: boolean
  canNextSong?: boolean
}

interface ReadingAnchor {
  lineIndex: number
  focalRatio: number
  offsetInLine: number
}

function getReadingAnchor(container: HTMLElement): ReadingAnchor | null {
  if (container.scrollTop <= 2) {
    return { lineIndex: 0, focalRatio: 0, offsetInLine: 0 }
  }
  const maxScroll = container.scrollHeight - container.clientHeight
  if (maxScroll > 0 && maxScroll - container.scrollTop <= 2) {
    return { lineIndex: -1, focalRatio: 1, offsetInLine: 1 }
  }

  const containerRect = container.getBoundingClientRect()
  const focalY = containerRect.top + Math.min(140, Math.max(20, container.clientHeight * 0.2))
  const lines = container.querySelectorAll<HTMLElement>('[data-stage-line="true"]')
  if (lines.length === 0) return null

  let bestLine: HTMLElement | null = null
  let bestDist = Infinity

  for (let i = 0; i < lines.length; i++) {
    const el = lines[i]
    const rect = el.getBoundingClientRect()
    if (rect.top <= focalY && rect.bottom >= focalY) {
      bestLine = el
      break
    }
    const dist = Math.abs(rect.top - focalY)
    if (dist < bestDist) {
      bestDist = dist
      bestLine = el
    }
  }

  if (!bestLine) return null
  const lineIndexStr = bestLine.getAttribute('data-line-index')
  const lineIndex = lineIndexStr !== null ? parseInt(lineIndexStr, 10) : 0
  const lineRect = bestLine.getBoundingClientRect()
  const focalRatio = (focalY - containerRect.top) / (container.clientHeight || 1)
  const offsetInLine = lineRect.height > 0 ? (focalY - lineRect.top) / lineRect.height : 0

  return { lineIndex, focalRatio, offsetInLine }
}

function restoreReadingAnchor(container: HTMLElement, anchor: ReadingAnchor | null) {
  if (!anchor) return
  if (anchor.lineIndex === 0 && anchor.focalRatio === 0) {
    container.scrollTop = 0
    return
  }
  const maxScroll = container.scrollHeight - container.clientHeight
  if (anchor.lineIndex === -1 && maxScroll > 0) {
    container.scrollTop = maxScroll
    return
  }

  const lineEl = container.querySelector<HTMLElement>(`[data-stage-line="true"][data-line-index="${anchor.lineIndex}"]`)
  if (!lineEl) {
    return
  }

  const containerRect = container.getBoundingClientRect()
  const targetFocalY = containerRect.top + anchor.focalRatio * container.clientHeight
  const currentLineRect = lineEl.getBoundingClientRect()
  const lineFocalPoint = currentLineRect.top + anchor.offsetInLine * currentLineRect.height
  const delta = lineFocalPoint - targetFocalY

  const targetScrollTop = Math.max(0, Math.min(maxScroll, container.scrollTop + delta))
  container.scrollTop = targetScrollTop
}

export const StageView: React.FC<StageViewProps> = ({
  song,
  transposeOffset,
  onTransposeChange,
  onBack,
  queue,
  currentQueueIndex = 0,
  onSelectQueueIndex,
  setlistName,
  onPrevSong,
  onNextSong,
  canPrevSong: canPrevSongProp,
  canNextSong: canNextSongProp,
}) => {
  // Navigation bounds
  const hasQueue = Array.isArray(queue) && queue.length > 0
  const canPrevSong = hasQueue ? currentQueueIndex > 0 : Boolean(canPrevSongProp)
  const canNextSong = hasQueue ? currentQueueIndex < (queue?.length ?? 0) - 1 : Boolean(canNextSongProp)

  const handlePrevSong = () => {
    if (hasQueue && onSelectQueueIndex && currentQueueIndex > 0) {
      onSelectQueueIndex(currentQueueIndex - 1)
    } else {
      onPrevSong?.()
    }
  }

  const handleNextSong = () => {
    if (hasQueue && onSelectQueueIndex && currentQueueIndex < (queue?.length ?? 0) - 1) {
      onSelectQueueIndex(currentQueueIndex + 1)
    } else {
      onNextSong?.()
    }
  }

  // --- Persistent Appearance & Performance State ---
  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STAGE_FONT_SIZE_KEY)
      if (saved) {
        const val = Number(saved)
        if (!isNaN(val)) return Math.max(14, Math.min(36, val))
      }
    } catch {}
    return 24
  })

  const [chordScale, setChordScale] = useState<StageChordScale>(() => {
    try {
      const saved = localStorage.getItem(STAGE_CHORD_SCALE_KEY)
      if (saved) {
        const val = Number(saved)
        if (val === 1.0 || val === 1.1 || val === 1.2 || val === 1.3) return val
      }
    } catch {}
    return 1.0
  })

  const [fontWeight, setFontWeight] = useState<StageFontWeight>(() => {
    try {
      const saved = localStorage.getItem(STAGE_FONT_WEIGHT_KEY)
      if (saved === 'regular' || saved === 'medium' || saved === 'bold') return saved
    } catch {}
    return 'regular'
  })

  const [lineSpacing, setLineSpacing] = useState<StageLineSpacing>(() => {
    try {
      const saved = localStorage.getItem(STAGE_LINE_SPACING_KEY)
      if (saved === 'compact' || saved === 'normal' || saved === 'relaxed') return saved
    } catch {}
    return 'normal'
  })

  const [fontFamily, setFontFamily] = useState<'mono' | 'sans' | 'serif'>(() => {
    try {
      const saved = localStorage.getItem(STAGE_FONT_FAMILY_KEY)
      if (saved === 'mono' || saved === 'sans' || saved === 'serif') return saved
    } catch {}
    return 'mono'
  })

  const [notation, setNotation] = useState<StageNotationMode>(() => {
    try {
      const stored = localStorage.getItem(NOTATION_STORAGE_KEY)
      return stored === 'numbers' ? 'numbers' : 'chords'
    } catch {
      return 'chords'
    }
  })

  // User-controlled two-column mode (opt-in; NEVER automatically enabled by landscape)
  const [isTwoColumn, setIsTwoColumn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STAGE_TWO_COLUMN_KEY) === 'true'
    } catch {}
    return false
  })

  // Controls auto-hide: defaults to ON (true)
  const [autoHideControls, setAutoHideControls] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STAGE_CONTROLS_AUTO_HIDE_KEY)
      if (saved !== null) return saved === 'true'
    } catch {}
    return true
  })

  // Floating dock for tablet/desktop: defaults to false (bottom transport default)
  const [showDock, setShowDock] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STAGE_SHOW_DOCK_KEY) === 'true'
    } catch {}
    return false
  })

  // Screen Wake Lock user preference: enabled by default
  const [wakeLockPreference, setWakeLockPreference] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STAGE_WAKE_LOCK_KEY)
      if (saved !== null) return saved === 'true'
    } catch {}
    return true
  })

  // Screen Wake Lock actual hardware acquisition status
  const [isWakeLockAcquired, setIsWakeLockAcquired] = useState<boolean>(false)
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>(() => {
    try {
      const saved = localStorage.getItem(STAGE_WAKE_LOCK_KEY)
      const pref = saved !== null ? saved === 'true' : true
      if (!pref) return 'disabled'
      if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return 'unsupported'
      return 'disabled'
    } catch {
      return 'disabled'
    }
  })
  const readingAnchorRef = useRef<ReadingAnchor | null>(null)

  // Auto-scroll speed: 5–180 px/s, default 35
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STAGE_AUTO_SCROLL_SPEED_KEY)
      if (saved) {
        const val = Number(saved)
        if (val >= 5 && val <= 180) return val
      }
    } catch {}
    return 35
  })

  // Active Auto-Scrolling State
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false)

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // Modals & Sheets
  const [isToolsOpen, setIsToolsOpen] = useState(false)
  const [isOptionsOpen, setIsOptionsOpen] = useState<boolean>(false)
  const [isKeyPickerOpen, setIsKeyPickerOpen] = useState<boolean>(false)

  // Overlays / HUD visibility & auto-hide
  const [showStageOverlays, setShowStageOverlays] = useState<boolean>(true)
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Performance mode active: when autoscrolling or fullscreen
  const inPerformanceMode = isAutoScrolling || isFullscreen

  // DOM Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const accumulatedScrollRef = useRef<number>(0)
  const lastScrollRatioRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const isProgrammaticScrollRef = useRef<boolean>(false)
  const lastProgrammaticScrollTopRef = useRef<number>(0)
  const animIdRef = useRef<number | null>(null)
  const isAutoScrollingRef = useRef<boolean>(isAutoScrolling)

  // Controllers
  const wakeLockControllerRef = useRef<ReturnType<typeof createWakeLockController> | null>(null)
  const fullscreenControllerRef = useRef<ReturnType<typeof createFullscreenController> | null>(null)

  // --- Musical Semantics & Parsing ---
  const context = transposeContext(song, transposeOffset)
  const parsed = useMemo(() => parseGtarSong(song.rawContent, transposeOffset), [song.rawContent, transposeOffset])
  const currentKey = context.performanceKey || parsed.key || '—'
  const trustworthyKey = useMemo(() => getTrustworthySongKey(currentKey, song.rawContent), [currentKey, song.rawContent])

  // Extract structural section headers from parsed lines
  const sectionHeaders = useMemo(() => {
    return parsed.lines.filter((l) => l.type === 'SECTION_HEADER')
  }, [parsed.lines])

  // Split lines if two-column mode is enabled
  const [col1Lines, col2Lines] = useMemo(() => {
    if (!isTwoColumn) return [parsed.lines, []]
    return splitSongLinesForColumns(parsed.lines)
  }, [parsed.lines, isTwoColumn])

  // --- Reading Position Preservation (M5: Logical Anchor Across Orientation/Resize/Layout) ---
  const captureScrollRatio = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll > 0) {
      lastScrollRatioRef.current = el.scrollTop / maxScroll
    } else {
      lastScrollRatioRef.current = 0
    }
    readingAnchorRef.current = getReadingAnchor(el)
  }, [])

  // Restore reading anchor after typography/layout changes
  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current
      if (readingAnchorRef.current) {
        restoreReadingAnchor(el, readingAnchorRef.current)
        accumulatedScrollRef.current = el.scrollTop
        lastProgrammaticScrollTopRef.current = el.scrollTop
        readingAnchorRef.current = null
        lastScrollRatioRef.current = null
      } else if (lastScrollRatioRef.current !== null) {
        const maxScroll = el.scrollHeight - el.clientHeight
        if (maxScroll > 0) {
          el.scrollTop = lastScrollRatioRef.current * maxScroll
          accumulatedScrollRef.current = el.scrollTop
          lastProgrammaticScrollTopRef.current = el.scrollTop
        }
        lastScrollRatioRef.current = null
      }
    }
  }, [fontSize, chordScale, fontWeight, lineSpacing, fontFamily, notation, isTwoColumn])

  // Viewport resize and orientation change handler (M5)
  useEffect(() => {
    let resizeTimer: any = null
    let isResizing = false

    const handleBeforeResize = () => {
      if (!isResizing && scrollContainerRef.current) {
        readingAnchorRef.current = getReadingAnchor(scrollContainerRef.current)
        isResizing = true
      }
    }

    const handleAfterResize = () => {
      if (scrollContainerRef.current && readingAnchorRef.current) {
        restoreReadingAnchor(scrollContainerRef.current, readingAnchorRef.current)
        accumulatedScrollRef.current = scrollContainerRef.current.scrollTop
        lastProgrammaticScrollTopRef.current = scrollContainerRef.current.scrollTop
      }
      isResizing = false
      readingAnchorRef.current = null
    }

    const onResize = () => {
      handleBeforeResize()
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(handleAfterResize, 40)
    }

    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      clearTimeout(resizeTimer)
    }
  }, [])

  // Occurrence transition identity: combines song.id with entryId or queue index
  const currentOccurrenceId = queue?.[currentQueueIndex]?.entryId || `${song.id}-${currentQueueIndex}`

  // --- Wake Lock Lifecycle (M3) ---
  useEffect(() => {
    const controller = createWakeLockController()
    wakeLockControllerRef.current = controller

    const unsubscribe = controller.onChange((acquired, status) => {
      setIsWakeLockAcquired(acquired)
      if (status) {
        setWakeLockStatus(status)
      } else if (!wakeLockPreference) {
        setWakeLockStatus('disabled')
      } else if (acquired) {
        setWakeLockStatus('active')
      } else if (!controller.isSupported) {
        setWakeLockStatus('unsupported')
      } else {
        setWakeLockStatus('inactive')
      }
    })

    if (wakeLockPreference) {
      controller.acquire().then((acquired) => {
        setIsWakeLockAcquired(acquired)
        setWakeLockStatus(controller.status)
      }).catch(() => {
        setIsWakeLockAcquired(false)
        setWakeLockStatus('denied')
      })
    } else {
      setWakeLockStatus('disabled')
    }

    return () => {
      unsubscribe()
      controller.cleanup().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const controller = wakeLockControllerRef.current
    if (!controller) return
    if (wakeLockPreference) {
      controller.acquire().then((acquired) => {
        setIsWakeLockAcquired(acquired)
        setWakeLockStatus(controller.status)
      }).catch(() => {
        setIsWakeLockAcquired(false)
        setWakeLockStatus('denied')
      })
    } else {
      controller.release().catch(() => {})
      setWakeLockStatus('disabled')
    }
    try {
      localStorage.setItem(STAGE_WAKE_LOCK_KEY, String(wakeLockPreference))
    } catch {}
  }, [wakeLockPreference])

  // --- Fullscreen Controller Lifecycle ---
  useEffect(() => {
    const controller = createFullscreenController()
    fullscreenControllerRef.current = controller

    const unsubscribe = controller.onChange((fs) => {
      setIsFullscreen(fs)
    })

    return () => {
      unsubscribe()
      controller.cleanup()
    }
  }, [])

  const handleToggleFullscreen = () => {
    fullscreenControllerRef.current?.toggle()
  }

  // --- Auto-Hide HUD Overlays Logic ---
  // Target approved 3.5s behavior, ONLY in actual performance mode (autoscrolling or fullscreen)
  const triggerOverlaysShow = useCallback(() => {
    setShowStageOverlays(true)
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }

    if (inPerformanceMode && autoHideControls && !isOptionsOpen && !isKeyPickerOpen && !isToolsOpen) {
      autoHideTimerRef.current = setTimeout(() => {
        setShowStageOverlays(false)
      }, 3500)
    }
  }, [inPerformanceMode, autoHideControls, isOptionsOpen, isKeyPickerOpen, isToolsOpen])

  useEffect(() => {
    if (inPerformanceMode && autoHideControls) {
      triggerOverlaysShow()
    } else {
      // Paused / idle mode: controls remain discoverable and visible
      setShowStageOverlays(true)
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current)
        autoHideTimerRef.current = null
      }
    }
    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current)
        autoHideTimerRef.current = null
      }
    }
  }, [inPerformanceMode, autoHideControls, triggerOverlaysShow])

  // Pause auto-hide while modals/sheets are open; preserve interaction state
  useEffect(() => {
    if (isOptionsOpen || isKeyPickerOpen || isToolsOpen) {
      setShowStageOverlays(true)
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current)
        autoHideTimerRef.current = null
      }
    } else if (inPerformanceMode && autoHideControls) {
      triggerOverlaysShow()
    }
  }, [isOptionsOpen, isKeyPickerOpen, isToolsOpen, inPerformanceMode, autoHideControls, triggerOverlaysShow])

  // Keep synchronous ref aligned with auto-scrolling state
  useEffect(() => {
    isAutoScrollingRef.current = isAutoScrolling
  }, [isAutoScrolling])

  // Synchronously kill scheduled RAF and pause auto-scrolling
  const cancelActiveAutoScroll = useCallback(() => {
    if (animIdRef.current !== null) {
      cancelAnimationFrame(animIdRef.current)
      animIdRef.current = null
    }
    isProgrammaticScrollRef.current = false
    isAutoScrollingRef.current = false
    setIsAutoScrolling(false)
  }, [])

  // Reset scroll position and cancel any active autoscroll when song or occurrence transition occurs
  useEffect(() => {
    cancelActiveAutoScroll()
    accumulatedScrollRef.current = 0
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [currentOccurrenceId])

  // --- Auto-Scroll Engine (requestAnimationFrame with bounded elapsed-time accounting) ---
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !isAutoScrolling) {
      if (animIdRef.current !== null) {
        cancelAnimationFrame(animIdRef.current)
        animIdRef.current = null
      }
      return
    }

    accumulatedScrollRef.current = container.scrollTop
    let lastTime: number | null = null

    const step = (now: number) => {
      if (!lastTime) {
        lastTime = now
      }
      const rawDeltaMs = now - lastTime
      lastTime = now
      // Bound RAF elapsed-time jumps after throttling, background tab sleep, or thread lag
      const deltaMs = Math.max(0, Math.min(64, rawDeltaMs))

      accumulatedScrollRef.current += (autoScrollSpeed * deltaMs) / 1000
      isProgrammaticScrollRef.current = true
      lastProgrammaticScrollTopRef.current = accumulatedScrollRef.current
      container.scrollTop = accumulatedScrollRef.current

      // Check if reached bottom
      const maxScroll = container.scrollHeight - container.clientHeight
      if (container.scrollTop >= maxScroll - 2) {
        cancelActiveAutoScroll()
        return
      }

      animIdRef.current = requestAnimationFrame(step)
    }

    animIdRef.current = requestAnimationFrame(step)

    return () => {
      if (animIdRef.current !== null) {
        cancelAnimationFrame(animIdRef.current)
        animIdRef.current = null
      }
    }
  }, [isAutoScrolling, autoScrollSpeed, cancelActiveAutoScroll])

  // Invariant: Stop/pause auto-scroll when document becomes hidden; NEVER automatically resume
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cancelActiveAutoScroll()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [cancelActiveAutoScroll])

  // Intercept wheel, touch drag, and pointer interactions before next RAF can overwrite position
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = () => {
      if (isAutoScrollingRef.current) {
        cancelActiveAutoScroll()
      }
    }

    const handleTouchMove = () => {
      if (isAutoScrollingRef.current) {
        cancelActiveAutoScroll()
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (!isAutoScrollingRef.current) return
      const rect = container.getBoundingClientRect()
      // Detect clicks on vertical scrollbar area
      if (e.clientX >= rect.right - 24) {
        cancelActiveAutoScroll()
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: true })
    container.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('wheel', handleWheel, { passive: true })

    return () => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [cancelActiveAutoScroll])

  // --- Section Navigation Bounds ---
  const [canPrevSection, setCanPrevSection] = useState<boolean>(false)
  const [canNextSection, setCanNextSection] = useState<boolean>(false)

  const updateSectionNavBounds = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || sectionHeaders.length === 0) {
      setCanPrevSection(false)
      setCanNextSection(false)
      return
    }

    const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-stage-section="true"]'))
    if (sections.length === 0) {
      setCanPrevSection(false)
      setCanNextSection(false)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const headerOffset = 60
    const currentScrollTop = container.scrollTop

    const targets = sections.map((el) => {
      const elRect = el.getBoundingClientRect()
      const distanceFromTop = elRect.top - containerRect.top
      return Math.max(0, currentScrollTop + distanceFromTop - headerOffset)
    })

    const hasPrev = targets.some((targetTop) => targetTop <= currentScrollTop - 12)
    const hasNext = targets.some((targetTop) => targetTop > currentScrollTop + 12)

    setCanPrevSection(hasPrev)
    setCanNextSection(hasNext)
  }, [sectionHeaders.length])

  // Sync scroll accumulator and pause autoscroll on manual user scroll
  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) return

    if (isProgrammaticScrollRef.current) {
      const delta = Math.abs(container.scrollTop - lastProgrammaticScrollTopRef.current)
      if (delta <= 2) {
        isProgrammaticScrollRef.current = false
        updateSectionNavBounds()
        return
      }
      isProgrammaticScrollRef.current = false
    }

    accumulatedScrollRef.current = container.scrollTop
    if (isAutoScrollingRef.current) {
      cancelActiveAutoScroll()
    }
    updateSectionNavBounds()
  }

  // Update section bounds after layout changes or song change
  useLayoutEffect(() => {
    updateSectionNavBounds()
  }, [parsed.lines, fontSize, chordScale, isTwoColumn, updateSectionNavBounds])

  // --- Section Navigation ---
  const handlePrevSection = useCallback(() => {
    triggerOverlaysShow()
    const container = scrollContainerRef.current
    if (!container) return
    const currentScrollTop = container.scrollTop
    const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-stage-section="true"]'))
    if (sections.length === 0) return

    const containerRect = container.getBoundingClientRect()
    const headerOffset = 60
    const targets = sections.map((el) => {
      const elRect = el.getBoundingClientRect()
      const distanceFromTop = elRect.top - containerRect.top
      const targetScrollTop = Math.max(0, currentScrollTop + distanceFromTop - headerOffset)
      return { el, targetScrollTop }
    })

    const prevSections = targets.filter((s) => s.targetScrollTop <= currentScrollTop - 12)
    if (prevSections.length > 0) {
      const targetTop = prevSections[prevSections.length - 1].targetScrollTop
      accumulatedScrollRef.current = targetTop
      cancelActiveAutoScroll()
      container.scrollTo({ top: targetTop, behavior: 'smooth' })
      setCanPrevSection(targets.some((t) => t.targetScrollTop <= targetTop - 12))
      setCanNextSection(targets.some((t) => t.targetScrollTop > targetTop + 12))
    }
  }, [triggerOverlaysShow, cancelActiveAutoScroll])

  const handleNextSection = useCallback(() => {
    triggerOverlaysShow()
    const container = scrollContainerRef.current
    if (!container) return
    const currentScrollTop = container.scrollTop
    const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-stage-section="true"]'))
    if (sections.length === 0) return

    const containerRect = container.getBoundingClientRect()
    const headerOffset = 60
    const targets = sections.map((el) => {
      const elRect = el.getBoundingClientRect()
      const distanceFromTop = elRect.top - containerRect.top
      const targetScrollTop = Math.max(0, currentScrollTop + distanceFromTop - headerOffset)
      return { el, targetScrollTop }
    })

    const next = targets.find((s) => s.targetScrollTop > currentScrollTop + 12)
    if (next) {
      const targetTop = next.targetScrollTop
      accumulatedScrollRef.current = targetTop
      cancelActiveAutoScroll()
      container.scrollTo({ top: targetTop, behavior: 'smooth' })
      setCanPrevSection(targets.some((t) => t.targetScrollTop <= targetTop - 12))
      setCanNextSection(targets.some((t) => t.targetScrollTop > targetTop + 12))
    }
  }, [triggerOverlaysShow, cancelActiveAutoScroll])

  // --- Transpose Controls (-11..+11 bound) ---
  const handleTransposeChange = (delta: number) => {
    triggerOverlaysShow()
    const newOffset = Math.max(-11, Math.min(11, transposeOffset + delta))
    onTransposeChange(newOffset)
  }

  // --- Horizontal Touch Swipe for Previous/Next Song ---
  const handleTouchStart = (e: React.TouchEvent) => {
    triggerOverlaysShow()
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    const dt = Date.now() - touchStartRef.current.time
    touchStartRef.current = null

    // Swipe condition: min 60px horizontal, dx dominantly larger than dy (1.5x), within 600ms
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
      if (dx < 0 && canNextSong) {
        handleNextSong()
      } else if (dx > 0 && canPrevSong) {
        handlePrevSong()
      }
    }
  }

  // --- Keyboard Shortcuts (R5 Contract) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an editable control or modal is open
      const target = e.target as HTMLElement | null
      const isEditable = Boolean(
        target &&
          typeof target.getAttribute === 'function' &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            Boolean(target.isContentEditable) ||
            target.getAttribute('contenteditable') === 'true')
      )
      if (isEditable || isOptionsOpen || isKeyPickerOpen || isToolsOpen) {
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          setIsAutoScrolling((prev) => !prev)
          triggerOverlaysShow()
          break
        case 'PageUp':
          e.preventDefault()
          if (canPrevSection) {
            handlePrevSection()
          }
          break
        case 'PageDown':
          e.preventDefault()
          if (canNextSection) {
            handleNextSection()
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          triggerOverlaysShow()
          if (scrollContainerRef.current) {
            cancelActiveAutoScroll()
            scrollContainerRef.current.scrollBy({ top: -80, behavior: 'smooth' })
            accumulatedScrollRef.current = Math.max(0, scrollContainerRef.current.scrollTop - 80)
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          triggerOverlaysShow()
          if (scrollContainerRef.current) {
            cancelActiveAutoScroll()
            scrollContainerRef.current.scrollBy({ top: 80, behavior: 'smooth' })
            accumulatedScrollRef.current = scrollContainerRef.current.scrollTop + 80
          }
          break
        case 'Home':
          e.preventDefault()
          triggerOverlaysShow()
          if (scrollContainerRef.current) {
            cancelActiveAutoScroll()
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
            accumulatedScrollRef.current = 0
          }
          break
        case 'End':
          e.preventDefault()
          triggerOverlaysShow()
          if (scrollContainerRef.current) {
            cancelActiveAutoScroll()
            const maxScroll = scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight
            scrollContainerRef.current.scrollTo({ top: maxScroll, behavior: 'smooth' })
            accumulatedScrollRef.current = maxScroll
          }
          break
        case 'ArrowLeft':
        case '[':
          if (canPrevSong) {
            e.preventDefault()
            handlePrevSong()
          }
          break
        case 'ArrowRight':
        case ']':
          if (canNextSong) {
            e.preventDefault()
            handleNextSong()
          }
          break
        case '+':
        case '=':
          e.preventDefault()
          handleTransposeChange(1)
          break
        case '-':
        case '_':
          e.preventDefault()
          handleTransposeChange(-1)
          break
        case 'f':
        case 'F':
          e.preventDefault()
          handleToggleFullscreen()
          break
        case 'Escape':
          e.preventDefault()
          onBack()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    canPrevSong,
    canNextSong,
    canPrevSection,
    canNextSection,
    isOptionsOpen,
    isKeyPickerOpen,
    isToolsOpen,
    handlePrevSection,
    handleNextSection,
    handlePrevSong,
    handleNextSong,
    transposeOffset,
    onBack,
    triggerOverlaysShow,
  ])

  return (
    <div
      data-stage-view="true"
      className="stage-view-root relative w-full h-[100dvh] min-h-0 flex flex-col overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--custom-stage-bg, #020617)',
        color: 'var(--custom-stage-text, #f1f5f9)',
      }}
      onMouseMove={triggerOverlaysShow}
      onClick={() => {
        if (!showStageOverlays) {
          triggerOverlaysShow()
        }
      }}
    >
      {/* 1. Minimal Persistent Song Title Badge (When Overlays Auto-Hidden in Performance Mode) */}
      {inPerformanceMode && !showStageOverlays && (
        <div
          onClick={triggerOverlaysShow}
          role="button"
          tabIndex={0}
          aria-label="Reveal stage controls"
          className="stage-minimal-badge fixed top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 min-h-[44px] rounded-full backdrop-blur-md border shadow-lg cursor-pointer flex items-center gap-2 max-w-[85vw] transition-transform active:scale-95"
          style={{
            backgroundColor: 'var(--custom-dock-bg, var(--custom-stage-surface, rgba(15, 23, 42, 0.9)))',
            borderColor: 'var(--custom-dock-border, var(--custom-card-border, rgba(51, 65, 85, 0.6)))',
            color: 'var(--custom-uiPrimaryText, #f1f5f9)',
          }}
        >
          <span className="text-xs sm:text-base md:text-lg font-bold truncate" style={{ color: 'var(--custom-uiPrimaryText, #f1f5f9)' }}>
            {song.title || 'Untitled Song'}
          </span>
        </div>
      )}

      {/* 2. Top Bar (Portrait-First Compact Navigation) */}
      <header
        role="banner"
        className={`fixed top-0 inset-x-0 z-40 backdrop-blur-md border-b px-3 py-1.5 transition-all duration-300 ${
          showStageOverlays
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{
          backgroundColor: 'var(--custom-chrome-header-bg, rgba(15, 23, 42, 0.9))',
          borderBottomColor: 'var(--custom-card-border, var(--custom-stage-border, #1e293b))',
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 overflow-x-hidden">
          {/* Left: Back Button & Song Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={onBack}
              aria-label="Exit Stage and return to Music Explorer"
              className="ui-button min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl transition-colors shrink-0 flex items-center justify-center border"
              style={{
                backgroundColor: 'var(--custom-control-button-bg, #1e293b)',
                color: 'var(--custom-control-button-text, #f1f5f9)',
                borderColor: 'var(--custom-card-border, #334155)',
              }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1
                  className="stage-title-text text-sm sm:text-base font-extrabold truncate"
                  style={{ color: 'var(--custom-headerPrimaryText, var(--custom-uiPrimaryText, #ffffff))' }}
                >
                  {song.title || 'Untitled Song'}
                </h1>
                {(setlistName ? hasQueue : hasQueue && (queue?.length ?? 0) > 1) && (
                  <span
                    data-testid="stage-queue-counter"
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 border"
                    style={{
                      backgroundColor: 'var(--custom-card-selected-bg, rgba(8, 47, 73, 0.8))',
                      color: 'var(--custom-card-selected-border, #38bdf8)',
                      borderColor: 'var(--custom-card-selected-border, rgba(7, 89, 133, 0.6))',
                    }}
                  >
                    {currentQueueIndex + 1}/{queue?.length}
                  </span>
                )}
              </div>
              {song.artist && (
                <div
                  className="stage-artist-text text-[11px] truncate"
                  style={{ color: 'var(--custom-headerSecondaryText, var(--custom-uiSecondaryText, #94a3b8))' }}
                >
                  {song.artist}
                </div>
              )}
            </div>
          </div>

          {/* Right: Key Chip, Notation Toggle & Stage Options */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Key Chip (Tapping opens KeyPickerModal) */}
            <button
              type="button"
              onClick={() => setIsKeyPickerOpen(true)}
              aria-label={`Key: ${currentKey}. Click to transpose.`}
              className="ui-button min-h-[44px] min-w-[44px] px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
              style={{
                backgroundColor: 'var(--custom-control-button-bg, #1e293b)',
                borderColor: 'var(--custom-card-border, #334155)',
                color: 'var(--custom-control-button-text, #f1f5f9)',
              }}
            >
              <span style={{ color: 'var(--custom-uiMutedText, #94a3b8)' }}>Key:</span>
              <span className="font-bold" style={{ color: 'var(--custom-control-accent, #f59e0b)' }}>{currentKey}</span>
              {transposeOffset !== 0 && (
                <span className="text-[10px] font-mono" style={{ color: 'var(--custom-uiLinkText, #38bdf8)' }}>
                  {transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset}
                </span>
              )}
            </button>

            {/* Quick Notation Switcher */}
            <button
              type="button"
              onClick={() => {
                const next = notation === 'chords' ? 'numbers' : 'chords'
                setNotation(next)
                try {
                  localStorage.setItem(NOTATION_STORAGE_KEY, next)
                } catch {}
              }}
              aria-label="Toggle Chords vs Numbers"
              className="hidden sm:inline-flex min-h-[44px] px-3 items-center rounded-xl text-xs font-bold border transition-colors"
              style={{
                backgroundColor: notation === 'numbers' ? 'var(--custom-control-accent, #f59e0b)' : 'var(--custom-control-button-bg, #1e293b)',
                borderColor: notation === 'numbers' ? 'var(--custom-control-accent, #f59e0b)' : 'var(--custom-card-border, #334155)',
                color: notation === 'numbers' ? 'var(--custom-action-foreground, #000000)' : 'var(--custom-control-button-text, #f1f5f9)',
              }}
            >
              {notation === 'numbers' ? 'NNS' : 'Chords'}
            </button>

            <button
              type="button"
              onClick={() => setIsToolsOpen(true)}
              aria-label="Open Stage Tools"
              className="ui-button min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-app-button hover:brightness-110 border border-app-border text-app-button-text flex items-center justify-center shrink-0"
            >
              <Gauge className="w-5 h-5" />
            </button>

            {/* Options Button */}
            <button
              type="button"
              onClick={() => setIsOptionsOpen(true)}
              aria-label="Open Stage Options"
              className="ui-button min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border transition-colors flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--custom-control-button-bg, #1e293b)',
                borderColor: 'var(--custom-card-border, #334155)',
                color: 'var(--custom-control-button-text, #f1f5f9)',
              }}
            >
              <Sliders className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 3. Main Reading Canvas (Full-width, responsive, touch-friendly) */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={() => {
          if (isAutoScrollingRef.current) {
            cancelActiveAutoScroll()
          }
        }}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (!showStageOverlays) {
            triggerOverlaysShow()
          }
        }}
        data-stage-canvas="true"
        className="flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden pt-16 pb-32 sm:pb-28 px-3 sm:px-6 md:px-8 max-w-7xl mx-auto focus:outline-none"
        tabIndex={0}
      >
        {isTwoColumn ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div>
              <SongLineRenderer
                lines={col1Lines}
                fontSizePx={fontSize}
                fontFamily={fontFamily}
                chordScale={chordScale}
                fontWeight={fontWeight}
                lineSpacing={lineSpacing}
                notation={notation}
                referenceKey={trustworthyKey}
              />
            </div>
            <div>
              <SongLineRenderer
                lines={col2Lines}
                fontSizePx={fontSize}
                fontFamily={fontFamily}
                chordScale={chordScale}
                fontWeight={fontWeight}
                lineSpacing={lineSpacing}
                notation={notation}
                referenceKey={trustworthyKey}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <SongLineRenderer
              lines={parsed.lines}
              fontSizePx={fontSize}
              fontFamily={fontFamily}
              chordScale={chordScale}
              fontWeight={fontWeight}
              lineSpacing={lineSpacing}
              notation={notation}
              referenceKey={trustworthyKey}
            />
          </div>
        )}
      </main>

      {/* 4. Fixed Bottom Transport (Mobile-First Primary Controls) */}
      {!showDock && (
        <nav
          role="region"
          aria-label="Stage transport controls"
          className={`fixed bottom-0 inset-x-0 z-40 backdrop-blur-md border-t px-4 py-2.5 transition-all duration-300 ${
            showStageOverlays
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}
          style={{
            backgroundColor: 'var(--custom-dock-bg, var(--custom-chrome-toolbar-bg, rgba(15, 23, 42, 0.95)))',
            borderTopColor: 'var(--custom-dock-border, var(--custom-card-border, #1e293b))',
            paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0.625rem))',
          }}
        >
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
            {/* Prev Section Button */}
            <button
              type="button"
              disabled={!canPrevSection}
              onClick={handlePrevSection}
              aria-label="Previous section"
              className={`p-3 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center transition-all border ${
                canPrevSection
                  ? 'active:scale-95'
                  : 'opacity-40 cursor-not-allowed pointer-events-none'
              }`}
              style={{
                backgroundColor: 'var(--custom-dock-btn-bg, var(--custom-control-button-bg, #1e293b))',
                color: 'var(--custom-dock-btn-icon, var(--custom-control-button-text, #f1f5f9))',
                borderColor: 'var(--custom-dock-border, var(--custom-card-border, #334155))',
              }}
            >
              <ChevronUp className="w-6 h-6 stroke-[2.5]" />
            </button>

            {/* Transpose - */}
            <button
              type="button"
              onClick={() => handleTransposeChange(-1)}
              aria-label="Transpose down one semitone"
              className="p-3 min-w-[44px] min-h-[44px] rounded-2xl active:scale-95 flex items-center justify-center transition-all border"
              style={{
                backgroundColor: 'var(--custom-dock-btn-bg, var(--custom-control-button-bg, #1e293b))',
                color: 'var(--custom-dock-btn-icon, var(--custom-control-button-text, #f1f5f9))',
                borderColor: 'var(--custom-dock-border, var(--custom-card-border, #334155))',
              }}
            >
              <Minus className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Prominent Play / Pause FAB */}
            <button
              type="button"
              onClick={() => {
                triggerOverlaysShow()
                setIsAutoScrolling((prev) => !prev)
              }}
              aria-label={isAutoScrolling ? 'Pause auto-scroll' : 'Start auto-scroll'}
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 border-2"
              style={{
                backgroundColor: isAutoScrolling ? '#dc2626' : 'var(--custom-dock-play-bg, var(--custom-control-accent, #0284c7))',
                borderColor: isAutoScrolling ? '#ef4444' : 'var(--custom-dock-play-bg, var(--custom-control-accent, #38bdf8))',
                color: isAutoScrolling ? '#ffffff' : 'var(--custom-dock-play-icon, #000000)',
              }}
            >
              {isAutoScrolling ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-0.5" />
              )}
            </button>

            {/* Transpose + */}
            <button
              type="button"
              onClick={() => handleTransposeChange(1)}
              aria-label="Transpose up one semitone"
              className="p-3 min-w-[44px] min-h-[44px] rounded-2xl active:scale-95 flex items-center justify-center transition-all border"
              style={{
                backgroundColor: 'var(--custom-dock-btn-bg, var(--custom-control-button-bg, #1e293b))',
                color: 'var(--custom-dock-btn-icon, var(--custom-control-button-text, #f1f5f9))',
                borderColor: 'var(--custom-dock-border, var(--custom-card-border, #334155))',
              }}
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Next Section Button */}
            <button
              type="button"
              disabled={!canNextSection}
              onClick={handleNextSection}
              aria-label="Next section"
              className={`p-3 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center transition-all border ${
                canNextSection
                  ? 'active:scale-95'
                  : 'opacity-40 cursor-not-allowed pointer-events-none'
              }`}
              style={{
                backgroundColor: 'var(--custom-dock-btn-bg, var(--custom-control-button-bg, #1e293b))',
                color: 'var(--custom-dock-btn-icon, var(--custom-control-button-text, #f1f5f9))',
                borderColor: 'var(--custom-dock-border, var(--custom-card-border, #334155))',
              }}
            >
              <ChevronDown className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>
        </nav>
      )}

      {/* 5. Draggable Stage Control Dock (Tablet & Desktop Mode) */}
      {showDock && (
        <StageControlDock
          isAutoScrolling={isAutoScrolling}
          onToggleAutoScroll={() => {
            triggerOverlaysShow()
            setIsAutoScrolling((prev) => !prev)
          }}
          onOpenStageOptions={() => setIsOptionsOpen(true)}
          onPrevSection={handlePrevSection}
          onNextSection={handleNextSection}
          canPrevSection={canPrevSection}
          canNextSection={canNextSection}
          visible={showStageOverlays}
          onUserInteraction={triggerOverlaysShow}
        />
      )}

      {/* 6. Stage Options Bottom Sheet */}
      <StageOptionsSheet
        isOpen={isOptionsOpen}
        onClose={() => setIsOptionsOpen(false)}
        fontSize={fontSize}
        onFontSizeChange={(size) => {
          const clamped = Math.max(14, Math.min(36, size))
          captureScrollRatio()
          setFontSize(clamped)
          try {
            localStorage.setItem(STAGE_FONT_SIZE_KEY, String(clamped))
          } catch {}
        }}
        chordScale={chordScale}
        onChordScaleChange={(scale) => {
          captureScrollRatio()
          setChordScale(scale)
          try {
            localStorage.setItem(STAGE_CHORD_SCALE_KEY, String(scale))
          } catch {}
        }}
        fontWeight={fontWeight}
        onFontWeightChange={(weight) => {
          captureScrollRatio()
          setFontWeight(weight)
          try {
            localStorage.setItem(STAGE_FONT_WEIGHT_KEY, weight)
          } catch {}
        }}
        lineSpacing={lineSpacing}
        onLineSpacingChange={(spacing) => {
          captureScrollRatio()
          setLineSpacing(spacing)
          try {
            localStorage.setItem(STAGE_LINE_SPACING_KEY, spacing)
          } catch {}
        }}
        fontFamily={fontFamily}
        onFontFamilyChange={(fam) => {
          captureScrollRatio()
          setFontFamily(fam)
          try {
            localStorage.setItem(STAGE_FONT_FAMILY_KEY, fam)
          } catch {}
        }}
        notation={notation}
        onNotationChange={(not) => {
          captureScrollRatio()
          setNotation(not)
          try {
            localStorage.setItem(NOTATION_STORAGE_KEY, not)
          } catch {}
        }}
        isTwoColumn={isTwoColumn}
        onToggleTwoColumn={(enabled) => {
          captureScrollRatio()
          setIsTwoColumn(enabled)
          try {
            localStorage.setItem(STAGE_TWO_COLUMN_KEY, String(enabled))
          } catch {}
        }}
        showDock={showDock}
        onToggleShowDock={(enabled) => {
          setShowDock(enabled)
          try {
            localStorage.setItem(STAGE_SHOW_DOCK_KEY, String(enabled))
          } catch {}
        }}
        autoScrollSpeed={autoScrollSpeed}
        onAutoScrollSpeedChange={(speed) => {
          setAutoScrollSpeed(speed)
          try {
            localStorage.setItem(STAGE_AUTO_SCROLL_SPEED_KEY, String(speed))
          } catch {}
        }}
        autoHideControls={autoHideControls}
        onToggleAutoHideControls={(enabled) => {
          setAutoHideControls(enabled)
          try {
            localStorage.setItem(STAGE_CONTROLS_AUTO_HIDE_KEY, String(enabled))
          } catch {}
        }}
        wakeLockActive={wakeLockPreference}
        wakeLockAcquired={isWakeLockAcquired}
        wakeLockStatus={wakeLockStatus}
        onToggleWakeLock={() => setWakeLockPreference((prev) => !prev)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreenSupported={fullscreenControllerRef.current?.isSupported ?? false}
        queueSongs={queue}
        currentQueueIndex={currentQueueIndex}
        onSelectQueueIndex={onSelectQueueIndex}
        setlistName={setlistName}
      />

      {isToolsOpen && (
        <StageToolsModal onClose={() => setIsToolsOpen(false)} initialBpm={Number.parseFloat(String(song.bpm || ''))} />
      )}

      {/* 7. Key Picker Modal for Transposition */}
      <KeyPickerModal
        isOpen={isKeyPickerOpen}
        onClose={() => setIsKeyPickerOpen(false)}
        song={song}
        currentOffset={transposeOffset}
        onSelectOffset={(offset) => {
          onTransposeChange(offset)
        }}
        onReset={() => {
          onTransposeChange(context.resetOffset)
        }}
      />
    </div>
  )
}
