/**
 * TS-03 角色管理 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/roles.test.ts
 */

import { getJSON, postJSON, putJSON, delJSON, login, generateUnique } from './setup.js'

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`)
}

function assertTrue(value: any, msg: string) {
  if (!value) throw new Error(`${msg}: got ${value}`)
}

async function run() {
  let passed = 0, failed = 0
  async function test(name: string, fn: () => Promise<void>) {
    try { await fn(); console.log(`✅ ${name}`); passed++ }
    catch (e: any) { console.log(`❌ ${name}: ${e.message}`); failed++ }
  }

  const adminToken = await login('admin', 'admin123')
  const whmToken = await login('cangguan', 'CoreOne2026!')

  const roleCode = generateUnique('test_role')

  await test('ROLE-01 admin获取角色列表', async () => {
    const res = await getJSON('/roles?page=1&pageSize=20', adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.list.length > 0, 'has roles')
  })

  await test('ROLE-02 创建角色', async () => {
    const res = await postJSON('/roles', { code: roleCode, name: '测试角色', permissions: ['inventory', 'alerts'], status: 'active' }, adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.id, 'has id')
  })

  await test('ROLE-07 重复code返回409', async () => {
    try {
      await postJSON('/roles', { code: roleCode, name: '测试角色2', permissions: [], status: 'active' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('409') || e.message.includes('exists'), 'should be 409')
    }
  })

  await test('ROLE-08 缺少code返回400', async () => {
    try {
      await postJSON('/roles', { name: '测试角色', permissions: [] }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('required'), 'should be 400')
    }
  })

  await test('ROLE-10 编辑不存在的角色返回404', async () => {
    try {
      await putJSON('/roles/non-existent-id', { code: 'x', name: 'x', permissions: [] }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('not found'), 'should be 404')
    }
  })

  await test('ROLE-11 WHM访问角色列表返回403', async () => {
    try {
      await getJSON('/roles', whmToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // 清理
  await test('ROLE-05 删除角色', async () => {
    const roles = await getJSON('/roles?page=1&pageSize=50', adminToken)
    const role = roles.data.list.find((r: any) => r.code === roleCode)
    if (!role) throw new Error('Role not found')
    const res = await delJSON(`/roles/${role.id}`, adminToken)
    assertTrue(res.success, 'delete success')
  })

  console.log(`\n📊 Roles Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
