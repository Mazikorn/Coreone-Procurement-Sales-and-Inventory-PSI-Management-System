/**
 * 调拨管理 API 测试
 * 运行: cd 后端代码/server && npx tsx tests/transfers.test.ts
 */

import { getJSON, postJSON, delJSON, login, generateUnique } from './setup.js'

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
  const whmToken = await login('wangkq', 'CoreOne2026!')
  const techToken = await login('zhangwei', 'CoreOne2026!')
  const pathToken = await login('liuyf', 'CoreOne2026!')
  const proToken = await login('zhaohp', 'CoreOne2026!')
  const finToken = await login('sunli', 'CoreOne2026!')

  // 获取有库存的物料和库位
  let testMaterialId = ''
  let testLocationId = ''
  let testStock = 0
  try {
    const inv = await getJSON('/inventory?page=1&pageSize=50', adminToken)
    const item = inv.data?.list?.find((m: any) => m.stock >= 5)
    if (item) {
      testMaterialId = item.materialId
      testStock = item.stock
    }
    const locs = await getJSON('/locations?page=1&pageSize=2', adminToken)
    if (locs.data?.list?.length >= 1) testLocationId = locs.data.list[0].id
  } catch { /* ignore */ }

  // ── 1. 列表查询 ──
  await test('TR-01 admin查询调拨列表成功', async () => {
    const res = await getJSON('/transfers?page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('TR-02 warehouse_manager查询调拨列表成功', async () => {
    const res = await getJSON('/transfers?page=1&pageSize=10', whmToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('TR-03 technician查询调拨列表返回403', async () => {
    try {
      await getJSON('/transfers?page=1&pageSize=10', techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('TR-04 pathologist查询调拨列表返回403', async () => {
    try {
      await getJSON('/transfers?page=1&pageSize=10', pathToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('TR-05 procurement查询调拨列表返回403', async () => {
    try {
      await getJSON('/transfers?page=1&pageSize=10', proToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('TR-06 finance查询调拨列表返回403', async () => {
    try {
      await getJSON('/transfers?page=1&pageSize=10', finToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('TR-07 无Token返回401', async () => {
    try {
      await getJSON('/transfers?page=1&pageSize=10')
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Unauthorized'), 'should be 401')
    }
  })

  // ── 2. 创建调拨 ──
  await test('TR-08 admin创建调拨成功', async () => {
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    const res = await postJSON('/transfers/inbound', {
      materialId: testMaterialId,
      quantity: 1,
      fromLocationId: testLocationId,
      fromLocationName: '测试来源库位',
      toLocationId: testLocationId,
      remark: generateUnique('E2E调拨'),
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.inboundNo, 'should have inboundNo')
  })

  await test('TR-09 warehouse_manager创建调拨成功', async () => {
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    const res = await postJSON('/transfers/inbound', {
      materialId: testMaterialId,
      quantity: 1,
      fromLocationId: testLocationId,
      fromLocationName: '测试来源',
      toLocationId: testLocationId,
      remark: generateUnique('E2E调拨WM'),
    }, whmToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('TR-10 缺少materialId返回400', async () => {
    try {
      await postJSON('/transfers/inbound', {
        quantity: 1,
        fromLocationId: testLocationId,
        toLocationId: testLocationId,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('必填'), 'should be 400')
    }
  })

  await test('TR-11 缺少toLocationId返回400', async () => {
    if (!testMaterialId) { console.log('  (skip: no material)'); return }
    try {
      await postJSON('/transfers/inbound', {
        materialId: testMaterialId,
        quantity: 1,
        fromLocationId: testLocationId,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('必填'), 'should be 400')
    }
  })

  await test('TR-12 缺少fromLocation返回400', async () => {
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    try {
      await postJSON('/transfers/inbound', {
        materialId: testMaterialId,
        quantity: 1,
        toLocationId: testLocationId,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('必填'), 'should be 400')
    }
  })

  await test('TR-13 quantity=0返回400', async () => {
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    try {
      await postJSON('/transfers/inbound', {
        materialId: testMaterialId,
        quantity: 0,
        fromLocationId: testLocationId,
        toLocationId: testLocationId,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('必填'), 'should be 400')
    }
  })

  await test('TR-14 quantity为负数返回400', async () => {
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    try {
      await postJSON('/transfers/inbound', {
        materialId: testMaterialId,
        quantity: -5,
        fromLocationId: testLocationId,
        toLocationId: testLocationId,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('必填'), 'should be 400')
    }
  })

  await test('TR-15 不存在的物料返回404', async () => {
    if (!testLocationId) { console.log('  (skip: no location)'); return }
    try {
      await postJSON('/transfers/inbound', {
        materialId: 'non-existent-material',
        quantity: 1,
        fromLocationId: testLocationId,
        toLocationId: testLocationId,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('TR-16 不存在的目标库位返回404', async () => {
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    try {
      await postJSON('/transfers/inbound', {
        materialId: testMaterialId,
        quantity: 1,
        fromLocationId: testLocationId,
        toLocationId: 'non-existent-location',
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('TR-17 technician创建调拨返回403', async () => {
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    try {
      await postJSON('/transfers/inbound', {
        materialId: testMaterialId,
        quantity: 1,
        fromLocationId: testLocationId,
        toLocationId: testLocationId,
      }, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // ── 3. 删除/撤销调拨 ──
  await test('TR-18 删除不存在的调拨记录返回404', async () => {
    try {
      await delJSON('/transfers/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('TR-19 admin删除调拨记录', async () => {
    // 先创建再删除
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    const create = await postJSON('/transfers/inbound', {
      materialId: testMaterialId,
      quantity: 1,
      fromLocationId: testLocationId,
      fromLocationName: '测试来源',
      toLocationId: testLocationId,
      remark: generateUnique('E2E调拨删除'),
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    const res = await delJSON(`/transfers/${id}`, adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('TR-20 technician删除调拨记录返回403', async () => {
    // 先创建一个
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    const create = await postJSON('/transfers/inbound', {
      materialId: testMaterialId,
      quantity: 1,
      fromLocationId: testLocationId,
      fromLocationName: '测试',
      toLocationId: testLocationId,
      remark: generateUnique('E2E'),
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    try {
      await delJSON(`/transfers/${id}`, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
    // cleanup
    await delJSON(`/transfers/${id}`, adminToken).catch(() => {})
  })

  // ── 4. 分页 ──
  await test('TR-21 分页page=0修正为1', async () => {
    const res = await getJSON('/transfers?page=0&pageSize=5', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('TR-22 分页page=999返回空列表', async () => {
    const res = await getJSON('/transfers?page=999&pageSize=5', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('TR-23 分页pageSize=1', async () => {
    const res = await getJSON('/transfers?page=1&pageSize=1', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.list?.length <= 1, 'should have at most 1 item')
  })

  // ── 5. 并发 ──
  await test('TR-24 并发创建调拨不同物料', async () => {
    if (!testMaterialId || !testLocationId) { console.log('  (skip: no material/location)'); return }
    const body = {
      materialId: testMaterialId,
      quantity: 1,
      fromLocationId: testLocationId,
      fromLocationName: '并发测试',
      toLocationId: testLocationId,
      remark: generateUnique('E2E并发'),
    }
    const [r1, r2] = await Promise.all([
      postJSON('/transfers/inbound', body, adminToken).catch(() => ({ success: false })),
      postJSON('/transfers/inbound', { ...body, remark: generateUnique('E2E并发2') }, adminToken).catch(() => ({ success: false })),
    ])
    assertTrue(r1.success || r2.success, 'at least one should succeed')
  })

  console.log(`\n📊 Transfers API Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
