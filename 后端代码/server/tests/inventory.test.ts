/**
 * TS-07 库存管理 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/inventory.test.ts
 */

import { getJSON, login } from './setup.js'

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
  const finToken = await login('caiwu', 'CoreOne2026!')

  await test('INV-01 admin获取库存列表', async () => {
    const res = await getJSON('/inventory?page=1&pageSize=20', adminToken)
    assertTrue(res.success, 'success')
    assertTrue(Array.isArray(res.data.list), 'should be list')
  })

  await test('INV-12 库存统计看板', async () => {
    const res = await getJSON('/inventory/stats', adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.totalMaterials !== undefined, 'has totalMaterials')
  })

  await test('INV-21 finance访问返回403', async () => {
    try {
      await getJSON('/inventory?page=1', finToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  console.log(`\n📊 Inventory Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
