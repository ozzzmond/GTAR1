/** Reference strings and triangle-tone playback for GTAR1.
 * No microphone, permissions, persistence, or remote playback.
 */
import { createAudioContext } from './metronome'
export const GUITAR_STRINGS = [
  { name: 'E2 (6th)', freq: 82.41 },
  { name: 'A2 (5th)', freq: 110.0 },
  { name: 'D3 (4th)', freq: 146.83 },
  { name: 'G3 (3rd)', freq: 196.0 },
  { name: 'B3 (2nd)', freq: 246.94 },
  { name: 'E4 (1st)', freq: 329.63 },
] as const

export class GuitarReferenceTuner {
  private ctx: AudioContext | null = null
  private osc: OscillatorNode | null = null
  private gain: GainNode | null = null
  private generation = 0
  private selected: string | null = null
  constructor(private onChange: (name: string | null) => void) {}
  public stop() {
    ++this.generation
    if (this.osc) { try { this.osc.stop(); this.osc.disconnect() } catch {} }
    this.gain?.disconnect()
    this.osc = this.gain = null
    this.selected = null
    this.onChange(null)
  }
  public async play(name: string) {
    const string = GUITAR_STRINGS.find(item => item.name === name)
    if (!string) return
    const wasSelected = this.selected === name
    this.stop()
    if (wasSelected) return
    const generation = this.generation
    this.selected = name
    try {
      if (!this.ctx) {
        this.ctx = createAudioContext()
        this.ctx.onstatechange = () => { if (this.ctx?.state !== 'running') this.stop() }
      }
      const ctx = this.ctx
      if (ctx.state !== 'running') await ctx.resume()
      if (generation !== this.generation) return
      if (ctx.state !== 'running') throw new Error('Audio could not start. Tap a string to retry.')
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      this.osc = osc
      this.gain = gain
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(string.freq, ctx.currentTime)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      this.onChange(name)
    } catch (error) {
      if (generation !== this.generation) return
      this.stop()
      throw error
    }
  }
  public dispose() {
    this.stop()
    const ctx = this.ctx
    this.ctx = null
    if (ctx) { ctx.onstatechange = null; void ctx.close().catch(() => {}) }
  }
}
