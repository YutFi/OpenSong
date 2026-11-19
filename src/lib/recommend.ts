import type { FavouriteTrack, HistoryEntry, Release, Track } from '../types'
import { norm, parseDate } from './util'

/**
 * Transparent, local recommendation engine. No network, no model: every score is a sum of the
 * signals below and every result carries human-readable `reasons`.
 *
 *  artist affinity  = Σ over plays   (completed play +1, partial +0.2, skip −0.6, + completion bonus) × 0.5^(age/30 days)
 *                   + 3 per favourited track + 4 if the artist is followed
 *  genre affinity   = same, per genre (favourites +2)
 *  candidate score  = artist affinity + 0.6 × best genre affinity + freshness (≤0.5) + 0.3 if playable − repeat penalty
 */
export interface Affinity { artists: Map<string, number>; genres: Map<string, number>; artistNames: Map<string, string>; plays: Map<string, number> }

const HALF_LIFE_DAYS = 30

export function buildAffinity(history: HistoryEntry[], favourites: FavouriteTrack[], follows: string[], now = Date.now()): Affinity {
  const artists = new Map<string, number>(), genres = new Map<string, number>(), names = new Map<string, string>(), plays = new Map<string, number>()
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  for (const e of history) {
    const ageDays = Math.max(0, (now - e.startedAt) / 86400_000)
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
    const completion = e.duration ? Math.min(1, e.listened / e.duration) : 0.5
    const w = (e.counted ? 1 : e.skipped ? -0.6 : 0.2) + (e.counted ? completion * 0.5 : 0)
    const a = norm(e.artist)
    names.set(a, e.artist)
    add(artists, a, w * decay)
    if (e.genre) add(genres, norm(e.genre), w * decay)
    if (e.counted) plays.set(e.trackId, (plays.get(e.trackId) ?? 0) + 1)
  }
  for (const f of favourites) {
    const a = norm(f.track.artist)
    names.set(a, f.track.artist)
    add(artists, a, 3)
    if (f.track.genre) add(genres, norm(f.track.genre), 2)
  }
  for (const f of follows) { add(artists, norm(f), 4); names.set(norm(f), f) }
  return { artists, genres, artistNames: names, plays }
}

export interface Candidate { release?: Release; track?: Track }
export interface Recommendation extends Candidate {
  score: number
  /** Taste match only (artist + genre affinity), excluding freshness/playability. */
  relevance: number
  reasons: string[]
}

const cArtist = (c: Candidate) => c.release?.artist ?? c.track?.artist ?? ''
const cGenres = (c: Candidate): string[] => [c.release?.genre ?? c.track?.genre, ...(c.release?.tags ?? [])].filter((g): g is string => !!g).map(norm)
const cDate = (c: Candidate) => parseDate(c.release?.releaseDate ?? c.track?.releaseDate)
const cPlayable = (c: Candidate) => ['full', 'local', 'preview'].includes((c.release?.availability ?? c.track?.availability) ?? '')
export const cId = (c: Candidate) => c.release?.id ?? c.track?.id ?? ''

export function scoreCandidate(c: Candidate, aff: Affinity, now = Date.now()): Recommendation {
  const reasons: string[] = []
  const maxA = Math.max(1, ...aff.artists.values())
  const maxG = Math.max(1, ...aff.genres.values())
  const a = norm(cArtist(c))
  const artistScore = (aff.artists.get(a) ?? 0) / maxA
  if (artistScore > 0.15) reasons.push(`You listen to ${cArtist(c)}`)
  let genreScore = 0, bestGenre = ''
  for (const g of cGenres(c)) { const s = (aff.genres.get(g) ?? 0) / maxG; if (s > genreScore) { genreScore = s; bestGenre = g } }
  if (genreScore > 0.2) reasons.push(`Matches your ${aff.genres.has(bestGenre) ? [...cGenres(c)].find((g) => g === bestGenre) ?? bestGenre : bestGenre} listening`)
  const t = cDate(c)
  let fresh = 0
  if (t != null) {
    const age = Math.max(0, (now - t) / 86400_000)
    fresh = 0.5 * Math.exp(-age / 14)
    if (age <= 7) reasons.push('Released this week')
  }
  const plays = aff.plays.get(c.track?.id ?? c.release?.tracks?.[0]?.id ?? '') ?? 0
  const repeatPenalty = Math.min(0.5, plays * 0.1)
  const playable = cPlayable(c) ? 0.3 : 0
  if (playable && reasons.length === 0) reasons.push('Free to play')
  const relevance = Math.max(0, artistScore) + 0.6 * genreScore
  return { ...c, score: artistScore + 0.6 * genreScore + fresh + playable - repeatPenalty, relevance, reasons }
}

/** Artists the user has skipped repeatedly (net negative affinity) are never recommended. */
function blocked(c: Candidate, aff: Affinity) { return (aff.artists.get(norm(cArtist(c))) ?? 0) < -1 }

