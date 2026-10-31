import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getChordVoicing } from '../utils/chordDictionary'
import { ChordQuickPreview, type ChordQuickPreviewAnchor } from './ChordQuickPreview'
import { FretboardDiagramModal } from './FretboardDiagramModal'

/** Shared, offline Legacy preview -> full diagram flow for both song readers. */
export function useChordDiagrams(context: string, enabled: boolean) {
  const [anchor, setAnchor] = useState<ChordQuickPreviewAnchor | null>(null)
  const [selectedChord, setSelectedChord] = useState<string | null>(null)
  const [pinned, setPinned] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  const pinnedRef = useRef(false)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const dismissedTrigger = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const close = useCallback(() => {
    cancelTimer()
    // Removing an overlapping popup can expose its trigger under a stationary
    // pointer and synthesize mouseenter. Keep Escape/close effective until exit.
    const rect = trigger.current?.getBoundingClientRect()
    const point = pointer.current
    dismissedTrigger.current = rect && point && point.x >= rect.left && point.x <= rect.right
      && point.y >= rect.top && point.y <= rect.bottom ? trigger.current : null
    setAnchor(null)
    setSelectedChord(null)
    if (pinnedRef.current) trigger.current?.focus()
    pinnedRef.current = false
    setPinned(false)
  }, [cancelTimer])

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY }
      if (dismissedTrigger.current && !dismissedTrigger.current.contains(event.target as Node)) dismissedTrigger.current = null
    }
    document.addEventListener('pointermove', trackPointer)
    document.addEventListener('pointerdown', trackPointer)
    return () => {
      document.removeEventListener('pointermove', trackPointer)
      document.removeEventListener('pointerdown', trackPointer)
    }
  }, [])

  useEffect(() => { close() }, [context, enabled, close])
  useEffect(() => cancelTimer, [cancelTimer])
  useEffect(() => {
    if (!anchor) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !(target instanceof Element && target.closest('[data-chord-preview]'))) close()
    }
    const scroll = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest('[data-chord-preview]'))) close()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [anchor, close])

  const onChordClick = (chord: string, target?: HTMLElement) => {
    if (!enabled) return
    cancelTimer()
    dismissedTrigger.current = null
    trigger.current = target || null
    pinnedRef.current = true
    setPinned(true)
    if (!target || (pinned && anchor?.chord === chord)) {
      setSelectedChord(chord)
      setAnchor(null)
    } else {
      setAnchor({ chord, rect: target.getBoundingClientRect() })
    }
  }
  const onChordHover = (chord: string, target: HTMLElement) => {
    cancelTimer()
    if (!enabled || pinnedRef.current || selectedChord || dismissedTrigger.current === target) return
    timer.current = setTimeout(() => {
      trigger.current = target
      setAnchor({ chord, rect: target.getBoundingClientRect() })
    }, 250)
  }
  const onChordLeave = () => {
    dismissedTrigger.current = null
    cancelTimer()
    if (!pinnedRef.current) timer.current = setTimeout(close, 200)
  }
  const overlays = typeof document === 'undefined' ? null : createPortal(
    <>
      <ChordQuickPreview anchor={anchor} voicing={anchor ? getChordVoicing(anchor.chord) : null}
        focusOnOpen={pinned} onClose={close} onMouseEnter={cancelTimer} onMouseLeave={onChordLeave}
        onOpenDiagram={(chord) => { cancelTimer(); pinnedRef.current = true; setPinned(true); setSelectedChord(chord); setAnchor(null) }} />
      <FretboardDiagramModal requestedChord={selectedChord}
        voicing={selectedChord ? getChordVoicing(selectedChord) : null} onClose={close} />
    </>, document.fullscreenElement || document.body)
  return { onChordClick, onChordHover, onChordLeave, overlays, isOpen: !!(anchor || selectedChord) }
}
