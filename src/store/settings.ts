import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BAND_FREQS, BAND_Q, presetGains, type AudioParams, type BandCount } from '../audio/eq'

export type VizMode =
  | 'bars' | 'circular' | 'waveform' | 'frequency' | 'neon'
  | 'particles' | 'fluid' | 'retro' | 'minimal'

export interface VizSettings {
  mode: VizMode
  background: string
  colorA: string
  colorB: string
  gradient: boolean
  speed: number        // 0.2–2
  sensitivity: number  // 0.5–3
  particleDensity: number // 20–400
  barWidth: number     // 2–30 px
  barSpacing: number   // 0–20 px
  glow: number         // 0–40
  size: number         // 0.4–1.2
  backgroundEffect: 'none' | 'vignette' | 'stars' | 'artwork'
  fps: 30 | 60
}

export const DEFAULT_VIZ: VizSettings = {
  mode: 'bars', background: '#0b0b0f', colorA: '#ff7a45', colorB: '#ff3d6e', gradient: true,
  speed: 1, sensitivity: 1.2, particleDensity: 140, barWidth: 8, barSpacing: 3, glow: 12, size: 1,
  backgroundEffect: 'vignette', fps: 60,
}

export interface EqState {
  enabled: boolean
  bands: BandCount
  gains: Record<BandCount, number[]>
  preset: string
  preamp: number
  autoHeadroom: boolean
  bass: number
  treble: number
  loudness: number
  balance: number
  width: number
}

const zeros = (n: number) => Array.from({ length: n }, () => 0)

export const DEFAULT_EQ: EqState = {
  enabled: true, bands: 10, gains: { 5: zeros(5), 10: zeros(10), 15: zeros(15) }, preset: 'Normal',
  preamp: 0, autoHeadroom: true, bass: 0, treble: 0, loudness: 0, balance: 0, width: 1,
}

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  accent: string
  providers: Record<string, boolean>
  jamendoClientId: string
  jamendoFormat: 'mp31' | 'mp32' | 'ogg' | 'flac'
  archiveFormat: 'mp3' | 'ogg'
  recommendations: boolean
  recordHistory: boolean
  crossfade: number
  speed: number
  resumeSession: boolean
  /** Play online streams on a plain element (no EQ / visualiser). Safer for lock-screen playback on some phones. */
  bypassProcessing: boolean
  notifications: boolean
  autoSync: boolean
  lowPower: boolean
  volume: number
  muted: boolean
  eq: EqState
  viz: VizSettings
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void
  setEq: (patch: Partial<EqState>) => void
  setViz: (patch: Partial<VizSettings>) => void
  setBand: (i: number, gain: number) => void
  applyPreset: (name: string, gains?: Record<BandCount, number[]>) => void
  setBands: (n: BandCount) => void
  resetEq: () => void
}

const envKey = (import.meta.env.VITE_JAMENDO_CLIENT_ID as string | undefined) ?? ''

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark', accent: '#ff6a3d',
  providers: { jamendo: true, archive: true, commons: true, listenbrainz: true, musicbrainz: true },
  jamendoClientId: envKey,
  jamendoFormat: 'mp32', archiveFormat: 'mp3',
  recommendations: true, recordHistory: true,
  crossfade: 0, speed: 1, resumeSession: true, bypassProcessing: false,
  notifications: false, autoSync: true, lowPower: false,
  volume: 0.8, muted: false,
  eq: DEFAULT_EQ, viz: DEFAULT_VIZ,
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      setEq: (patch) => set({ eq: { ...get().eq, ...patch } }),
      setViz: (patch) => set({ viz: { ...get().viz, ...patch } }),
      setBand: (i, gain) => {
        const eq = get().eq
        const g = [...eq.gains[eq.bands]]
        g[i] = gain
        set({ eq: { ...eq, gains: { ...eq.gains, [eq.bands]: g }, preset: 'Custom' } })
      },
      applyPreset: (name, custom) => {
        const eq = get().eq
        if (custom) { set({ eq: { ...eq, gains: custom, preset: name } }); return }
        const gains = { ...eq.gains }
        for (const b of [5, 10, 15] as BandCount[]) {
          const g = presetGains(name, b)
          if (g) gains[b] = g
        }
        set({ eq: { ...eq, gains, preset: name } })
      },
      setBands: (n) => set({ eq: { ...get().eq, bands: n } }),
      resetEq: () => set({ eq: { ...DEFAULT_EQ, enabled: get().eq.enabled, bands: get().eq.bands } }),
    }),
    {
      name: 'opensong:settings',
      version: 1,
      // Deep-merge so new settings keys added in later versions get defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>
        return {
          ...current, ...p,
          providers: { ...DEFAULT_SETTINGS.providers, ...p.providers },
          eq: { ...DEFAULT_EQ, ...p.eq, gains: { ...DEFAULT_EQ.gains, ...p.eq?.gains } },
          viz: { ...DEFAULT_VIZ, ...p.viz },
        }
      },
    },
  ),
)

export function audioParams(eq: EqState): AudioParams {
  return {
    enabled: eq.enabled, freqs: BAND_FREQS[eq.bands], q: BAND_Q[eq.bands], gains: eq.gains[eq.bands],
    preamp: eq.preamp, autoHeadroom: eq.autoHeadroom, bass: eq.bass, treble: eq.treble,
    loudness: eq.loudness, balance: eq.balance, width: eq.width,
  }
}
