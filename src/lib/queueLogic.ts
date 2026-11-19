import type { Track } from '../types'
import { shuffled } from './util'

export type RepeatMode = 'off' | 'all' | 'one'

/** Index of the next track, or null at the end of the queue. `auto` = natural end-of-track (vs. user pressing Next). */
export function nextIndex(len: number, index: number, repeat: RepeatMode, auto: boolean): number | null {
  if (len === 0) return null
  if (auto && repeat === 'one') return index
  if (index + 1 < len) return index + 1
  return repeat === 'off' ? null : 0
}

export function prevIndex(len: number, index: number, repeat: RepeatMode): number | null {
  if (len === 0) return null
  if (index > 0) return index - 1
  return repeat === 'off' ? null : len - 1
}

/** Shuffle everything AFTER the current track; tracks already played stay where they are. */
export function shuffleUpcoming(queue: Track[], index: number, rnd?: () => number): Track[] {
  return [...queue.slice(0, index + 1), ...shuffled(queue.slice(index + 1), rnd)]
}

/** Put the queue back in its pre-shuffle order. Tracks added since go to the end (stable). */
export function restoreOrder(queue: Track[], originalIds: string[]): Track[] {
  const rank = new Map(originalIds.map((id, i) => [id, i]))
  return queue
    .map((t, i) => ({ t, i, r: rank.get(t.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.t)
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr
  const a = [...arr]
  const [x] = a.splice(from, 1)
  a.splice(to, 0, x)
  return a
}

/** Where the currently-playing index ends up after moving `from` → `to`. */
export function indexAfterMove(index: number, from: number, to: number): number {
  if (index === from) return to
  if (from < index && to >= index) return index - 1
  if (from > index && to <= index) return index + 1
  return index
}

export function removeAt(queue: Track[], index: number, i: number): { queue: Track[]; index: number; removedCurrent: boolean } {
  if (i < 0 || i >= queue.length) return { queue, index, removedCurrent: false }
  const q = queue.filter((_, k) => k !== i)
  if (i < index) return { queue: q, index: index - 1, removedCurrent: false }
  if (i === index) return { queue: q, index: Math.min(index, q.length - 1), removedCurrent: true }
  return { queue: q, index, removedCurrent: false }
}

export const isPlayable = (t: Track | undefined): boolean =>
  !!t && (t.availability === 'local' ? !!t.blobKey : (t.availability === 'full' || t.availability === 'preview') && (!!t.streamUrl || !!t.needsResolve || !!t.youtubeId))
