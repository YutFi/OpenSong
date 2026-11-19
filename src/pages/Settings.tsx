import { Download, ExternalLink, HardDrive, Keyboard, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { syncCatalog, useSync } from '../catalog/sync'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ProviderHealthList } from '../components/ProviderHealth'
import { PageHeader } from '../components/Section'
import { Button, Card, Field, Input, Row, Select, Switch } from '../components/ui'
import { useLive } from '../lib/useLive'
import { db, wipeAll } from '../lib/db'
import { exportBackup, importBackup } from '../lib/library'
import { SHORTCUTS } from '../lib/useShortcuts'
import { download, timeAgo } from '../lib/util'
import { providerContext } from '../lib/providerCtx'
import { providers } from '../providers/registry'
import { usePlayer } from '../store/player'
import { DEFAULT_SETTINGS, useSettings, type Settings as S } from '../store/settings'
import { useUI } from '../store/ui'

const ACCENTS = ['#ff6a3d', '#f43f5e', '#a855f7', '#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308']

function Group({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return <Card id={id} className="space-y-1"><h2 className="mb-1 text-base font-bold">{title}</h2>{children}</Card>
}
const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)

export default function Settings() {
  const s = useSettings()
  const { set } = useSettings.getState()
  const toast = useUI.getState().toast
  const syncing = useSync((x) => x.running)
  const last = useSync((x) => x.last)
  const backupIn = useRef<HTMLInputElement>(null)
  const [wipe, setWipe] = useState(false)
  const [storage, setStorage] = useState<{ used?: number; quota?: number; persisted?: boolean }>({})
  const [counts] = useLive(async () => ({ tracks: await db.tracks.count(), playlists: await db.playlists.count(), history: await db.history.count(), catalog: await db.catalog.count() }), [])
  const [install, setInstall] = useState<(Event & { prompt?: () => Promise<void> }) | null>(null)

  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.().catch(() => undefined)
      const persisted = await navigator.storage?.persisted?.().catch(() => undefined)
      setStorage({ used: est?.usage, quota: est?.quota, persisted })
    })()
    const h = (e: Event) => { e.preventDefault(); setInstall(e as Event & { prompt?: () => Promise<void> }) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [counts?.tracks])

  const hosts = [...new Set(providers.filter((p) => s.providers[p.id] !== false && p.isConfigured(providerContext().settings)).flatMap((p) => p.hosts))].sort()

  const toggleNotifs = async (v: boolean) => {
    if (!v) { set({ notifications: false }); return }
    if (typeof Notification === 'undefined') { toast('This browser doesn’t support notifications.', 'error'); return }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm === 'granted') { set({ notifications: true }); toast('Notifications on — shown only while OpenSong is open or running in the background.', 'success') }
    else toast('Permission wasn’t granted, so notifications stay off.', 'error')
  }

  const doExport = async () => {
    const { set: _a, setEq: _b, setViz: _c, setBand: _d, applyPreset: _e, setBands: _f, resetEq: _g, ...settings } = useSettings.getState()
    void [_a, _b, _c, _d, _e, _f, _g]
    download(`opensong-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup({ ...settings, jamendoClientId: '', youtubeApiKey: '' }))
    toast('Backup saved. It excludes your API keys and your audio files.', 'success')
  }
  const doImport = async (f: File) => {
    try {
      const r = await importBackup(await f.text())
      if (r.settings && typeof r.settings === 'object') { const { jamendoClientId: _k, youtubeApiKey: _y, ...rest } = r.settings as Partial<S>; void [_k, _y]; set(rest) }
      toast(`Restored ${r.playlists} playlists, ${r.favourites} favourites, ${r.history} history entries`, 'success')
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not read that backup', 'error') }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Everything is stored in this browser. There are no accounts and no servers of ours." />

      <Group title="Appearance">
        <Row title="Theme"><Select aria-label="Theme" className="w-auto" value={s.theme} onChange={(e) => set({ theme: e.target.value as S['theme'] })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Match system</option></Select></Row>
        <Row title="Accent colour"><div className="flex gap-1.5" role="radiogroup" aria-label="Accent colour">{ACCENTS.map((c) => <button key={c} role="radio" aria-checked={s.accent === c} aria-label={`Accent ${c}`} onClick={() => set({ accent: c })} className="h-7 w-7 rounded-full border-2" style={{ background: c, borderColor: s.accent === c ? 'var(--fg)' : 'transparent' }} />)}</div></Row>
        <Row title="Low-power mode" desc="Cheaper visualiser rendering — recommended on older phones"><Switch label="Low-power mode" checked={s.lowPower} onChange={(v) => set({ lowPower: v })} /></Row>
        {install?.prompt && <Row title="Install OpenSong" desc="Add it to your home screen or desktop"><Button size="sm" onClick={() => void install.prompt!()}>Install</Button></Row>}
      </Group>

      <Group title="Music sources" id="sources">
        <p className="text-sm text-muted">OpenSong only plays what a source explicitly allows. Metadata-only sources never imply you can stream the music.</p>
        <div className="divide-y divide-line">
          {providers.map((p) => (
            <div key={p.id} className="space-y-1 py-3">
              <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{p.description}</div></div><Switch label={`Use ${p.name}`} checked={s.providers[p.id] !== false} onChange={(v) => set({ providers: { ...s.providers, [p.id]: v } })} /></div>
              <dl className="grid gap-x-4 text-xs text-muted sm:grid-cols-2"><div><dt className="inline font-medium text-fg">Playback: </dt><dd className="inline">{p.playback}</dd></div><div><dt className="inline font-medium text-fg">Data licence: </dt><dd className="inline">{p.dataLicense}</dd></div><div><dt className="inline font-medium text-fg">Rate limit: </dt><dd className="inline">{p.rateLimit}</dd></div><div className="flex gap-3"><a className="inline-flex items-center gap-1 text-accent hover:underline" href={p.homepage} target="_blank" rel="noopener noreferrer">Website<ExternalLink size={11} /></a><a className="inline-flex items-center gap-1 text-accent hover:underline" href={p.termsUrl} target="_blank" rel="noopener noreferrer">Terms<ExternalLink size={11} /></a></div></dl>
            </div>
          ))}
        </div>
        <Field label="Jamendo client ID (optional, free)" hint={<>Jamendo needs a client ID for full-length streams. Create a free one at <a className="text-accent hover:underline" href="https://developer.jamendo.com/v3.0" target="_blank" rel="noopener noreferrer">developer.jamendo.com</a>. It stays in this browser and is never included in backups.</>}>
          <Input value={s.jamendoClientId} onChange={(e) => set({ jamendoClientId: e.target.value.trim() })} placeholder="e.g. 1a2b3c4d" autoComplete="off" spellCheck={false} aria-label="Jamendo client ID" />
        </Field>
        <div className="space-y-3 rounded-2xl border border-line p-4">
          <div className="min-w-0"><div className="font-medium">YouTube music: setup (optional, free)</div><div className="text-xs text-muted">Turn “YouTube (official player)” on above, then add your own free key. Off by default.</div></div>
          <Field label="Your YouTube Data API key" hint={<>Free: create a key at <a className="text-accent hover:underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>, enable “YouTube Data API v3”, and restrict the key to this site’s address. It stays in this browser and is never included in backups. Free quota only — if it runs out, YouTube results pause until it resets.</>}>
            <Input value={s.youtubeApiKey} onChange={(e) => set({ youtubeApiKey: e.target.value.trim() })} placeholder="AIza…" autoComplete="off" spellCheck={false} aria-label="YouTube API key" />
          </Field>
          <Field label="Chart region (2-letter country code)"><Input value={s.youtubeRegion} maxLength={2} onChange={(e) => set({ youtubeRegion: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} aria-label="YouTube region" className="w-24" /></Field>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            <li><b className="text-fg">Privacy:</b> when you play a YouTube song, YouTube’s player loads from Google servers and may set cookies; Google’s terms and privacy policy apply to that. Nothing is loaded from YouTube until you turn this on and play a YouTube song.</li>
            <li><b className="text-fg">Limits:</b> the player stays on screen while a song plays. The equaliser, visualiser, crossfade and speed don’t apply, and playback usually stops when the screen locks or the tab is in the background.</li>
            <li>OpenSong never downloads or extracts YouTube audio.</li>
          </ul>
        </div>
        <Row title="Jamendo stream format"><Select aria-label="Jamendo format" className="w-auto" value={s.jamendoFormat} onChange={(e) => set({ jamendoFormat: e.target.value as S['jamendoFormat'] })}><option value="mp31">MP3 · 96 kbps</option><option value="mp32">MP3 · VBR (best)</option><option value="ogg">Ogg Vorbis</option><option value="flac">FLAC</option></Select></Row>
        <Row title="Internet Archive format"><Select aria-label="Archive format" className="w-auto" value={s.archiveFormat} onChange={(e) => set({ archiveFormat: e.target.value as S['archiveFormat'] })}><option value="mp3">MP3</option><option value="ogg">Ogg Vorbis</option></Select></Row>
        <div className="pt-2"><h3 className="mb-2 text-sm font-semibold">Source status</h3><ProviderHealthList compact /></div>
      </Group>

      <Group title="Catalogue updates">
        <Row title="Update automatically" desc="Checks for new releases when OpenSong opens and every few hours while it’s open (new: 6 h · trending: 12 h)"><Switch label="Update automatically" checked={s.autoSync} onChange={(v) => set({ autoSync: v })} /></Row>
        <Row title="Notify me about followed artists" desc="A browser notification when a followed artist has a new release. Requires permission."><Switch label="Notifications" checked={s.notifications} onChange={(v) => void toggleNotifs(v)} /></Row>
        <Row title="Last update" desc={last ? `${timeAgo(last.at)} · ${last.added} new` : 'Not run yet this session'}><Button size="sm" disabled={syncing} onClick={async () => { const r = await syncCatalog({ force: true }); toast(`${r.added} new release${r.added === 1 ? '' : 's'}`, 'success') }}>{syncing ? 'Updating…' : 'Update now'}</Button></Row>
        <p className="pt-1 text-xs text-muted">Browsers don’t let a web app poll in the background while fully closed, so updates happen when you open OpenSong — it never pretends otherwise.</p>
      </Group>

      <Group title="Playback">
        <Row title="Resume where I left off" desc="Restores the queue and position on next launch"><Switch label="Resume session" checked={s.resumeSession} onChange={(v) => set({ resumeSession: v })} /></Row>
        <Row title="Skip audio processing for online streams" desc="Plays streams on a plain element. Turn on if lock-screen playback misbehaves on your phone — the equaliser and visualiser then won’t affect online music."><Switch label="Bypass processing" checked={s.bypassProcessing} onChange={(v) => set({ bypassProcessing: v })} /></Row>
        <p className="text-xs text-muted">Crossfade, speed and the equaliser are on the <a className="text-accent hover:underline" href="#/equaliser">Equaliser page</a>.</p>
      </Group>

      <Group title="Privacy" id="privacy">
        <div className="flex items-start gap-3 rounded-xl bg-surface2/60 p-3 text-sm"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" /><p>No accounts, no analytics, no ads, no tracking. Requests are sent without cookies. Your listening history, favourites and playlists never leave this device.</p></div>
        <Row title="Recommendations" desc="Computed on this device from your history, favourites and follows"><Switch label="Recommendations" checked={s.recommendations} onChange={(v) => set({ recommendations: v })} /></Row>
        <Row title="Record listening history" desc="Powers Recently played, statistics and recommendations"><Switch label="Record history" checked={s.recordHistory} onChange={(v) => set({ recordHistory: v })} /></Row>
        <div className="pt-2 text-sm"><h3 className="mb-1 font-semibold">Servers this app contacts right now</h3>{hosts.length ? <ul className="flex flex-wrap gap-1.5">{hosts.map((h) => <li key={h} className="rounded-full border border-line px-2.5 py-1 text-xs">{h}</li>)}</ul> : <p className="text-xs text-muted">None — all sources are off.</p>}<p className="mt-2 text-xs text-muted">Search words and artist names you look up are sent to those sources. Audio you stream comes from the source’s own host. Nothing goes to us — we don’t run a server.</p></div>
      </Group>

      <Group title="Your data">
        <p className="text-sm text-muted">{counts ? `${counts.tracks} library tracks · ${counts.playlists} playlists · ${counts.history} history entries · ${counts.catalog} cached releases` : ''}{storage.used != null ? ` · ${fmtBytes(storage.used)} used${storage.quota ? ` of ~${fmtBytes(storage.quota)}` : ''}` : ''}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => void doExport()}><Download size={16} />Export backup</Button>
          <Button onClick={() => backupIn.current?.click()}><Upload size={16} />Restore backup</Button>
          {storage.persisted === false && <Button onClick={async () => { const ok = await navigator.storage.persist(); setStorage((x) => ({ ...x, persisted: ok })); toast(ok ? 'Storage protected from automatic clean-up' : 'The browser declined — try installing the app first', ok ? 'success' : 'info') }}><HardDrive size={16} />Protect storage</Button>}
          <Button variant="danger" onClick={() => setWipe(true)}><Trash2 size={16} />Erase everything</Button>
        </div>
        <input ref={backupIn} type="file" accept="application/json,.json" className="hidden" aria-label="Choose backup file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = '' }} />
        <p className="text-xs text-muted">Backups contain playlists, favourites, follows, history and settings. Imported audio files stay in the browser and aren’t part of the backup — keep your originals. Browsers can clear site data if the device is low on space; make a backup now and then.</p>
      </Group>

      <Group title="Keyboard shortcuts">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted"><Keyboard size={16} />Active when you’re not typing in a field.</div>
        <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">{SHORTCUTS.map(([k, d]) => <div key={k} className="flex items-center justify-between gap-3 text-sm"><dt className="text-muted">{d}</dt><dd><kbd className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 font-mono text-xs">{k}</kbd></dd></div>)}</dl>
      </Group>

      <Group title="About">
        <p className="text-sm text-muted">OpenSong {import.meta.env.VITE_APP_VERSION ?? '0.1.0'} — free software under the GNU GPL v3. Music belongs to its artists and is played only under the terms each source publishes. OpenSong never scrapes or bypasses any service.</p>
        <p className="text-xs text-muted">Music metadata courtesy of MusicBrainz and ListenBrainz (CC0 data); audio from Jamendo, the Internet Archive and Wikimedia Commons under their stated licences — each track shows its licence.</p>
      </Group>

      <ConfirmDialog open={wipe} onClose={() => setWipe(false)} title="Erase all OpenSong data?" confirmLabel="Erase everything" body="This deletes your library, playlists, favourites, history, presets and cached catalogue from this browser, and resets all settings. It can’t be undone — export a backup first if you might want it back." onConfirm={() => { void (async () => { usePlayer.getState().clearQueue(); await wipeAll(); localStorage.removeItem('opensong:settings'); localStorage.removeItem('opensong:session'); set({ ...DEFAULT_SETTINGS }); location.reload() })() }} />
    </div>
  )
}
