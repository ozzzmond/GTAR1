import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'

export interface DockPosition {
  x: number
  y: number
}

export interface ViewportSize {
  width: number
  height: number
}

export const DOCK_SIZE = {
  width: 76,
  height: 236,
}

export const DOCK_DEFAULT_MARGINS = {
  right: 16,
  bottom: 88,
  min: 12,
}

export const DRAG_THRESHOLD_PX = 8
export const LONG_PRESS_MS = 500
export const STAGE_DOCK_POSITION_KEY = 'gtar1_stage_dock_pos'

/**
 * Calculates safe default dock position in bottom-right corner.
 */
export function getDefaultDockPosition(
  viewport: ViewportSize,
  dockSize: { width: number; height: number } = DOCK_SIZE,
  marginRight = DOCK_DEFAULT_MARGINS.right,
  marginBottom = DOCK_DEFAULT_MARGINS.bottom
): DockPosition {
  const safeW = typeof viewport.width === 'number' && !isNaN(viewport.width) && viewport.width > 0 ? viewport.width : 1024
  const safeH = typeof viewport.height === 'number' && !isNaN(viewport.height) && viewport.height > 0 ? viewport.height : 768
  return {
    x: Math.max(DOCK_DEFAULT_MARGINS.min, safeW - dockSize.width - marginRight),
    y: Math.max(DOCK_DEFAULT_MARGINS.min, safeH - dockSize.height - marginBottom),
  }
}

/**
 * Clamps coordinates to reachable stage viewport bounds.
 */
export function clampDockPosition(
  pos: DockPosition,
  viewport: ViewportSize,
  dockSize: { width: number; height: number } = DOCK_SIZE,
  minMargin = DOCK_DEFAULT_MARGINS.min
): DockPosition {
  const safeW = typeof viewport.width === 'number' && !isNaN(viewport.width) && viewport.width > 0 ? viewport.width : 1024
  const safeH = typeof viewport.height === 'number' && !isNaN(viewport.height) && viewport.height > 0 ? viewport.height : 768

  const minX = minMargin
  const maxX = Math.max(minMargin, safeW - dockSize.width - minMargin)
  const minY = minMargin
  const maxY = Math.max(minMargin, safeH - dockSize.height - minMargin)

  const rawX = typeof pos.x === 'number' && !isNaN(pos.x) ? pos.x : maxX
  const rawY = typeof pos.y === 'number' && !isNaN(pos.y) ? pos.y : maxY

  return {
    x: Math.min(Math.max(rawX, minX), maxX),
    y: Math.min(Math.max(rawY, minY), maxY),
  }
}

/**
 * Reads locally persisted dock position from storage.
 */
export function readPersistedDockPosition(
  storage: Pick<Storage, 'getItem'> = typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null } as any,
  viewport: ViewportSize = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }
): DockPosition {
  try {
    const raw = storage.getItem(STAGE_DOCK_POSITION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DockPosition>
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number' && !isNaN(parsed.x) && !isNaN(parsed.y)) {
        return clampDockPosition({ x: parsed.x, y: parsed.y }, viewport)
      }
    }
  } catch {
    // Ignore JSON errors and fallback
  }
  return getDefaultDockPosition(viewport)
}

/**
 * Writes locally persisted dock position to storage.
 */
export function persistDockPosition(
  pos: DockPosition,
  storage: Pick<Storage, 'setItem'> = typeof localStorage !== 'undefined' ? localStorage : { setItem: () => {} } as any
): void {
  try {
    storage.setItem(STAGE_DOCK_POSITION_KEY, JSON.stringify(pos))
  } catch {
    // Silently ignore quota errors
  }
}

export interface StageControlDockProps {
  isAutoScrolling: boolean
  onToggleAutoScroll: () => void
  onOpenStageOptions: () => void
  onPrevSection: () => void
  onNextSection: () => void
  canPrevSection?: boolean
  canNextSection?: boolean
  visible?: boolean
  onUserInteraction?: () => void
}

