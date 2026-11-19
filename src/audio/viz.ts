import type { VizMode, VizSettings } from '../store/settings'

/** All visualiser drawing lives here as plain functions of (audio data, settings) → pixels. No randomness drives the motion:
 *  every movement is derived from AnalyserNode frequency / waveform data. */

export interface Frame {
  freq: Uint8Array   // getByteFrequencyData
  time: Uint8Array   // getByteTimeDomainData
  w: number
  h: number
  t: number          // seconds
  dt: number         // seconds since last frame
  sampleRate: number
  lowPower: boolean
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number }

export interface VizState {
  smooth: Float32Array
  peaks: Float32Array
  particles: Particle[]
  rot: number
  seed: number
}

export const createVizState = (): VizState => ({ smooth: new Float32Array(256), peaks: new Float32Array(256), particles: [], rot: 0, seed: 1 })

export const MODES: { id: VizMode; label: string }[] = [
  { id: 'bars', label: 'Spectrum bars' }, { id: 'circular', label: 'Circular' }, { id: 'waveform', label: 'Waveform' },
  { id: 'frequency', label: 'Frequency analyser' }, { id: 'neon', label: 'Neon waveform' }, { id: 'particles', label: 'Particles' },
  { id: 'fluid', label: 'Fluid' }, { id: 'retro', label: 'Retro' }, { id: 'minimal', label: 'Minimal' },
]

/** Collapse FFT bins into `count` log-spaced bands (40 Hz … 16 kHz), each 0–1. Pure; unit-tested. */
export function bandLevels(freq: Uint8Array, count: number, sampleRate: number, sensitivity = 1, out?: Float32Array): Float32Array {
  const res = out && out.length >= count ? out : new Float32Array(count)
  const bins = freq.length
  const nyquist = sampleRate / 2
  const lo = 40, hi = Math.min(16000, nyquist)
  const binHz = nyquist / bins
  for (let b = 0; b < count; b++) {
    const f0 = lo * Math.pow(hi / lo, b / count), f1 = lo * Math.pow(hi / lo, (b + 1) / count)
    let i0 = Math.floor(f0 / binHz), i1 = Math.max(i0 + 1, Math.ceil(f1 / binHz))
    i0 = Math.min(i0, bins - 1); i1 = Math.min(i1, bins)
    let sum = 0
    for (let i = i0; i < i1; i++) sum += freq[i]
    const v = sum / Math.max(1, i1 - i0) / 255
    res[b] = Math.min(1, Math.pow(Math.min(1, v * sensitivity), 1.15))
  }
  return res
}

export const energy = (levels: Float32Array, from: number, to: number) => {
  const a = Math.floor(from * levels.length), b = Math.max(a + 1, Math.floor(to * levels.length))
  let s = 0
  for (let i = a; i < b; i++) s += levels[i]
  return s / (b - a)
}

/** Attack fast, release slowly — avoids flicker while staying faithful to the signal. */
function smoothInto(state: VizState, levels: Float32Array, dt: number, speed: number) {
  for (let i = 0; i < levels.length; i++) {
    const cur = state.smooth[i]
    state.smooth[i] = levels[i] > cur ? cur + (levels[i] - cur) * Math.min(1, 14 * dt * speed) : Math.max(levels[i], cur - dt * 1.1 * speed)
    state.peaks[i] = Math.max(state.smooth[i], state.peaks[i] - dt * 0.5 * speed)
  }
}

function fillStyle(ctx: CanvasRenderingContext2D, s: VizSettings, x0: number, y0: number, x1: number, y1: number) {
  if (!s.gradient) return s.colorA
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, s.colorA); g.addColorStop(1, s.colorB)
  return g
}

function glow(ctx: CanvasRenderingContext2D, s: VizSettings, lowPower: boolean, color = s.colorA) {
  ctx.shadowBlur = lowPower ? 0 : s.glow
  ctx.shadowColor = color
}

