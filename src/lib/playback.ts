import { providerContext } from './providerCtx'
import { isPlayable } from './queueLogic'
import { providerById } from '../providers/registry'
import { usePlayer } from '../store/player'
import { useUI } from '../store/ui'
import type { Release, Track } from '../types'

/** Playable tracks for a release (expanding lazily via the provider when needed). Empty = nothing legally playable. */
export async function releaseTracks(r: Release): Promise<Track[]> {
  if (r.availability === 'metadata' || r.availability === 'external') return []
  if (r.tracks?.length && r.source !== 'archive') return r.tracks.filter(isPlayable)
  const p = providerById(r.source)
  if (!p?.expand) return r.tracks?.filter(isPlayable) ?? []
  const t = await p.expand(r, providerContext())
  return t.filter(isPlayable)
}

export async function playRelease(r: Release, opts: { shuffle?: boolean } = {}) {
  const toast = useUI.getState().toast
  try {
    const tracks = await releaseTracks(r)
    if (!tracks.length) {
      toast(r.availability === 'metadata' ? 'This release is metadata only — there is no legal stream to play. Use “Open source”.' : 'No playable audio was found for this item.', 'error')
      return
    }
    await usePlayer.getState().playQueue(tracks, 0, opts)
  } catch (e) {
    toast(`Couldn’t load tracks: ${e instanceof Error ? e.message : 'unknown error'}`, 'error')
  }
}

export async function queueRelease(r: Release, next = false) {
  const toast = useUI.getState().toast
  try {
    const tracks = await releaseTracks(r)
    if (!tracks.length) { toast('Nothing playable in this release.', 'error'); return }
    const p = usePlayer.getState()
    next ? p.playNext(tracks) : p.enqueue(tracks)
  } catch (e) { toast(`Couldn’t load tracks: ${e instanceof Error ? e.message : 'unknown error'}`, 'error') }
}

export const canPlayRelease = (r: Release) => r.availability === 'full' || r.availability === 'preview'
