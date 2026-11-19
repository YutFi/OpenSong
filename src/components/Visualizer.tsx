import { useEffect, useRef } from 'react'
import { engine } from '../audio/engine'
import { createVizState, loudness, renderViz } from '../audio/viz'
import { cn } from '../lib/util'
import { usePlayer } from '../store/player'
import { useSettings, type VizMode, type VizSettings } from '../store/settings'

/** Canvas visualiser driven by the shared AnalyserNode. Renders nothing fake: with no audio data it says why. */
export function Visualizer({ mode, settings, className, artwork }: { mode?: VizMode; settings?: Partial<VizSettings>; className?: string; artwork?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const viz = useSettings((s) => s.viz)
  const lowPower = useSettings((s) => s.lowPower)
  const merged = { ...viz, ...settings, mode: mode ?? settings?.mode ?? viz.mode }
  const ref = useRef(merged); ref.current = merged
  const lp = useRef(lowPower); lp.current = lowPower
  const msg = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('2d')!
    const state = createVizState()
    let raf = 0, last = performance.now(), visible = true
    let freq = new Uint8Array(0), time = new Uint8Array(0)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(cv)

    const resize = () => {
      const dpr = lp.current ? 0.6 : Math.min(window.devicePixelRatio || 1, 2)
      const r = cv.getBoundingClientRect()
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr))
    }
    const ro = new ResizeObserver(resize); ro.observe(cv); resize()

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const s = ref.current
      const interval = 1000 / (lp.current ? 24 : s.fps)
      if (!visible || now - last < interval - 2) return
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const an = engine.analyser
      let note = ''
      if (usePlayer.getState().mode === 'embed' && usePlayer.getState().status !== 'idle') note = 'This song plays in YouTube’s own player, which doesn’t allow audio analysis, so the visualiser can’t react to it.'
      else if (usePlayer.getState().mode === 'bypass' && usePlayer.getState().status !== 'idle') note = 'This source doesn’t allow audio analysis, so the visualiser can’t react to it. Local files and most streams work.'
      else if (!an) note = 'Press play to start the visualiser.'
      if (msg.current) msg.current.textContent = note
      if (!an || note) { ctx.fillStyle = s.background; ctx.clearRect(0, 0, cv.width, cv.height); if (s.backgroundEffect !== 'artwork') ctx.fillRect(0, 0, cv.width, cv.height); return }
      if (freq.length !== an.frequencyBinCount) { freq = new Uint8Array(an.frequencyBinCount); time = new Uint8Array(an.fftSize) }
      an.getByteFrequencyData(freq); an.getByteTimeDomainData(time)
      renderViz(ctx, { freq, time, w: cv.width, h: cv.height, t: now / 1000, dt, sampleRate: engine.ctx?.sampleRate ?? 44100, lowPower: lp.current }, s.mode, s, state)
      void loudness
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
  }, [])

  return (
    <div className={cn('relative overflow-hidden', className)} style={{ background: merged.backgroundEffect === 'artwork' ? '#000' : merged.background }}>
      {merged.backgroundEffect === 'artwork' && artwork && <img src={artwork} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" />}
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" data-testid="visualiser-canvas" aria-label="Audio visualiser" role="img" />
      <div ref={msg} className="pointer-events-none absolute inset-x-0 bottom-3 px-4 text-center text-xs text-white/70" />
    </div>
  )
}
