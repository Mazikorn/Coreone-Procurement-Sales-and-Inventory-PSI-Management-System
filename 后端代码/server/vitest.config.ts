import { defineConfig } from 'vitest/config'

// node:sqlite 是 Node 实验性内置模块，未列入 vite 的 builtinModules，
// vite 会把 `node:sqlite` 误当作普通包 `sqlite` 解析而失败。
// 该插件在解析阶段把它标记为外部模块，交还给 Node 运行时（--experimental-sqlite）。
const NODE_SQLITE_SHIM = '\0node-sqlite-shim'
function externalizeNodeSqlite() {
  return {
    name: 'externalize-node-sqlite',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (id === 'node:sqlite' || id === 'sqlite') {
        return NODE_SQLITE_SHIM
      }
      return null
    },
    load(id: string) {
      if (id === NODE_SQLITE_SHIM) {
        // 经 createRequire 在 Node 运行时（--experimental-sqlite）加载真正的内置模块
        return `import { createRequire } from 'node:module'\n` +
          `const require = createRequire(import.meta.url)\n` +
          `const mod = require('node:sqlite')\n` +
          `export const DatabaseSync = mod.DatabaseSync\n` +
          `export default mod\n`
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [externalizeNodeSqlite()],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--experimental-sqlite'],
      },
    },
  },
})
