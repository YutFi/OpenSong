import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUI } from '../store/ui'
import type { Release, Track } from '../types'
import { AvailabilityBadge } from './Badges'
import { ReleaseCard } from './ReleaseCard'
import { TrackRow } from './TrackRow'

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
const track = (over: Partial<Track> = {}): Track => ({ id: 't1', title: 'Song', artist: 'Band', source: 'jamendo', availability: 'full', streamUrl: 'https://x.test/a.mp3', ...over })
const release = (over: Partial<Release> = {}): Release => ({ id: 'r1', kind: 'album', title: 'Album', artist: 'Band', source: 'musicbrainz', sourceId: '1', availability: 'metadata', discoveredAt: 1, catalogAddedAt: 1, lastSeenAt: 1, ...over })

beforeEach(() => useUI.setState({ toasts: [] }))

describe('availability is never overstated', () => {
  it.each([['full', 'Full stream'], ['preview', 'Preview'], ['external', 'External'], ['metadata', 'Metadata only'], ['local', 'Local file']] as const)('%s → "%s"', (v, label) => {
    render(<AvailabilityBadge value={v} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('ReleaseCard', () => {
  it('metadata-only releases have NO play button, only details', () => {
    wrap(<ReleaseCard release={release()} />)
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull()
    expect(screen.getByRole('button', { name: /Details for Album/ })).toBeInTheDocument()
    expect(screen.getByText('Metadata only')).toBeInTheDocument()
  })
  it('external releases have no play button either', () => {
    wrap(<ReleaseCard release={release({ availability: 'external', source: 'archive' })} />)
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull()
  })
  it('full-stream releases show a play button', () => {
    wrap(<ReleaseCard release={release({ availability: 'full', source: 'jamendo' })} />)
    expect(screen.getByRole('button', { name: 'Play Album' })).toBeInTheDocument()
  })
  it('never invents a release date', () => {
    wrap(<ReleaseCard release={release()} />)
    expect(screen.getByText(/Date unknown/)).toBeInTheDocument()
  })
  it('shows a real date when the source provides one', () => {
    wrap(<ReleaseCard release={release({ releaseDate: '2026-03-14' })} />)
    expect(screen.queryByText(/Date unknown/)).toBeNull()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })
})

describe('TrackRow', () => {
  it('a metadata-only track cannot be played and explains why when attempted', async () => {
    const t = track({ availability: 'metadata', streamUrl: undefined })
    wrap(<TrackRow track={t} context={[t]} />)
    expect(screen.queryByRole('button', { name: /^Play Song/ })).toBeNull()
    await userEvent.dblClick(screen.getByText('Song'))
    expect(useUI.getState().toasts.some((x) => /no legal stream/i.test(x.message))).toBe(true)
  })
  it('a playable track exposes a play button and favourite toggle with accessible names', () => {
    const t = track()
    wrap(<TrackRow track={t} context={[t]} />)
    expect(screen.getByRole('button', { name: 'Play Song' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add to favourites' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /More actions for Song/ })).toBeInTheDocument()
  })
})
