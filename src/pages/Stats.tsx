import { BarChart3, ChevronLeft, ChevronRight, Download, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BarChart, Donut, LineChart, RankList } from '../components/charts'
import { PageHeader } from '../components/Section'
import { Button, Card, Chip, EmptyState } from '../components/ui'
import { useHistory } from '../lib/data'
import { busiestMonth, inRange, monthlyTotals, rangeFor, series, summarize, toCSV, type RangeKind } from '../lib/stats'
import { download, formatDuration } from '../lib/util'
import { useSettings } from '../store/settings'

const KINDS: [RangeKind, string][] = [['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All time']]
const hrs = (s: number) => Math.round((s / 3600) * 10) / 10
const mins = (s: number) => Math.round(s / 60)
const hour = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card className="space-y-0.5 !p-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div><div className="text-2xl font-extrabold tabular-nums">{value}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</Card>
}

export default function Stats() {
  const [history, loading] = useHistory()
  const recording = useSettings((s) => s.recordHistory)
  const [kind, setKind] = useState<RangeKind>('month')
  const [offset, setOffset] = useState(0)
  const all = history ?? []

  const range = useMemo(() => rangeFor(kind, Date.now(), offset), [kind, offset])
  const s = useMemo(() => summarize(all, range), [all, range])
  const line = useMemo(() => series(all, range), [all, range])
  const year = new Date(range.kind === 'all' ? Date.now() : range.from).getFullYear()
  const monthly = useMemo(() => monthlyTotals(all, year), [all, year])
  const best = useMemo(() => busiestMonth(all, year), [all, year])
  const wrapped = useMemo(() => summarize(all, rangeFor('year')), [all])
  const rows = inRange(all, range)
  const earliest = all.reduce((m, e) => Math.min(m, e.startedAt), Date.now())

  const empty = !loading && all.length === 0
  const none = !loading && !empty && rows.length === 0
  const topHour = s.hourly.indexOf(Math.max(...s.hourly))

  return (
    <div className="space-y-8">
      <PageHeader title="Your listening" subtitle="Calculated from the history stored on this device. Nothing is uploaded or shared." actions={all.length > 0 && <Button size="sm" onClick={() => download('opensong-history.csv', toCSV(all), 'text/csv')}><Download size={14} />Export CSV</Button>} />

      {!recording && <Card className="text-sm text-muted">History recording is off in Settings → Privacy, so new listening isn’t being counted.</Card>}
      {empty ? <EmptyState icon={<BarChart3 />} title="No listening data yet">Play a few songs. A track counts as a play after 30 seconds (or half its length) — skips don’t count.</EmptyState> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {KINDS.map(([k, l]) => <Chip key={k} active={kind === k} onClick={() => { setKind(k); setOffset(0) }}>{l}</Chip>)}
            {kind !== 'all' && (
              <div className="ml-auto flex items-center gap-1 text-sm">
                <Button size="icon" variant="ghost" aria-label="Previous period" onClick={() => setOffset((o) => o - 1)} disabled={range.to <= earliest}><ChevronLeft size={18} /></Button>
                <span className="min-w-[8rem] text-center font-medium" aria-live="polite">{range.label}</span>
                <Button size="icon" variant="ghost" aria-label="Next period" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0}><ChevronRight size={18} /></Button>
              </div>
            )}
          </div>

          {none ? <EmptyState icon={<BarChart3 />} title={`Nothing played in ${range.label}`}>Try another period.</EmptyState> : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Listening time" value={s.totalSeconds >= 3600 ? `${hrs(s.totalSeconds)} h` : `${mins(s.totalSeconds)} min`} sub={`${s.sessions} session${s.sessions === 1 ? '' : 's'}`} />
                <Stat label="Plays" value={String(s.plays)} sub={`${Math.round(s.skipRate * 100)}% skipped`} />
                <Stat label="Artists" value={String(s.uniqueArtists)} sub={`${s.newArtists.length} new to you`} />
                <Stat label="Songs" value={String(s.uniqueTracks)} sub={s.avgSessionSeconds ? `Avg session ${formatDuration(s.avgSessionSeconds)}` : undefined} />
              </div>

              <Card className="space-y-2"><h2 className="text-sm font-bold">Listening over time <span className="font-normal text-muted">(minutes)</span></h2>
                <LineChart data={line.map((b) => ({ label: b.label, value: mins(b.seconds), title: `${b.label}: ${mins(b.seconds)} min · ${b.plays} plays` }))} ariaLabel={`Minutes listened per ${kind === 'week' || kind === 'month' ? 'day' : 'month'}, ${range.label}`} /></Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="space-y-2"><h2 className="text-sm font-bold">Top songs</h2>{s.topSongs.length ? <RankList items={s.topSongs.slice(0, 8).map((r) => ({ key: r.key, title: r.title, sub: r.artist, value: r.plays }))} /> : <p className="text-sm text-muted">No plays counted yet.</p>}</Card>
                <Card className="space-y-2"><h2 className="text-sm font-bold">Top artists</h2>{s.topArtists.length ? <RankList items={s.topArtists.slice(0, 8).map((r) => ({ key: r.key, title: r.title, value: r.plays, extra: `${mins(r.seconds)} min` }))} /> : <p className="text-sm text-muted">No plays counted yet.</p>}</Card>
                <Card className="space-y-2"><h2 className="text-sm font-bold">Top albums</h2>{s.topAlbums.length ? <RankList items={s.topAlbums.slice(0, 6).map((r) => ({ key: r.key, title: r.title, sub: r.artist, value: r.plays }))} /> : <p className="text-sm text-muted">Album info is only available for some sources.</p>}</Card>
                <Card className="space-y-3"><h2 className="text-sm font-bold">Genres</h2>{s.topGenres.length ? <Donut data={s.topGenres.slice(0, 6).map((g) => ({ label: g.title, value: g.seconds }))} ariaLabel="Share of listening time by genre" /> : <p className="text-sm text-muted">No genre tags on what you played.</p>}</Card>
              </div>

              <Card className="space-y-2"><h2 className="text-sm font-bold">When you listen <span className="font-normal text-muted">(minutes by hour of day)</span></h2>
                <BarChart data={s.hourly.map((v, h) => ({ label: hour(h), value: mins(v), title: `${hour(h)}: ${mins(v)} min` }))} highlight={Math.max(...s.hourly) > 0 ? topHour : undefined} ariaLabel="Listening minutes by hour of day" />
                {Math.max(...s.hourly) > 0 && <p className="text-xs text-muted">Peak hour: {hour(topHour)}</p>}</Card>

              {s.replays.length > 0 && <Card className="space-y-2"><h2 className="text-sm font-bold">On repeat</h2><RankList items={s.replays.slice(0, 5).map((r) => ({ key: r.key, title: r.title, sub: r.artist, value: r.plays }))} /></Card>}

              <Card className="flex flex-wrap items-center gap-4"><Sparkles className="shrink-0 text-accent" /><div><div className="text-lg font-bold">{s.personality.name}</div><p className="text-sm text-muted">{s.personality.why}</p><p className="mt-1 text-[11px] text-muted">A simple rule-based label — the reason is always shown. No AI, no profiling.</p></div></Card>
            </>
          )}

          <section className="space-y-3" aria-label="Year in review">
            <h2 className="text-lg font-bold">Your {new Date().getFullYear()} so far</h2>
            {wrapped.plays === 0 ? <p className="text-sm text-muted">Your year in review appears once you’ve listened to a few songs this year.</p> : (
              <div className="hide-scroll -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 [&>*]:snap-start">
                {[
                  { t: 'You listened for', big: `${hrs(wrapped.totalSeconds)} h`, sub: `${wrapped.plays} plays · ${wrapped.uniqueArtists} artists` },
                  { t: 'Your top artist', big: wrapped.topArtists[0]?.title ?? '—', sub: wrapped.topArtists[0] ? `${wrapped.topArtists[0].plays} plays` : '' },
                  { t: 'Your top song', big: wrapped.topSongs[0]?.title ?? '—', sub: wrapped.topSongs[0]?.artist ?? '' },
                  { t: 'Favourite genre', big: wrapped.topGenres[0]?.title ?? 'Not tagged', sub: wrapped.topGenres[0] ? `${mins(wrapped.topGenres[0].seconds)} minutes` : '' },
                  { t: 'Busiest month', big: best ? best.label : '—', sub: best ? `${hrs(best.seconds)} hours` : '' },
                  { t: 'Your listener type', big: wrapped.personality.name.replace('The ', ''), sub: wrapped.personality.why },
                ].map((c) => (
                  <div key={c.t} className="flex h-52 w-60 shrink-0 flex-col justify-between rounded-3xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, var(--accent), #6d28d9)' }}>
                    <div className="text-xs font-semibold uppercase tracking-widest opacity-80">{c.t}</div>
                    <div className="break-words text-3xl font-extrabold leading-tight">{c.big}</div>
                    <div className="text-xs opacity-85">{c.sub}</div>
                  </div>
                ))}
              </div>
            )}
            {kind === 'year' && <Card className="space-y-2"><h2 className="text-sm font-bold">Month by month, {year} <span className="font-normal text-muted">(hours)</span></h2><BarChart data={monthly.map((m) => ({ label: m.label, value: hrs(m.seconds), title: `${m.label}: ${hrs(m.seconds)} h` }))} highlight={best ? monthly.findIndex((m) => m.start === best.start) : undefined} ariaLabel={`Hours listened per month in ${year}`} format={(v) => `${v} h`} /></Card>}
          </section>
        </>
      )}
    </div>
  )
}
