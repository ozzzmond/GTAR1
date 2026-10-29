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
import { StageOptionsSheet } from './StageOptionsSheet'
import { KeyPickerModal } from './KeyPickerModal'
import {
  ArrowLeft,
  Sliders,
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
      if (saved) return Number(saved) || 24
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

  // Screen Wake Lock controller: enabled by default
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STAGE_WAKE_LOCK_KEY)
      if (saved !== null) return saved === 'true'
    } catch {}
    return true
  })

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

  // --- Reading Position Preservation ---
  // Capture scroll ratio before layout-altering changes
  const captureScrollRatio = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll > 0) {
      lastScrollRatioRef.current = el.scrollTop / maxScroll
    } else {
      lastScrollRatioRef.current = 0
    }
  }, [])

  // Restore scroll ratio after layout changes
  useLayoutEffect(() => {
    if (lastScrollRatioRef.current !== null && scrollContainerRef.current) {
      const el = scrollContainerRef.current
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll > 0) {
        el.scrollTop = lastScrollRatioRef.current * maxScroll
        accumulatedScrollRef.current = el.scrollTop
      }
      lastScrollRatioRef.current = null
    }
  }, [fontSize, chordScale, fontWeight, lineSpacing, fontFamily, notation, isTwoColumn])

  // --- Wake Lock Lifecycle ---
  useEffect(() => {
    const controller = createWakeLockController()
    wakeLockControllerRef.current = controller

    if (wakeLockActive) {
      controller.acquire().catch(() => {})
    }

    return () => {
      controller.cleanup().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const controller = wakeLockControllerRef.current
    if (!controller) return
    if (wakeLockActive) {
      controller.acquire().catch(() => {})
    } else {
      controller.release().catch(() => {})
    }
    try {
      localStorage.setItem(STAGE_WAKE_LOCK_KEY, String(wakeLockActive))
    } catch {}
  }, [wakeLockActive])

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
  const triggerOverlaysShow = useCallback(() => {
    setShowStageOverlays(true)
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }

    if (autoHideControls) {
      autoHideTimerRef.current = setTimeout(() => {
        // Only hide if options modal and key picker are not open
        if (!isOptionsOpen && !isKeyPickerOpen) {
          setShowStageOverlays(false)
        }
      }, 4000)
    }
  }, [autoHideControls, isOptionsOpen, isKeyPickerOpen])

  useEffect(() => {
    if (autoHideControls) {
      triggerOverlaysShow()
    } else {
      setShowStageOverlays(true)
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current)
        autoHideTimerRef.current = null
      }
    }
    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current)
      }
    }
  }, [autoHideControls, triggerOverlaysShow])

  // Pause auto-hide while modals are open
  useEffect(() => {
    if (isOptionsOpen || isKeyPickerOpen) {
      setShowStageOverlays(true)
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current)
        autoHideTimerRef.current = null
      }
    } else if (autoHideControls) {
      triggerOverlaysShow()
    }
  }, [isOptionsOpen, isKeyPickerOpen, autoHideControls, triggerOverlaysShow])

  // --- Auto-Scroll Engine (requestAnimationFrame with elapsed-time accounting) ---
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !isAutoScrolling) return

    accumulatedScrollRef.current = container.scrollTop
    let lastTime: number | null = null
    let animId: number

    const step = (now: number) => {
      if (!lastTime) {
        lastTime = now
      }
      const deltaMs = now - lastTime
      lastTime = now

      accumulatedScrollRef.current += (autoScrollSpeed * deltaMs) / 1000
      container.scrollTop = accumulatedScrollRef.current

      // Check if reached bottom
      const maxScroll = container.scrollHeight - container.clientHeight
      if (container.scrollTop >= maxScroll - 2) {
        setIsAutoScrolling(false)
        return
      }

      animId = requestAnimationFrame(step)
    }

    animId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [isAutoScrolling, autoScrollSpeed])

  // Invariant: Stop/pause auto-scroll when document becomes hidden; NEVER automatically resume
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsAutoScrolling(false)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Sync scroll accumulator on manual user scroll
  const handleScroll = () => {
    if (!isAutoScrolling && scrollContainerRef.current) {
      accumulatedScrollRef.current = scrollContainerRef.current.scrollTop
    }
  }

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
      setIsAutoScrolling(false)
      container.scrollTo({ top: targetTop, behavior: 'smooth' })
    } else {
      accumulatedScrollRef.current = 0
      setIsAutoScrolling(false)
      container.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [triggerOverlaysShow])

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
      setIsAutoScrolling(false)
      container.scrollTo({ top: targetTop, behavior: 'smooth' })
    }
  }, [triggerOverlaysShow])

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

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input or textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toUpperCase()
      if (
        targetTag === 'INPUT' ||
        targetTag === 'TEXTAREA' ||
        isOptionsOpen ||
        isKeyPickerOpen
      ) {
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          setIsAutoScrolling((prev) => !prev)
          triggerOverlaysShow()
          break
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          handlePrevSection()
          break
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          handleNextSection()
          break
        case 'ArrowLeft':
        case '[':
        case 'PageUp':
          if (canPrevSong) {
            e.preventDefault()
            handlePrevSong()
          }
          break
        case 'ArrowRight':
        case ']':
        case 'PageDown':
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
    isOptionsOpen,
    isKeyPickerOpen,
    handlePrevSection,
    handleNextSection,
    transposeOffset,
    onBack,
    triggerOverlaysShow,
  ])

  // Can Prev / Next section state
  const canPrevSection = sectionHeaders.length > 0
  const canNextSection = sectionHeaders.length > 0

  return (
    <div
      className="relative w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none"
      onMouseMove={triggerOverlaysShow}
    >
      {/* 1. Minimal Persistent Song Title Badge (When Overlays Auto-Hidden in Performance Mode) */}
      {inPerformanceMode && !showStageOverlays && (
        <div
          onClick={triggerOverlaysShow}
          role="button"
          tabIndex={0}
          aria-label="Reveal stage controls"
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-app-surface/85 backdrop-blur-md border border-slate-700/60 shadow-lg cursor-pointer flex items-center gap-2 max-w-[85vw] transition-transform active:scale-95"
        >
          <span className="text-xs sm:text-base md:text-lg font-bold text-app-text truncate">
            {song.title || 'Untitled Song'}
          </span>
        </div>
      )}

      {/* 2. Top Bar (Portrait-First Compact Navigation) */}
      <header
        role="banner"
        className={`fixed top-0 inset-x-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-3 py-2 transition-all duration-300 ${
          showStageOverlays
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Left: Back Button & Song Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Exit Stage and return to Music Explorer"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-white truncate">
                  {song.title || 'Untitled Song'}
                </h1>
                {hasQueue && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-950/80 text-sky-400 border border-sky-800/60 text-[10px] font-mono font-bold shrink-0">
                    {currentQueueIndex + 1}/{queue?.length}
                  </span>
                )}
              </div>
              {song.artist && (
                <div className="text-[11px] text-slate-400 truncate">
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
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span className="text-slate-400">Key:</span>
              <span className="font-bold text-amber-400">{currentKey}</span>
              {transposeOffset !== 0 && (
                <span className="text-[10px] font-mono text-sky-300">
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
              className={`hidden xs:inline-flex px-2 py-1 rounded-xl text-xs font-bold border transition-colors ${
                notation === 'numbers'
                  ? 'bg-amber-500 border-amber-400 text-slate-900'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
              }`}
            >
              {notation === 'numbers' ? 'NNS' : 'Chords'}
            </button>

            {/* Options Button */}
            <button
              type="button"
              onClick={() => setIsOptionsOpen(true)}
              aria-label="Open Stage Options"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
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
        onTouchEnd={handleTouchEnd}
        data-stage-canvas="true"
        className="flex-1 w-full overflow-y-auto overflow-x-hidden pt-16 pb-32 sm:pb-28 px-3 sm:px-6 md:px-8 max-w-7xl mx-auto focus:outline-none"
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
          className={`fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-4 py-2.5 transition-all duration-300 ${
            showStageOverlays
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}
          style={{
            paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0.625rem))',
          }}
        >
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
            {/* Prev Section Button */}
            <button
              type="button"
              disabled={!(sectionHeaders.length > 0 && canPrevSection)}
              onClick={handlePrevSection}
              aria-label="Previous section"
              className={`p-3 rounded-2xl flex items-center justify-center transition-all ${
                sectionHeaders.length > 0 && canPrevSection
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95'
                  : 'bg-slate-900/40 text-slate-600 cursor-not-allowed'
              }`}
            >
              <ChevronUp className="w-6 h-6 stroke-[2.5]" />
            </button>

            {/* Transpose - */}
            <button
              type="button"
              onClick={() => handleTransposeChange(-1)}
              aria-label="Transpose down one semitone"
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 flex items-center justify-center transition-all"
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
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 border-2 ${
                isAutoScrolling
                  ? 'bg-red-600 border-red-500 text-white shadow-red-900/50'
                  : 'bg-sky-600 border-sky-400 text-white shadow-sky-900/50 hover:bg-sky-500'
              }`}
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
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95 flex items-center justify-center transition-all"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Next Section Button */}
            <button
              type="button"
              disabled={!(sectionHeaders.length > 0 && canNextSection)}
              onClick={handleNextSection}
              aria-label="Next section"
              className={`p-3 rounded-2xl flex items-center justify-center transition-all ${
                sectionHeaders.length > 0 && canNextSection
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 active:scale-95'
                  : 'bg-slate-900/40 text-slate-600 cursor-not-allowed'
              }`}
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
          canPrevSection={sectionHeaders.length > 0 && canPrevSection}
          canNextSection={sectionHeaders.length > 0 && canNextSection}
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
          captureScrollRatio()
          setFontSize(size)
          try {
            localStorage.setItem(STAGE_FONT_SIZE_KEY, String(size))
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
        wakeLockActive={wakeLockActive}
        onToggleWakeLock={() => setWakeLockActive((prev) => !prev)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreenSupported={fullscreenControllerRef.current?.isSupported ?? false}
        queueSongs={queue}
        currentQueueIndex={currentQueueIndex}
        onSelectQueueIndex={onSelectQueueIndex}
        setlistName={setlistName}
      />

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
