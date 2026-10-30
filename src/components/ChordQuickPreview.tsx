import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { ChordVoicing } from '../utils/chordDictionary'
import { ChordSvgDiagram } from './ChordSvgDiagram'

export interface ChordQuickPreviewAnchor {
  rect: DOMRect
  chord: string
}

export interface ChordQuickPreviewProps {
  anchor: ChordQuickPreviewAnchor | null
  voicing: ChordVoicing | null
  onOpenDiagram?: (chord: string, voicing: ChordVoicing | null) => void
  onClose: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  focusOnOpen?: boolean
}

export const ChordQuickPreview: React.FC<ChordQuickPreviewProps> = ({
  anchor,
  voicing,
  onOpenDiagram,
  onClose,
  onMouseEnter,
  onMouseLeave,
  focusOnOpen = false,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [resizeTick, setResizeTick] = useState(0)
  const [measuredHeight, setMeasuredHeight] = useState(320)

  useLayoutEffect(() => {
    if (anchor) setMeasuredHeight(popoverRef.current?.getBoundingClientRect().height || 320)
  }, [anchor, voicing, resizeTick])

  useEffect(() => {
    if (anchor && focusOnOpen) popoverRef.current?.querySelector('button')?.focus()
  }, [anchor, focusOnOpen])

  // Listen for window resize to update positioning if anchor is active
  useEffect(() => {
    if (!anchor) return
    const handleResize = () => setResizeTick((t) => t + 1)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [anchor])

  // Global ESC key listener to dismiss quick preview
  useEffect(() => {
    if (!anchor) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [anchor, onClose])

  if (!anchor) return null

  // Derived dimensions
  const popoverWidth = Math.min(210, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 24)
  const popoverHeight = Math.min(measuredHeight, (typeof window !== 'undefined' ? window.innerHeight : 768) - 24)
  const gap = 8
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768

  const anchorRect = anchor.rect

  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2
  const minPadding = 12
  if (left < minPadding) left = minPadding
  if (left + popoverWidth > viewportWidth - minPadding) {
    left = viewportWidth - minPadding - popoverWidth
  }

  let top = anchorRect.top - popoverHeight - gap
  if (top < minPadding) {
    top = anchorRect.bottom + gap
    if (top + popoverHeight > viewportHeight - minPadding) {
      top = Math.max(minPadding, viewportHeight - minPadding - popoverHeight)
    }
  }

  const displayChord = anchor.chord

  return (
    <div
      ref={popoverRef}
      data-chord-preview="true"
      role="dialog"
      aria-label={`${anchor.chord} quick preview`}
      aria-live="polite"
      className="fixed z-[100] rounded-2xl bg-app-surface border border-app-border shadow-2xl p-3 text-app-text select-none animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        width: `${popoverWidth}px`,
        maxHeight: 'calc(100dvh - 24px)',
        overflowY: 'auto',
        pointerEvents: 'auto',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header: Chord Name & Close */}
      <div className="flex items-center justify-between pb-1.5 border-b border-app-border">
        <div className="flex items-baseline gap-1.5 overflow-hidden">
          <span className="text-lg font-black text-app-accent tracking-tight truncate">
            {displayChord}
          </span>
          <span className="text-[10px] font-mono text-app-muted">Guitar</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-md text-app-muted hover:text-app-heading hover:bg-app-base transition-colors cursor-pointer"
            aria-label="Dismiss quick preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: SVG Diagram or Unavailable state */}
      {voicing ? (
        <div className="flex flex-col items-center justify-center pt-2 pb-1">
          <ChordSvgDiagram voicing={voicing} width={170} height={185} compact={true} />
          {voicing.baseFret > 1 && (
            <p className="text-[10px] font-mono text-app-muted text-center mt-1">
              Fret offset: {voicing.baseFret}
            </p>
          )}
        </div>
      ) : (
        <div className="py-4 px-2 text-center">
          <p className="text-xs font-semibold text-app-text">Diagram unavailable</p>
          <p className="text-[10px] text-app-muted mt-1 leading-tight">
            No trusted shape cataloged for this chord.
          </p>
        </div>
      )}

      {/* Footer tip */}
      <div className="pt-1.5 border-t border-app-border flex items-center justify-between text-[9px] font-mono text-app-muted">
        {onOpenDiagram && <button type="button" className="min-h-11 p-2 text-xs text-app-action cursor-pointer" onClick={() => onOpenDiagram(displayChord, voicing)}>Open Full Diagram</button>}
        <span>ESC to close</span>
      </div>
    </div>
  )
}