export function recommendForYou(cands: Candidate[], aff: Affinity, limit = 12, now = Date.now()): Recommendation[] {
  const seen = new Set<string>()
  return cands
    .filter((c) => !blocked(c, aff))
    .map((c) => scoreCandidate(c, aff, now))
    // Freshness alone is not a reason: the item must match the user's taste.
    .filter((r) => r.relevance > 0.15 && r.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .filter((r) => { const k = `${norm(cArtist(r))}|${norm(r.release?.title ?? r.track?.title)}`; if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, limit)
}

export function topKeys(m: Map<string, number>, n: number): string[] {
  return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
}

/** "Because you listen to <artist>": catalogue items sharing the artist's genres, by other artists. */
export function becauseYouListenTo(cands: Candidate[], aff: Affinity, limit = 10): { artist: string; items: Recommendation[] } | undefined {
  for (const key of topKeys(aff.artists, 5)) {
    const artistName = aff.artistNames.get(key) ?? key
    const genres = new Set<string>()
    for (const c of cands) if (norm(cArtist(c)) === key) cGenres(c).forEach((g) => genres.add(g))
    if (!genres.size) continue
    const items = cands
      .filter((c) => norm(cArtist(c)) !== key && cGenres(c).some((g) => genres.has(g)) && !blocked(c, aff))
      .map((c) => ({ ...scoreCandidate(c, aff), reasons: [`Similar genre to ${artistName}`] }))
      .sort((a, b) => b.score - a.score).slice(0, limit)
    if (items.length >= 2) return { artist: artistName, items }
  }
  return undefined
}

/** Artists most similar to `artist` by shared genre tags (Jaccard), computed over what we have locally. */
export function similarArtists(artist: string, cands: Candidate[], limit = 8): { name: string; similarity: number }[] {
  const tags = new Map<string, Set<string>>()
  const names = new Map<string, string>()
  for (const c of cands) {
    const k = norm(cArtist(c)); if (!k) continue
    names.set(k, cArtist(c))
    const s = tags.get(k) ?? new Set<string>(); cGenres(c).forEach((g) => s.add(g)); tags.set(k, s)
  }
  const me = tags.get(norm(artist))
  if (!me || !me.size) return []
  return [...tags.entries()]
    .filter(([k]) => k !== norm(artist))
    .map(([k, s]) => { const inter = [...s].filter((g) => me.has(g)).length; return { name: names.get(k)!, similarity: inter / (me.size + s.size - inter) } })
    .filter((x) => x.similarity > 0).sort((a, b) => b.similarity - a.similarity).slice(0, limit)
}

/** Artists the user has never played, in genres they like (fresh first). */
export function discoverNewArtists(cands: Candidate[], aff: Affinity, limit = 12): Recommendation[] {
  const topG = new Set(topKeys(aff.genres, 5))
  const seen = new Set<string>()
  return cands
    .filter((c) => !(aff.artists.get(norm(cArtist(c))) ?? 0) && !blocked(c, aff))
    .map((c) => { const r = scoreCandidate(c, aff); const hit = cGenres(c).find((g) => topG.has(g)); return { ...r, reasons: hit ? [`New artist in ${hit}`] : ['New artist'], score: r.score + (hit ? 0.5 : 0) } })
    .sort((a, b) => b.score - a.score)
    .filter((r) => { const k = norm(cArtist(r)); if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, limit)
}

/** A weighted-random-free, deterministic mix: your best-affinity playable tracks, no more than 2 per artist in a row. */
export function musicMix(tracks: Track[], aff: Affinity, limit = 30): Track[] {
  const scored = tracks.map((t) => ({ t, s: (aff.artists.get(norm(t.artist)) ?? 0) + (t.genre ? 0.4 * (aff.genres.get(norm(t.genre)) ?? 0) : 0) - Math.min(0.5, (aff.plays.get(t.id) ?? 0) * 0.05) }))
    .sort((a, b) => b.s - a.s)
  const out: Track[] = []
  const per = new Map<string, number>()
  for (const { t } of scored) {
    const k = norm(t.artist)
    if ((per.get(k) ?? 0) >= 3) continue
    per.set(k, (per.get(k) ?? 0) + 1)
    out.push(t)
    if (out.length >= limit) break
  }
  // interleave artists so the same artist isn't back-to-back
  for (let i = 1; i < out.length; i++) {
    if (norm(out[i].artist) === norm(out[i - 1].artist)) {
      const j = out.findIndex((x, k) => k > i && norm(x.artist) !== norm(out[i - 1].artist))
      if (j > 0) [out[i], out[j]] = [out[j], out[i]]
    }
  }
  return out
}

export function favouriteGenres(aff: Affinity, n = 8): { genre: string; score: number }[] {
  return topKeys(aff.genres, n).map((g) => ({ genre: g, score: aff.genres.get(g)! }))
}
