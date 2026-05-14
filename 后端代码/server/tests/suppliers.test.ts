/**
 * TS-04 供应商管理 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/suppliers.test.ts
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
  const techToken = await login('jishuyuan1', 'CoreOne2026!')

  const supplierName = generateUnique('测试供应商')

  await test('SUP-01 admin获取供应商列表', async () => {
    const res = await getJSON('/suppliers?page=1&pageSize=20', adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.list.length > 0, 'has suppliers')
  })

  await test('SUP-02 创建供应商', async () => {
    const res = await postJSON('/suppliers', { name: supplierName, contact: '张三', phone: '13800138000' }, adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.code, 'has auto code')
    assertTrue(res.data.id, 'has id')
  })

  await test('SUP-10 缺少name返回400', async () => {
    try {
      await postJSON('/suppliers', { contact: '张三' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('required'), 'should be 400')
    }
  })

  await test('SUP-06 WHM可访问列表', async () => {
    const res = await getJSON('/suppliers?page=1', whmToken)
    assertTrue(res.success, 'success')
  })

  await test('SUP-09 TECH访问返回403', async () => {
    try {
      await getJSON('/suppliers', techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // 清理
  await test('SUP-05 删除供应商', async () => {
    const list = await getJSON(`/suppliers?keyword=${encodeURIComponent(supplierName)}`, adminToken)
    const id = list.data.list[0]?.id
    if (!id) throw new Error('Supplier not found')
    const res = await delJSON(`/suppliers/${id}`, adminToken)
    assertTrue(res.success, 'delete success')
  })

  console.log(`\n📊 Suppliers Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
