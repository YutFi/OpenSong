import { curveAt, GAIN_MAX, GAIN_MIN } from '../audio/eq'

/** Approximate EQ response curve drawn from the current band gains (20 Hz – 20 kHz, log axis). */
export function EqCurve({ freqs, gains, q, enabled }: { freqs: number[]; gains: number[]; q: number; enabled: boolean }) {
  const W = 600, H = 120
  const x = (f: number) => ((Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * W
  const y = (g: number) => H / 2 - (g / GAIN_MAX) * (H / 2 - 6)
  const pts = Array.from({ length: 120 }, (_, i) => { const f = 20 * Math.pow(1000, i / 119); return `${x(f).toFixed(1)},${y(Math.max(GAIN_MIN, Math.min(GAIN_MAX, curveAt(f, freqs, gains, q)))).toFixed(1)}` })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label="Equaliser response curve" preserveAspectRatio="none">
      {[-12, -6, 0, 6, 12].map((g) => <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={g === 0 ? 0.35 : 0.12} strokeDasharray={g === 0 ? '' : '3 4'} />)}
      {freqs.map((f) => <line key={f} x1={x(f)} x2={x(f)} y1={0} y2={H} stroke="currentColor" strokeOpacity={0.07} />)}
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" opacity={enabled ? 1 : 0.35} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
