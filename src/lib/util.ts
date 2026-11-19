import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export function formatTime(sec?: number): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '–:––'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

/** Lower-case, strip accents/punctuation: used for duplicate detection and matching. */
export function norm(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function dedupeKey(artist: string, title: string): string {
  return `${norm(artist)}|${norm(title)}`
}

/** Only http(s) URLs may reach <a href>, <img src> or <audio src>. Everything from providers goes through this. */
export function safeUrl(u: unknown): string | undefined {
  if (typeof u !== 'string' || !u) return undefined
  try {
    const url = new URL(u)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Parse YYYY, YYYY-MM or YYYY-MM-DD into a UTC timestamp (start of the period). Returns undefined if invalid. */
export function parseDate(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s)
  if (!m) return undefined
  const t = Date.UTC(+m[1], m[2] ? +m[2] - 1 : 0, m[3] ? +m[3] : 1)
  return Number.isNaN(t) ? undefined : t
}

export function formatDate(s: string | number | undefined): string {
  if (s == null) return '—'
  const t = typeof s === 'number' ? s : parseDate(s)
  if (t == null) return '—'
  const partial = typeof s === 'string' && s.length <= 7
  const d = new Date(t)
  return d.toLocaleDateString(undefined, partial
    ? { year: 'numeric', month: s.length === 4 ? undefined : 'short', timeZone: 'UTC' }
    : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d ago`
  return new Date(ts).toLocaleDateString()
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function shuffled<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function download(filename: string, data: Blob | string, type = 'application/json') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Returns a copy of `arr` with the item at `from` moved to `to`. */
export function moveArr<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length) return arr
  const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(Math.max(0, Math.min(a.length, to)), 0, x); return a
}
