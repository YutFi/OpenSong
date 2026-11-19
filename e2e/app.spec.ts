import { expect, test, type Page } from '@playwright/test'
import { makeWav } from './wav'

// Provider hosts are unreachable in this environment on purpose: the app must stay fully usable.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('opensong:debug', '1'))
})

const importTone = async (page: Page, opts = {}) => {
  await page.goto('/#/library')
  await page.setInputFiles('input[aria-label="Choose audio files"]', { name: 'tone.wav', mimeType: 'audio/wav', buffer: makeWav(opts) })
  await expect(page.getByText('Test Tone').first()).toBeVisible()
}
const play = async (page: Page) => {
  await page.getByRole('button', { name: 'Play Test Tone' }).first().click({ force: true })
  await page.waitForFunction(() => (window as any).__opensong.usePlayer.getState().status === 'playing', null, { timeout: 15_000 })
}
/** Peak level (dB) near `hz` from the live analyser — measures the real processed signal. */
const levelAt = (page: Page, hz: number) => page.evaluate((hz) => {
  const { engine } = (window as any).__opensong
  const an: AnalyserNode = engine.analyser
  // The analyser smooths against its previous *read*, so take an unsmoothed snapshot to measure the signal as it is now.
  const prev = an.smoothingTimeConstant; an.smoothingTimeConstant = 0
  const d = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(d)
  an.smoothingTimeConstant = prev
  const bin = Math.round((hz / engine.ctx.sampleRate) * an.fftSize)
  return Math.max(d[bin - 1], d[bin], d[bin + 1])
}, hz)

test('home renders and degrades gracefully when every provider is unreachable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening|night)/)
  await expect(page.getByText('New releases').first()).toBeVisible()
  await page.getByRole('button', { name: 'Refresh catalogue' }).click()
  await expect(page.getByRole('button', { name: 'Refresh catalogue' })).toBeEnabled({ timeout: 45_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

test('every route renders without a crash', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const r of ['explore', 'search', 'new', 'trending', 'artists', 'artist/Nobody', 'library', 'playlists', 'playlist/missing', 'favourites', 'recent', 'equaliser', 'visualiser', 'stats', 'settings']) {
    await page.goto(`/#/${r}`)
    await expect(page.locator('main, #root').first()).toBeVisible()
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('imports a WAV with its tags, plays it, and the analyser sees real signal', async ({ page }) => {
  await importTone(page)
  await expect(page.getByText('Test Artist').first()).toBeVisible()
  await play(page)
  await page.waitForTimeout(1500)
  const t = await page.evaluate(() => (window as any).__opensong.usePlayer.getState().position)
  expect(t).toBeGreaterThan(0.5)
  const peak = await levelAt(page, 1000)
  const floor = await levelAt(page, 6000)
  expect(peak).toBeGreaterThan(-60)
  expect(peak - floor).toBeGreaterThan(30) // a 1 kHz tone, not noise
})

test('equaliser really changes the audio (+12 dB vs −12 dB on the 1 kHz band)', async ({ page }) => {
  await importTone(page, { seconds: 30, amp: 0.05 }) // quiet tone: boosts stay below the limiter so we measure the EQ alone
  await play(page)
  const set = (g: number) => page.evaluate((g) => { const s = (window as any).__opensong.useSettings.getState(); s.setEq({ autoHeadroom: false, preamp: 0, enabled: true, bands: 10 }); s.setBand(5, g) }, g)
  await set(0); await page.waitForTimeout(600); const flat = await levelAt(page, 1000)
  await set(12); await page.waitForTimeout(600); const up = await levelAt(page, 1000)
  await set(0); await page.waitForTimeout(600); const flat2 = await levelAt(page, 1000)
  await set(-12); await page.waitForTimeout(600); const down = await levelAt(page, 1000)
  expect(Math.abs(flat - flat2)).toBeLessThan(1.5) // stable baseline, so the differences below are the EQ and nothing else
  expect(up - flat).toBeGreaterThan(9)   // +12 dB requested
  expect(up - flat).toBeLessThan(15)
  expect(flat - down).toBeGreaterThan(9) // −12 dB requested
  expect(flat - down).toBeLessThan(15)
})

test('output limiter keeps a loud, heavily boosted signal at or below full scale', async ({ page }) => {
  await importTone(page, { seconds: 30, amp: 0.9 })
  await play(page)
  await page.evaluate(() => { const s = (window as any).__opensong.useSettings.getState(); s.setEq({ autoHeadroom: false, preamp: 12, enabled: true, bands: 10 }); s.setBand(5, 12) })
  await page.waitForTimeout(800)
  const peak = await page.evaluate(() => {
    const an: AnalyserNode = (window as any).__opensong.engine.analyser
    const d = new Float32Array(an.fftSize); let m = 0
    for (let k = 0; k < 20; k++) { an.getFloatTimeDomainData(d); for (const v of d) m = Math.max(m, Math.abs(v)) }
    return m
  })
  expect(peak).toBeGreaterThan(0.3)   // it is playing
  expect(peak).toBeLessThanOrEqual(1.0) // and not clipping (+21 dB of requested gain would be ~12× full scale unlimited)
})

test('visualiser draws non-blank pixels from live audio, and says so honestly when idle', async ({ page }) => {
  await page.goto('/#/visualiser')
  await expect(page.getByText('Press play to start the visualiser.')).toBeVisible()
  await importTone(page, { seconds: 30 })
  await play(page)
  await page.goto('/#/visualiser')
  await page.waitForTimeout(1500)
  const lit = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="visualiser-canvas"]') as HTMLCanvasElement
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    const bg = [d[0], d[1], d[2]]; let diff = 0
    for (let i = 0; i < d.length; i += 4 * 17) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 60) diff++
    return diff
  })
  expect(lit).toBeGreaterThan(30)
})

