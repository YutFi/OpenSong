import { Save, Pencil, RotateCcw, Trash2, Info } from 'lucide-react'
import { useState } from 'react'
import { BAND_FREQS, BAND_Q, BUILTIN_PRESETS, GAIN_MAX, GAIN_MIN, effectiveParams, type BandCount } from '../audio/eq'
import { EqCurve } from '../components/EqCurve'
import { PageHeader } from '../components/Section'
import { Button, Card, Field, Input, Modal, Row, Select, Slider, Switch } from '../components/ui'
import { VSlider } from '../components/VSlider'
import { db } from '../lib/db'
import { deletePreset, renamePreset, savePreset } from '../lib/presets'
import { useLive } from '../lib/useLive'
import { useSettings, audioParams, type EqState } from '../store/settings'
import { useUI } from '../store/ui'
import { usePlayer } from '../store/player'

const fmtHz = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`)
const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`

export default function Equaliser() {
  const eq = useSettings((s) => s.eq)
  const crossfade = useSettings((s) => s.crossfade)
  const speed = useSettings((s) => s.speed)
  const bypass = useSettings((s) => s.bypassProcessing)
  const { set, setEq, setBand, applyPreset, setBands, resetEq } = useSettings.getState()
  const mode = usePlayer((s) => s.mode)
  const [presets] = useLive(() => db.presets.where('kind').equals('eq').sortBy('name'), [])
  const [dlg, setDlg] = useState<null | { kind: 'save' | 'rename'; id?: string; name: string }>(null)

  const gains = eq.gains[eq.bands]
  const freqs = BAND_FREQS[eq.bands]
  const eff = effectiveParams(audioParams(eq))
  const selectedUser = presets?.find((p) => p.name === eq.preset)

  const choose = (name: string) => {
    const u = presets?.find((p) => `u:${p.id}` === name)
    if (u) { applyPreset(u.name, (u.data as { gains: EqState['gains'] }).gains) } else applyPreset(name)
  }
  const sanitizeGains = (g: EqState['gains']): EqState['gains'] => ({ 5: g[5].slice(0, 5), 10: g[10].slice(0, 10), 15: g[15].slice(0, 15) })

  const doSave = async () => {
    if (!dlg) return
    if (dlg.kind === 'save') {
      const row = await savePreset('eq', dlg.name, { gains: sanitizeGains(eq.gains), bands: eq.bands, preamp: eq.preamp, bass: eq.bass, treble: eq.treble })
      applyPreset(row.name, eq.gains)
      useUI.getState().toast(`Saved preset “${row.name}”`, 'success')
    } else if (dlg.id) { await renamePreset(dlg.id, dlg.name); if (selectedUser?.id === dlg.id) setEq({ preset: dlg.name.trim() || selectedUser.name }) }
    setDlg(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Equaliser" subtitle="Real-time Web Audio filters on everything you play, with the output limiter always on." actions={<>
        <Switch showLabel label="Equaliser on" checked={eq.enabled} onChange={(v) => setEq({ enabled: v })} />
        <Button size="sm" onClick={resetEq}><RotateCcw size={14} />Reset</Button>
      </>} />

      {(bypass || mode === 'bypass' || mode === 'embed') && (
        <Card className="flex items-start gap-3 text-sm"><Info size={18} className="mt-0.5 shrink-0 text-accent" /><p className="text-muted">{mode === 'embed' ? 'The current song plays in YouTube’s own player, which doesn’t allow audio processing, so the equaliser can’t change it. Songs from other sources and your own files are unaffected.' : bypass ? 'Processing is bypassed in Settings, so the equaliser has no effect on online streams.' : 'The current online stream doesn’t permit audio processing (browser CORS rules), so it’s playing without the equaliser. Your own files and most Creative Commons streams are unaffected.'}</p></Card>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-line p-0.5" role="group" aria-label="Number of bands">
            {([5, 10, 15] as BandCount[]).map((n) => <button key={n} aria-pressed={eq.bands === n} onClick={() => setBands(n)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${eq.bands === n ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'}`}>{n}-band</button>)}
          </div>
          <Select aria-label="Preset" className="w-auto min-w-[10rem]" value={selectedUser ? `u:${selectedUser.id}` : eq.preset} onChange={(e) => choose(e.target.value)}>
            <optgroup label="Built-in">{BUILTIN_PRESETS.filter((p) => p !== 'Custom' || eq.preset === 'Custom').map((p) => <option key={p} value={p}>{p}</option>)}</optgroup>
            {(presets?.length ?? 0) > 0 && <optgroup label="Yours">{presets!.map((p) => <option key={p.id} value={`u:${p.id}`}>{p.name}</option>)}</optgroup>}
          </Select>
          <Button size="sm" onClick={() => setDlg({ kind: 'save', name: eq.preset === 'Custom' ? '' : eq.preset })}><Save size={14} />Save as preset</Button>
          {selectedUser && <>
            <Button size="sm" onClick={() => setDlg({ kind: 'rename', id: selectedUser.id, name: selectedUser.name })}><Pencil size={14} />Rename</Button>
            <Button size="sm" variant="danger" onClick={() => void deletePreset(selectedUser.id).then(() => { applyPreset('Normal'); useUI.getState().toast('Preset deleted') })}><Trash2 size={14} />Delete</Button>
          </>}
        </div>

        <EqCurve freqs={freqs} gains={gains} q={BAND_Q[eq.bands]} enabled={eq.enabled} />

        <div className={`flex items-stretch justify-between gap-1 overflow-x-auto pb-1 ${eq.enabled ? '' : 'opacity-50'}`} role="group" aria-label="Band gains">
          {gains.map((g, i) => (
            <div key={`${eq.bands}-${i}`} className="flex min-w-[2.25rem] flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-muted">{g > 0 ? '+' : ''}{g}</span>
              <div className="h-40"><VSlider value={g} min={GAIN_MIN} max={GAIN_MAX} step={0.5} onChange={(v) => setBand(i, v)} label={`${fmtHz(freqs[i])} Hz gain`} valueText={fmtDb(g)} /></div>
              <span className="text-[10px] font-medium text-muted">{fmtHz(freqs[i])}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted">Double-click a band to return it to 0 dB. Range ±12 dB.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-1">
          <h2 className="mb-1 text-sm font-bold">Tone & level</h2>
          <Row title="Preamp" desc={eq.autoHeadroom ? `Auto headroom is applying ${fmtDb(eff.preampDb - eq.preamp)} to avoid clipping` : 'Manual — a limiter still protects the output'}><Slider label="Preamp" value={eq.preamp} min={-12} max={12} step={0.5} onChange={(v) => setEq({ preamp: v })} className="w-40" /></Row>
          <Row title="Auto headroom" desc="Lower the level automatically when boosting bands"><Switch label="Auto headroom" checked={eq.autoHeadroom} onChange={(v) => setEq({ autoHeadroom: v })} /></Row>
          <Row title="Bass"><Slider label="Bass" value={eq.bass} min={-10} max={10} step={0.5} onChange={(v) => setEq({ bass: v })} className="w-40" /></Row>
          <Row title="Treble"><Slider label="Treble" value={eq.treble} min={-10} max={10} step={0.5} onChange={(v) => setEq({ treble: v })} className="w-40" /></Row>
          <Row title="Loudness" desc="Gentle low/high lift for quiet listening"><Slider label="Loudness" value={eq.loudness} min={0} max={10} step={0.5} onChange={(v) => setEq({ loudness: v })} className="w-40" /></Row>
        </Card>
        <Card className="space-y-1">
          <h2 className="mb-1 text-sm font-bold">Stereo & playback</h2>
          <Row title="Balance" desc={eq.balance === 0 ? 'Centre' : eq.balance < 0 ? `${Math.round(-eq.balance * 100)}% left` : `${Math.round(eq.balance * 100)}% right`}><Slider label="Balance" value={eq.balance} min={-1} max={1} step={0.05} onChange={(v) => setEq({ balance: v })} className="w-40" /></Row>
          <Row title="Stereo width" desc={`${Math.round(eq.width * 100)}% (100% is unchanged, 0% is mono)`}><Slider label="Stereo width" value={eq.width} min={0} max={2} step={0.05} onChange={(v) => setEq({ width: v })} className="w-40" /></Row>
          <Row title="Crossfade" desc={crossfade ? `${crossfade}s between tracks` : 'Off'}><Slider label="Crossfade" value={crossfade} min={0} max={12} step={1} onChange={(v) => set({ crossfade: v })} className="w-40" /></Row>
          <Row title="Playback speed" desc={`${speed.toFixed(2)}×`}><Slider label="Playback speed" value={speed} min={0.5} max={2} step={0.05} onChange={(v) => set({ speed: v })} className="w-40" /></Row>
        </Card>
      </div>

      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.kind === 'rename' ? 'Rename preset' : 'Save preset'} footer={<><Button onClick={() => setDlg(null)}>Cancel</Button><Button variant="primary" onClick={() => void doSave()}>Save</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); void doSave() }}><Field label="Preset name"><Input autoFocus maxLength={60} value={dlg?.name ?? ''} onChange={(e) => setDlg((d) => d && { ...d, name: e.target.value })} /></Field></form>
      </Modal>
    </div>
  )
}
