import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: [
      'tests/auth.test.ts',
      'tests/categories.test.ts',
      'tests/inbound.test.ts',
      'tests/inventory.test.ts',
      'tests/locations.test.ts',
      'tests/materials.test.ts',
      'tests/outbound.test.ts',
      'tests/purchase-orders.test.ts',
      'tests/roles.test.ts',
      'tests/supplier-returns.test.ts',
      'tests/suppliers.test.ts',
      'tests/users.test.ts',
    ],
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