test('playlist: create, add track, persists across reload; export works', async ({ page }) => {
  await importTone(page)
  await page.getByRole('button', { name: /More actions for Test Tone/ }).first().click()
  await page.getByRole('menuitem', { name: /Add to playlist/ }).click()
  await page.getByLabel('New playlist name').fill('E2E Mix')
  await page.getByRole('button', { name: /^Create/ }).click()
  await page.goto('/#/playlists')
  await expect(page.getByText('E2E Mix').first()).toBeVisible()
  await page.reload()
  await page.getByText('E2E Mix').first().click()
  await expect(page.getByText('Test Tone').first()).toBeVisible()
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.getByRole('button', { name: 'Playlist actions' }).click(); await page.getByRole('menuitem', { name: 'Export as M3U' }).click() })()])
  expect(dl.suggestedFilename()).toMatch(/\.m3u8$/)
})

test('queue: play, next and shuffle toggle (repeat / previous rules are unit-tested)', async ({ page }) => {
  await page.goto('/#/library')
  await page.setInputFiles('input[aria-label="Choose audio files"]', [
    { name: 'a.wav', mimeType: 'audio/wav', buffer: makeWav({ title: 'Alpha', freq: 440, seconds: 20 }) },
    { name: 'b.wav', mimeType: 'audio/wav', buffer: makeWav({ title: 'Bravo', freq: 660, seconds: 20 }) },
    { name: 'c.wav', mimeType: 'audio/wav', buffer: makeWav({ title: 'Charlie', freq: 880, seconds: 20 }) },
  ])
  await expect(page.getByText('Charlie').first()).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).first().click()
  await page.waitForFunction(() => (window as any).__opensong.usePlayer.getState().status === 'playing')
  const idx = () => page.evaluate(() => { const s = (window as any).__opensong.usePlayer.getState(); return s.queue[s.index].title })
  const first = await idx()
  await page.evaluate(() => (window as any).__opensong.usePlayer.getState().next())
  await expect.poll(idx).not.toBe(first)
  await page.evaluate(() => (window as any).__opensong.usePlayer.getState().toggleShuffle())
  expect(await page.evaluate(() => (window as any).__opensong.usePlayer.getState().shuffle)).toBe(true)
  const q = await page.evaluate(() => (window as any).__opensong.usePlayer.getState().queue.length)
  expect(q).toBe(3)
})

