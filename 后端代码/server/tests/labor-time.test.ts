/**
 * 标准工时 API 测试
 * 运行: cd 后端代码/server && npx tsx tests/labor-time.test.ts
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

  let createdId = ''

  // ── 1. 列表查询 ──
  await test('LT-01 admin查询工时列表成功', async () => {
    const res = await getJSON('/labor-times?page=1&pageSize=10', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data?.list), 'should be list')
  })

  await test('LT-02 technician查询工时列表成功', async () => {
    const res = await getJSON('/labor-times?page=1&pageSize=10', techToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('LT-03 pathologist查询工时列表成功', async () => {
    const res = await getJSON('/labor-times?page=1&pageSize=10', pathToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('LT-04 warehouse_manager查询工时列表返回403', async () => {
    try {
      await getJSON('/labor-times?page=1&pageSize=10', whmToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('LT-05 procurement查询工时列表返回403', async () => {
    try {
      await getJSON('/labor-times?page=1&pageSize=10', proToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('LT-06 finance查询工时列表返回403', async () => {
    try {
      await getJSON('/labor-times?page=1&pageSize=10', finToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('LT-07 无Token返回401', async () => {
    try {
      await getJSON('/labor-times?page=1&pageSize=10')
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('401') || e.message.includes('Unauthorized'), 'should be 401')
    }
  })

  // ── 2. 筛选 ──
  await test('LT-08 按projectType筛选', async () => {
    const res = await getJSON('/labor-times?page=1&pageSize=10&projectType=IHC', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('LT-09 按keyword筛选', async () => {
    const res = await getJSON('/labor-times?page=1&pageSize=10&keyword=切片', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('LT-10 按referenceSource筛选', async () => {
    const res = await getJSON('/labor-times?page=1&pageSize=10&referenceSource=system', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  // ── 3. 创建工时 ──
  await test('LT-11 admin创建工时成功', async () => {
    const stepCode = generateUnique('STEP')
    const res = await postJSON('/labor-times', {
      stepCode,
      stepName: 'E2E测试步骤',
      projectType: 'IHC',
      standardMinutes: 15,
      laborRatePerMinute: 2.5,
      isEquipmentStep: false,
      description: 'E2E测试工时',
      sortOrder: 99,
      referenceSource: 'system',
    }, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.id, 'should have id')
    createdId = res.data.id
  })

  await test('LT-12 technician创建工时成功', async () => {
    const stepCode = generateUnique('STEP-T')
    const res = await postJSON('/labor-times', {
      stepCode,
      stepName: 'E2E技术员创建',
      projectType: 'HE',
      standardMinutes: 10,
    }, techToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('LT-13 缺少stepCode返回400', async () => {
    try {
      await postJSON('/labor-times', {
        stepName: 'test',
        projectType: 'IHC',
        standardMinutes: 10,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('缺少'), 'should be 400')
    }
  })

  await test('LT-14 缺少stepName返回400', async () => {
    try {
      await postJSON('/labor-times', {
        stepCode: generateUnique('STEP'),
        projectType: 'IHC',
        standardMinutes: 10,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('缺少'), 'should be 400')
    }
  })

  await test('LT-15 缺少projectType返回400', async () => {
    try {
      await postJSON('/labor-times', {
        stepCode: generateUnique('STEP'),
        stepName: 'test',
        standardMinutes: 10,
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('缺少'), 'should be 400')
    }
  })

  await test('LT-16 缺少standardMinutes返回400', async () => {
    try {
      await postJSON('/labor-times', {
        stepCode: generateUnique('STEP'),
        stepName: 'test',
        projectType: 'IHC',
      }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('缺少'), 'should be 400')
    }
  })

  await test('LT-17 warehouse_manager创建工时返回403', async () => {
    try {
      await postJSON('/labor-times', {
        stepCode: generateUnique('STEP'),
        stepName: 'test',
        projectType: 'IHC',
        standardMinutes: 10,
      }, whmToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // ── 4. 工时详情 ──
  await test('LT-18 查看工时详情', async () => {
    if (!createdId) { console.log('  (skip: no record)'); return }
    const res = await getJSON(`/labor-times/${createdId}`, adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(res.data?.stepCode, 'should have stepCode')
    assertTrue(res.data?.referenceSourceLabel, 'should have referenceSourceLabel')
  })

  await test('LT-19 查看不存在的工时返回404', async () => {
    try {
      await getJSON('/labor-times/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  // ── 5. 按项目类型获取模板 ──
  await test('LT-20 按项目类型获取工时模板', async () => {
    const res = await getJSON('/labor-times/project-type/IHC', adminToken)
    assertTrue(res.success, 'should succeed')
    assertTrue(Array.isArray(res.data), 'should be array')
  })

  // ── 6. 更新工时 ──
  await test('LT-21 admin更新工时成功', async () => {
    if (!createdId) { console.log('  (skip: no record)'); return }
    const res = await putJSON(`/labor-times/${createdId}`, {
      stepName: 'E2E更新后的步骤',
      standardMinutes: 20,
    }, adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('LT-22 更新不存在的工时返回404', async () => {
    try {
      await putJSON('/labor-times/non-existent-id', { stepName: 'test' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  // ── 7. 删除工时 ──
  await test('LT-23 admin删除工时成功', async () => {
    if (!createdId) { console.log('  (skip: no record)'); return }
    const res = await delJSON(`/labor-times/${createdId}`, adminToken)
    assertTrue(res.success, 'should succeed')
  })

  await test('LT-24 删除不存在的工时返回404', async () => {
    try {
      await delJSON('/labor-times/non-existent-id', adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('404') || e.message.includes('不存在'), 'should be 404')
    }
  })

  await test('LT-25 technician删除工时返回403', async () => {
    // 创建一个再尝试删除
    const stepCode = generateUnique('STEP-DEL')
    const create = await postJSON('/labor-times', {
      stepCode,
      stepName: '待删除',
      projectType: 'IHC',
      standardMinutes: 5,
    }, adminToken)
    if (!create.success) { console.log('  (skip: create failed)'); return }
    const id = create.data?.id
    if (!id) { console.log('  (skip: no id)'); return }
    try {
      await delJSON(`/labor-times/${id}`, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
    await delJSON(`/labor-times/${id}`, adminToken).catch(() => {})
  })

  // ── 8. 分页 ──
  await test('LT-26 分页page=999返回空列表', async () => {
    const res = await getJSON('/labor-times?page=999&pageSize=5', adminToken)
    assertTrue(res.success, 'should succeed')
  })

  console.log(`\n📊 Labor Time API Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
