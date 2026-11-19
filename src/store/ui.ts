import { create } from 'zustand'

export interface Toast { id: number; message: string; kind: 'info' | 'error' | 'success' }
let n = 0

interface UIStore {
  toasts: Toast[]
  toast: (message: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
  nowPlayingOpen: boolean
  queueOpen: boolean
  setNowPlaying: (v: boolean) => void
  setQueue: (v: boolean) => void
  /** Add-to-playlist dialog target */
  addToPlaylist: import('../types').Track[] | null
  openAddToPlaylist: (t: import('../types').Track[] | null) => void
}

export const useUI = create<UIStore>((set, get) => ({
  toasts: [],
  toast: (message, kind = 'info') => {
    const id = ++n
    set({ toasts: [...get().toasts, { id, message, kind }] })
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3500)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  nowPlayingOpen: false,
  queueOpen: false,
  setNowPlaying: (v) => set({ nowPlayingOpen: v }),
  setQueue: (v) => set({ queueOpen: v }),
  addToPlaylist: null,
  openAddToPlaylist: (t) => set({ addToPlaylist: t }),
}))
