/**
 * TS-09 出库管理 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/outbound.test.ts
 */

import { getJSON, postJSON, login, generateUnique } from './setup.js'

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
  const proToken = await login('caigou', 'CoreOne2026!')

  const materialId = 'MAT-HE-001'

  await test('OUT-01 创建出库单', async () => {
    const res = await postJSON('/outbound', {
      type: 'project',
      items: [{ materialId, quantity: 1, usage: 'self', receiver: '测试员' }],
      operator: '测试员',
    }, adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.outboundNo, 'has outboundNo')
    assertTrue(res.data.outboundNo.startsWith('OB-'), 'outboundNo starts with OB-')
  })

  await test('OUT-13 WHM创建出库单', async () => {
    const res = await postJSON('/outbound', {
      type: 'project',
      items: [{ materialId, quantity: 1 }],
      operator: '测试员',
    }, whmToken)
    assertTrue(res.success, 'success')
  })

  await test('OUT-14 TECH创建出库单', async () => {
    const res = await postJSON('/outbound', {
      type: 'project',
      items: [{ materialId, quantity: 1 }],
      operator: '测试员',
    }, techToken)
    assertTrue(res.success, 'success')
  })

  await test('OUT-16 procurement创建返回403', async () => {
    try {
      await postJSON('/outbound', {
        type: 'project',
        items: [{ materialId, quantity: 1 }],
        operator: '测试员',
      }, proToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  await test('OUT-18 缺少type返回400', async () => {
    try {
      await postJSON('/outbound', { items: [{ materialId, quantity: 1 }], operator: '测试员' }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('required') || e.message.includes('Missing'), 'should be 400')
    }
  })

  console.log(`\n📊 Outbound Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
