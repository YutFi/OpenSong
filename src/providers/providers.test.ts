import { describe, expect, it } from 'vitest'
import { mapFresh, mapReleaseGroupStat } from './listenbrainz'
import { groupJamendo, mapJamendoTrack } from './jamendo'
import { isOpenLicense, mapArchiveDoc, pickAudioFiles } from './archive'
import { mapCommonsPage } from './commons'
import { mapArtist, mapReleaseGroup } from './musicbrainz'
import { licenseLabel, stripHtml } from './shared'

const NOW = Date.UTC(2026, 10, 19)

describe('ListenBrainz', () => {
  // Real shape returned by /1/explore/fresh-releases (verified live, 2026-11-19)
  const raw = { artist_credit_name: '최태범', artist_mbids: ['84633f3d-483a-43be-bc16-083fa54e566c'], caa_id: null, caa_release_mbid: null, listen_count: 0, release_date: '2026-11-16', release_group_mbid: '0a1cff73-8d0d-4c98-b58d-2606e795d6b6', release_group_primary_type: 'Single', release_mbid: '0494920e-e2dc-4648-866c-1f66859ea7f6', release_name: '그때의 나는 어디쯤 있을까', release_tags: [] }
  it('maps fresh releases as metadata-only with the real release date', () => {
    const r = mapFresh(raw, NOW)
    expect(r).toMatchObject({ id: 'listenbrainz:0a1cff73-8d0d-4c98-b58d-2606e795d6b6', kind: 'single', releaseDate: '2026-11-16', availability: 'metadata', source: 'listenbrainz' })
    expect(r.sourceUrl).toBe('https://musicbrainz.org/release/0494920e-e2dc-4648-866c-1f66859ea7f6')
    expect(r.tracks).toBeUndefined() // metadata is not streaming permission
  })
  it('only requests artwork when the Cover Art Archive has some', () => {
    expect(mapFresh(raw, NOW).artworkUrl).toBeUndefined()
    expect(mapFresh({ ...raw, caa_id: 5, caa_release_mbid: 'abc' }, NOW).artworkUrl).toBe('https://coverartarchive.org/release/abc/front-250')
  })
  it('maps sitewide popularity stats as trending metadata', () => {
    const r = mapReleaseGroupStat({ artist_name: 'X', artist_mbids: ['1'], caa_id: null, caa_release_mbid: null, listen_count: 99, release_group_mbid: 'rg', release_group_name: 'Album' }, NOW)
    expect(r).toMatchObject({ trending: true, listenCount: 99, availability: 'metadata' })
    expect(r.releaseDate).toBeUndefined()
  })
})

