import { defineConfig } from '@playwright/test'

// Uses the system Chrome so no browser download is needed. In CI, set CHROME_PATH or install Playwright's Chromium.
const executablePath = process.env.CHROME_PATH ?? (process.env.CI ? undefined : '/usr/bin/google-chrome')

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'allow',
    launchOptions: { executablePath, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'] },
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run preview -- --port 4173 --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
})
