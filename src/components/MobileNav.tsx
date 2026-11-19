import { Home, Library, MoreHorizontal, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '../lib/util'
import { NAV } from './nav'
import { Modal } from './ui'

const TABS = [{ to: '/', label: 'Home', icon: Home }, { to: '/search', label: 'Search', icon: Search }, { to: '/new', label: 'New', icon: Sparkles }, { to: '/library', label: 'Library', icon: Library }]

/** Phone navigation: thumb-reach bottom tabs + a "More" sheet — not a squeezed desktop sidebar. */
export function MobileNav() {
  const [more, setMore] = useState(false)
  const nav = useNavigate()
  return (
    <>
      <nav aria-label="Main" className="safe-b fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-line bg-surface/95 backdrop-blur md:hidden" style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom))' }}>
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium', isActive ? 'text-accent' : 'text-muted')}>
            <Icon size={21} />{label}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted" aria-haspopup="dialog"><MoreHorizontal size={21} />More</button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Menu">
        <div className="grid grid-cols-3 gap-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <button key={to} onClick={() => { setMore(false); nav(to) }} className="flex flex-col items-center gap-2 rounded-2xl bg-surface2 p-3 text-center text-xs font-medium"><Icon size={22} className="text-accent" />{label}</button>
          ))}
        </div>
      </Modal>
    </>
  )
}