describe('Jamendo', () => {
  const t = (id: string, album?: string) => ({ id, name: `Track ${id}`, artist_name: 'Band', artist_id: '9', album_id: album ? '77' : '', album_name: album ?? '', duration: 180, releasedate: '2026-11-17', audio: `https://prod-1.storage.jamendo.com/?trackid=${id}&format=mp32`, image: 'https://usercontent.jamendo.com/img.jpg', license_ccurl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/', shareurl: `https://www.jamendo.com/track/${id}`, musicinfo: { tags: { genres: ['rock'] } } })
  it('maps a track as fully streamable with its licence', () => {
    const m = mapJamendoTrack(t('1'))
    expect(m).toMatchObject({ id: 'jamendo:1', availability: 'full', genre: 'rock', license: 'CC BY-NC-SA 3.0', duration: 180 })
    expect(m.streamUrl).toMatch(/^https:/)
  })
  it('does not claim playback when there is no audio URL', () => {
    expect(mapJamendoTrack({ ...t('2'), audio: '' }).availability).toBe('external')
    expect(mapJamendoTrack({ ...t('3'), audio: 'javascript:alert(1)' }).streamUrl).toBeUndefined()
  })
  it('groups tracks into releases, inferring kind from the track count', () => {
    const rs = groupJamendo([t('1'), t('2', 'LP'), t('3', 'LP'), t('4', 'LP')], NOW)
    expect(rs).toHaveLength(2)
    const single = rs.find((r) => r.kind === 'single')!
    const ep = rs.find((r) => r.kind === 'ep')!
    expect(single.tracks).toHaveLength(1)
    expect(ep).toMatchObject({ title: 'LP', independent: true })
    expect(ep.tracks).toHaveLength(3)
  })
})

describe('Internet Archive', () => {
  const doc = { identifier: 'abc', title: 'Cool Release', creator: ['The Band'], date: '2026-11-01', addeddate: '2026-11-18T10:00:00Z', licenseurl: 'http://creativecommons.org/licenses/by/4.0/', downloads: 12, subject: ['ambient', 'drone'] }
  it('treats a CC licence as streamable and keeps source metadata', () => {
    const r = mapArchiveDoc(doc, NOW)!
    expect(r).toMatchObject({ id: 'archive:abc', availability: 'full', license: 'CC BY 4.0', releaseDate: '2026-11-01', sourceAddedAt: '2026-11-18T10:00:00Z', artist: 'The Band', genre: 'ambient' })
  })
  it('refuses to stream items without an open licence', () => {
    expect(mapArchiveDoc({ ...doc, licenseurl: undefined }, NOW)!.availability).toBe('external')
    expect(mapArchiveDoc({ ...doc, licenseurl: 'http://example.com/all-rights-reserved' }, NOW)!.availability).toBe('external')
    expect(isOpenLicense('https://creativecommons.org/publicdomain/zero/1.0/')).toBe(true)
    expect(isOpenLicense('https://example.com/x')).toBe(false)
  })
  it('never invents or accepts impossible dates', () => {
    expect(mapArchiveDoc({ ...doc, date: '2099-01-01' }, NOW)!.releaseDate).toBeUndefined()
    expect(mapArchiveDoc({ ...doc, date: 'sometime' }, NOW)!.releaseDate).toBeUndefined()
    expect(mapArchiveDoc({ identifier: 'x' }, NOW)).toBeUndefined()
  })
  it('picks one file per track, preferring the requested format', () => {
    const files = [
      { name: '01 Song.flac', format: 'Flac' }, { name: '01 Song.mp3', format: 'VBR MP3', source: 'derivative' }, { name: '01 Song.ogg', format: 'Ogg Vorbis' },
      { name: '02 Song.mp3', format: 'MP3', source: 'original' }, { name: 'cover.jpg', format: 'JPEG' }, { name: 'x_archive.torrent', format: 'Archive BitTorrent' },
    ]
    expect(pickAudioFiles(files, 'mp3').map((f) => f.name)).toEqual(['01 Song.mp3', '02 Song.mp3'])
    expect(pickAudioFiles(files, 'ogg').map((f) => f.name)).toEqual(['01 Song.ogg', '02 Song.mp3'])
  })
})

describe('Wikimedia Commons', () => {
  const page = { title: 'File:Some_Tune.ogg', pageid: 5, imageinfo: [{ url: 'https://upload.wikimedia.org/x/Some_Tune.ogg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Some_Tune.ogg', mime: 'application/ogg', timestamp: '2026-11-18T08:00:00Z', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, Artist: { value: '<a href="//x">Jane <b>Doe</b></a>' } } }] }
  it('maps audio files with licence and cleans HTML from artist names', () => {
    const r = mapCommonsPage(page, NOW)!
    expect(r).toMatchObject({ id: 'commons:5', availability: 'full', artist: 'Jane Doe', title: 'Some Tune', license: 'CC BY-SA 4.0', sourceAddedAt: '2026-11-18T08:00:00Z' })
    expect(r.releaseDate).toBeUndefined() // upload time is not a release date
    expect(r.tracks![0].streamUrl).toMatch(/^https:/)
  })
  it('skips non-audio and unlicensed files', () => {
    expect(mapCommonsPage({ ...page, imageinfo: [{ ...page.imageinfo[0], mime: 'image/png' }] }, NOW)).toBeUndefined()
    expect(mapCommonsPage({ ...page, imageinfo: [{ ...page.imageinfo[0], extmetadata: {} }] }, NOW)).toBeUndefined()
    expect(mapCommonsPage({ title: 'File:x.ogg' }, NOW)).toBeUndefined()
  })
})

describe('MusicBrainz', () => {
  it('maps release groups and artists', () => {
    const r = mapReleaseGroup({ id: 'rg1', title: 'Debut', 'primary-type': 'Album', 'first-release-date': '2024-05', 'artist-credit': [{ name: 'Band', artist: { id: 'a1', name: 'Band' } }], tags: [{ name: 'rock', count: 3 }, { name: 'indie', count: 9 }] }, NOW)
    expect(r).toMatchObject({ kind: 'album', releaseDate: '2024-05', genre: 'indie', artistMbid: 'a1', availability: 'metadata' })
    expect(mapReleaseGroup({ id: 'x', title: 'T', 'first-release-date': '' }, NOW).releaseDate).toBeUndefined()
    expect(mapArtist({ id: 'a', name: 'N', country: 'GB' })).toMatchObject({ mbid: 'a', country: 'GB' })
  })
})

describe('helpers', () => {
  it('derives licence labels', () => {
    expect(licenseLabel('https://creativecommons.org/licenses/by-nc-nd/4.0/')).toBe('CC BY-NC-ND 4.0')
    expect(licenseLabel('https://creativecommons.org/publicdomain/mark/1.0/')).toBe('Public Domain')
    expect(licenseLabel('https://evil.test/licenses/by/4.0/')).toBeUndefined()
    expect(licenseLabel(undefined)).toBeUndefined()
  })
  it('strips HTML without executing anything', () => {
    expect(stripHtml('<script>alert(1)</script>Hi &amp; bye')).toBe('alert(1) Hi & bye')
    expect(stripHtml('')).toBeUndefined()
  })
})
