import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { bindMediaSession } from './audio/mediaSession'
import { engine } from './audio/engine'
import { AddToPlaylistDialog } from './components/AddToPlaylistDialog'
import { MobileNav } from './components/MobileNav'
import { NowPlaying } from './components/NowPlaying'
import { PlayerBar } from './components/PlayerBar'
import { QueueDrawer } from './components/QueueDrawer'
import { Sidebar } from './components/Sidebar'
import { Toaster } from './components/Toaster'
import { Button, Modal, Skeleton } from './components/ui'
import { startAutoSync } from './catalog/sync'
import { SHORTCUTS, useShortcuts } from './lib/useShortcuts'
import { initEngineFromSettings, usePlayer } from './store/player'
import { audioParams, useSettings } from './store/settings'
import Home from './pages/Home'

const Explore = lazy(() => import('./pages/Explore'))
const Search = lazy(() => import('./pages/Search'))
const NewReleases = lazy(() => import('./pages/NewReleases'))
const Trending = lazy(() => import('./pages/Trending'))
const Artists = lazy(() => import('./pages/Artists'))
const ArtistPage = lazy(() => import('./pages/ArtistPage'))
const LibraryPage = lazy(() => import('./pages/Library'))
const Playlists = lazy(() => import('./pages/Playlists'))
const PlaylistPage = lazy(() => import('./pages/PlaylistPage'))
const Favourites = lazy(() => import('./pages/Favourites'))
const Recent = lazy(() => import('./pages/Recent'))
const Equaliser = lazy(() => import('./pages/Equaliser'))
const VisualiserStudio = lazy(() => import('./pages/VisualiserStudio'))
const Stats = lazy(() => import('./pages/Stats'))
const SettingsPage = lazy(() => import('./pages/Settings'))

class ErrorBoundary extends Component<{ children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {}
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="mx-auto max-w-md space-y-3 p-8 text-center">
        <h1 className="text-xl font-bold">Something went wrong on this page</h1>
        <p className="text-sm text-muted">{this.state.err.message}</p>
        <Button variant="primary" onClick={() => { this.setState({ err: undefined }); location.hash = '#/' }}>Back to Home</Button>
      </div>
    )
  }
}

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function useGlobalEffects() {
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0b0f' : '#f6f6f9')
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-fg', luminance(accent) > 0.4 ? '#0b0b0f' : '#ffffff')
  }, [accent])

  useEffect(() => {
    initEngineFromSettings()
    engine.setParams(audioParams(useSettings.getState().eq))
    const unsub = useSettings.subscribe((s, prev) => {
      if (s.eq !== prev.eq) engine.setParams(audioParams(s.eq))
      if (s.speed !== prev.speed) engine.setRate(s.speed)
      if (s.crossfade !== prev.crossfade) engine.setCrossfade(s.crossfade)
    })
    bindMediaSession()
    const stop = startAutoSync()
    // Read-only debug handle used by the automated browser tests (no effect on normal use).
    if (localStorage.getItem('opensong:debug') === '1') (window as unknown as Record<string, unknown>).__opensong = { engine, usePlayer, useSettings }
    return () => { unsub(); stop() }
  }, [])
}

export default function App() {
  useGlobalEffects()
  const [help, setHelp] = useState(false)
  const openHelp = useCallback(() => setHelp((v) => !v), [])
  useShortcuts(openHelp)
  const loc = useLocation()
  const hasTrack = usePlayer((s) => s.queue.length > 0)
  useEffect(() => { document.getElementById('main')?.scrollTo({ top: 0 }) }, [loc.pathname])

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main id="main" className="min-w-0 flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + ' + (hasTrack ? '8.5rem' : '4.5rem') + ')' }}>
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 md:pb-6">
            <ErrorBoundary>
              <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64 w-full" /></div>}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/new" element={<NewReleases />} />
                  <Route path="/trending" element={<Trending />} />
                  <Route path="/artists" element={<Artists />} />
                  <Route path="/artist/:name" element={<ArtistPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/playlists" element={<Playlists />} />
                  <Route path="/playlist/:id" element={<PlaylistPage />} />
                  <Route path="/favourites" element={<Favourites />} />
                  <Route path="/recent" element={<Recent />} />
                  <Route path="/equaliser" element={<Equaliser />} />
                  <Route path="/visualiser" element={<VisualiserStudio />} />
                  <Route path="/stats" element={<Stats />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<div className="py-16 text-center text-muted">Page not found.</div>} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <PlayerBar />
      <MobileNav />
      <NowPlaying />
      <QueueDrawer />
      <AddToPlaylistDialog />
      <Toaster />
      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {SHORTCUTS.map(([k, d]) => <div key={k} className="contents"><dt><kbd className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 font-mono text-xs">{k}</kbd></dt><dd className="text-muted">{d}</dd></div>)}
        </dl>
      </Modal>
    </div>
  )
}
