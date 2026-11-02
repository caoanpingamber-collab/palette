import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests', testMatch: '*.browser.mjs', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5194', browserName: 'chromium', headless: true,
    launchOptions: { executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  },
  webServer: { command: 'node tests/serve.mjs', url: 'http://127.0.0.1:5194', reuseExistingServer: false, timeout: 30000 },
})
