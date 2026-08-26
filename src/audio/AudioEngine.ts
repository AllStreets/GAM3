/**
 * Synthesized situation-room audio. Zero assets. The AudioContext is created
 * lazily on the first user gesture (autoplay policy); every method is a safe
 * no-op before init and on the server.
 */
class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private rumbleGain: GainNode | null = null
  private rumbleSrc: AudioBufferSourceNode | null = null
  private armed = false
  private muted = typeof window !== 'undefined' && window.localStorage?.getItem('hyperion-muted') === '1'
  private static BASE_VOLUME = 0.18

  /** Install one-time gesture listeners that boot the context + ambient bed. */
  armGesture() {
    if (this.armed || typeof window === 'undefined') return
    this.armed = true
    const boot = () => {
      window.removeEventListener('pointerdown', boot)
      window.removeEventListener('keydown', boot)
      this.init()
    }
    window.addEventListener('pointerdown', boot)
    window.addEventListener('keydown', boot)
  }

  private init() {
    if (this.ctx) return
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : AudioEngine.BASE_VOLUME
    this.master.connect(this.ctx.destination)
    this.startAmbient()
  }

  /** Whether audio is currently muted (persisted across sessions). */
  isMuted(): boolean {
    return this.muted
  }

  /** Mute/unmute all audio; persisted to localStorage. */
  setMuted(m: boolean) {
    this.muted = m
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('hyperion-muted', m ? '1' : '0') } catch { /* ignore */ }
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : AudioEngine.BASE_VOLUME, this.ctx.currentTime, 0.02)
    }
  }

  /** Very quiet filtered-noise drone with a slow LFO swell. */
  private startAmbient() {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const len = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02 // brown-ish noise
      data[i] = last * 3.5
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 160
    const gain = ctx.createGain()
    gain.gain.value = 0.35
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.12
    lfo.connect(lfoGain).connect(gain.gain)
    src.connect(filter).connect(gain).connect(this.master)
    src.start()
    lfo.start()
  }

  private blip(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', when = 0) {
    if (!this.ctx || !this.master) return
    const t0 = this.ctx.currentTime + when
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  /** Short UI confirmation tick. */
  uiTick() {
    this.blip(1320, 0.05, 0.5, 'square')
  }

  /** Two-tone comms chirp (selection). */
  chirp() {
    this.blip(880, 0.06, 0.5)
    this.blip(1245, 0.09, 0.45, 'sine', 0.07)
  }

  /** Attention tone (arming, warnings). */
  alert() {
    this.blip(392, 0.14, 0.6, 'triangle')
    this.blip(392, 0.14, 0.5, 'triangle', 0.17)
  }

  /** Rising success arpeggio (burn complete). */
  stinger() {
    this.blip(523.25, 0.12, 0.5)
    this.blip(659.25, 0.12, 0.5, 'sine', 0.09)
    this.blip(783.99, 0.2, 0.55, 'sine', 0.18)
  }

  /** Engine rumble: level 0 stops, >0 starts/adjusts (call every frame during a burn). */
  setRumble(level: number) {
    if (!this.ctx || !this.master) return
    if (level <= 0) {
      if (this.rumbleGain) {
        this.rumbleGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08)
        this.rumbleSrc?.stop(this.ctx.currentTime + 0.4)
        this.rumbleSrc = null
        const dying = this.rumbleGain
        setTimeout(() => { dying.disconnect() }, 400)
        this.rumbleGain = null
      }
      return
    }
    if (!this.rumbleGain) {
      const ctx = this.ctx
      const len = ctx.sampleRate
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.05 * white) / 1.05
        data[i] = last * 4
      }
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 90
      this.rumbleGain = ctx.createGain()
      this.rumbleGain.gain.value = 0
      src.connect(filter).connect(this.rumbleGain).connect(this.master)
      src.start()
      this.rumbleSrc = src
    }
    this.rumbleGain.gain.setTargetAtTime(Math.min(1, level) * 1.6, this.ctx.currentTime, 0.06)
  }
}

export const audio = new AudioEngine()
