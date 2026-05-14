/**
 * TS-11 采购订单 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/purchase-orders.test.ts
 */

import { getJSON, postJSON, putJSON, login, generateUnique } from './setup.js'

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
  const proToken = await login('caigou', 'CoreOne2026!')
  const whmToken = await login('cangguan', 'CoreOne2026!')

  await test('PO-01 admin创建采购单', async () => {
    const res = await postJSON('/purchase-orders', {
      materialId: 'MAT-HE-001',
      orderedQty: 100,
      unitPrice: 50,
      supplierId: 'SUP-001',
      expectedDate: '2026-12-31',
    }, adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.orderNo, 'has orderNo')
    assertTrue(res.data.orderNo.startsWith('PO'), 'orderNo starts with PO')
  })

  await test('PO-11 procurement创建采购单', async () => {
    const res = await postJSON('/purchase-orders', {
      materialId: 'MAT-HE-002',
      orderedQty: 50,
      unitPrice: 30,
      supplierId: 'SUP-001',
      expectedDate: '2026-12-31',
    }, proToken)
    assertTrue(res.success, 'success')
  })

  await test('PO-14 WHM创建采购单返回403', async () => {
    try {
      await postJSON('/purchase-orders', { materialId: 'MAT-HE-001', orderedQty: 1, unitPrice: 1 }, whmToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('PO-16 缺少materialId返回400', async () => {
    try {
      await postJSON('/purchase-orders', { orderedQty: 10, unitPrice: 10 }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('required') || e.message.includes('必填'), 'should be 400')
    }
  })

  console.log(`\n📊 Purchase Orders Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
