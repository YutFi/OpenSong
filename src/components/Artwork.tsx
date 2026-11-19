import { useEffect, useState } from 'react'
import { Music2 } from 'lucide-react'
import { db } from '../lib/db'
import { cn, norm } from '../lib/util'

const urlCache = new Map<string, string>()

/** Resolve a stored Blob (embedded cover art) to an object URL once and reuse it. */
export function useBlobUrl(key?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(key ? urlCache.get(key) : undefined)
  useEffect(() => {
    if (!key) { setUrl(undefined); return }
    const hit = urlCache.get(key)
    if (hit) { setUrl(hit); return }
    let alive = true
    db.blobs.get(key).then((r) => { if (r && alive) { const u = URL.createObjectURL(r.blob); urlCache.set(key, u); setUrl(u) } }).catch(() => undefined)
    return () => { alive = false }
  }, [key])
  return url
}

function hue(s: string) { let h = 0; for (const c of norm(s) || s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

export function Artwork({ src, blobKey, title, className, rounded = 'rounded-xl' }: { src?: string; blobKey?: string; title: string; className?: string; rounded?: string }) {
  const blobUrl = useBlobUrl(blobKey)
  const [failed, setFailed] = useState(false)
  const url = blobUrl ?? (failed ? undefined : src)
  useEffect(() => setFailed(false), [src])
  if (url) {
    return <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn('aspect-square bg-surface2 object-cover', rounded, className)} />
  }
  const h = hue(title)
  return (
    <div aria-hidden className={cn('flex aspect-square items-center justify-center text-white/80', rounded, className)}
      style={{ background: `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${(h + 50) % 360} 60% 22%))` }}>
      <Music2 className="h-1/3 w-1/3 opacity-70" />
    </div>
  )
}
