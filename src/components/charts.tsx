import { useId } from 'react'
import { cn } from '../lib/util'

const PALETTE = ['var(--accent)', '#6366f1', '#22d3ee', '#a3e635', '#f472b6', '#fbbf24', '#94a3b8']

interface Pt { label: string; value: number; title?: string }

/** Smooth-ish area/line chart. Values are real, the y-axis starts at zero. */
export function LineChart({ data, ariaLabel, format = (v: number) => String(Math.round(v)), className }: { data: Pt[]; ariaLabel: string; format?: (v: number) => string; className?: string }) {
  const id = useId()
  const W = 600, H = 160, P = { l: 4, r: 4, t: 10, b: 22 }
  const max = Math.max(1, ...data.map((d) => d.value))
  const x = (i: number) => P.l + (data.length <= 1 ? (W - P.l - P.r) / 2 : (i / (data.length - 1)) * (W - P.l - P.r))
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const area = data.length ? `${line} L${x(data.length - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z` : ''
  const ticks = data.length > 1 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [0]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className={cn('h-40 w-full', className)} preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={P.l} x2={W - P.r} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" strokeOpacity={0.08} />)}
      {area && <path d={area} fill={`url(#${id})`} />}
      {line && <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {data.length <= 40 && data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.value)} r={3} fill="var(--accent)"><title>{d.title ?? `${d.label}: ${format(d.value)}`}</title></circle>)}
      {ticks.map((i) => data[i] && <text key={i} x={x(i)} y={H - 6} fontSize="11" textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fill="currentColor" opacity={0.55}>{data[i].label}</text>)}
    </svg>
  )
}

export function BarChart({ data, ariaLabel, format = (v: number) => String(Math.round(v)), highlight, className }: { data: Pt[]; ariaLabel: string; format?: (v: number) => string; highlight?: number; className?: string }) {
  const W = 600, H = 150, P = { t: 8, b: 20 }
  const max = Math.max(1, ...data.map((d) => d.value))
  const bw = W / Math.max(1, data.length)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className={cn('h-36 w-full', className)} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = (d.value / max) * (H - P.t - P.b)
        return (
          <g key={i}>
            <rect x={i * bw + bw * 0.14} y={H - P.b - h} width={bw * 0.72} height={Math.max(d.value > 0 ? 2 : 0, h)} rx={3} fill={i === highlight ? 'var(--accent)' : 'var(--accent)'} opacity={highlight == null || i === highlight ? 1 : 0.5}><title>{d.title ?? `${d.label}: ${format(d.value)}`}</title></rect>
            {(data.length <= 14 || i % Math.ceil(data.length / 12) === 0) && <text x={i * bw + bw / 2} y={H - 5} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.55}>{d.label}</text>}
          </g>
        )
      })}
    </svg>
  )
}

export function Donut({ data, ariaLabel, className }: { data: { label: string; value: number }[]; ariaLabel: string; className?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const R = 52, C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className={cn('flex items-center gap-5', className)}>
      <svg viewBox="0 0 140 140" role="img" aria-label={ariaLabel} className="h-36 w-36 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth="18" />
        {total > 0 && data.map((d, i) => { const len = (d.value / total) * C; const el = <circle key={d.label} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}><title>{`${d.label}: ${Math.round((d.value / total) * 100)}%`}</title></circle>; acc += len; return el })}
      </svg>
      <ul className="min-w-0 space-y-1 text-sm">{data.map((d, i) => <li key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate capitalize">{d.label}</span><span className="ml-auto pl-3 text-xs tabular-nums text-muted">{total ? Math.round((d.value / total) * 100) : 0}%</span></li>)}</ul>
    </div>
  )
}

/** Ranked list with proportional bars. */
export function RankList({ items, unit = 'plays', max }: { items: { key: string; title: string; sub?: string; value: number; extra?: string }[]; unit?: string; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={it.key} className="relative overflow-hidden rounded-lg px-3 py-2">
          <div className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${(it.value / m) * 100}%` }} aria-hidden />
          <div className="relative flex items-center gap-3 text-sm"><span className="w-5 shrink-0 text-xs font-bold tabular-nums text-muted">{i + 1}</span><div className="min-w-0 flex-1"><div className="truncate font-medium">{it.title}</div>{it.sub && <div className="truncate text-xs text-muted">{it.sub}</div>}</div><div className="shrink-0 text-right text-xs tabular-nums text-muted">{it.value} {unit}{it.extra && <div>{it.extra}</div>}</div></div>
        </li>
      ))}
    </ol>
  )
}
