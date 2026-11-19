import { Maximize2, Minimize2, Pause, Play, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MODES } from '../audio/viz'
import { PageHeader } from '../components/Section'
import { Visualizer } from '../components/Visualizer'
import { Button, Card, Chip, Field, Input, Modal, Row, Select, Slider, Switch } from '../components/ui'
import { db } from '../lib/db'
import { deletePreset, savePreset } from '../lib/presets'
import { useLive } from '../lib/useLive'
import { cn } from '../lib/util'
import { usePlayer } from '../store/player'
import { DEFAULT_VIZ, useSettings, type VizSettings } from '../store/settings'
import { useUI } from '../store/ui'

const BUILTIN: Record<string, Partial<VizSettings>> = {
  Sunset: { colorA: '#ff7a45', colorB: '#ff3d6e', background: '#0b0b0f' },
  Ocean: { colorA: '#22d3ee', colorB: '#6366f1', background: '#04111f' },
  Forest: { colorA: '#a3e635', colorB: '#10b981', background: '#06120b' },
  Mono: { colorA: '#ffffff', colorB: '#9ca3af', background: '#000000', gradient: false },
  Neon: { colorA: '#f0abfc', colorB: '#22d3ee', background: '#09090b', glow: 28 },
}

export default function VisualiserStudio() {
  const viz = useSettings((s) => s.viz)
  const lowPower = useSettings((s) => s.lowPower)
  const { setViz, set } = useSettings.getState()
  const cur = usePlayer((s) => s.queue[s.index])
  const status = usePlayer((s) => s.status)
  const stage = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [presets] = useLive(() => db.presets.where('kind').equals('viz').sortBy('name'), [])
  const [hideUi, setHideUi] = useState(false)

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  // Immersive mode: fade the controls after a moment of no pointer activity.
  useEffect(() => {
    if (!full) { setHideUi(false); return }
    let t = setTimeout(() => setHideUi(true), 2500)
    const wake = () => { setHideUi(false); clearTimeout(t); t = setTimeout(() => setHideUi(true), 2500) }
    window.addEventListener('pointermove', wake); window.addEventListener('keydown', wake)
    return () => { clearTimeout(t); window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake) }
  }, [full])

  const toggleFull = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen() }
    catch { useUI.getState().toast('Fullscreen isn’t available in this browser. The visualiser still works in the page.', 'error') }
  }
  const upd = <K extends keyof VizSettings>(k: K, v: VizSettings[K]) => setViz({ [k]: v } as Partial<VizSettings>)

  return (
    <div className="space-y-6">
      <PageHeader title="Visualiser" subtitle="Reacts to the real audio signal. If a source can’t be analysed, it says so instead of faking motion." actions={<Button onClick={() => void toggleFull()}><Maximize2 size={16} />Immersive</Button>} />

      <div ref={stage} className={cn('relative overflow-hidden rounded-2xl border border-line', full ? 'h-screen w-screen rounded-none border-0' : 'aspect-video max-h-[60vh] w-full')} data-testid="viz-stage">
        <Visualizer className="absolute inset-0" artwork={cur?.artworkUrl} />
        <div className={cn('pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-4 text-white transition-opacity', full && hideUi && 'opacity-0')}>
          <div className="min-w-0"><div className="truncate text-sm font-semibold">{cur?.title ?? 'Nothing playing'}</div><div className="truncate text-xs text-white/70">{cur?.artist}</div></div>
          <div className="pointer-events-auto flex items-center gap-2">
            <button aria-label={status === 'playing' ? 'Pause' : 'Play'} onClick={() => void usePlayer.getState().toggle()} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25">{status === 'playing' ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
            <button aria-label={full ? 'Exit immersive mode' : 'Immersive mode'} onClick={() => void toggleFull()} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25">{full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
          </div>
        </div>
      </div>

      {!cur && <p className="text-sm text-muted">Play something from your library or a release to see it react.</p>}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Visual style">
        {MODES.map((m) => <Chip key={m.id} active={viz.mode === m.id} onClick={() => upd('mode', m.id)}>{m.label}</Chip>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-1">
          <h2 className="mb-1 text-sm font-bold">Look</h2>
          <Row title="Colour A"><input type="color" aria-label="Colour A" value={viz.colorA} onChange={(e) => upd('colorA', e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent" /></Row>
          <Row title="Colour B"><input type="color" aria-label="Colour B" value={viz.colorB} onChange={(e) => upd('colorB', e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent" /></Row>
          <Row title="Background"><input type="color" aria-label="Background colour" value={viz.background} onChange={(e) => upd('background', e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent" /></Row>
          <Row title="Gradient"><Switch label="Gradient" checked={viz.gradient} onChange={(v) => upd('gradient', v)} /></Row>
          <Row title="Background effect"><Select aria-label="Background effect" className="w-auto" value={viz.backgroundEffect} onChange={(e) => upd('backgroundEffect', e.target.value as VizSettings['backgroundEffect'])}><option value="none">None</option><option value="vignette">Vignette</option><option value="stars">Stars</option><option value="artwork">Blurred artwork</option></Select></Row>
          <Row title="Glow" desc={`${viz.glow}`}><Slider label="Glow" value={viz.glow} min={0} max={40} onChange={(v) => upd('glow', v)} className="w-40" /></Row>
          <Row title="Size" desc={`${Math.round(viz.size * 100)}%`}><Slider label="Size" value={viz.size} min={0.4} max={1.2} step={0.05} onChange={(v) => upd('size', v)} className="w-40" /></Row>
        </Card>
        <Card className="space-y-1">
          <h2 className="mb-1 text-sm font-bold">Behaviour</h2>
          <Row title="Sensitivity" desc={viz.sensitivity.toFixed(1)}><Slider label="Sensitivity" value={viz.sensitivity} min={0.5} max={3} step={0.1} onChange={(v) => upd('sensitivity', v)} className="w-40" /></Row>
          <Row title="Speed" desc={`${viz.speed.toFixed(1)}×`}><Slider label="Speed" value={viz.speed} min={0.2} max={2} step={0.1} onChange={(v) => upd('speed', v)} className="w-40" /></Row>
          <Row title="Bar width" desc={`${viz.barWidth}px`}><Slider label="Bar width" value={viz.barWidth} min={2} max={30} onChange={(v) => upd('barWidth', v)} className="w-40" /></Row>
          <Row title="Bar spacing" desc={`${viz.barSpacing}px`}><Slider label="Bar spacing" value={viz.barSpacing} min={0} max={20} onChange={(v) => upd('barSpacing', v)} className="w-40" /></Row>
          <Row title="Particles" desc={`${viz.particleDensity}`}><Slider label="Particle density" value={viz.particleDensity} min={20} max={400} step={10} onChange={(v) => upd('particleDensity', v)} className="w-40" /></Row>
          <Row title="Frame rate"><Select aria-label="Frame rate" className="w-auto" value={viz.fps} onChange={(e) => upd('fps', Number(e.target.value) as 30 | 60)}><option value={60}>60 fps</option><option value={30}>30 fps</option></Select></Row>
          <Row title="Low-power mode" desc="Lower resolution and 24 fps — gentler on battery"><Switch label="Low-power mode" checked={lowPower} onChange={(v) => set({ lowPower: v })} /></Row>
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Presets</h2><div className="flex gap-2"><Button size="sm" onClick={() => setName('')}><Save size={14} />Save current</Button><Button size="sm" onClick={() => setViz({ ...DEFAULT_VIZ, mode: viz.mode })}><RotateCcw size={14} />Reset</Button></div></div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(BUILTIN).map(([n, p]) => <Chip key={n} onClick={() => setViz(p)}>{n}</Chip>)}
          {presets?.map((p) => (
            <span key={p.id} className="inline-flex items-center rounded-full border border-line pl-3 text-sm">
              <button onClick={() => setViz(p.data as Partial<VizSettings>)} className="py-1.5 pr-2 hover:text-accent">{p.name}</button>
              <button aria-label={`Delete preset ${p.name}`} onClick={() => void deletePreset(p.id)} className="rounded-full p-1.5 text-muted hover:text-red-400"><Trash2 size={13} /></button>
            </span>
          ))}
        </div>
      </Card>

      <Modal open={name !== null} onClose={() => setName(null)} title="Save visualiser preset" footer={<><Button onClick={() => setName(null)}>Cancel</Button><Button variant="primary" onClick={() => { void savePreset('viz', name ?? '', viz); setName(null) }}>Save</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); void savePreset('viz', name ?? '', viz); setName(null) }}><Field label="Preset name"><Input autoFocus maxLength={60} value={name ?? ''} onChange={(e) => setName(e.target.value)} /></Field></form>
      </Modal>
    </div>
  )
}
