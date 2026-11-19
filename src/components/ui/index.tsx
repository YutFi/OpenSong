import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/util'

// shadcn/ui-style primitives (same conventions: `cn`, variants, forwarded props) written by hand so the
// app has no Radix dependency tree.

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
const variants: Record<BtnVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110',
  secondary: 'bg-surface2 text-fg hover:bg-line',
  ghost: 'text-muted hover:text-fg hover:bg-surface2',
  outline: 'border border-line text-fg hover:bg-surface2',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
}

export function Button({ variant = 'secondary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'icon' | 'lg' }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition select-none disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'sm' && 'h-8 px-3 text-xs', size === 'md' && 'h-10 px-4 text-sm', size === 'lg' && 'h-12 px-6 text-sm', size === 'icon' && 'h-10 w-10',
        variants[variant], className,
      )}
    />
  )
}

export function IconButton({ label, active, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button" aria-label={label} title={label} {...p}
      className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-fg hover:bg-surface2 disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent', active && 'text-accent hover:text-accent', className)}
    />
  )
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn('h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted outline-none focus:border-accent', className)} />
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn('h-10 w-full min-w-0 max-w-full truncate rounded-xl border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-accent', className)}>{children}</select>
}

/** `showLabel` renders the label as visible text next to the switch (the whole row is the tap target). */
export function Switch({ checked, onChange, label, disabled, showLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; showLabel?: boolean }) {
  const track = (
    <span className={cn('relative block h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-line')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </span>
  )
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('inline-flex shrink-0 items-center gap-2 text-left disabled:opacity-40', showLabel && 'min-h-9 text-sm')}
    >
      {track}
      {showLabel && <span className="min-w-0">{label}</span>}
    </button>
  )
}

export function Slider({ value, min, max, step = 1, onChange, label, className, onCommit }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onCommit?: (v: number) => void; label: string; className?: string }) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <input
      type="range" className={cn('os-range', className)} aria-label={label} min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0}
      style={{ ['--fill' as string]: `${pct}%` }}
      onChange={(e) => onChange(+e.target.value)}
      onPointerUp={(e) => onCommit?.(+(e.target as HTMLInputElement).value)}
      onKeyUp={(e) => onCommit?.(+(e.target as HTMLInputElement).value)}
    />
  )
}

export function Chip({ active, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button" {...p} aria-pressed={active}
      className={cn('h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition', active ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg hover:border-muted', className)}
    >{children}</button>
  )
}

export function Skeleton({ className }: { className?: string }) { return <div className={cn('os-skeleton', className)} aria-hidden /> }

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className={cn('flex max-h-[90dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl outline-none sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={id} className="truncate text-lg font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 safe-b">{footer}</div>}
      </div>
    </div>, document.body)
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cn('rounded-2xl border border-line bg-surface p-4', className)} />
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Row({ title, desc, children }: { title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0"><div className="text-sm font-medium">{title}</div>{desc && <div className="mt-0.5 text-xs text-muted">{desc}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