function background(ctx: CanvasRenderingContext2D, f: Frame, s: VizSettings, levels: Float32Array) {
  const { w, h } = f
  if (s.backgroundEffect === 'artwork') ctx.clearRect(0, 0, w, h)
  else { ctx.fillStyle = s.background; ctx.fillRect(0, 0, w, h) }
  if (s.backgroundEffect === 'vignette') {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75)
    g.addColorStop(0, 'rgba(255,255,255,0.04)'); g.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  } else if (s.backgroundEffect === 'stars') {
    const tw = energy(levels, 0.6, 1)
    ctx.fillStyle = '#fff'
    let r = 12345
    for (let i = 0; i < (f.lowPower ? 40 : 110); i++) {
      r = (r * 1103515245 + 12345) & 0x7fffffff
      const x = (r % 1000) / 1000 * w; r = (r * 1103515245 + 12345) & 0x7fffffff
      const y = (r % 1000) / 1000 * h
      ctx.globalAlpha = 0.15 + 0.5 * Math.abs(Math.sin(f.t * 0.7 + i)) * (0.4 + tw)
      ctx.fillRect(x, y, 1.5, 1.5)
    }
    ctx.globalAlpha = 1
  }
}

type Drawer = (ctx: CanvasRenderingContext2D, f: Frame, s: VizSettings, st: VizState, levels: Float32Array) => void

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

const bars: Drawer = (ctx, f, s, st) => {
  const { w, h } = f
  const stride = s.barWidth + s.barSpacing
  const n = Math.max(8, Math.min(f.lowPower ? 40 : 160, Math.floor(w / stride)))
  const lv = bandLevels(f.freq, n, f.sampleRate, s.sensitivity)
  smoothInto(st, lv, f.dt, s.speed)
  const total = n * stride - s.barSpacing, x0 = (w - total) / 2
  const maxH = h * 0.85 * s.size
  ctx.fillStyle = fillStyle(ctx, s, 0, h, 0, h - maxH)
  glow(ctx, s, f.lowPower)
  for (let i = 0; i < n; i++) {
    const bh = Math.max(2, st.smooth[i] * maxH)
    roundRect(ctx, x0 + i * stride, h - bh - h * 0.05, s.barWidth, bh, s.barWidth / 2); ctx.fill()
  }
  ctx.shadowBlur = 0
  ctx.fillStyle = s.colorB
  for (let i = 0; i < n; i++) ctx.fillRect(x0 + i * stride, h - st.peaks[i] * maxH - h * 0.05 - 4, s.barWidth, 2)
}

const circular: Drawer = (ctx, f, s, st) => {
  const { w, h } = f
  const n = f.lowPower ? 64 : 120
  const lv = bandLevels(f.freq, n / 2, f.sampleRate, s.sensitivity)
  smoothInto(st, lv, f.dt, s.speed)
  const bass = energy(lv, 0, 0.15)
  st.rot += f.dt * 0.25 * s.speed
  const cx = w / 2, cy = h / 2, r0 = Math.min(w, h) * 0.2 * s.size * (1 + bass * 0.12), maxLen = Math.min(w, h) * 0.26 * s.size
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(2, s.barWidth * 0.5)
  ctx.strokeStyle = fillStyle(ctx, s, cx - r0, cy - r0, cx + r0, cy + r0)
  glow(ctx, s, f.lowPower)
  for (let i = 0; i < n; i++) {
    const idx = i < n / 2 ? i : n - 1 - i // mirror so the ring is symmetric
    const a = st.rot + (i / n) * Math.PI * 2 - Math.PI / 2
    const len = 3 + st.smooth[idx] * maxLen
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); ctx.stroke()
  }
  ctx.shadowBlur = 0
  ctx.beginPath(); ctx.arc(cx, cy, r0 - 6, 0, Math.PI * 2); ctx.strokeStyle = s.colorB; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1
}

