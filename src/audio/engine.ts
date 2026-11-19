import { dbToGain, effectiveParams, type AudioParams } from './eq'

export type EngineMode = 'processed' | 'bypass'

export interface EngineEvents {
  time?: (t: number, duration: number) => void
  ended?: () => void
  error?: (msg: string) => void
  play?: () => void
  pause?: () => void
  /** Fired once per track when `crossfade` seconds remain. */
  nearEnd?: () => void
  mode?: (m: EngineMode) => void
}

class Deck {
  el: HTMLAudioElement
  source: MediaElementAudioSourceNode | null = null
  gain: GainNode | null = null
  constructor() {
    this.el = new Audio()
    this.el.preload = 'auto'
    this.el.setAttribute('playsinline', '')
  }
}

/**
 * One persistent audio graph for the whole app:
 *
 *   deckA/deckB → mix → preamp → EQ bands → bass → treble → loudness → stereo width → balance → limiter → analyser → volume → output
 *
 * Elements are persistent (never re-created) because iOS Safari only lets a user-started element keep
 * playing in the background. Sources that don't send CORS headers cannot be routed through Web Audio
 * (the browser would output silence), so those play through a separate "bypass" element: no EQ/visualiser,
 * but the music still plays. The UI is told via the `mode` event.
 */
/** Identity up to `knee`, then a smooth tanh shoulder that never exceeds `ceiling` (inputs beyond ±1 are clamped to the ends). */
export function softClipCurve(n = 2049, knee = 0.8, ceiling = 0.97): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n)
  const room = ceiling - knee
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x)
    c[i] = Math.sign(x) * (a <= knee ? a : knee + room * Math.tanh((a - knee) / room))
  }
  return c
}

export class AudioEngine {
  events: EngineEvents = {}
  ctx: AudioContext | null = null
  analyser: AnalyserNode | null = null
  mode: EngineMode = 'processed'

  private decks = [new Deck(), new Deck()]
  private bypass = new Deck()
  private active = 0
  private volume = 1
  private rate = 1
  private crossfadeSec = 0
  private nearEndFired = false
  private fading = false

  private mix!: GainNode
  private pre!: GainNode
  private eqTail!: GainNode
  private filters: BiquadFilterNode[] = []
  private bass!: BiquadFilterNode
  private treble!: BiquadFilterNode
  private loudLow!: BiquadFilterNode
  private loudHigh!: BiquadFilterNode
  private sideGain!: GainNode
  private panner!: StereoPannerNode
  private master!: GainNode
  private params: AudioParams | null = null

  constructor() {
    for (const d of [...this.decks, this.bypass]) this.wire(d)
  }

  private get cur(): Deck { return this.mode === 'bypass' ? this.bypass : this.decks[this.active] }
  private get idle(): Deck { return this.decks[1 - this.active] }
  get element(): HTMLAudioElement { return this.cur.el }
  get isPlaying() { return !this.cur.el.paused && !this.cur.el.ended }
  get currentTime() { return this.cur.el.currentTime }
  get duration() { return this.cur.el.duration }

  private wire(d: Deck) {
    const el = d.el
    const isCur = () => this.cur === d
    el.addEventListener('timeupdate', () => {
      if (!isCur()) return
      const dur = el.duration
      this.events.time?.(el.currentTime, dur)
      if (this.crossfadeSec > 0 && !this.nearEndFired && Number.isFinite(dur) && dur > this.crossfadeSec * 2 && dur - el.currentTime <= this.crossfadeSec) {
        this.nearEndFired = true
        this.events.nearEnd?.()
      }
    })
    el.addEventListener('durationchange', () => isCur() && this.events.time?.(el.currentTime, el.duration))
    el.addEventListener('ended', () => isCur() && this.events.ended?.())
    el.addEventListener('play', () => isCur() && this.events.play?.())
    el.addEventListener('pause', () => isCur() && !this.fading && this.events.pause?.())
    el.addEventListener('error', () => {
      // Errors while loading are handled in loadInto(); this catches mid-stream failures.
      if (isCur() && el.src && el.error) this.events.error?.(el.error.message || 'Playback error')
    })
  }

