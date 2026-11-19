import { describe, expect, it } from 'vitest'
import { BAND_FREQS, BUILTIN_PRESETS, PRESET_10, curveAt, dbToGain, effectiveParams, presetGains, resampleCurve, type AudioParams } from './eq'
import { softClipCurve } from './engine'

const base = (over: Partial<AudioParams> = {}): AudioParams => ({
  enabled: true, freqs: BAND_FREQS[10], q: 1.41, gains: new Array(10).fill(0), preamp: 0, autoHeadroom: true,
  bass: 0, treble: 0, loudness: 0, balance: 0, width: 1, ...over,
})

describe('equaliser', () => {
  it('defines 5, 10 and 15 bands in ascending order', () => {
    for (const n of [5, 10, 15] as const) {
      expect(BAND_FREQS[n]).toHaveLength(n)
      expect([...BAND_FREQS[n]].sort((a, b) => a - b)).toEqual(BAND_FREQS[n])
    }
  })
  it('has every required preset', () => {
    for (const name of ['Normal', 'Bass Boost', 'Deep Bass', 'Rock', 'Pop', 'Classical', 'Jazz', 'Electronic', 'Acoustic', 'Vocal', 'Treble Boost', 'Custom']) expect(BUILTIN_PRESETS).toContain(name)
    for (const g of Object.values(PRESET_10)) { expect(g).toHaveLength(10); expect(Math.max(...g.map(Math.abs))).toBeLessThanOrEqual(12) }
  })
  it('resamples presets to other layouts and keeps the shape', () => {
    const five = presetGains('Bass Boost', 5)!
    const fifteen = presetGains('Bass Boost', 15)!
    expect(five).toHaveLength(5); expect(fifteen).toHaveLength(15)
    expect(five[0]).toBeGreaterThan(five[4]); expect(fifteen[0]).toBeGreaterThan(fifteen[14])
    expect(presetGains('Nope', 10)).toBeUndefined()
    expect(resampleCurve([100, 1000], [0, 10], [100, 316.2, 1000])[1]).toBeCloseTo(5, 0)
  })
  it('neutralises everything when processing is disabled', () => {
    const e = effectiveParams(base({ enabled: false, gains: new Array(10).fill(9), bass: 100, balance: 1, width: 2, preamp: 6 }))
    expect(e.gains.every((g) => g === 0)).toBe(true)
    expect([e.preampDb, e.bassDb, e.trebleDb, e.pan]).toEqual([0, 0, 0, 0])
    expect(e.width).toBe(1)
  })
  it('lowers the pre-amp to leave headroom when boosting (anti-clipping)', () => {
    const boosted = effectiveParams(base({ gains: [10, 8, 0, 0, 0, 0, 0, 0, 0, 0] }))
    expect(boosted.preampDb).toBeLessThan(0)
    expect(boosted.preampDb).toBeCloseTo(-6, 5)
    expect(effectiveParams(base({ gains: [10, 8, 0, 0, 0, 0, 0, 0, 0, 0], autoHeadroom: false })).preampDb).toBe(0)
    expect(effectiveParams(base({ gains: [-6, -6, 0, 0, 0, 0, 0, 0, 0, 0] })).preampDb).toBe(0) // cuts need no headroom
  })
  it('clamps out-of-range values', () => {
    const e = effectiveParams(base({ gains: [30, -30, 0, 0, 0, 0, 0, 0, 0, 0], balance: 5, width: 9, preamp: 99, bass: 500 }))
    expect(e.gains[0]).toBe(12); expect(e.gains[1]).toBe(-12)
    expect(e.pan).toBe(1); expect(e.width).toBe(2)
    expect(e.bassDb).toBe(10)
  })
  it('converts dB to linear gain', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(6)).toBeCloseTo(1.995, 2)
    expect(dbToGain(-20)).toBeCloseTo(0.1, 5)
  })
  it('draws a curve that peaks at a boosted band', () => {
    const gains = new Array(10).fill(0); gains[5] = 8
    expect(curveAt(1000, BAND_FREQS[10], gains, 1.41)).toBeCloseTo(8, 0)
    expect(curveAt(100, BAND_FREQS[10], gains, 1.41)).toBeLessThan(1)
  })
})

describe('softClipCurve (output guard)', () => {
  const c = softClipCurve()
  it('is transparent below the knee and odd-symmetric', () => {
    expect(c[Math.round(((0.5 + 1) / 2) * (c.length - 1))]).toBeCloseTo(0.5, 3)
    expect(c[0]).toBeCloseTo(-c[c.length - 1], 6)
  })
  it('never exceeds the ceiling, is monotonic, and continuous at the knee', () => {
    let prev = -Infinity
    for (const v of c) { expect(Math.abs(v)).toBeLessThanOrEqual(0.97 + 1e-6); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v }
    const i = Math.round(((0.8 + 1) / 2) * (c.length - 1)); expect(Math.abs(c[i + 1] - c[i])).toBeLessThan(0.002)
  })
})
