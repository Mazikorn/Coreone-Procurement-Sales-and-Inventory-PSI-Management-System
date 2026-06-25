/**
 * Vitest 全局 Setup
 * 在测试开始前启动服务器，供 API 测试使用
 *
 * 数据库隔离：主进程同样使用 `:memory:`，避免常驻服务器与测试 worker 并发打开同一磁盘库
 * `data/coreone.db` 引发 SQLite 文件锁 / DDL schema 竞争（该竞争会令 worker 偶发崩溃或读到
 * 半迁移的 schema，进而把同 worker 上无关测试拖红——即"跨文件污染偶发误红"的真正诱因之一）。
 * 见 tests/db-isolation.setup.ts（worker 侧每文件隔离）。
 */
process.env.DATABASE_PATH = ':memory:'

const PORT = 3001
let server: any

export default function setup() {
  // 动态导入 app（须在上方设置 DATABASE_PATH 之后），启动服务器
  return import('../src/app.js').then((mod: any) => {
    const app = mod.default
    return new Promise<void>((resolve) => {
      server = app.listen(PORT, () => {
        console.log('[vitest globalSetup] Test server running on port', PORT)
        resolve()
      })
      // 端口已被上一轮残留进程占用时不崩溃：当前测试集均用 supertest 的 request(app)（无需常驻端口），
      // 故容忍 EADDRINUSE 直接放行，避免"连续跑三次"因端口未及时释放而偶发 EADDRINUSE 失败。
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[vitest globalSetup] port ${PORT} in use, continuing without a dedicated server`)
          server = null
          resolve()
        } else {
          throw err
        }
      })
      // 不让监听句柄阻止进程退出（配合 teardown 的 close()，保证进程及时退出并释放端口）
      if (typeof server.unref === 'function') server.unref()
    })
  })
}

export function teardown() {
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => {
        console.log('[vitest globalSetup] Test server closed')
        resolve()
      })
    } else {
      resolve()
    }
  })
}