export const StageControlDock: React.FC<StageControlDockProps> = ({
  isAutoScrolling,
  onToggleAutoScroll,
  onOpenStageOptions,
  onPrevSection,
  onNextSection,
  canPrevSection = true,
  canNextSection = true,
  visible = true,
  onUserInteraction,
}) => {
  const [position, setPosition] = useState<DockPosition>(() => {
    return readPersistedDockPosition()
  })

  const activePointerRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    dockStartX: number
    dockStartY: number
    isDragging: boolean
    isLongPress: boolean
    timer: ReturnType<typeof setTimeout> | null
    target: 'autoscroll' | 'prev' | 'next' | 'dock'
  } | null>(null)

  const dockRef = useRef<HTMLDivElement>(null)

  // Re-clamp position on window resize or device orientation change
  useEffect(() => {
    const handleResize = () => {
      const currentViewport: ViewportSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      }
      setPosition((prev) => {
        const reclamped = clampDockPosition(prev, currentViewport)
        persistDockPosition(reclamped)
        return reclamped
      })
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
      if (activePointerRef.current?.timer) {
        clearTimeout(activePointerRef.current.timer)
        activePointerRef.current.timer = null
      }
    }
  }, [])

  const handlePointerStart = (
    e: React.PointerEvent,
    target: 'autoscroll' | 'prev' | 'next' | 'dock'
  ) => {
    onUserInteraction?.()

    if (activePointerRef.current) {
      if (activePointerRef.current.timer) {
        clearTimeout(activePointerRef.current.timer)
      }
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Guard pointer capture
    }

    const startX = e.clientX
    const startY = e.clientY
    const dockStartX = position.x
    const dockStartY = position.y

    let timer: ReturnType<typeof setTimeout> | null = null

    if (target === 'autoscroll') {
      timer = setTimeout(() => {
        if (activePointerRef.current && !activePointerRef.current.isDragging) {
          activePointerRef.current.isLongPress = true
          onOpenStageOptions()
        }
      }, LONG_PRESS_MS)
    }

    activePointerRef.current = {
      pointerId: e.pointerId,
      startX,
      startY,
      dockStartX,
      dockStartY,
      isDragging: false,
      isLongPress: false,
      timer,
      target,
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const state = activePointerRef.current
    if (!state || state.pointerId !== e.pointerId) return

    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY

    if (!state.isDragging) {
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist >= DRAG_THRESHOLD_PX) {
        state.isDragging = true
        if (state.timer) {
          clearTimeout(state.timer)
          state.timer = null
        }
      }
    }

    if (state.isDragging) {
      const viewport: ViewportSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      }
      const rawPos = {
        x: state.dockStartX + dx,
        y: state.dockStartY + dy,
      }
      const clamped = clampDockPosition(rawPos, viewport)
      setPosition(clamped)
    }
  }

  const handlePointerEnd = (e: React.PointerEvent) => {
    const state = activePointerRef.current
    if (!state || state.pointerId !== e.pointerId) return

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Guard release
    }

    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }

    const wasDragging = state.isDragging
    const wasLongPress = state.isLongPress
    const target = state.target
    activePointerRef.current = null

    if (wasDragging) {
      const viewport: ViewportSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      }
      const finalPos = clampDockPosition(position, viewport)
      persistDockPosition(finalPos)
      return
    }

    if (wasLongPress) {
      return
    }

    if (target === 'autoscroll') {
      onToggleAutoScroll()
    } else if (target === 'prev' && canPrevSection) {
      onPrevSection()
    } else if (target === 'next' && canNextSection) {
      onNextSection()
    }
  }

  const handleResetDefaultPosition = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const viewport: ViewportSize = {
      width: window.innerWidth,
      height: window.innerHeight,
    }
    const def = getDefaultDockPosition(viewport)
    setPosition(def)
    persistDockPosition(def)
  }, [])

  return (
    <div
      ref={dockRef}
      role="toolbar"
      aria-label="Stage Control Dock"
      data-stage-dock="true"
      onPointerMove={handlePointerMove}
      className={`fixed z-40 select-none touch-none flex flex-col items-center gap-2 p-2 rounded-full
                 bg-app-surface/95 backdrop-blur-md border border-app-border shadow-2xl transition-opacity duration-300 ${
                   visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                 }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${DOCK_SIZE.width}px`,
      }}
    >
      {/* Top Drag Grip & Reset Target */}
      <div
        onPointerDown={(e) => handlePointerStart(e, 'dock')}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleResetDefaultPosition}
        aria-label="Reposition stage control dock"
        title="Drag to reposition, double-click to reset"
        className="w-full flex items-center justify-center py-1 cursor-grab active:cursor-grabbing text-app-muted hover:text-app-accent transition-colors"
      >
        <GripVertical className="w-4 h-4 rotate-90" />
      </div>

      {/* Previous Section Button */}
      <button
        type="button"
        disabled={!canPrevSection}
        onPointerDown={(e) => handlePointerStart(e, 'prev')}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={`w-14 h-14 min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center transition-all cursor-pointer select-none active:scale-90 ${
          canPrevSection
            ? 'bg-app-button border border-app-border text-app-button-text hover:text-app-accent hover:border-app-accent shadow-md'
            : 'bg-app-button/40 border border-app-border/30 text-app-muted/40 cursor-not-allowed'
        }`}
        aria-label="Jump to previous section"
      >
        <ChevronUp className="w-8 h-8 stroke-[3]" />
      </button>

      {/* Center Autoscroll FAB Button with Long-Press Stage Options */}
      <button
        type="button"
        onPointerDown={(e) => handlePointerStart(e, 'autoscroll')}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={`w-15 h-15 min-w-[60px] min-h-[60px] rounded-full flex items-center justify-center shadow-xl transition-all active:scale-95 cursor-pointer select-none border-2 ${
          isAutoScrolling
            ? 'bg-status-error border-status-error/70 text-white hover:brightness-110 shadow-lg'
            : 'bg-app-action border-app-action/70 text-app-on-action hover:brightness-110 shadow-lg'
        }`}
        aria-label={
          isAutoScrolling
            ? 'Pause autoscroll. Long press to open stage options'
            : 'Start autoscroll. Long press to open stage options'
        }
      >
        {isAutoScrolling ? (
          <Pause className="w-6 h-6 fill-current" />
        ) : (
          <Play className="w-6 h-6 fill-current ml-0.5" />
        )}
      </button>

      {/* Next Section Button */}
      <button
        type="button"
        disabled={!canNextSection}
        onPointerDown={(e) => handlePointerStart(e, 'next')}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={`w-14 h-14 min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center transition-all cursor-pointer select-none active:scale-90 ${
          canNextSection
            ? 'bg-app-button border border-app-border text-app-button-text hover:text-app-accent hover:border-app-accent shadow-md'
            : 'bg-app-button/40 border border-app-border/30 text-app-muted/40 cursor-not-allowed'
        }`}
        aria-label="Jump to next section"
      >
        <ChevronDown className="w-8 h-8 stroke-[3]" />
      </button>
    </div>
  )
}
