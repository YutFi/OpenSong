import { describe, expect, it } from 'vitest'
import { bandLevels, energy, loudness } from './viz'

const SR = 44100, N = 1024
/** Synthetic FFT frame with energy only in the bin nearest `hz`. */
const tone = (hz: number, mag = 255) => { const f = new Uint8Array(N); f[Math.round(hz / (SR / 2 / N))] = mag; return f }

describe('visualiser analysis (real FFT data → levels)', () => {
  it('silence gives zero everywhere', () => {
    const lv = bandLevels(new Uint8Array(N), 32, SR)
    expect(Math.max(...lv)).toBe(0)
    expect(loudness(new Uint8Array(N))).toBe(0)
  })
  it('puts a bass tone in the low bands and a hi-hat tone in the high bands', () => {
    const peak = (a: Float32Array) => a.indexOf(Math.max(...a))
    const low = bandLevels(tone(100), 32, SR), high = bandLevels(tone(8000), 32, SR)
    expect(peak(low)).toBeLessThan(8)
    expect(peak(high)).toBeGreaterThan(22)
    expect(energy(low, 0, 0.3)).toBeGreaterThan(energy(low, 0.7, 1))
    expect(energy(high, 0.7, 1)).toBeGreaterThan(energy(high, 0, 0.3))
  })
  it('responds to input level and sensitivity', () => {
    const quiet = Math.max(...bandLevels(new Uint8Array(N).fill(40), 16, SR))
    const loud = Math.max(...bandLevels(new Uint8Array(N).fill(200), 16, SR))
    expect(loud).toBeGreaterThan(quiet)
    expect(Math.max(...bandLevels(new Uint8Array(N).fill(40), 16, SR, 3))).toBeGreaterThan(quiet)
    expect(Math.max(...bandLevels(new Uint8Array(N).fill(255), 16, SR, 5))).toBeLessThanOrEqual(1)
  })
  it('handles tiny and odd inputs without NaN', () => {
    for (const lv of [bandLevels(new Uint8Array(8).fill(100), 64, 8000), bandLevels(new Uint8Array(N), 1, SR)]) expect(lv.every(Number.isFinite)).toBe(true)
  })
})
