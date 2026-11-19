import { BarChart3, Clock, Compass, Heart, Home, Library, ListMusic, Mic2, Search, Settings, SlidersHorizontal, Sparkles, TrendingUp, Waves, type LucideIcon } from 'lucide-react'

export interface NavItem { to: string; label: string; icon: LucideIcon; group: 'Browse' | 'Your music' | 'Studio' | 'App' }

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, group: 'Browse' },
  { to: '/explore', label: 'Explore', icon: Compass, group: 'Browse' },
  { to: '/search', label: 'Search', icon: Search, group: 'Browse' },
  { to: '/new', label: 'New Releases', icon: Sparkles, group: 'Browse' },
  { to: '/trending', label: 'Trending', icon: TrendingUp, group: 'Browse' },
  { to: '/artists', label: 'Artists', icon: Mic2, group: 'Browse' },
  { to: '/library', label: 'My Library', icon: Library, group: 'Your music' },
  { to: '/playlists', label: 'Playlists', icon: ListMusic, group: 'Your music' },
  { to: '/favourites', label: 'Favourites', icon: Heart, group: 'Your music' },
  { to: '/recent', label: 'Recently Played', icon: Clock, group: 'Your music' },
  { to: '/equaliser', label: 'Equaliser Studio', icon: SlidersHorizontal, group: 'Studio' },
  { to: '/visualiser', label: 'Visualiser Studio', icon: Waves, group: 'Studio' },
  { to: '/stats', label: 'Listening Statistics', icon: BarChart3, group: 'Studio' },
  { to: '/settings', label: 'Settings', icon: Settings, group: 'App' },
]
