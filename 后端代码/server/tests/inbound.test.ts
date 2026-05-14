/**
 * TS-08 入库管理 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/inbound.test.ts
 */

import { getJSON, postJSON, putJSON, delJSON, login, generateUnique } from './setup.js'

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`)
}

function assertTrue(value: any, msg: string) {
  if (!value) throw new Error(`${msg}: got ${value}`)
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

  const adminToken = await login('admin', 'admin123')
  const whmToken = await login('cangguan', 'CoreOne2026!')
  const proToken = await login('caigou', 'CoreOne2026!')
  const techToken = await login('jishuyuan1', 'CoreOne2026!')

  const testMaterialId = 'MAT-HE-001'
  const testLocationId = 'LOC-A01'

  // INB-01: 创建采购入库单
  await test('INB-01 创建采购入库单', async () => {
    const res = await postJSON('/inbound', {
      type: 'purchase',
      materialId: testMaterialId,
      batchNo: generateUnique('BATCH'),
      quantity: 10,
      price: 100,
      locationId: testLocationId,
      supplierId: 'SUP-001',
      expiryDate: '2027-12-31',
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data.inboundNo, 'should have inboundNo')
    assertTrue(res.data.inboundNo.startsWith('IB-'), 'inboundNo should start with IB-')
    assertEqual(res.data.status, 'completed', 'status should be completed')
  })

  // INB-13~16: 缺少必填字段返回400
  await test('INB-13 缺少type返回400', async () => {
    try {
      await postJSON('/inbound', { materialId: testMaterialId, quantity: 10, locationId: testLocationId }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('INB-14 缺少materialId返回400', async () => {
    try {
      await postJSON('/inbound', { type: 'purchase', quantity: 10, locationId: testLocationId }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('INB-15 缺少quantity返回400', async () => {
    try {
      await postJSON('/inbound', { type: 'purchase', materialId: testMaterialId, locationId: testLocationId }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('INB-16 缺少locationId返回400', async () => {
    try {
      await postJSON('/inbound', { type: 'purchase', materialId: testMaterialId, quantity: 10 }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  // INB-19: warehouse_manager可以创建
  await test('INB-19 WHM创建入库单', async () => {
    const res = await postJSON('/inbound', {
      type: 'purchase',
      materialId: testMaterialId,
      quantity: 5,
      locationId: testLocationId,
      batchNo: generateUnique('BATCH'),
      expiryDate: '2027-12-31',
    }, whmToken)
    assertTrue(res.success, 'should succeed')
  })

  // INB-20: procurement用户POST返回403
  await test('INB-20 procurement POST返回403', async () => {
    try {
      await postJSON('/inbound', {
        type: 'purchase',
        materialId: testMaterialId,
        quantity: 5,
        locationId: testLocationId,
        batchNo: generateUnique('BATCH'),
        expiryDate: '2027-12-31',
      }, proToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // INB-21: technician用户POST返回403
  await test('INB-21 technician POST返回403', async () => {
    try {
      await postJSON('/inbound', {
        type: 'purchase',
        materialId: testMaterialId,
        quantity: 5,
        locationId: testLocationId,
        batchNo: generateUnique('BATCH'),
        expiryDate: '2027-12-31',
      }, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // INB-17: 列表查询status筛选
  await test('INB-17 列表status筛选', async () => {
    const res = await getJSON('/inbound?status=completed&page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data.list), 'should be list')
    assertTrue(res.data.list.length > 0, 'should have records')
  })

  // INB-18: 日期范围筛选
  await test('INB-18 日期范围筛选', async () => {
    const res = await getJSON('/inbound?startDate=2026-01-01&endDate=2026-12-31&page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data.list), 'should be list')
  })

  // INB-26: 无Token返回401
  await test('INB-26 无Token返回401', async () => {
    try {
      await getJSON('/inbound?page=1&pageSize=10')
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Unauthorized'), 'should be 401')
    }
  })

  console.log(`\n📊 Inbound Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
