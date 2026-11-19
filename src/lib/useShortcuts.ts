import { useEffect } from 'react'
import { db } from './db'
import { toggleFavourite } from './library'
import { usePlayer } from '../store/player'
import { useSettings } from '../store/settings'
import { useUI } from '../store/ui'

export const SHORTCUTS: [string, string][] = [
  ['Space / K', 'Play / pause'], ['← / →', 'Seek 5 seconds'], ['J / L', 'Seek 10 seconds'], ['N / P', 'Next / previous track'],
  ['↑ / ↓', 'Volume'], ['M', 'Mute'], ['S', 'Shuffle'], ['R', 'Repeat'], ['F', 'Favourite current track'], ['Q', 'Queue'], ['/', 'Search'], ['?', 'Show shortcuts'],
]

export function useShortcuts(onHelp: () => void) {
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return
      const p = usePlayer.getState()
      const interactive = !!el.closest('button, a, [role="menuitem"], [role="slider"], summary')
      switch (e.key) {
        case ' ': if (interactive) return; e.preventDefault(); void p.toggle(); break
        case 'k': case 'K': void p.toggle(); break
        case 'ArrowRight': if (interactive && el.getAttribute('type') === 'range') return; e.preventDefault(); p.seekBy(5); break
        case 'ArrowLeft': if (interactive && el.getAttribute('type') === 'range') return; e.preventDefault(); p.seekBy(-5); break
        case 'l': case 'L': p.seekBy(10); break
        case 'j': case 'J': p.seekBy(-10); break
        case 'n': case 'N': void p.next(); break
        case 'p': case 'P': void p.prev(); break
        case 'ArrowUp': if (el.getAttribute('type') === 'range') return; e.preventDefault(); p.setVolume(Math.min(1, useSettings.getState().volume + 0.05)); break
        case 'ArrowDown': if (el.getAttribute('type') === 'range') return; e.preventDefault(); p.setVolume(Math.max(0, useSettings.getState().volume - 0.05)); break
        case 'm': case 'M': p.toggleMute(); break
        case 's': case 'S': p.toggleShuffle(); break
        case 'r': case 'R': p.cycleRepeat(); break
        case 'f': case 'F': { const t = p.current(); if (t) { const on = await toggleFavourite(t); useUI.getState().toast(on ? 'Added to favourites' : 'Removed from favourites') } break }
        case 'q': case 'Q': useUI.getState().setQueue(!useUI.getState().queueOpen); break
        case '/': e.preventDefault(); location.hash = '#/search'; setTimeout(() => document.getElementById('search-input')?.focus(), 50); break
        case '?': onHelp(); break
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onHelp])
  void db
}