test('settings persist and theme switches', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByLabel('Theme').selectOption('light')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.reload()
  await expect(page.getByLabel('Theme')).toHaveValue('light')
})

test('works offline after first load (app shell + local library)', async ({ page, context }) => {
  await importTone(page)
  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload() // let the SW take control
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 })
  await context.setOffline(true)
  await page.goto('/#/library')
  await page.reload()
  await expect(page.getByText('Test Tone').first()).toBeVisible()
  await play(page)
  await context.setOffline(false)
})

test('mobile viewport: bottom navigation, no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('navigation').last()).toBeVisible()
  for (const r of ['', 'new', 'library', 'equaliser', 'settings', 'stats']) {
    await page.goto(`/#/${r}`)
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `route /${r}`).toBeLessThanOrEqual(1)
  }
  await page.screenshot({ path: 'e2e/shots/mobile-home.png' })
})

test('New releases on a phone: filters fit the screen, switches have visible labels, playable releases come first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/new')
  await page.waitForFunction(() => !!(window as any).__opensong?.db)
  const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
  await page.evaluate(async (dates) => {
    const { db } = (window as any).__opensong
    const now = Date.now()
    const mk = (i: number, availability: string) => ({ id: `t:${i}`, kind: 'single', title: `Fixture song ${i}`, artist: `Fixture artist ${i}`, releaseDate: dates[i % dates.length], source: 'jamendo', sourceId: String(i), availability, discoveredAt: now, catalogAddedAt: now, lastSeenAt: now, dkey: `fixture|${i}` })
    await db.catalog.clear()
    await db.catalog.bulkPut([...Array.from({ length: 12 }, (_, i) => mk(i, 'metadata')), mk(100, 'full'), mk(101, 'full')])
  }, [day(1), day(2), day(3)])
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Independent artists' })).toBeVisible()
  // labels are real, visible text (not just aria-labels)
  await expect(page.getByText('Independent artists', { exact: true })).toBeVisible()
  await expect(page.getByText(/^Followed artists/)).toBeVisible()
  // nothing inside the page may be wider than the viewport
  const wide = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('[class*="overflow-x-auto"]')).map((el) => `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 80)))
  expect(wide).toEqual([])
  // 'Listen now' is the automatic default when something is playable
  await expect(page.getByRole('button', { name: 'Listen now' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Fixture song 100').first()).toBeVisible()
  await expect(page.getByText('Fixture song 3', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /more are info-only/ }).click()
  await expect(page.getByText('Fixture song 3').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/shots/mobile-new-releases.png', fullPage: false })
})

/** A stand-in for YouTube's IFrame API (the real one can't be reached from the test environment). It follows the documented surface only. */
const FAKE_YT = () => {
  const w = window as any
  w.__yt = { created: [] as any[], calls: [] as string[], vol: [] as number[] }
  w.YT = {
    Player: class {
      o: any; vid: string; t = 0; frame: HTMLIFrameElement
      constructor(el: HTMLElement, o: any) {
        this.o = o; this.vid = o.videoId
        this.frame = document.createElement('iframe'); this.frame.title = 'fake youtube'; this.frame.style.cssText = 'width:100%;height:100%;border:0;display:block'
        el.replaceWith(this.frame)
        w.__yt.created.push({ videoId: o.videoId, playerVars: o.playerVars, width: o.width, height: o.height })
        setTimeout(() => { o.events.onReady(); if (o.playerVars.autoplay) this.state(1) }, 30)
        setInterval(() => { if (this.playing) this.t += 0.5 }, 500)
      }
      playing = false
      state(n: number) { this.playing = n === 1; this.o.events.onStateChange({ data: n }) }
      loadVideoById(a: any) { this.vid = a.videoId; this.t = a.startSeconds ?? 0; w.__yt.calls.push('load:' + a.videoId); this.state(1) }
      cueVideoById(a: any) { this.vid = a.videoId; w.__yt.calls.push('cue:' + a.videoId); this.state(5) }
      playVideo() { w.__yt.calls.push('play'); this.state(1) }
      pauseVideo() { w.__yt.calls.push('pause'); this.state(2) }
      seekTo(t: number) { w.__yt.calls.push('seek:' + t); this.t = t }
      getCurrentTime() { return this.t }
      getDuration() { return 205 }
      setVolume(v: number) { w.__yt.vol.push(v) }
    },
  }
}
const ytTrack = (id: string, title: string) => ({ id: `youtube:${id}`, title, artist: 'Fixture Artist', source: 'youtube', sourceId: id, youtubeId: id, availability: 'full', duration: 205, sourceUrl: `https://www.youtube.com/watch?v=${id}` })

test('YouTube track plays in the visible official embed; audio engine and embed hand over cleanly', async ({ page }) => {
  await page.addInitScript(FAKE_YT)
  await page.setViewportSize({ width: 390, height: 844 })
  await importTone(page)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.evaluate((tracks) => (window as any).__opensong.usePlayer.getState().playQueue(tracks, 0), [ytTrack('aaaaaaaaaaa', 'YT Song One'), ytTrack('bbbbbbbbbbb', 'YT Song Two')])
  const stage = page.getByTestId('yt-stage')
  await expect(stage).toBeVisible()
  await page.waitForFunction(() => (window as any).__opensong.usePlayer.getState().status === 'playing')
  expect(await page.evaluate(() => (window as any).__yt.created[0])).toMatchObject({ videoId: 'aaaaaaaaaaa', playerVars: { autoplay: 1, playsinline: 1 } })
  expect(await page.evaluate(() => (window as any).__opensong.usePlayer.getState().mode)).toBe('embed')

  // YouTube's rules: ≥200×200 and nothing drawn over the player.
  const geo = await page.evaluate(() => {
    const f = document.querySelector('iframe[title="fake youtube"]') as HTMLElement
    const r = f.getBoundingClientRect()
    const hit = (x: number, y: number) => document.elementFromPoint(x, y)
    const pts = [[r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2], [r.left + r.width / 2, r.top + r.height / 2]]
    const nav = [...document.querySelectorAll('nav[aria-label="Main"]')].map((e) => e.getBoundingClientRect()).find((r) => r.width > 0)!
    const title = [...document.querySelectorAll('button[aria-label="Open now playing"]')].map((e) => e.closest('.fixed')?.getBoundingClientRect()).find((r) => r && r.width > 0)!
    return { w: r.width, h: r.height, covered: pts.filter(([x, y]) => hit(x, y) !== f).length, right: r.right, vw: innerWidth, bottom: r.bottom, barTop: Math.min(nav.top, title.top) }
  })
  expect(geo.w).toBeGreaterThanOrEqual(200); expect(geo.h).toBeGreaterThanOrEqual(200)
  expect(geo.covered).toBe(0)
  expect(geo.right).toBeLessThanOrEqual(geo.vw)
  expect(geo.bottom).toBeLessThanOrEqual(geo.barTop)
  await page.evaluate(() => (window as any).__opensong.usePlayer.getState().enqueue([{ id: 'x:1', title: 'Queued', artist: 'A', source: 'youtube', youtubeId: 'ccccccccccc', availability: 'full' }]))
  await expect(page.getByRole('status').getByText(/Added 1 to queue/)).toBeVisible()
  const toastClear = await page.evaluate(() => {
    const f = document.querySelector('iframe[title="fake youtube"]')!.getBoundingClientRect()
    const t = [...document.querySelectorAll('[role="status"] button')].map((e) => e.getBoundingClientRect())
    return t.every((r) => r.bottom <= f.top || r.top >= f.bottom)
  })
  expect(toastClear).toBe(true) // notifications never cover the YouTube player
  await page.screenshot({ path: 'e2e/shots/mobile-youtube.png' })

  // progress comes from the embed
  await page.waitForFunction(() => (window as any).__opensong.usePlayer.getState().position > 0.4, null, { timeout: 8000 })
  // pause / resume go to the embed, not the audio engine
  await page.evaluate(() => (window as any).__opensong.usePlayer.getState().toggle())
  await page.waitForFunction(() => (window as any).__opensong.usePlayer.getState().status === 'paused')
  expect(await page.evaluate(() => (window as any).__yt.calls.includes('pause'))).toBe(true)
  await page.evaluate(() => (window as any).__opensong.usePlayer.getState().toggle())
  await page.waitForFunction(() => (window as any).__opensong.usePlayer.getState().status === 'playing')
  // next → second video loaded in the SAME player
  await page.evaluate(() => (window as any).__opensong.usePlayer.getState().next())
  await page.waitForFunction(() => (window as any).__yt.calls.includes('load:bbbbbbbbbbb'))
  expect(await page.evaluate(() => (window as any).__yt.created.length)).toBe(1)
  // closing the player pauses it
  await page.getByRole('button', { name: /Close YouTube player/ }).click()
  await expect(stage).toBeHidden()
  // a local file hands playback back to the Web Audio engine and hides the embed
  await page.evaluate(() => { const p = (window as any).__opensong.usePlayer.getState(); return p.playQueue(p.queue.slice(0, 0).concat([]), 0) }).catch(() => undefined)
  await page.goto('/#/library')
  await play(page)
  await expect(stage).toBeHidden()
  expect(await page.evaluate(() => (window as any).__opensong.usePlayer.getState().mode)).toBe('processed')
  expect(pageErrors).toEqual([])
})

test('YouTube is opt-in: nothing from YouTube is requested or loaded until a YouTube song is played', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (r) => { try { hosts.add(new URL(r.url()).hostname) } catch { /* data: urls */ } })
  await page.goto('/')
  await page.waitForTimeout(1500)
  await page.goto('/#/settings')
  await expect(page.getByText('YouTube (official player)').first()).toBeVisible()
  expect([...hosts].filter((h) => /youtube|googleapis|ytimg|google/.test(h))).toEqual([])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('opensong:settings') ?? '{}').state?.providers?.youtube)).not.toBe(true)
})

