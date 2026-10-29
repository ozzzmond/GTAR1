/** Selectively adapted from Legacy GTAR web/src/utils/metronome.ts.
 * Same beat/accent sound and controls; instance-owned audio with cancellable startup.
 */
export interface MetronomeState {
  isRunning: boolean
  isMuted: boolean
  bpm: number
  beatsPerBar: number
  currentBeat: number
  volume: number
}
export function createAudioContext(): AudioContext {
  const Constructor = window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Constructor) throw new Error('Audio is not supported in this browser.')
  return new Constructor()
}

export class MetronomeEngine {
  private audioCtx: AudioContext | null = null
  private output: GainNode | null = null
  private timerId: number | null = null
  private visualTimers = new Set<number>()
  private voices = new Set<OscillatorNode>()
  private generation = 0
  private nextTime = 0
  private nextBeat = 1
  private listeners = new Set<(state: MetronomeState) => void>()
  private state: MetronomeState = {
    isRunning: false, isMuted: false, bpm: 120, beatsPerBar: 4, currentBeat: 1, volume: 1,
  }

  public subscribe(listener: (state: MetronomeState) => void) {
    this.listeners.add(listener)
    listener(this.getState())
    return () => { this.listeners.delete(listener) }
  }
  private emitState() { this.listeners.forEach(listener => listener(this.getState())) }
  public getState() { return { ...this.state } }
  public setBpm(bpm: number) {
    if (!Number.isFinite(bpm)) return
    this.state.bpm = Math.max(30, Math.min(300, Math.round(bpm)))
    this.emitState()
  }
  public setBeatsPerBar(beats: number) {
    if (!Number.isFinite(beats)) return
    this.state.beatsPerBar = Math.max(1, Math.min(16, Math.round(beats)))
    if (this.nextBeat > this.state.beatsPerBar) this.nextBeat = 1
    this.emitState()
  }
  public toggleMute() {
    this.state.isMuted = !this.state.isMuted
    this.updateVolume()
  }
  public setVolume(volume: number) {
    if (!Number.isFinite(volume)) return
    this.state.volume = Math.max(0, Math.min(1, volume))
    this.updateVolume()
  }
  private updateVolume() {
    if (this.output && this.audioCtx) {
      this.output.gain.setValueAtTime(this.state.isMuted ? 0 : this.state.volume, this.audioCtx.currentTime)
    }
    this.emitState()
  }
  private playClick(beat: number, time: number) {
    const ctx = this.audioCtx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    // Legacy downbeat/accent and envelope.
    osc.frequency.setValueAtTime(beat === 1 ? 1200 : 800, time)
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04)
    osc.connect(gain)
    gain.connect(this.output!)
    this.voices.add(osc)
    osc.onended = () => { osc.disconnect(); gain.disconnect(); this.voices.delete(osc) }
    osc.start(time)
    osc.stop(time + 0.05)
  }
  private schedule = () => {
    if (!this.state.isRunning || !this.audioCtx) return
    const now = this.audioCtx.currentTime
    // Drop missed beats rather than burst after a blocked main thread.
    if (this.nextTime < now - 0.1) this.nextTime = now
    while (this.nextTime < now + 0.1) {
      const beat = this.nextBeat
      this.playClick(beat, this.nextTime)
      const timer = window.setTimeout(() => {
        this.visualTimers.delete(timer)
        if (this.state.isRunning) { this.state.currentBeat = beat; this.emitState() }
      }, Math.max(0, (this.nextTime - now) * 1000))
      this.visualTimers.add(timer)
      this.nextBeat = beat >= this.state.beatsPerBar ? 1 : beat + 1
      this.nextTime += 60 / this.state.bpm
    }
  }
  public async start() {
    if (this.state.isRunning) return
    const generation = ++this.generation
    try {
      if (!this.audioCtx) {
        this.audioCtx = createAudioContext()
        this.output = this.audioCtx.createGain()
        this.output.connect(this.audioCtx.destination)
        this.audioCtx.onstatechange = () => {
          if (this.state.isRunning && this.audioCtx?.state !== 'running') this.stop()
        }
      }
      const ctx = this.audioCtx
      if (ctx.state !== 'running') await ctx.resume()
      if (generation !== this.generation) return
      if (ctx.state !== 'running') throw new Error('Audio could not start. Tap Start to retry.')
      this.state.isRunning = true
      this.state.currentBeat = this.nextBeat = 1
      this.nextTime = ctx.currentTime
      this.updateVolume()
      this.schedule()
      this.timerId = window.setInterval(this.schedule, 25)
    } catch (error) {
      if (generation !== this.generation) return
      this.stop()
      throw error
    }
  }
  public stop() {
    ++this.generation
    if (this.timerId !== null) window.clearInterval(this.timerId)
    this.timerId = null
    this.visualTimers.forEach(timer => window.clearTimeout(timer))
    this.visualTimers.clear()
    this.voices.forEach(osc => { try { osc.stop(); osc.disconnect() } catch {} })
    this.voices.clear()
    this.state.isRunning = false
    this.state.currentBeat = 1
    this.emitState()
  }
  public dispose() {
    this.stop()
    const ctx = this.audioCtx
    this.audioCtx = null
    this.output?.disconnect()
    this.output = null
    if (ctx) { ctx.onstatechange = null; void ctx.close().catch(() => {}) }
  }
}
