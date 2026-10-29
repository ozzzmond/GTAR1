import React, { useEffect, useRef, useState } from 'react'
import { Gauge, Sliders, Volume2, X } from 'lucide-react'
import { MetronomeEngine } from '../utils/metronome'
import { GuitarReferenceTuner, GUITAR_STRINGS } from '../utils/guitarTuner'

/** Local-only panels for metronome and guitar reference tuner; GTAR1 sheet conventions. */
export function StageToolsModal({ onClose, initialBpm }: { onClose: () => void; initialBpm?: number }) {
  const [tab, setTab] = useState<'metronome' | 'tuner'>('metronome')
  const [metronome] = useState(() => {
    const engine = new MetronomeEngine()
    if (initialBpm) engine.setBpm(initialBpm)
    return engine
  })
  const [metro, setMetro] = useState(() => metronome.getState())
  const [activeString, setActiveString] = useState<string | null>(null)
  const [tuner] = useState(() => new GuitarReferenceTuner(setActiveString))
  const [error, setError] = useState('')
  const tapTimes = useRef<number[]>([])
  const dialog = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const buttonClass = 'min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border border-app-border bg-app-button hover:brightness-110 text-app-button-text font-semibold focus-visible:outline-2 focus-visible:outline-app-action'

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const unsubscribe = metronome.subscribe(setMetro)
    const silence = () => { metronome.dispose(); tuner.dispose() }
    const visibility = () => { if (document.hidden) silence() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', silence)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', silence)
      silence()
      if (previous?.isConnected) previous.focus()
    }
  }, [metronome, tuner])

  const switchTab = (next: typeof tab) => {
    metronome.stop()
    tuner.stop()
    setError('')
    setTab(next)
  }
  const tapTempo = () => {
    const now = performance.now()
    const recent = [...tapTimes.current, now].filter(t => now - t < 3000)
    tapTimes.current = recent
    if (recent.length < 2) return
    const average = (recent[recent.length - 1] - recent[0]) / (recent.length - 1)
    const bpm = Math.round(60000 / average)
    if (bpm >= 30 && bpm <= 300) metronome.setBpm(bpm)
  }
  const handleKeys = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key !== 'Tab') return
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select') || [])
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Stage Tools" onKeyDown={handleKeys}
        className="relative w-full sm:max-w-lg max-h-[90dvh] rounded-t-3xl sm:rounded-3xl bg-app-surface border border-app-border shadow-2xl overflow-hidden flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <header className="px-5 py-3 border-b border-app-border flex items-center justify-between shrink-0">
          <h2 className="font-bold text-app-heading">Stage Tools</h2>
          <button ref={closeButton} type="button" aria-label="Close Stage Tools" onClick={onClose} className={buttonClass}><X className="w-5 h-5" /></button>
        </header>
        <div className="grid grid-cols-2 gap-2 p-3 border-b border-app-border" role="group" aria-label="Musician tools">
          <button type="button" aria-pressed={tab === 'metronome'} onClick={() => switchTab('metronome')} className={`${buttonClass} ${tab === 'metronome' ? 'aria-pressed:bg-app-action aria-pressed:text-app-on-action aria-pressed:border-app-action' : ''}`}><Gauge className="inline w-4 h-4 mr-2" />Metronome</button>
          <button type="button" aria-pressed={tab === 'tuner'} onClick={() => switchTab('tuner')} className={`${buttonClass} ${tab === 'tuner' ? 'aria-pressed:bg-app-action aria-pressed:text-app-on-action aria-pressed:border-app-action' : ''}`}><Sliders className="inline w-4 h-4 mr-2" />Guitar Tuner</button>
        </div>
        <div className="p-5 overflow-y-auto overscroll-contain space-y-4">
          {error && <p role="alert" className="text-status-warning text-sm">{error}</p>}
          {tab === 'metronome' ? <div className="space-y-4 text-center">
            <div className="text-5xl font-black font-mono text-app-heading" data-testid="metronome-bpm">{metro.bpm}<span className="block text-xs text-app-action mt-1">BPM</span></div>
            <input type="range" min="30" max="300" step="1" value={metro.bpm} aria-label="Metronome BPM" onChange={event => metronome.setBpm(Number(event.target.value))} className="w-full accent-app-action min-h-[44px]" />
            <div className="flex flex-wrap items-center justify-center gap-1">
              {[-5, -1].map(delta => <button type="button" key={delta} className={buttonClass} aria-label={`Decrease BPM by ${-delta}`} onClick={() => metronome.setBpm(metro.bpm + delta)}>{delta}</button>)}
              <button type="button" className={buttonClass} onClick={tapTempo}>Tap Tempo</button>
              {[1, 5].map(delta => <button type="button" key={delta} className={buttonClass} aria-label={`Increase BPM by ${delta}`} onClick={() => metronome.setBpm(metro.bpm + delta)}>+{delta}</button>)}
            </div>
            <label className="flex items-center justify-between gap-3 text-sm text-app-text">Beats per bar
              <select className={buttonClass} aria-label="Beats per bar" value={metro.beatsPerBar} onChange={event => metronome.setBeatsPerBar(Number(event.target.value))}>
                {Array.from({ length: 16 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap justify-center gap-2" aria-label={metro.isRunning ? `Beat ${metro.currentBeat} of ${metro.beatsPerBar}` : 'Metronome stopped'}>
              {Array.from({ length: metro.beatsPerBar }, (_, i) => <span key={i} className={`w-6 h-6 rounded-full text-xs flex items-center justify-center ${metro.isRunning && metro.currentBeat === i + 1 ? 'bg-app-action text-app-on-action' : 'bg-app-button text-app-muted'}`}>{i + 1}</span>)}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className={buttonClass} aria-pressed={metro.isMuted} onClick={() => metronome.toggleMute()}>{metro.isMuted ? 'Unmute' : 'Mute'}</button>
              <label className="flex-1 text-sm text-app-text">Volume {Math.round(metro.volume * 100)}%
                <input type="range" min="0" max="1" step="0.05" value={metro.volume} aria-label="Metronome volume" onChange={event => metronome.setVolume(Number(event.target.value))} className="w-full accent-app-action min-h-[44px]" />
              </label>
            </div>
            <button type="button" className={`${buttonClass} w-full`} onClick={() => {
              setError('')
              if (metro.isRunning) metronome.stop()
              else void metronome.start().catch(error => setError(error instanceof Error ? error.message : 'Audio could not start.'))
            }}>{metro.isRunning ? 'Stop Metronome' : 'Start Metronome'}</button>
          </div> : <div className="space-y-4">
            <h3 className="text-center text-app-text text-sm">Guitar reference tones</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {GUITAR_STRINGS.map(string => <button type="button" key={string.name} aria-pressed={activeString === string.name} className={`${buttonClass} flex flex-col items-center gap-1 ${activeString === string.name ? 'aria-pressed:bg-app-action aria-pressed:text-app-on-action aria-pressed:border-app-action' : ''}`} onClick={() => {
                setError('')
                void tuner.play(string.name).catch(error => setError(error instanceof Error ? error.message : 'Audio could not start.'))
              }}><Volume2 className="w-4 h-4" /><span>{string.name}</span><span className="text-xs font-mono">{string.freq.toFixed(1)} Hz</span></button>)}
            </div>
            <button type="button" className={`${buttonClass} w-full`} onClick={() => tuner.stop()}>Stop reference tone</button>
          </div>}
        </div>
      </div>
    </div>
  )
}
