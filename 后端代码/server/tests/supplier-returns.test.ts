/**
 * Supplier Returns 退货给供应商 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/supplier-returns.test.ts
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

  // 获取一个有库存的物料（>=2，允许创建+删除恢复）
  let testMaterialId = ''
  try {
    const inv = await getJSON('/inventory?page=1&pageSize=50', adminToken)
    const item = inv.data?.list?.find((m: any) => m.stock >= 2)
    if (item) testMaterialId = item.materialId
  } catch { /* ignore */ }

  let createdId = ''
  let createdNo = ''

  // ── 列表查询 ──
  await test('SR-01 admin查询列表成功', async () => {
    const res = await getJSON('/supplier-returns?page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('SR-02 warehouse_manager查询列表成功', async () => {
    const res = await getJSON('/supplier-returns?page=1&pageSize=10', whmToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('SR-03 procurement查询列表成功', async () => {
    const res = await getJSON('/supplier-returns?page=1&pageSize=10', proToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('SR-04 technician查询返回403', async () => {
    try {
      await getJSON('/supplier-returns?page=1&pageSize=10', techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('SR-05 无Token返回401', async () => {
    try {
      await getJSON('/supplier-returns?page=1&pageSize=10')
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Unauthorized'), 'should be 401')
    }
  })

  await test('SR-06 列表关键词筛选', async () => {
    const res = await getJSON('/supplier-returns?keyword=SR&page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('SR-07 列表状态筛选', async () => {
    const res = await getJSON('/supplier-returns?status=pending&page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    if (res.data?.list?.length > 0) {
      assertEqual(res.data.list[0].status, 'pending', 'status should be pending')
    }
  })

  // ── 创建 ──
  await test('SR-08 admin创建退货成功', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material with stock'); return }
    const res = await postJSON('/supplier-returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: 'quality_issue',
      remark: `TEST_${generateUnique('SR')}`,
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.id, 'should have id')
    assertTrue(res.data?.returnNo?.startsWith('SR-'), 'returnNo should start with SR-')
    createdId = res.data.id
    createdNo = res.data.returnNo
  })

  await test('SR-09 warehouse_manager创建退货成功', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material with stock'); return }
    const res = await postJSON('/supplier-returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: 'damaged',
      remark: `TEST_${generateUnique('SR')}`,
    }, whmToken)
    assertTrue(res.success, 'should succeed')
    // 立即删除恢复库存
    if (res.data?.id) {
      await delJSON(`/supplier-returns/${res.data.id}`, whmToken).catch(() => {})
    }
  })

  await test('SR-10 procurement创建退货成功', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material with stock'); return }
    const res = await postJSON('/supplier-returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: 'quantity_mismatch',
      remark: `TEST_${generateUnique('SR')}`,
    }, proToken)
    assertTrue(res.success, 'should succeed')
    // 立即删除恢复库存
    if (res.data?.id) {
      await delJSON(`/supplier-returns/${res.data.id}`, proToken).catch(() => {})
    }
  })

  await test('SR-11 缺少materialId返回400', async () => {
    try {
      await postJSON('/supplier-returns', { quantity: 1, reason: 'quality_issue' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Invalid'), 'should be 400')
    }
  })

  await test('SR-12 缺少quantity返回400', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material'); return }
    try {
      await postJSON('/supplier-returns', { materialId: testMaterialId, reason: 'quality_issue' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Invalid'), 'should be 400')
    }
  })

  await test('SR-13 缺少reason返回400', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material'); return }
    try {
      await postJSON('/supplier-returns', { materialId: testMaterialId, quantity: 1 }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Invalid'), 'should be 400')
    }
  })

  await test('SR-14 quantity=0返回400', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material'); return }
    try {
      await postJSON('/supplier-returns', { materialId: testMaterialId, quantity: 0, reason: 'quality_issue' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Invalid'), 'should be 400')
    }
  })

  await test('SR-15 负数quantity返回400', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material'); return }
    try {
      await postJSON('/supplier-returns', { materialId: testMaterialId, quantity: -1, reason: 'quality_issue' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Invalid'), 'should be 400')
    }
  })

  await test('SR-16 库存不足返回422', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material'); return }
    try {
      await postJSON('/supplier-returns', { materialId: testMaterialId, quantity: 999999, reason: 'quality_issue' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('422') || e.message.includes('Insufficient') || e.message.includes('库存'), 'should be 422')
    }
  })

  await test('SR-17 物料不存在返回404', async () => {
    try {
      await postJSON('/supplier-returns', { materialId: 'non-existent-id', quantity: 1, reason: 'quality_issue' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('Not Found') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('SR-18 technician创建返回403', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material'); return }
    try {
      await postJSON('/supplier-returns', { materialId: testMaterialId, quantity: 1, reason: 'quality_issue' }, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // ── 详情 ──
  await test('SR-19 查询详情成功', async () => {
    if (!createdId) { console.log('  ⏭️ skip: no created record'); return }
    const res = await getJSON(`/supplier-returns/${createdId}`, adminToken)
    assertTrue(res.success, 'should succeed')
    assertEqual(res.data?.id, createdId, 'id should match')
    assertEqual(res.data?.returnNo, createdNo, 'returnNo should match')
  })

  await test('SR-20 查询不存在的详情返回404', async () => {
    try {
      await getJSON('/supplier-returns/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('Not Found'), 'should be 404')
    }
  })

  // ── 状态流转 ──
  await test('SR-21 pending→shipped', async () => {
    if (!createdId) { console.log('  ⏭️ skip: no created record'); return }
    const res = await putJSON(`/supplier-returns/${createdId}/status`, { status: 'shipped' }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertEqual(res.data?.status, 'shipped', 'status should be shipped')
  })

  await test('SR-22 shipped→received', async () => {
    if (!createdId) { console.log('  ⏭️ skip: no created record'); return }
    const res = await putJSON(`/supplier-returns/${createdId}/status`, { status: 'received' }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertEqual(res.data?.status, 'received', 'status should be received')
  })

  await test('SR-23 received→refunded', async () => {
    if (!createdId) { console.log('  ⏭️ skip: no created record'); return }
    const res = await putJSON(`/supplier-returns/${createdId}/status`, { status: 'refunded' }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertEqual(res.data?.status, 'refunded', 'status should be refunded')
  })

  await test('SR-24 refunded→shipped非法流转返回400', async () => {
    if (!createdId) { console.log('  ⏭️ skip: no created record'); return }
    try {
      await putJSON(`/supplier-returns/${createdId}/status`, { status: 'shipped' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Invalid'), 'should be 400')
    }
  })

  await test('SR-25 无效状态值返回400', async () => {
    if (!createdId) { console.log('  ⏭️ skip: no created record'); return }
    try {
      await putJSON(`/supplier-returns/${createdId}/status`, { status: 'invalid_status' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Invalid'), 'should be 400')
    }
  })

  await test('SR-26 更新不存在的记录返回404', async () => {
    try {
      await putJSON('/supplier-returns/non-existent-id/status', { status: 'shipped' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('Not Found'), 'should be 404')
    }
  })

  // ── 删除 ──
  // 先创建一个新的 pending 记录用于删除测试
  let deleteTestId = ''
  await test('SR-27 创建待删除的pending记录', async () => {
    if (!testMaterialId) { console.log('  ⏭️ skip: no material'); return }
    const res = await postJSON('/supplier-returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: 'quality_issue',
      remark: `TEST_DELETE_${generateUnique('SR')}`,
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    deleteTestId = res.data.id
  })

  await test('SR-28 admin删除pending记录成功', async () => {
    if (!deleteTestId) { console.log('  ⏭️ skip: no record to delete'); return }
    const res = await delJSON(`/supplier-returns/${deleteTestId}`, adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('SR-29 删除已refunded记录返回400', async () => {
    if (!createdId) { console.log('  ⏭️ skip: no created record'); return }
    try {
      await delJSON(`/supplier-returns/${createdId}`, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('pending'), 'should be 400')
    }
  })

  await test('SR-30 删除不存在的记录返回404', async () => {
    try {
      await delJSON('/supplier-returns/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('Not Found'), 'should be 404')
    }
  })

  await test('SR-31 warehouse_manager删除返回403（因为记录已refunded）', async () => {
    if (!createdId) { console.log('  ⏭️ skip: no created record'); return }
    try {
      await delJSON(`/supplier-returns/${createdId}`, whmToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('403') || e.message.includes('pending'), 'should fail')
    }
  })

  console.log(`\n📊 Supplier Returns Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