  /** Must be called from a user gesture the first time (autoplay policy). */
  ensureContext(): AudioContext {
    if (this.ctx) return this.ctx
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC({ latencyHint: 'playback' })
    this.ctx = ctx
    this.mix = ctx.createGain()
    this.pre = ctx.createGain()
    this.eqTail = ctx.createGain()
    this.bass = Object.assign(ctx.createBiquadFilter(), { type: 'lowshelf' as const })
    this.bass.frequency.value = 100
    this.treble = Object.assign(ctx.createBiquadFilter(), { type: 'highshelf' as const })
    this.treble.frequency.value = 8000
    this.loudLow = Object.assign(ctx.createBiquadFilter(), { type: 'lowshelf' as const })
    this.loudLow.frequency.value = 70
    this.loudHigh = Object.assign(ctx.createBiquadFilter(), { type: 'highshelf' as const })
    this.loudHigh.frequency.value = 10000

    // Stereo width via mid/side matrix.
    const widthIn = ctx.createGain()
    widthIn.channelCount = 2
    widthIn.channelCountMode = 'explicit'
    const split = ctx.createChannelSplitter(2)
    const merge = ctx.createChannelMerger(2)
    const midL = ctx.createGain(); midL.gain.value = 0.5
    const midR = ctx.createGain(); midR.gain.value = 0.5
    const sideL = ctx.createGain(); sideL.gain.value = 0.5
    const sideR = ctx.createGain(); sideR.gain.value = -0.5
    const mid = ctx.createGain()
    const side = ctx.createGain()
    this.sideGain = ctx.createGain()
    const invSide = ctx.createGain(); invSide.gain.value = -1
    const outL = ctx.createGain()
    const outR = ctx.createGain()
    widthIn.connect(split)
    split.connect(midL, 0); split.connect(midR, 1); split.connect(sideL, 0); split.connect(sideR, 1)
    midL.connect(mid); midR.connect(mid); sideL.connect(side); sideR.connect(side)
    side.connect(this.sideGain)
    mid.connect(outL); this.sideGain.connect(outL)
    mid.connect(outR); this.sideGain.connect(invSide); invSide.connect(outR)
    outL.connect(merge, 0, 0); outR.connect(merge, 0, 1)

    this.panner = ctx.createStereoPanner()
    const limiter = ctx.createDynamicsCompressor()
    // Brick-wall-ish safety limiter: only acts near full scale so normal dynamics are untouched.
    limiter.threshold.value = -2
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.12
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    this.analyser.minDecibels = -90
    this.analyser.maxDecibels = -10
    this.master = ctx.createGain()

    this.mix.connect(this.pre)
    this.pre.connect(this.eqTail) // temporary until bands are built
    this.eqTail.connect(this.bass)
    this.bass.connect(this.treble)
    this.treble.connect(this.loudLow)
    this.loudLow.connect(this.loudHigh)
    this.loudHigh.connect(widthIn)
    merge.connect(this.panner)
    this.panner.connect(limiter)
    // A DynamicsCompressor can't catch every instantaneous peak (3 ms attack), so a transparent-below-−2 dBFS soft clipper
    // follows it. Together they keep the output under full scale however much gain the equaliser asks for.
    const guard = ctx.createWaveShaper()
    guard.curve = softClipCurve()
    guard.oversample = '2x'
    limiter.connect(guard)
    guard.connect(this.analyser)
    this.analyser.connect(this.master)
    this.master.connect(ctx.destination)

    for (const d of this.decks) {
      d.gain = ctx.createGain()
      d.gain.gain.value = d === this.decks[this.active] ? 1 : 0
      d.source = ctx.createMediaElementSource(d.el)
      d.source.connect(d.gain)
      d.gain.connect(this.mix)
    }
    this.master.gain.value = this.volume
    if (this.params) this.setParams(this.params)
    ctx.addEventListener('statechange', () => {
      // iOS may mark the context "interrupted" (calls, Siri); resume when we should be playing.
      if (this.isPlaying && ctx.state !== 'running') void ctx.resume().catch(() => undefined)
    })
    return ctx
  }

  setParams(p: AudioParams) {
    this.params = p
    const ctx = this.ctx
    if (!ctx) return
    const e = effectiveParams(p)
    const t = ctx.currentTime
    const ramp = (param: AudioParam, v: number) => param.setTargetAtTime(v, t, 0.015)
    // Rebuild the band chain when the layout changes.
    if (this.filters.length !== p.freqs.length || this.filters.some((f, i) => f.frequency.value !== p.freqs[i])) {
      this.pre.disconnect()
      this.filters.forEach((f) => f.disconnect())
      this.filters = p.freqs.map((f, i) => {
        const b = ctx.createBiquadFilter()
        b.type = i === 0 ? 'lowshelf' : i === p.freqs.length - 1 ? 'highshelf' : 'peaking'
        b.frequency.value = f
        b.Q.value = p.q
        b.gain.value = 0
        return b
      })
      let prev: AudioNode = this.pre
      for (const f of this.filters) { prev.connect(f); prev = f }
      prev.connect(this.eqTail)
    }
    this.filters.forEach((f, i) => { f.Q.value = p.q; ramp(f.gain, e.gains[i] ?? 0) })
    ramp(this.pre.gain, dbToGain(e.preampDb))
    ramp(this.bass.gain, e.bassDb)
    ramp(this.treble.gain, e.trebleDb)
    ramp(this.loudLow.gain, e.loudLowDb)
    ramp(this.loudHigh.gain, e.loudHighDb)
    ramp(this.sideGain.gain, e.width)
    ramp(this.panner.pan, e.pan)
  }

