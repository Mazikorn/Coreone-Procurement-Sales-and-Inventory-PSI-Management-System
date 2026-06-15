/**
 * TS-05 物料分类 — 测试场景
 * 运行: cd 后端代码/server && npx tsx tests/categories.test.ts
 */

import { getJSON, postJSON, putJSON, delJSON, login, generateUnique } from './setup.js'

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`)
}

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
  const techToken = await login('zhangwei', 'CoreOne2026!')

  const catName = generateUnique('分类')

  await test('CAT-01 任意角色获取分类树', async () => {
    const res = await getJSON('/categories/tree', techToken)
    assertTrue(res.success, 'success')
    assertTrue(Array.isArray(res.data), 'should be array')
    assertTrue(res.data.length > 0, 'has categories')
  })

  await test('CAT-02 admin创建一级分类', async () => {
    const res = await postJSON('/categories', { name: catName, level: 1, sortOrder: 0 }, adminToken)
    assertTrue(res.success, 'success')
    assertTrue(res.data.code, 'has auto code')
    assertTrue(res.data.code.endsWith('00'), '一级分类code以00结尾')
  })

  await test('CAT-11 缺少name返回400', async () => {
    try {
      await postJSON('/categories', { level: 1 }, adminToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('400') || e.message.includes('required'), 'should be 400')
    }
  })

  await test('CAT-15 TECH创建分类返回403', async () => {
    try {
      await postJSON('/categories', { name: 'x', level: 1 }, techToken)
      throw new Error('should fail')
    } catch (e: any) {
      assertTrue(e.message.includes('403') || e.message.includes('Forbidden'), 'should be 403')
    }
  })

  // 清理
  await test('CAT-06 删除分类', async () => {
    const cats = await getJSON(`/categories?keyword=${encodeURIComponent(catName)}`, adminToken)
    const id = cats.data.list[0]?.id
    if (!id) throw new Error('Category not found')
    const res = await delJSON(`/categories/${id}`, adminToken)
    assertTrue(res.success, 'delete success')
  })

  console.log(`\n📊 Categories Test Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
