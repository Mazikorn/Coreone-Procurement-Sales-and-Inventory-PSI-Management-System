import { defineConfig, devices } from '@playwright/test'

const localChromiumLaunchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : process.env.CI || process.platform !== 'win32'
    ? undefined
    : { executablePath: 'C:\\Users\\86185\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe' }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 限制并发为1，避免SQLite写锁导致ECONNRESET
  timeout: 90000,
  reporter: [
    ['html', { outputFolder: 'e2e-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-extensions',
          ],
          ...localChromiumLaunchOptions,
        },
      },
    },
  ],

  // 同时启动后端 API 和前端 dev server，解决 E2E 测试因后端未启动导致的超时
  webServer: [
    {
      command: 'cd ../后端代码/server && npx tsx src/app.ts',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'npx vite --host',
      url: 'http://localhost:8080',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
})
