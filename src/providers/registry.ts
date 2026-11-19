import { archive } from './archive'
import { commons } from './commons'
import { jamendo } from './jamendo'
import { listenbrainz } from './listenbrainz'
import { musicbrainz } from './musicbrainz'
import { youtube } from './youtube'
import type { MusicProvider } from './types'

/** Adding a source = implement MusicProvider and add it here. Nothing else in the app changes. */
export const providers: MusicProvider[] = [jamendo, archive, commons, listenbrainz, musicbrainz, youtube]

export const providerById = (id: string) => providers.find((p) => p.id === id)
