/** Equaliser band layouts, presets and the pure maths that turns UI state into audio-node parameters. */

export type BandCount = 5 | 10 | 15

export const BAND_FREQS: Record<BandCount, number[]> = {
  5: [60, 230, 910, 3600, 14000],
  10: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
}

/** Peaking-filter Q per layout (≈ constant-Q for the band spacing). */
export const BAND_Q: Record<BandCount, number> = { 5: 0.7, 10: 1.41, 15: 2.1 }

export const GAIN_MIN = -12
export const GAIN_MAX = 12

/** Built-in presets, authored as 10-band curves and resampled for 5/15-band layouts. */
export const PRESET_10: Record<string, number[]> = {
  Normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Deep Bass': [8, 7, 5, 2, 0, -1, 0, 0, 0, 0],
  Rock: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
  Pop: [-1, 2, 4, 5, 3, 0, -1, -1, -2, -2],
  Classical: [4, 3, 3, 2, -1, -1, 0, 2, 3, 4],
  Jazz: [4, 3, 1, 2, -2, -2, 0, 1, 3, 4],
  Electronic: [5, 4, 1, 0, -2, 2, 1, 1, 4, 5],
  Acoustic: [5, 4, 3, 1, 2, 2, 3, 3, 3, 2],
  Vocal: [-2, -3, -3, 1, 3, 3, 3, 2, 0, -1],
  'Treble Boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
}
export const BUILTIN_PRESETS = [...Object.keys(PRESET_10), 'Custom']

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Resample a gain curve to another set of centre frequencies by interpolating on a log-frequency axis. */
export function resampleCurve(srcFreqs: number[], srcGains: number[], dstFreqs: number[]): number[] {
  const lx = srcFreqs.map(Math.log)
  return dstFreqs.map((f) => {
    const x = Math.log(f)
    if (x <= lx[0]) return srcGains[0]
    if (x >= lx[lx.length - 1]) return srcGains[srcGains.length - 1]
    let i = 0
    while (i < lx.length - 2 && x > lx[i + 1]) i++
    const t = (x - lx[i]) / (lx[i + 1] - lx[i])
    return srcGains[i] + (srcGains[i + 1] - srcGains[i]) * t
  })
}

export function presetGains(name: string, bands: BandCount): number[] | undefined {
  const p = PRESET_10[name]
  if (!p) return undefined
  const out = bands === 10 ? [...p] : resampleCurve(BAND_FREQS[10], p, BAND_FREQS[bands])
  return out.map((g) => Math.round(g * 2) / 2)
}

export interface AudioParams {
  enabled: boolean
  freqs: number[]
  q: number
  gains: number[]
  /** dB, user pre-amp. */
  preamp: number
  /** Automatically lower the pre-amp to leave headroom for boosts. */
  autoHeadroom: boolean
  /** 0–100 */
  bass: number
  treble: number
  loudness: number
  /** -1 (left) … 1 (right) */
  balance: number
  /** 0 (mono) … 2 (extra wide); 1 = unchanged */
  width: number
}

export interface EffectiveParams {
  gains: number[]
  preampDb: number
  bassDb: number
  trebleDb: number
  loudLowDb: number
  loudHighDb: number
  pan: number
  width: number
}

export const MAX_SHELF_DB = 10

/** Convert UI state to the actual numbers sent to the Web Audio nodes. Pure + unit-tested. */
export function effectiveParams(p: AudioParams): EffectiveParams {
  if (!p.enabled) {
    return { gains: p.gains.map(() => 0), preampDb: 0, bassDb: 0, trebleDb: 0, loudLowDb: 0, loudHighDb: 0, pan: 0, width: 1 }
  }
  const gains = p.gains.map((g) => clamp(g, GAIN_MIN, GAIN_MAX))
  const bassDb = (clamp(p.bass, 0, 100) / 100) * MAX_SHELF_DB
  const trebleDb = (clamp(p.treble, 0, 100) / 100) * MAX_SHELF_DB
  const loudLowDb = (clamp(p.loudness, 0, 100) / 100) * 6
  const loudHighDb = (clamp(p.loudness, 0, 100) / 100) * 3
  const maxBoost = Math.max(0, ...gains, bassDb, trebleDb, loudLowDb)
  const headroom = p.autoHeadroom ? maxBoost * 0.6 : 0
  return {
    gains,
    preampDb: clamp(p.preamp, -12, 12) - headroom,
    bassDb, trebleDb, loudLowDb, loudHighDb,
    pan: clamp(p.balance, -1, 1),
    width: clamp(p.width, 0, 2),
  }
}

export const dbToGain = (db: number) => Math.pow(10, db / 20)

/** Frequency-response magnitude of the whole EQ at `f` Hz, for drawing the curve (approximate, peaking bell sum). */
export function curveAt(f: number, freqs: number[], gains: number[], q: number): number {
  let total = 0
  for (let i = 0; i < freqs.length; i++) {
    const r = Math.log2(f / freqs[i])
    const bw = 1 / q
    total += gains[i] * Math.exp(-(r * r) / (2 * (bw * 0.6) ** 2))
  }
  return total
}
