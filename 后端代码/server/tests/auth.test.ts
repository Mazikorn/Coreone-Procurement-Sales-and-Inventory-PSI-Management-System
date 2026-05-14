/**
 * TS-01 认证与登录 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/auth.test.ts
 */

import { getJSON, postJSON, login } from './setup.js'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001/api/v1'

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`)
  }
}

function assertTrue(value: any, msg: string) {
  if (!value) {
    throw new Error(`${msg}: got ${value}`)
  }
}

async function run() {
  let passed = 0
  let failed = 0

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn()
      console.log(`✅ ${name}`)
      passed++
    } catch (e: any) {
      console.log(`❌ ${name}: ${e.message}`)
      failed++
    }
  }

  // AUTH-01: admin登录成功，返回token、refreshToken、expiresIn=28800
  await test('AUTH-01 admin登录成功', async () => {
    const res = await postJSON('/auth/login', { username: 'admin', password: 'admin123' })
    assertTrue(res.success, 'success should be true')
    assertTrue(res.data.token, 'should have token')
    assertTrue(res.data.refreshToken, 'should have refreshToken')
    assertEqual(res.data.expiresIn, 28800, 'expiresIn should be 28800')
    assertTrue(res.data.user, 'should have user')
    assertEqual(res.data.user.role, 'admin', 'role should be admin')
    assertTrue(res.data.user.permissions, 'should have permissions')
  })

  // AUTH-07: 密码错误返回401
  await test('AUTH-07 密码错误', async () => {
    try {
      await postJSON('/auth/login', { username: 'admin', password: 'wrongpassword' })
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Invalid'), 'should be 401')
    }
  })

  // AUTH-08: 不存在的用户名
  await test('AUTH-08 不存在的用户', async () => {
    try {
      await postJSON('/auth/login', { username: 'nonexistent', password: 'password' })
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('not found') || e.message.includes('disabled'), 'should be 401')
    }
  })

  // AUTH-10: 空用户名返回400
  await test('AUTH-10 空用户名', async () => {
    try {
      await postJSON('/auth/login', { username: '', password: 'password' })
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('required') || e.message.includes('Login failed'), 'should be 400')
    }
  })

  // AUTH-13: refresh token
  await test('AUTH-13 refresh token', async () => {
    const loginRes = await postJSON('/auth/login', { username: 'admin', password: 'admin123' })
    const refreshToken = loginRes.data.refreshToken
    const res = await postJSON('/auth/refresh', { refreshToken })
    assertTrue(res.success, 'refresh should succeed')
    assertTrue(res.data.token, 'should have new token')
    assertEqual(res.data.expiresIn, 28800, 'expiresIn should be 28800')
  })

  // AUTH-14: 使用access token调用刷新接口返回401
  await test('AUTH-14 accessToken不能refresh', async () => {
    const loginRes = await postJSON('/auth/login', { username: 'admin', password: 'admin123' })
    try {
      await postJSON('/auth/refresh', { refreshToken: loginRes.data.token })
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Invalid refresh'), 'should be 401')
    }
  })

  // AUTH-18: 登出接口
  await test('AUTH-18 登出接口', async () => {
    const res = await postJSON('/auth/logout', {})
    assertTrue(res.success, 'logout should succeed')
  })

  // AUTH-21: 无Token请求返回401
  await test('AUTH-21 无Token', async () => {
    try {
      await getJSON('/users')
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Unauthorized'), 'should be 401')
    }
  })

  console.log(`\n📊 Auth Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
