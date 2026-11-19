import { cn } from '../lib/util'
import type { Availability } from '../types'

export const AVAIL: Record<Availability, { label: string; cls: string; title: string }> = {
  full: { label: 'Full stream', cls: 'bg-ok/15 text-ok', title: 'The full track can be streamed legally from its source.' },
  preview: { label: 'Preview', cls: 'bg-sky-400/15 text-sky-400', title: 'Only a short preview is available.' },
  external: { label: 'External', cls: 'bg-amber-400/15 text-amber-500', title: 'Playable only on the original website. OpenSong links to it.' },
  metadata: { label: 'Metadata only', cls: 'bg-surface2 text-muted', title: 'We know this release exists, but there is no legal stream to play here.' },
  local: { label: 'Local file', cls: 'bg-violet-400/15 text-violet-400', title: 'Stored on this device — works offline.' },
}

export function AvailabilityBadge({ value, className }: { value: Availability; className?: string }) {
  const a = AVAIL[value]
  return <span title={a.title} className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', a.cls, className)}>{a.label}</span>
}

export const SOURCE_NAMES: Record<string, string> = {
  jamendo: 'Jamendo', archive: 'Internet Archive', commons: 'Wikimedia Commons', listenbrainz: 'ListenBrainz', musicbrainz: 'MusicBrainz', youtube: 'YouTube', local: 'This device', url: 'Web link',
}
export const sourceName = (id: string) => SOURCE_NAMES[id] ?? id
