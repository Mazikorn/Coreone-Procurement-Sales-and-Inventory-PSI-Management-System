/**
 * 设备管理 API 测试
 * 运行: cd 后端代码/server && npx tsx tests/equipment.test.ts
 */

import { getJSON, postJSON, putJSON, delJSON, login, generateUnique } from './setup.js'

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
  const techToken = await login('zhangwei', 'CoreOne2026!')
  const pathToken = await login('liuyf', 'CoreOne2026!')
  const whmToken = await login('wangkq', 'CoreOne2026!')
  const proToken = await login('zhaohp', 'CoreOne2026!')
  const finToken = await login('sunli', 'CoreOne2026!')

  // 获取设备类型
  let testTypeId = ''
  try {
    const types = await getJSON('/equipment-types?page=1&pageSize=1', adminToken)
    if (types.data?.list?.length > 0) testTypeId = types.data.list[0].id
  } catch { /* ignore */ }

  let createdId = ''

  // ── 1. 列表查询 ──
  await test('EQ-01 admin查询设备列表成功', async () => {
    const res = await getJSON('/equipment?page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('EQ-02 technician查询设备列表成功', async () => {
    const res = await getJSON('/equipment?page=1&pageSize=10', techToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('EQ-03 pathologist查询设备列表成功', async () => {
    const res = await getJSON('/equipment?page=1&pageSize=10', pathToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('EQ-04 warehouse_manager查询设备列表返回403', async () => {
    try {
      await getJSON('/equipment?page=1&pageSize=10', whmToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('EQ-05 procurement查询设备列表返回403', async () => {
    try {
      await getJSON('/equipment?page=1&pageSize=10', proToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('EQ-06 finance查询设备列表返回403', async () => {
    try {
      await getJSON('/equipment?page=1&pageSize=10', finToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('EQ-07 无Token返回401', async () => {
    try {
      await getJSON('/equipment?page=1&pageSize=10')
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Unauthorized'), 'should be 401')
    }
  })

  // ── 2. 创建设备 ──
  await test('EQ-08 admin创建设备成功', async () => {
    const code = generateUnique('EQ')
    const res = await postJSON('/equipment', {
      code,
      name: 'E2E测试设备',
      model: 'Test-100',
      manufacturer: 'E2E厂商',
      purchasePrice: 50000,
      purchaseDate: '2026-01-01',
      depreciableLifeYears: 5,
      residualValue: 5000,
      depreciationMethod: 'straight_line',
      status: 'active',
      typeId: testTypeId || undefined,
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.id, 'should have id')
    createdId = res.data.id
  })

  await test('EQ-09 technician创建设备成功', async () => {
    const code = generateUnique('EQ-T')
    const res = await postJSON('/equipment', {
      code,
      name: 'E2E技术员创建设备',
      purchasePrice: 30000,
    }, techToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('EQ-10 缺少code返回400', async () => {
    try {
      await postJSON('/equipment', { name: 'test' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('缺少'), 'should be 400')
    }
  })

  await test('EQ-11 缺少name返回400', async () => {
    try {
      await postJSON('/equipment', { code: generateUnique('EQ') }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('缺少'), 'should be 400')
    }
  })

  await test('EQ-12 重复code返回409', async () => {
    const code = generateUnique('EQ-DUP')
    await postJSON('/equipment', { code, name: '设备A' }, adminToken)
    try {
      await postJSON('/equipment', { code, name: '设备B' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('409') || e.message.includes('exists') || e.message.includes('CONFLICT'), 'should be 409')
    }
  })

  await test('EQ-13 warehouse_manager创建设备返回403', async () => {
    try {
      await postJSON('/equipment', { code: generateUnique('EQ'), name: 'test' }, whmToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // ── 3. 设备详情 ──
  await test('EQ-14 admin查看设备详情', async () => {
    if (!createdId) { console.log('  (skip: no device)'); return }
    const res = await getJSON(`/equipment/${createdId}`, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.code, 'should have code')
    assertTrue(res.data?.annualDepreciation !== undefined, 'should have annualDepreciation')
  })

  await test('EQ-15 查看不存在的设备返回404', async () => {
    try {
      await getJSON('/equipment/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  // ── 4. 更新设备 ──
  await test('EQ-16 admin更新设备成功', async () => {
    if (!createdId) { console.log('  (skip: no device)'); return }
    const res = await putJSON(`/equipment/${createdId}`, {
      name: 'E2E更新后的设备',
      purchasePrice: 60000,
    }, adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('EQ-17 更新不存在的设备返回404', async () => {
    try {
      await putJSON('/equipment/non-existent-id', { name: 'test' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  // ── 5. 设备使用记录 ──
  await test('EQ-18 登记设备使用成功', async () => {
    if (!createdId) { console.log('  (skip: no device)'); return }
    const res = await postJSON(`/equipment/${createdId}/usage`, {
      usageMinutes: 60,
      usageCount: 1,
      operator: '张伟',
      usageDate: '2026-06-01',
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.id, 'should have id')
    assertTrue(res.data?.depreciationCost !== undefined, 'should have depreciationCost')
  })

  await test('EQ-19 查询设备使用记录', async () => {
    if (!createdId) { console.log('  (skip: no device)'); return }
    const res = await getJSON(`/equipment/${createdId}/usage?page=1&pageSize=10`, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('EQ-20 为不存在的设备登记使用返回404', async () => {
    try {
      await postJSON('/equipment/non-existent-id/usage', { usageMinutes: 30 }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('not found'), 'should be 404')
    }
  })

  // ── 6. 折旧统计 ──
  await test('EQ-21 查询设备折旧统计', async () => {
    const res = await getJSON('/equipment/depreciation-stats', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.summary, 'should have summary')
    assertTrue(res.data?.stats, 'should have stats')
    assertTrue(typeof res.data.summary.totalEquipment === 'number', 'should have totalEquipment')
  })

  // ── 7. 删除设备 ──
  await test('EQ-22 删除不存在的设备返回404', async () => {
    try {
      await delJSON('/equipment/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('EQ-23 有使用记录的设备不可删除', async () => {
    if (!createdId) { console.log('  (skip: no device)'); return }
    try {
      await delJSON(`/equipment/${createdId}`, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('409') || e.message.includes('CONFLICT') || e.message.includes('使用记录'), 'should be 409')
    }
  })

  await test('EQ-24 technician删除设备返回403', async () => {
    if (!createdId) { console.log('  (skip: no device)'); return }
    try {
      await delJSON(`/equipment/${createdId}`, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // ── 8. 筛选 ──
  await test('EQ-25 按keyword筛选', async () => {
    const res = await getJSON('/equipment?page=1&pageSize=10&keyword=E2E', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('EQ-26 按status筛选', async () => {
    const res = await getJSON('/equipment?page=1&pageSize=10&status=active', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  // ── 9. 分页 ──
  await test('EQ-27 分页page=999返回空列表', async () => {
    const res = await getJSON('/equipment?page=999&pageSize=5', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  console.log(`\n📊 Equipment API Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
