import { create } from 'zustand'

/**
 * Playback through YouTube's OFFICIAL IFrame Player API.
 *
 * What this is: the embed YouTube documents for third-party sites. The player stays visible (≥200×200 px, no overlays),
 * YouTube's own controls and branding are untouched, and we only call documented methods.
 * What this is NOT: audio extraction. The audio never reaches the Web Audio graph, so the equaliser, visualiser,
 * crossfade and speed settings do not apply to these tracks.
 */

type YTState = -1 | 0 | 1 | 2 | 3 | 5
interface YTPlayerLike {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void
  cueVideoById(o: { videoId: string; startSeconds?: number }): void
  playVideo(): void
  pauseVideo(): void
  seekTo(s: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  setVolume(v: number): void
  destroy?(): void
}
interface YTNamespace {
  Player: new (el: HTMLElement, o: {
    width: string; height: string; videoId?: string
    playerVars: Record<string, string | number>
    events: { onReady: () => void; onStateChange: (e: { data: number }) => void; onError: (e: { data: number }) => void }
  }) => YTPlayerLike
}
declare global { interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void } }

export const YT_API_SRC = 'https://www.youtube.com/iframe_api'

export const YT_ERRORS: Record<number, string> = {
  2: 'YouTube rejected the video id.',
  5: 'YouTube’s player hit an error.',
  100: 'This video was removed or is private.',
  101: 'The owner doesn’t allow this video to be played outside YouTube.',
  150: 'The owner doesn’t allow this video to be played outside YouTube.',
  153: 'YouTube couldn’t identify this app (missing referrer).',
}

export interface YTEvents {
  time?: (t: number, d: number) => void
  ended?: () => void
  play?: () => void
  pause?: () => void
  error?: (message: string) => void
  /** Autoplay was refused by the browser: the user must press play on YouTube's own player. */
  blocked?: () => void
}

/** Whether the floating YouTube player is on screen. */
export const useYT = create<{ visible: boolean }>(() => ({ visible: false }))

export class YouTubeBackend {
  events: YTEvents = {}
  private player: YTPlayerLike | null = null
  private host: HTMLElement | null = null
  private apiPromise: Promise<void> | null = null
  private readyPromise: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private blockTimer: ReturnType<typeof setTimeout> | undefined
  private volume = 100
  private state: YTState = -1
  /** Events are only forwarded while this backend owns playback. */
  private active = false

  setHost(el: HTMLElement | null) { this.host = el }

  /** Load YouTube's script (only ever done after the user opts in and plays/preloads a YouTube track). */
  loadApi(): Promise<void> {
    if (window.YT?.Player) return Promise.resolve()
    this.apiPromise ??= new Promise<void>((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve() }
      const s = document.createElement('script')
      s.src = YT_API_SRC
      s.async = true
      s.onerror = () => { this.apiPromise = null; reject(new Error('Couldn’t load YouTube’s player (offline or blocked).')) }
      document.head.appendChild(s)
      setTimeout(() => { if (!window.YT?.Player) { this.apiPromise = null; reject(new Error('YouTube’s player took too long to load.')) } }, 15_000)
    })
    return this.apiPromise
  }

  private ensurePlayer(videoId: string, autoplay: boolean, startAt?: number): Promise<void> {
    if (this.player && this.readyPromise) {
      const o = { videoId, startSeconds: startAt && startAt > 1 ? Math.floor(startAt) : undefined }
      if (autoplay) this.player.loadVideoById(o); else this.player.cueVideoById(o)
      return this.readyPromise
    }
    if (!this.host || !window.YT) return Promise.reject(new Error('The YouTube player area isn’t ready.'))
    const mount = document.createElement('div')
    this.host.replaceChildren(mount)
    this.readyPromise = new Promise<void>((resolve) => {
      this.player = new window.YT!.Player(mount, {
        width: '100%', height: '100%', videoId,
        playerVars: { autoplay: autoplay ? 1 : 0, playsinline: 1, rel: 0, start: startAt && startAt > 1 ? Math.floor(startAt) : 0, origin: location.origin },
        events: {
          onReady: () => { this.player?.setVolume(this.volume); resolve() },
          onStateChange: (e) => this.onState(e.data as YTState),
          onError: (e) => { if (this.active) this.events.error?.(YT_ERRORS[e.data] ?? `YouTube error ${e.data}`) },
        },
      })
    })
    return this.readyPromise
  }

  private onState(s: YTState) {
    this.state = s
    if (!this.active) return
    if (s === 1) { this.startPolling(); clearTimeout(this.blockTimer); this.events.play?.() }
    else if (s === 2) { this.stopPolling(); this.events.pause?.() }
    else if (s === 0) { this.stopPolling(); this.events.ended?.() }
  }

  private startPolling() {
    if (this.timer) return
    this.timer = setInterval(() => { if (this.player && this.active) this.events.time?.(this.player.getCurrentTime(), this.player.getDuration()) }, 500)
  }
  private stopPolling() { clearInterval(this.timer); this.timer = undefined }

  async load(videoId: string, o: { autoplay: boolean; startAt?: number }) {
    await this.loadApi()
    this.active = true
    await this.ensurePlayer(videoId, o.autoplay, o.startAt)
    clearTimeout(this.blockTimer)
    if (o.autoplay) this.blockTimer = setTimeout(() => { if (this.active && this.state !== 1 && this.state !== 3) this.events.blocked?.() }, 5000)
  }

  async play() { this.active = true; this.player?.playVideo() }
  pause() { this.player?.pauseVideo() }
  seek(t: number) { if (Number.isFinite(t)) this.player?.seekTo(Math.max(0, t), true) }
  /** Hand playback back to the audio engine. */
  stop() { this.active = false; clearTimeout(this.blockTimer); this.stopPolling(); try { this.player?.pauseVideo() } catch { /* player gone */ } }
  /** `v` is 0..1 like the engine. */
  setVolume(v: number) { this.volume = Math.round(Math.min(1, Math.max(0, v)) * 100); try { this.player?.setVolume(this.volume) } catch { /* not ready yet */ } }
  get duration() { const d = this.player?.getDuration?.() ?? 0; return Number.isFinite(d) ? d : 0 }
  get isActive() { return this.active }
}

export const yt = new YouTubeBackend()
