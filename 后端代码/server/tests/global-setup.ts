/**
 * Vitest 全局 Setup
 * 在测试开始前启动服务器，供 API 测试使用
 */

let server: any

export default async function setup() {
  process.env.JWT_SECRET ||= 'test-secret'
  process.env.DATABASE_PATH ||= ':memory:'

  const [{ default: app }, { closeDatabase }] = await Promise.all([
    import('../src/app.js'),
    import('../src/database/DatabaseManager.js'),
  ])

  await new Promise<void>((resolve) => {
    server = app.listen(3001, () => {
      console.log('[vitest globalSetup] Test server running on port 3001')
      resolve()
    })
  })

  return async () => {
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve()
        return
      }

      server.close(() => {
        console.log('[vitest globalSetup] Test server closed')
        resolve()
      })
    })

    if (server) {
      server.closeAllConnections?.()
      server = null
    }
    closeDatabase()
  }
}
