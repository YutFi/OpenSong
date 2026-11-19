import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '../lib/util'
import { IconButton } from './ui'

export interface MenuItem { label: string; icon?: ReactNode; onSelect?: () => void; href?: string; danger?: boolean; disabled?: boolean; divider?: boolean }

/** Click-to-open menu rendered in a portal so it is never clipped by scrolling containers. */
export function Menu({ items, label = 'More actions', trigger }: { items: MenuItem[]; label?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const w = 220, h = Math.min(items.length * 40 + 12, 360)
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8)
    const top = r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4
    setPos({ top, left })
  }, [open, items.length])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc); window.addEventListener('scroll', () => setOpen(false), { capture: true, once: true })
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <>
      <span ref={btn} className="inline-flex" onClick={(e) => e.stopPropagation()}>
        {trigger ? <span onClick={() => setOpen((v) => !v)}>{trigger}</span> : <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><MoreHorizontal size={18} /></IconButton>}
      </span>
      {open && pos && createPortal(
        <div ref={panel} role="menu" style={{ top: pos.top, left: pos.left }} className="fixed z-[120] w-[220px] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => it.divider ? <div key={i} className="my-1 h-px bg-line" /> : it.href ? (
            <a key={i} role="menuitem" href={it.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm hover:bg-surface2">{it.icon}{it.label}</a>
          ) : (
            <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect?.() }}
              className={cn('flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-surface2 disabled:opacity-40', it.danger && 'text-danger')}>{it.icon}{it.label}</button>
          ))}
        </div>, document.body)}
    </>
  )
}
