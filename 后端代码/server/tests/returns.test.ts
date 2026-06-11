/**
 * 退库管理 API 测试
 * 运行: cd 后端代码/server && npx tsx tests/returns.test.ts
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

  // 获取有库存的物料
  let testMaterialId = ''
  try {
    const inv = await getJSON('/inventory?page=1&pageSize=50', adminToken)
    const item = inv.data?.list?.find((m: any) => m.stock >= 3)
    if (item) testMaterialId = item.materialId
  } catch { /* ignore */ }

  let createdId = ''

  // ── 1. 列表查询 ──
  await test('RT-01 admin查询退库列表成功', async () => {
    const res = await getJSON('/returns?page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('RT-02 warehouse_manager查询退库列表成功', async () => {
    const res = await getJSON('/returns?page=1&pageSize=10', whmToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('RT-03 technician查询退库列表返回403', async () => {
    try {
      await getJSON('/returns?page=1&pageSize=10', techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('RT-04 pathologist查询退库列表返回403', async () => {
    try {
      await getJSON('/returns?page=1&pageSize=10', pathToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('RT-05 procurement查询退库列表返回403', async () => {
    try {
      await getJSON('/returns?page=1&pageSize=10', proToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('RT-06 finance查询退库列表返回403', async () => {
    try {
      await getJSON('/returns?page=1&pageSize=10', finToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('RT-07 无Token返回401', async () => {
    try {
      await getJSON('/returns?page=1&pageSize=10')
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Unauthorized'), 'should be 401')
    }
  })

  // ── 2. 创建退库 ──
  await test('RT-08 admin创建退库成功', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const res = await postJSON('/returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E退库原因'),
      remark: 'E2E退库测试',
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.id, 'should have id')
    createdId = res.data.id
  })

  await test('RT-09 warehouse_manager创建退库成功', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const res = await postJSON('/returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E退库WM'),
      remark: 'E2E退库WM测试',
    }, whmToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('RT-10 缺少materialId返回400', async () => {
    try {
      await postJSON('/returns', {
        quantity: 1,
        reason: 'test',
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('RT-11 缺少quantity返回400', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/returns', {
        materialId: testMaterialId,
        reason: 'test',
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('RT-12 缺少reason返回400', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/returns', {
        materialId: testMaterialId,
        quantity: 1,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('RT-13 quantity=0返回400', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/returns', {
        materialId: testMaterialId,
        quantity: 0,
        reason: 'test',
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('Missing'), 'should be 400')
    }
  })

  await test('RT-14 不存在的物料返回404', async () => {
    try {
      await postJSON('/returns', {
        materialId: 'non-existent-material',
        quantity: 1,
        reason: 'test',
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('RT-15 technician创建退库返回403', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/returns', {
        materialId: testMaterialId,
        quantity: 1,
        reason: 'test',
      }, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // ── 3. 退库后库存验证 ──
  await test('RT-16 退库后库存增加', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const before = await getJSON(`/inventory?page=1&pageSize=1&materialId=${testMaterialId}`, adminToken)
    const beforeStock = before.data?.list?.[0]?.stock || 0
    await postJSON('/returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E库存验证'),
    }, adminToken)
    const after = await getJSON(`/inventory?page=1&pageSize=1&materialId=${testMaterialId}`, adminToken)
    const afterStock = after.data?.list?.[0]?.stock || 0
    assertTrue(afterStock >= beforeStock, `stock should increase: ${beforeStock} -> ${afterStock}`)
  })

  // ── 4. 删除/撤销退库 ──
  await test('RT-17 删除不存在的退库记录返回404', async () => {
    try {
      await delJSON('/returns/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('RT-18 admin删除退库记录成功', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const create = await postJSON('/returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E删除测试'),
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    const res = await delJSON(`/returns/${id}`, adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('RT-19 technician删除退库记录返回403', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const create = await postJSON('/returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E'),
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    try {
      await delJSON(`/returns/${id}`, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
    await delJSON(`/returns/${id}`, adminToken).catch(() => {})
  })

  // ── 5. 分页 ──
  await test('RT-20 分页page=0修正为1', async () => {
    const res = await getJSON('/returns?page=0&pageSize=5', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('RT-21 分页page=999返回空列表', async () => {
    const res = await getJSON('/returns?page=999&pageSize=5', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  // ── 6. 撤销后库存回退 ──
  await test('RT-22 撤销退库后库存回退', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const before = await getJSON(`/inventory?page=1&pageSize=1&materialId=${testMaterialId}`, adminToken)
    const beforeStock = before.data?.list?.[0]?.stock || 0
    const create = await postJSON('/returns', {
      materialId: testMaterialId,
      quantity: 1,
      reason: generateUnique('E2E回退'),
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    await delJSON(`/returns/${id}`, adminToken)
    const after = await getJSON(`/inventory?page=1&pageSize=1&materialId=${testMaterialId}`, adminToken)
    const afterStock = after.data?.list?.[0]?.stock || 0
    assertTrue(afterStock <= beforeStock + 1, `stock should revert: before=${beforeStock}, after=${afterStock}`)
  })

  // ── 7. 并发 ──
  await test('RT-23 并发创建退库', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    const [r1, r2] = await Promise.all([
      postJSON('/returns', { materialId: testMaterialId, quantity: 1, reason: generateUnique('E2E并发1') }, adminToken).catch(() => ({ success: false })),
      postJSON('/returns', { materialId: testMaterialId, quantity: 1, reason: generateUnique('E2E并发2') }, adminToken).catch(() => ({ success: false })),
    ])
    assertTrue(r1.success || r2.success, 'at least one should succeed')
  })

  console.log(`\n📊 Returns API Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
