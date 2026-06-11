/**
 * Vitest 全局 Setup
 * 在测试开始前启动服务器，供 API 测试使用
 */

let server: any

export default function setup() {
  // 动态导入 app，启动服务器
  return import('../src/app.js').then((mod: any) => {
    const app = mod.default
    return new Promise<void>((resolve) => {
      server = app.listen(3001, () => {
        console.log('[vitest globalSetup] Test server running on port 3001')
        resolve()
      })
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
