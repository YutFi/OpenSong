import { ChevronRight } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from './ui'

export function Section({ title, subtitle, to, children, action }: { title: string; subtitle?: ReactNode; to?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
          {subtitle && <p className="text-xs text-muted sm:text-sm">{subtitle}</p>}
        </div>
        {action}
        {to && <Link to={to} className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted hover:text-fg">See all<ChevronRight size={14} /></Link>}
      </div>
      {children}
    </section>
  )
}

/** Horizontally scrolling shelf with snap points (touch-friendly; no scrollbar). */
export function Shelf({ children }: { children: ReactNode }) {
  return <div className="hide-scroll -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 [&>*]:snap-start">{children}</div>
}

export function ShelfSkeleton({ n = 6 }: { n?: number }) {
  return <Shelf>{Array.from({ length: n }, (_, i) => <div key={i} className="w-40 shrink-0 space-y-2 sm:w-44"><Skeleton className="aspect-square w-full !rounded-2xl" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}</Shelf>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
