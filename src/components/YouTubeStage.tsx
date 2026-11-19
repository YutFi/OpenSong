import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { yt, useYT } from '../audio/ytPlayer'
import { usePlayer } from '../store/player'

/**
 * The visible home of YouTube's official embedded player. YouTube requires the player to stay on screen at a
 * minimum of 200×200 px with nothing drawn over it, so the title strip and close button sit ABOVE the player,
 * never on top of it. Closing pauses the song.
 */
export function YouTubeStage() {
  const visible = useYT((s) => s.visible)
  const track = usePlayer((s) => s.queue[s.index])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { yt.setHost(ref.current); return () => yt.setHost(null) }, [])
  return (
    <section
      aria-label="YouTube player" data-testid="yt-stage" hidden={!visible || !track?.youtubeId}
      className="fixed right-2 z-[95] w-[min(480px,calc(100vw-1rem))] border border-line bg-surface shadow-2xl max-md:bottom-[calc(9.5rem+env(safe-area-inset-bottom))] md:bottom-[6.25rem] md:right-4"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
        <span className="min-w-0 truncate text-muted">Playing in YouTube’s player{track?.title ? ` · ${track.title}` : ''}</span>
        <button type="button" aria-label="Close YouTube player (pauses)" className="rounded-full p-1 text-muted hover:bg-surface2 hover:text-fg"
          onClick={() => { yt.pause(); useYT.setState({ visible: false }) }}><X size={14} /></button>
      </div>
      <div ref={ref} className="aspect-video min-h-[200px] w-full bg-black" />
    </section>
  )
}
