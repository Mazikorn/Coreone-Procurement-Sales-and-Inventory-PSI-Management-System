/**
 * TS-10 库位管理 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/locations.test.ts
 */

import { getJSON, postJSON, putJSON, delJSON, login, generateUnique } from './setup.js'

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
  const techToken = await login('jishuyuan1', 'CoreOne2026!')

  const locName = generateUnique('库位')

  await test('LOC-01 admin获取库位列表', async () => {
    const res = await getJSON('/locations?page=1&pageSize=20', adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.list.length > 0, 'has locations')
  })

  await test('LOC-02 创建库位', async () => {
    const res = await postJSON('/locations', { name: locName, zone: 'A区', type: 'shelf' }, adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.id, 'has id')
  })

  await test('LOC-09 缺少name返回400', async () => {
    try {
      await postJSON('/locations', { zone: 'A区' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('required'), 'should be 400')
    }
  })

  await test('LOC-06 WHM可访问列表', async () => {
    const res = await getJSON('/locations?page=1', whmToken)
    assertTrue(res.success, 'success')
  })

  await test('LOC-08 TECH访问返回403', async () => {
    try {
      await getJSON('/locations', techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // 清理
  await test('LOC-05 删除库位', async () => {
    const list = await getJSON(`/locations?keyword=${encodeURIComponent(locName)}`, adminToken)
    const id = list.data.list[0]?.id
    if (!id) throw new Error('Location not found')
    const res = await delJSON(`/locations/${id}`, adminToken)
    assertTrue(res.success, 'delete success')
  })

  console.log(`\n📊 Locations Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
