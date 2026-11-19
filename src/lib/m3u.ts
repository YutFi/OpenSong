import type { Track } from '../types'

export interface M3UEntry { title: string; artist?: string; duration?: number; path: string }

const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

export function toM3U(name: string, tracks: Track[]): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${clean(name)}`]
  for (const t of tracks) {
    const path = t.availability === 'local' ? (t.fileName ?? `${t.artist} - ${t.title}`) : (t.streamUrl ?? t.sourceUrl ?? '')
    if (!path) continue
    lines.push(`#EXTINF:${Math.round(t.duration ?? -1)},${clean(t.artist)} - ${clean(t.title)}`, clean(path))
  }
  return lines.join('\n') + '\n'
}

export function parseM3U(text: string): { name?: string; entries: M3UEntry[] } {
  const entries: M3UEntry[] = []
  let name: string | undefined
  let pending: { title: string; artist?: string; duration?: number } | null = null
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#PLAYLIST:')) { name = line.slice(10).trim(); continue }
    if (line.startsWith('#EXTINF:')) {
      const m = /^#EXTINF:(-?\d+(?:\.\d+)?)[^,]*,(.*)$/.exec(line)
      if (m) {
        const label = m[2].trim()
        const i = label.indexOf(' - ')
        pending = i > 0 ? { artist: label.slice(0, i), title: label.slice(i + 3), duration: +m[1] > 0 ? +m[1] : undefined } : { title: label, duration: +m[1] > 0 ? +m[1] : undefined }
      }
      continue
    }
    if (line.startsWith('#')) continue
    const base = line.split(/[\\/]/).pop() ?? line
    entries.push({ path: line, title: pending?.title ?? base.replace(/\.[^.]+$/, ''), artist: pending?.artist, duration: pending?.duration })
    pending = null
  }
  return { name, entries }
}
