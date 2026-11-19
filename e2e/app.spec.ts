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