  setCrossfade(sec: number) { this.crossfadeSec = Math.max(0, sec) }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01)
    this.bypass.el.volume = this.volume
  }

  setRate(r: number) {
    this.rate = r
    for (const d of [...this.decks, this.bypass]) { d.el.playbackRate = r; d.el.preservesPitch = true }
  }

  /** Load `url` onto a deck and resolve once it can play. Falls back to the bypass element when Web Audio can't read the stream. */
  async load(url: string, opts: { local: boolean; startAt?: number; autoplay: boolean; fade?: number; allowProcessing?: boolean }): Promise<EngineMode> {
    const allowProc = opts.allowProcessing !== false
    this.nearEndFired = false
    const fade = opts.fade ?? 0
    const canCross = fade > 0 && this.mode === 'processed' && this.isPlaying && !!this.ctx && allowProc
    const prevDeck = this.cur
    let target: Deck
    let mode: EngineMode = 'processed'

    if (!allowProc && !opts.local) {
      target = this.bypass; mode = 'bypass'
    } else {
      this.ensureContext()
      target = canCross ? this.idle : this.decks[this.active]
    }

    const tryLoad = (d: Deck, cors: boolean) => new Promise<void>((resolve, reject) => {
      const el = d.el
      const ok = () => { cleanup(); resolve() }
      const bad = () => { cleanup(); reject(new Error(el.error?.message || 'Could not load audio')) }
      const cleanup = () => { el.removeEventListener('canplay', ok); el.removeEventListener('error', bad) }
      el.addEventListener('canplay', ok)
      el.addEventListener('error', bad)
      if (cors) el.crossOrigin = 'anonymous'; else el.removeAttribute('crossorigin')
      el.src = url
      el.playbackRate = this.rate
      el.preservesPitch = true
      el.load()
    })

    if (!canCross) { this.stopDeck(this.decks[0]); this.stopDeck(this.decks[1]); this.stopDeck(this.bypass) }

    try {
      if (mode === 'processed') await tryLoad(target, !opts.local)
      else await tryLoad(target, false)
    } catch (err) {
      if (opts.local || mode === 'bypass') throw err
      // CORS refused (or network error): retry without CORS on the bypass element.
      target = this.bypass; mode = 'bypass'
      await tryLoad(target, false)
    }

    if (mode === 'processed') {
      const idx = this.decks.indexOf(target)
      if (canCross) {
        this.fading = true
        const t = this.ctx!.currentTime
        target.gain!.gain.cancelScheduledValues(t); target.gain!.gain.setValueAtTime(0, t)
        target.gain!.gain.linearRampToValueAtTime(1, t + fade)
        const old = prevDeck
        old.gain?.gain.cancelScheduledValues(t); old.gain?.gain.setValueAtTime(old.gain.gain.value, t)
        old.gain?.gain.linearRampToValueAtTime(0, t + fade)
        this.active = idx
        setTimeout(() => { old.el.pause(); this.fading = false }, fade * 1000 + 50)
      } else {
        this.active = idx
        const t = this.ctx!.currentTime
        for (const d of this.decks) { d.gain!.gain.cancelScheduledValues(t); d.gain!.gain.setValueAtTime(d === target ? 1 : 0, t) }
      }
    }
    this.mode = mode
    this.events.mode?.(mode)

    if (opts.startAt) target.el.currentTime = opts.startAt
    if (opts.autoplay) await this.play()
    return mode
  }

  private stopDeck(d: Deck) {
    d.el.pause()
  }

  async play() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined)
    await this.cur.el.play()
  }
  pause() { this.cur.el.pause() }
  seek(t: number) { if (Number.isFinite(t)) this.cur.el.currentTime = Math.max(0, t) }
  stop() { for (const d of [...this.decks, this.bypass]) { d.el.pause(); d.el.removeAttribute('src'); d.el.load() } }
}

export const engine = new AudioEngine()
