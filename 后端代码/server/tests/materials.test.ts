/**
 * TS-06 物料管理 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/materials.test.ts
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
  const techToken = await login('jishuyuan1', 'CoreOne2026!')

  const matName = generateUnique('物料')
  const categoryId = 'CAT-HE'

  await test('MAT-01 admin获取物料列表', async () => {
    const res = await getJSON('/materials?page=1&pageSize=20', adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.list.length > 0, 'has materials')
  })

  await test('MAT-02 创建物料', async () => {
    const res = await postJSON('/materials', { name: matName, unit: '瓶', categoryId, price: 100 }, adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.id, 'has id')
  })

  await test('MAT-10 缺少name返回400', async () => {
    try {
      await postJSON('/materials', { unit: '瓶', categoryId }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('required'), 'should be 400')
    }
  })

  await test('MAT-09 TECH创建物料返回403', async () => {
    try {
      await postJSON('/materials', { name: 'x', unit: '瓶', categoryId }, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // 清理
  await test('MAT-06 删除物料', async () => {
    const mats = await getJSON(`/materials?keyword=${encodeURIComponent(matName)}`, adminToken)
    const id = mats.data.list[0]?.id
    if (!id) throw new Error('Material not found')
    const res = await delJSON(`/materials/${id}`, adminToken)
    assertTrue(res.success, 'delete success')
  })

  console.log(`\n📊 Materials Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
