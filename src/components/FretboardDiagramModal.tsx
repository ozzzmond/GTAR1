import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { ChordVoicing } from '../utils/chordDictionary'
import { getAllChordVoicings } from '../utils/chordDictionary'
import { ChordSvgDiagram } from './ChordSvgDiagram'

export interface FretboardDiagramModalProps {
  voicing: ChordVoicing | null
  requestedChord?: string | null
  onClose: () => void
}

export const FretboardDiagramModal: React.FC<FretboardDiagramModalProps> = ({
  voicing: initialVoicing,
  requestedChord,
  onClose,
}) => {
  const chordTitle = initialVoicing?.chord || requestedChord || ''
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chordTitle) return
    const previousFocus = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector('button')?.focus()
    return () => { if (previousFocus?.isConnected) previousFocus.focus() }
  }, [chordTitle])

  const trapFocus = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!buttons?.length) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus()
    }
  }

  // Support cycling through multiple alternate voicings when available
  const allVoicings = React.useMemo(() => {
    if (!chordTitle) return []
    const list = getAllChordVoicings(chordTitle)
    if (list.length === 0 && initialVoicing) return [initialVoicing]
    return list
  }, [chordTitle, initialVoicing])

  const [activeVoicingIndex, setActiveVoicingIndex] = useState(0)

  // Reset active index when chord changes
  useEffect(() => {
    setActiveVoicingIndex(0)
  }, [chordTitle])

  // Global ESC key listener to dismiss modal
  useEffect(() => {
    if (!chordTitle) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chordTitle, onClose])

  if (!initialVoicing && !requestedChord) return null

  const activeVoicing = allVoicings[activeVoicingIndex] || initialVoicing

  const handlePrevVoicing = () => {
    setActiveVoicingIndex((prev) => (prev > 0 ? prev - 1 : allVoicings.length - 1))
  }

  const handleNextVoicing = () => {
    setActiveVoicingIndex((prev) => (prev < allVoicings.length - 1 ? prev + 1 : 0))
  }

  // Honest fallback state when no trusted voicing is cataloged
  if (!activeVoicing) {
    return (
      <div
        ref={dialogRef}
        onKeyDown={trapFocus}
        className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chord-modal-title"
      >
        <div
          className="relative w-full max-w-sm max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[20px] bg-app-surface border border-app-border p-6 shadow-2xl text-app-text select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-3 border-b border-app-border">
            <div>
              <h2 id="chord-modal-title" className="text-2xl font-black text-app-accent tracking-tight">
                {chordTitle}
              </h2>
              <p className="text-xs font-mono text-app-muted mt-0.5">Chord Voicing</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-w-11 min-h-11 flex items-center justify-center p-1.5 rounded-full text-app-muted hover:text-app-heading hover:bg-app-base transition-colors cursor-pointer"
              aria-label="Close Diagram"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-6 py-8 px-4 rounded-xl bg-app-base flex flex-col items-center justify-center border border-app-border text-center">
            <p className="text-sm font-semibold text-app-text">Chord diagram unavailable</p>
            <p className="text-xs text-app-muted mt-1.5 max-w-[220px]">
              No trusted guitar fingering is currently cataloged for this chord.
            </p>
          </div>

          <p className="text-[11px] text-center text-app-muted mt-4">
            Click outside or press <span className="font-mono text-app-action">ESC</span> to dismiss
          </p>
        </div>
      </div>
    )
  }

  const fretsSummary = activeVoicing.frets
    .map((f) => (f === -1 ? 'x' : f.toString()))
    .join(' ')

  return (
    <div
      ref={dialogRef}
      onKeyDown={trapFocus}
      className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chord-modal-title"
    >
      <div
        className="relative w-full max-w-sm max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[20px] bg-app-surface border border-app-border p-6 shadow-2xl text-app-text select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Chord Name, Frets & Close */}
        <div className="flex items-center justify-between pb-3 border-b border-app-border">
          <div>
            <h2 id="chord-modal-title" className="text-2xl font-black text-app-accent tracking-tight">
              {activeVoicing.chord}
            </h2>
            <p className="text-xs font-mono text-app-muted mt-0.5">
              Frets: <span className="text-app-text font-bold">{fretsSummary}</span>
              {activeVoicing.baseFret > 1 ? ` • Base: ${activeVoicing.baseFret}fr` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-11 min-h-11 flex items-center justify-center p-1.5 rounded-full text-app-muted hover:text-app-heading hover:bg-app-base transition-colors cursor-pointer"
            aria-label="Close Diagram"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alternate Voicing Selector (if multiple shapes exist) */}
        {allVoicings.length > 1 && (
          <div className="mt-3 flex items-center justify-between px-2 py-1.5 rounded-lg bg-app-base border border-app-border text-xs font-mono">
            <button
              type="button"
              onClick={handlePrevVoicing}
              className="min-w-11 min-h-11 justify-center p-1 rounded text-app-muted hover:text-app-text hover:bg-app-surface transition-colors cursor-pointer flex items-center"
              aria-label="Previous voicing"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-app-muted">
              Voicing <strong className="text-app-text">{activeVoicingIndex + 1}</strong> of{' '}
              <strong className="text-app-text">{allVoicings.length}</strong>
            </span>
            <button
              type="button"
              onClick={handleNextVoicing}
              className="min-w-11 min-h-11 justify-center p-1 rounded text-app-muted hover:text-app-text hover:bg-app-surface transition-colors cursor-pointer flex items-center"
              aria-label="Next voicing"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Fretboard SVG Canvas */}
        <div className="mt-4 p-2 rounded-xl bg-app-base flex flex-col items-center justify-center border border-app-border">
          <ChordSvgDiagram voicing={activeVoicing} width={240} height={260} compact={false} />
        </div>

        {/* Footer info */}
        <p className="text-[11px] text-center text-app-muted mt-3">
          Click outside or press <span className="font-mono text-app-action">ESC</span> to dismiss
        </p>
      </div>
    </div>
  )
}