function wavePath(ctx: CanvasRenderingContext2D, f: Frame, s: VizSettings, yOffset = 0, amp = 1) {
  const { w, h, time } = f
  const step = f.lowPower ? 4 : 2
  ctx.beginPath()
  for (let x = 0, i = 0; x <= w; x += step, i++) {
    const idx = Math.min(time.length - 1, Math.floor((x / w) * time.length))
    const v = ((time[idx] - 128) / 128) * s.sensitivity * amp
    const y = h / 2 + yOffset + v * h * 0.35 * s.size
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
}

const waveform: Drawer = (ctx, f, s) => {
  ctx.lineWidth = Math.max(2, s.barWidth * 0.3); ctx.lineJoin = 'round'
  ctx.strokeStyle = fillStyle(ctx, s, 0, 0, f.w, 0)
  glow(ctx, s, f.lowPower)
  wavePath(ctx, f, s); ctx.stroke(); ctx.shadowBlur = 0
}

const neon: Drawer = (ctx, f, s, st, lv) => {
  smoothInto(st, lv, f.dt, s.speed)
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineJoin = 'round'
  const passes: [number, number, string][] = f.lowPower ? [[3, 1, s.colorA]] : [[14, 0.25, s.colorA], [7, 0.5, s.colorB], [2.5, 1, '#ffffff']]
  for (const [lw, alpha, col] of passes) {
    ctx.lineWidth = lw; ctx.globalAlpha = alpha; ctx.strokeStyle = col
    ctx.shadowBlur = f.lowPower ? 0 : s.glow + lw * 2; ctx.shadowColor = col
    wavePath(ctx, f, s); ctx.stroke()
    wavePath(ctx, f, s, 0, -0.6); ctx.stroke()
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over'
}

const frequency: Drawer = (ctx, f, s, st) => {
  const { w, h } = f
  const n = f.lowPower ? 96 : 256
  const lv = bandLevels(f.freq, n, f.sampleRate, s.sensitivity)
  smoothInto(st, lv, f.dt, s.speed)
  const top = h * 0.08, bottom = h * 0.88, ph = (bottom - top) * s.size
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.font = '11px ui-monospace, monospace'
  for (const [fr, label] of [[100, '100'], [1000, '1k'], [10000, '10k']] as const) {
    const x = (Math.log(fr / 40) / Math.log(16000 / 40)) * w
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.fillText(`${label} Hz`, x + 4, bottom + 14)
  }
  for (let d = 0; d <= 4; d++) { const y = bottom - (d / 4) * ph; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
  ctx.beginPath(); ctx.moveTo(0, bottom)
  for (let i = 0; i < n; i++) ctx.lineTo((i / (n - 1)) * w, bottom - st.smooth[i] * ph)
  ctx.lineTo(w, bottom); ctx.closePath()
  const g = ctx.createLinearGradient(0, bottom - ph, 0, bottom)
  g.addColorStop(0, s.colorB + 'cc'); g.addColorStop(1, s.colorA + '22')
  ctx.fillStyle = s.gradient ? g : s.colorA + '66'; ctx.fill()
  ctx.strokeStyle = s.colorA; ctx.lineWidth = 2; glow(ctx, s, f.lowPower)
  ctx.beginPath()
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * w, y = bottom - st.smooth[i] * ph; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
  ctx.stroke(); ctx.shadowBlur = 0
}

const particles: Drawer = (ctx, f, s, st) => {
  const { w, h } = f
  const lv = bandLevels(f.freq, 64, f.sampleRate, s.sensitivity)
  smoothInto(st, lv, f.dt, s.speed)
  const bass = energy(lv, 0, 0.15), mid = energy(lv, 0.15, 0.6), hi = energy(lv, 0.6, 1)
  const cap = Math.round(s.particleDensity * (f.lowPower ? 0.4 : 1) * 2)
  const spawn = Math.floor(bass * s.particleDensity * 0.35 * Math.min(2, f.dt * 60) + hi * 4)
  const cx = w / 2, cy = h / 2, base = Math.min(w, h)
  for (let i = 0; i < spawn && st.particles.length < cap; i++) {
    st.seed = (st.seed * 16807) % 2147483647 // deterministic scatter of direction; speed comes from the audio
    const a = (st.seed / 2147483647) * Math.PI * 2
    const sp = base * (0.15 + mid * 0.9) * s.speed
    st.particles.push({ x: cx + Math.cos(a) * base * 0.05, y: cy + Math.sin(a) * base * 0.05, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.9 + bass * 1.2, hue: i % 2 })
  }
  ctx.globalCompositeOperation = 'lighter'
  glow(ctx, s, f.lowPower)
  for (let i = st.particles.length - 1; i >= 0; i--) {
    const p = st.particles[i]
    p.life += f.dt; p.x += p.vx * f.dt; p.y += p.vy * f.dt
    if (p.life > p.max || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) { st.particles.splice(i, 1); continue }
    const k = 1 - p.life / p.max
    ctx.globalAlpha = k * 0.9
    ctx.fillStyle = p.hue ? s.colorB : s.colorA; ctx.shadowColor = ctx.fillStyle
    ctx.beginPath(); ctx.arc(p.x, p.y, (1.5 + bass * 4) * s.size * (0.5 + k), 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over'
}

const fluid: Drawer = (ctx, f, s, st) => {
  const { w, h } = f
  const lv = bandLevels(f.freq, 48, f.sampleRate, s.sensitivity)
  smoothInto(st, lv, f.dt, s.speed)
  st.rot += f.dt * s.speed * (0.4 + energy(lv, 0, 0.3))
  const n = f.lowPower ? 4 : 7, base = Math.min(w, h)
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) {
    const e = st.smooth[Math.floor((i / n) * 36)]
    const a = st.rot * (0.6 + i * 0.13) + i * 1.7
    const x = w / 2 + Math.cos(a) * w * 0.28 * (0.5 + e * 0.5), y = h / 2 + Math.sin(a * 1.3 + i) * h * 0.26 * (0.5 + e * 0.5)
    const r = base * (0.13 + e * 0.3) * s.size
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const c = i % 2 ? s.colorB : s.colorA
    g.addColorStop(0, c + 'cc'); g.addColorStop(1, c + '00')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

const retro: Drawer = (ctx, f, s, st) => {
  const { w, h } = f
  const cols = Math.max(8, Math.min(f.lowPower ? 20 : 40, Math.floor(w / (s.barWidth + s.barSpacing + 6))))
  const lv = bandLevels(f.freq, cols, f.sampleRate, s.sensitivity)
  smoothInto(st, lv, f.dt, s.speed)
  const segs = 22, gap = 3, cw = w / cols, segH = (h * 0.8 * s.size) / segs, bottom = h * 0.92
  for (let c = 0; c < cols; c++) {
    const lit = Math.round(st.smooth[c] * segs), pk = Math.round(st.peaks[c] * segs)
    for (let k = 0; k < segs; k++) {
      const y = bottom - (k + 1) * segH
      const hot = k / segs
      ctx.fillStyle = k < lit || k === pk - 1 ? (hot > 0.8 ? '#ff3d55' : hot > 0.6 ? '#ffd84d' : s.colorA) : 'rgba(255,255,255,0.05)'
      ctx.fillRect(c * cw + gap / 2, y + gap / 2, cw - gap, segH - gap)
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1) // scanlines
}

const minimal: Drawer = (ctx, f, s, st) => {
  const { w, h } = f
  const n = f.lowPower ? 24 : 48
  const lv = bandLevels(f.freq, n, f.sampleRate, s.sensitivity)
  smoothInto(st, lv, f.dt, s.speed)
  const gap = Math.min(w / (n + 2), 28), x0 = w / 2 - (gap * (n - 1)) / 2
  ctx.lineCap = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = fillStyle(ctx, s, 0, 0, w, 0)
  for (let i = 0; i < n; i++) {
    const len = 2 + st.smooth[i] * h * 0.3 * s.size
    ctx.globalAlpha = 0.35 + st.smooth[i] * 0.65
    ctx.beginPath(); ctx.moveTo(x0 + i * gap, h / 2 - len / 2); ctx.lineTo(x0 + i * gap, h / 2 + len / 2); ctx.stroke()
  }
  ctx.globalAlpha = 1
}

const DRAWERS: Record<VizMode, Drawer> = { bars, circular, waveform, frequency, neon, particles, fluid, retro, minimal }

export function renderViz(ctx: CanvasRenderingContext2D, f: Frame, mode: VizMode, s: VizSettings, st: VizState) {
  const lv = bandLevels(f.freq, 32, f.sampleRate, s.sensitivity)
  ctx.save()
  background(ctx, f, s, lv)
  DRAWERS[mode](ctx, f, s, st, lv)
  ctx.restore()
}

/** Overall loudness 0–1 from the frequency data (used to decide whether anything is actually playing). */
export function loudness(freq: Uint8Array): number {
  let s = 0
  for (let i = 0; i < freq.length; i++) s += freq[i]
  return s / freq.length / 255
}