test('production build: no Content-Security-Policy violations while using the app and playing audio', async ({ page }) => {
  const violations: string[] = []
  await page.addInitScript(() => {
    ;(window as any).__csp = []
    document.addEventListener('securitypolicyviolation', (e) => (window as any).__csp.push(`${e.violatedDirective} ← ${e.blockedURI}`))
  })
  await page.goto('/')
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(1)
  await importTone(page, { seconds: 10 })
  await play(page)
  for (const r of ['', 'explore', 'search?q=test', 'new', 'equaliser', 'visualiser', 'stats', 'settings']) { await page.goto(`/#/${r}`); await page.waitForTimeout(250) }
  violations.push(...(await page.evaluate(() => (window as any).__csp)))
  expect(violations).toEqual([])
})

test('first load stays small: initial JS budget and the metadata parser is lazy', async ({ page }) => {
  const js: { url: string; bytes: number }[] = []
  page.on('response', async (r) => { if (r.url().endsWith('.js') && !r.url().includes('sw.js') && !r.url().includes('workbox')) js.push({ url: r.url(), bytes: (await r.body().catch(() => Buffer.alloc(0))).length }) })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  const total = js.reduce((a, b) => a + b.bytes, 0)
  console.log(`initial JS: ${(total / 1024).toFixed(0)} KB uncompressed across ${js.length} files`)
  expect(js.some((j) => /metadata-/.test(j.url))).toBe(false) // music-metadata (~300 KB) only loads when files are imported
  expect(total).toBeLessThan(700 * 1024)
})
