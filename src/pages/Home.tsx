import { CloudOff, Disc3, KeyRound, Play, Shuffle } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSync } from '../catalog/sync'
import { byRecent, matchesWindow } from '../catalog/queries'
import { PlaylistCard } from '../components/PlaylistCard'
import { ReleaseCard } from '../components/ReleaseCard'
import { Section, Shelf, ShelfSkeleton } from '../components/Section'
import { SyncButton } from '../components/SyncButton'
import { TrackCard } from '../components/TrackCard'
import { Artwork } from '../components/Artwork'
import { Button, Card } from '../components/ui'
import { useCatalog, useFavourites, useFollows, useHistory, useLibrary, usePlaylists, useTrackIndex } from '../lib/data'
import { becauseYouListenTo, buildAffinity, discoverNewArtists, favouriteGenres, musicMix, recommendForYou, type Candidate } from '../lib/recommend'
import { isPlayable } from '../lib/queueLogic'
import { norm, timeAgo } from '../lib/util'
import { usePlayer } from '../store/player'
import { useSettings } from '../store/settings'
import type { Release, Track } from '../types'

function greeting(h = new Date().getHours()) { return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

export default function Home() {
  const [catalog, loadingCat] = useCatalog()
  const [history] = useHistory()
  const [library] = useLibrary()
  const [favs] = useFavourites()
  const [follows] = useFollows()
  const [playlists] = usePlaylists()
  const [index] = useTrackIndex()
  const recsOn = useSettings((s) => s.recommendations)
  const hasKey = useSettings((s) => !!s.jamendoClientId.trim() && s.providers.jamendo !== false)
  const syncing = useSync((s) => s.running)
  const last = useSync((s) => s.last)
  const cur = usePlayer((s) => s.queue[s.index])
  const position = usePlayer((s) => s.position)
  const status = usePlayer((s) => s.status)
  const queue = usePlayer((s) => s.queue)

  const now = Date.now()
  const aff = useMemo(() => buildAffinity(history ?? [], favs ?? [], (follows ?? []).map((f) => f.name)), [history, favs, follows])
  const cands: Candidate[] = useMemo(() => [...(catalog ?? []).map((release) => ({ release })), ...(library ?? []).map((track) => ({ track }))], [catalog, library])
  const hasSignals = (history?.length ?? 0) + (favs?.length ?? 0) + (follows?.length ?? 0) > 0

  const recs = useMemo(() => (recsOn && hasSignals ? recommendForYou(cands.filter((c) => c.release), aff, 14) : []), [recsOn, hasSignals, cands, aff])
  const because = useMemo(() => (recsOn && hasSignals ? becauseYouListenTo(cands.filter((c) => c.release), aff) : undefined), [recsOn, hasSignals, cands, aff])
  const discover = useMemo(() => (recsOn ? discoverNewArtists(cands.filter((c) => c.release), aff, 12) : []), [recsOn, cands, aff])
  const genres = useMemo(() => (recsOn ? favouriteGenres(aff, 10) : []), [recsOn, aff])
  const mix = useMemo(() => {
    if (!recsOn) return []
    const pool = new Map<string, Track>()
    for (const t of library ?? []) pool.set(t.id, t)
    for (const f of favs ?? []) if (isPlayable(f.track)) pool.set(f.id, f.track)
    for (const t of index?.values() ?? []) if (isPlayable(t) && aff.plays.has(t.id)) pool.set(t.id, t)
    return musicMix([...pool.values()], aff, 30)
  }, [recsOn, library, favs, index, aff])

  const recent = useMemo(() => {
    const seen = new Set<string>(); const out: Track[] = []
    for (const h of [...(history ?? [])].sort((a, b) => b.startedAt - a.startedAt)) {
      if (seen.has(h.trackId)) continue
      seen.add(h.trackId)
      const t = index?.get(h.trackId)
      if (t) out.push(t)
      if (out.length >= 16) break
    }
    return out
  }, [history, index])

  const latest = useMemo(() => (catalog ?? []).filter((r) => matchesWindow(r, 'month', now) || !r.releaseDate).sort(byRecent).slice(0, 16), [catalog, now])
  const trending = useMemo(() => (catalog ?? []).filter((r) => r.trending).sort((a, b) => (b.listenCount ?? 0) - (a.listenCount ?? 0)).slice(0, 16), [catalog])
  const indie = useMemo(() => {
    const by = new Map<string, { name: string; art?: string; n: number; score: number }>()
    for (const r of catalog ?? []) {
      if (!r.independent) continue
      const k = norm(r.artist); const e = by.get(k) ?? { name: r.artist, art: undefined, n: 0, score: 0 }
      e.n++; e.score += 1 + (r.listenCount ?? 0) / 100 + (r.trending ? 3 : 0); e.art ??= r.artworkUrl
      by.set(k, e)
    }
    return [...by.values()].sort((a, b) => b.score - a.score).slice(0, 14)
  }, [catalog])

  // "Continue listening": the loaded track if it's paused part-way, otherwise the last partially-played track.
  const resume = cur && status !== 'playing' && position > 5 && (cur.duration == null || position < cur.duration - 5) ? cur : undefined

  const empty = !loadingCat && (catalog?.length ?? 0) === 0
  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <div className="space-y-9">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">OpenSong</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{greeting()}</h1>
          <p className="mt-1 text-sm text-muted">
            {syncing ? 'Looking for new music…' : last ? `Catalogue updated ${timeAgo(last.at)}` : 'Free music, discovered fresh. No ads. No accounts.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mix.length > 1 && <Button size="sm" variant="primary" onClick={() => void usePlayer.getState().playQueue(mix, 0)}><Shuffle size={14} />Your Music Mix</Button>}
          <SyncButton />
        </div>
      </header>

      {offline && <Card className="flex items-center gap-3 text-sm"><CloudOff size={18} className="text-muted" />You’re offline. Your library, playlists and statistics still work; online catalogues will return when you reconnect.</Card>}
      {!hasKey && (
        <Card className="flex flex-wrap items-center gap-3 text-sm">
          <KeyRound size={18} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">Unlock full-length streaming of independent music: add your own free Jamendo client ID. Without it, OpenSong still plays Creative Commons and public-domain music from the Internet Archive and Wikimedia Commons.</span>
          <Link to="/settings" className="font-semibold text-accent hover:underline">Set up</Link>
        </Card>
      )}

      {resume && (
        <Section title="Continue listening">
          <Card className="flex items-center gap-4">
            <Artwork src={resume.artworkUrl} blobKey={resume.artworkBlobKey} title={resume.title} className="h-16 w-16" />
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{resume.title}</div><div className="truncate text-sm text-muted">{resume.artist} · resume at {Math.floor(position / 60)}:{String(Math.floor(position % 60)).padStart(2, '0')}</div></div>
            <Button variant="primary" onClick={() => void usePlayer.getState().toggle()}><Play size={16} fill="currentColor" />Resume</Button>
          </Card>
        </Section>
      )}
      {!resume && queue.length === 0 && recent.length > 0 && null}

      {recent.length > 0 && (
        <Section title="Recently played" to="/recent">
          <Shelf>{recent.map((t) => <TrackCard key={t.id} track={t} context={recent} />)}</Shelf>
        </Section>
      )}

      {recsOn && recs.length > 0 && (
        <Section title="Recommended for you" subtitle="Picked on this device from what you play, favourite and follow. Every pick says why.">
          <Shelf>{recs.map((r) => <ReleaseCard key={r.release!.id} release={r.release!} note={r.reasons[0]} />)}</Shelf>
        </Section>
      )}

      <Section title="New releases" subtitle="Fresh from open music catalogues" to="/new">
        {loadingCat || (syncing && empty) ? <ShelfSkeleton /> : empty ? (
          <Card className="space-y-2 text-sm"><div className="flex items-center gap-2 font-semibold"><Disc3 size={16} />No releases yet</div><p className="text-muted">{offline ? 'Connect to the internet once and OpenSong will fetch the latest releases.' : 'The first update is on its way. If nothing appears, press Refresh — some sources may be temporarily unavailable.'}</p></Card>
        ) : <Shelf>{latest.map((r) => <ReleaseCard key={r.id} release={r} />)}</Shelf>}
      </Section>

      {trending.length > 0 && (
        <Section title="Trending music" subtitle="What the open music community is playing this week" to="/trending">
          <Shelf>{trending.map((r) => <ReleaseCard key={r.id} release={r} />)}</Shelf>
        </Section>
      )}

      {indie.length > 0 && (
        <Section title="Popular independent artists" subtitle="Creative Commons and public-domain creators">
          <Shelf>{indie.map((a) => (
            <Link key={a.name} to={`/artist/${encodeURIComponent(a.name)}`} className="group w-32 shrink-0 text-center sm:w-36">
              <Artwork src={a.art} title={a.name} className="w-full" rounded="rounded-full" />
              <div className="mt-2 truncate text-sm font-semibold group-hover:underline">{a.name}</div>
              <div className="text-[11px] text-muted">{a.n} release{a.n > 1 ? 's' : ''}</div>
            </Link>))}</Shelf>
        </Section>
      )}

      {recsOn && discover.length > 0 && (
        <Section title="Discover something new" subtitle="Artists you haven’t played yet">
          <Shelf>{discover.map((r) => <ReleaseCard key={r.release!.id} release={r.release!} note={r.reasons[0]} />)}</Shelf>
        </Section>
      )}

      {recsOn && because && (
        <Section title={`Because you listen to ${because.artist}`}>
          <Shelf>{because.items.map((r) => <ReleaseCard key={r.release!.id} release={r.release!} note={r.reasons[0]} />)}</Shelf>
        </Section>
      )}

      {recsOn && genres.length > 0 && (
        <Section title="Your favourite genres" subtitle="Based on your listening history">
          <div className="flex flex-wrap gap-2">{genres.map((g) => <Link key={g.genre} to={`/explore?genre=${encodeURIComponent(g.genre)}`} className="rounded-full border border-line px-4 py-2 text-sm font-medium capitalize hover:border-accent hover:text-accent">{g.genre}</Link>)}</div>
        </Section>
      )}

      {(playlists?.length ?? 0) > 0 && (
        <Section title="Your playlists" to="/playlists"><Shelf>{playlists!.slice(0, 12).map((p) => <PlaylistCard key={p.id} playlist={p} />)}</Shelf></Section>
      )}

      {!hasSignals && (
        <Card className="space-y-1 text-sm"><div className="font-semibold">Personalised sections will appear here</div><p className="text-muted">Play, favourite or follow a few things and OpenSong will start recommending music — entirely on this device. You can turn recommendations off in Settings → Privacy.</p></Card>
      )}
    </div>
  )
}
export type { Release }
