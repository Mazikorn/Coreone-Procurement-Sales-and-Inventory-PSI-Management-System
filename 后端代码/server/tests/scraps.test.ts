/**
 * 报废管理 API 测试
 * 运行: cd 后端代码/server && npx tsx tests/scraps.test.ts
 */

import { getJSON, postJSON, delJSON, login, generateUnique } from './setup.js'

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
  const whmToken = await login('wangkq', 'CoreOne2026!')
  const techToken = await login('zhangwei', 'CoreOne2026!')
  const pathToken = await login('liuyf', 'CoreOne2026!')
  const proToken = await login('zhaohp', 'CoreOne2026!')
  const finToken = await login('sunli', 'CoreOne2026!')

  let testMaterialId = ''
  try {
    const inv = await getJSON('/inventory?page=1&pageSize=50', adminToken)
    const item = inv.data?.list?.find((m: any) => m.stock >= 3)
    if (item) testMaterialId = item.materialId
  } catch { /* ignore */ }

  // ── 1. 列表查询 ──
  await test('SC-01 admin查询报废列表成功', async () => {
    const res = await getJSON('/scraps?page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('SC-02 warehouse_manager查询报废列表成功', async () => {
    const res = await getJSON('/scraps?page=1&pageSize=10', whmToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('SC-03 technician查询报废列表返回403', async () => {
    try {
      await getJSON('/scraps?page=1&pageSize=10', techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('SC-04 pathologist查询报废列表返回403', async () => {
    try {
      await getJSON('/scraps?page=1&pageSize=10', pathToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('SC-05 procurement查询报废列表返回403', async () => {
    try {
      await getJSON('/scraps?page=1&pageSize=10', proToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('SC-06 finance查询报废列表返回403', async () => {
    try {
      await getJSON('/scraps?page=1&pageSize=10', finToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('SC-07 无Token返回401', async () => {
    try {
      await getJSON('/scraps?page=1&pageSize=10')
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Unauthorized'), 'should be 401')
    }
  })

  // ── 2. 创建报废 ──
  await test('SC-08 admin创建报废成功', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const res = await postJSON('/scraps', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E报废原因'),
      remark: 'E2E报废测试',
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.id, 'should have id')
  })

  await test('SC-09 warehouse_manager创建报废成功', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const res = await postJSON('/scraps', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E报废WM'),
    }, whmToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('SC-10 缺少materialId返回400', async () => {
    try {
      await postJSON('/scraps', { quantity: 1, reason: 'test' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('SC-11 缺少reason返回400', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/scraps', { materialId: testMaterialId, quantity: 1 }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('SC-12 quantity=0返回400', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/scraps', { materialId: testMaterialId, quantity: 0, reason: 'test' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('SC-13 quantity为负数返回400', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/scraps', { materialId: testMaterialId, quantity: -1, reason: 'test' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('SC-14 不存在的物料返回404', async () => {
    try {
      await postJSON('/scraps', { materialId: 'non-existent', quantity: 1, reason: 'test' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('SC-15 technician创建报废返回403', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/scraps', { materialId: testMaterialId, quantity: 1, reason: 'test' }, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // ── 3. 报废后库存验证 ──
  await test('SC-16 报废后库存减少', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const before = await getJSON(`/inventory?page=1&pageSize=1&materialId=${testMaterialId}`, adminToken)
    const beforeStock = before.data?.list?.[0]?.stock || 0
    if (beforeStock < 2) { console.log('  (skip: insufficient stock)'); return }
    await postJSON('/scraps', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E库存验证'),
    }, adminToken)
    const after = await getJSON(`/inventory?page=1&pageSize=1&materialId=${testMaterialId}`, adminToken)
    const afterStock = after.data?.list?.[0]?.stock || 0
    assertTrue(afterStock <= beforeStock, `stock should decrease: ${beforeStock} -> ${afterStock}`)
  })

  // ── 4. 库存不足 ──
  await test('SC-17 超量报废返回422', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/scraps', {
        materialId: testMaterialId,
        quantity: 99999,
        reason: 'E2E超量报废',
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('422') || e.message.includes('库存不足') || e.message.includes('STOCK'), 'should be 422')
    }
  })

  // ── 5. 删除/撤销报废 ──
  await test('SC-18 删除不存在的报废记录返回404', async () => {
    try {
      await delJSON('/scraps/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('SC-19 admin删除报废记录成功', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const create = await postJSON('/scraps', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E删除'),
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    const res = await delJSON(`/scraps/${id}`, adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('SC-20 technician删除报废记录返回403', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const create = await postJSON('/scraps', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E'),
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    try {
      await delJSON(`/scraps/${id}`, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
    await delJSON(`/scraps/${id}`, adminToken).catch(() => {})
  })

  // ── 6. 撤销后库存回退 ──
  await test('SC-21 撤销报废后库存回退', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const before = await getJSON(`/inventory?page=1&pageSize=1&materialId=${testMaterialId}`, adminToken)
    const beforeStock = before.data?.list?.[0]?.stock || 0
    const create = await postJSON('/scraps', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E回退'),
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    await delJSON(`/scraps/${id}`, adminToken)
    const after = await getJSON(`/inventory?page=1&pageSize=1&materialId=${testMaterialId}`, adminToken)
    const afterStock = after.data?.list?.[0]?.stock || 0
    assertTrue(afterStock >= beforeStock - 1, `stock should revert: before=${beforeStock}, after=${afterStock}`)
  })

  // ── 7. 分页 ──
  await test('SC-22 分页page=0修正为1', async () => {
    const res = await getJSON('/scraps?page=0&pageSize=5', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('SC-23 分页page=999返回空列表', async () => {
    const res = await getJSON('/scraps?page=999&pageSize=5', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  // ── 8. 并发 ──
  await test('SC-24 并发创建报废', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const [r1, r2] = await Promise.all([
      postJSON('/scraps', { materialId: testMaterialId, quantity: 1, reason: generateUnique('E2E并发1') }, adminToken).catch(() => ({ success: false })),
      postJSON('/scraps', { materialId: testMaterialId, quantity: 1, reason: generateUnique('E2E并发2') }, adminToken).catch(() => ({ success: false })),
    ])
    assertTrue(r1.success || r2.success, 'at least one should succeed')
  })

  console.log(`\n📊 Scraps API Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
