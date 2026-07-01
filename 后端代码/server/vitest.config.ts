import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // 遗留 tsx 场景脚本：手写 harness（import './setup.js' + 顶层 run() + process.exit()），
    // 需对实跑的 :3001 服务执行（见 package.json 的 test:scenarios），不是 vitest 用例。
    // 若不排除，vitest 会把它们误报为 "No test suite found" 红色失败、污染真实信号。
    // 注意：仅排除真正的遗留脚本——勿把已改写成 vitest 的同名文件（如 supplier-returns.test.ts）列入。
    exclude: [
      'tests/auth.test.ts',
      'tests/categories.test.ts',
      'tests/inventory.test.ts',
      'tests/locations.test.ts',
      'tests/purchase-orders.test.ts',
      'tests/suppliers.test.ts',
      'tests/users.test.ts',
    ],
    testTimeout: 30000,
    globals: true,
    environment: 'node',
    globalSetup: './tests/global-setup.ts',
    // 每文件强制独立内存库，消除跨文件 SQLite 污染（详见 tests/db-isolation.setup.ts）
    setupFiles: ['./tests/db-isolation.setup.ts'],
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
