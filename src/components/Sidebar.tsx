import { NavLink } from 'react-router-dom'
import { cn } from '../lib/util'
import { Logo } from './Logo'
import { NAV } from './nav'

export function Sidebar() {
  const groups = ['Browse', 'Your music', 'Studio', 'App'] as const
  return (
    <nav aria-label="Main" className="hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface/60 px-3 py-5 md:flex">
      <div className="flex items-center gap-2.5 px-3"><Logo /><span className="text-lg font-extrabold tracking-tight">OpenSong</span></div>
      {groups.map((g) => (
        <div key={g} className="space-y-0.5">
          {g !== 'App' && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{g}</div>}
          {NAV.filter((n) => n.group === g).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition', isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface2 hover:text-fg')}>
              <Icon size={18} />{label}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="mt-auto px-3 text-[11px] leading-relaxed text-muted">Free forever. No ads, no accounts, no tracking.</div>
    </nav>
  )
}
