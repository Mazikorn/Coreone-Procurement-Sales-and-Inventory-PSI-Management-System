import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/supplier-returns.test.ts'],
    testTimeout: 30000,
    globals: true,
    environment: 'node',
    globalSetup: './tests/global-setup.ts',
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--experimental-sqlite'],
      },
    },
    server: {
      deps: {
        external: ['node:sqlite'],
      },
    },
  },
})
