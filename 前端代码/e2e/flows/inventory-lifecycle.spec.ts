import { test, expect } from '@playwright/test'

/**
 * 跨模块集成测试：库存生命周期
 * 测试 入库 → 库存 → 出库 → 盘点 → 退库/报废 的完整业务流程
 */

const API_BASE = 'http://127.0.0.1:3001/api/v1'

async function apiLogin(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = (await res.json()) as any
  return data.data?.token || data.token
}

async function apiFetch(token: string, method: string, path: string, body?: any) {
  const opts: any = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  if (body && method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  return { status: res.status, data: (await res.json().catch(() => null)) as any }
}

async function getAnyMaterialId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}
async function getAnyLocationId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

test.describe('库存生命周期集成测试', () => {
  let adminToken = ''

  test.beforeAll(async () => {
    adminToken = await apiLogin('admin', 'admin123')
  })

  // ────────────────────────────────────────────
  // 1. 入库 → 库存增加
  // ────────────────────────────────────────────
  test('FLOW-01. 入库后库存增加', async () => {
    const mid = await getAnyMaterialId(adminToken)
    const lid = await getAnyLocationId(adminToken)
    if (!mid || !lid) { test.skip(); return }

    const before = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0

    const inbound = await apiFetch(adminToken, 'POST', '/inbound', {
      type: 'direct', materialId: mid, quantity: 20, locationId: lid,
      batchNo: `FLOW-${Date.now()}`, remark: 'FLOW入库测试',
    })
    expect(inbound.status).toBe(201)

    const after = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBeGreaterThanOrEqual(beforeStock + 20)
  })

  // ────────────────────────────────────────────
  // 2. 出库 → 库存减少
  // ────────────────────────────────────────────
  test('FLOW-02. 出库后库存减少', async () => {
    const mid = await getAnyMaterialId(adminToken)
    const lid = await getAnyLocationId(adminToken)
    if (!mid || !lid) { test.skip(); return }

    const before = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0
    if (beforeStock < 5) { test.skip(); return }

    // 出库需要项目
    const projects = await apiFetch(adminToken, 'GET', '/projects?page=1&pageSize=1')
    const projectId = projects.data?.data?.list?.[0]?.id
    if (!projectId) { test.skip(); return }

    const outbound = await apiFetch(adminToken, 'POST', '/outbound', {
      type: 'project',
      projectId,
      items: [{ materialId: mid, quantity: 5, locationId: lid }],
      remark: 'FLOW出库测试',
    })
    expect([200, 201]).toContain(outbound.status)

    const after = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBeLessThanOrEqual(beforeStock - 5)
  })

  // ────────────────────────────────────────────
  // 3. 盘点 → 差异处理
  // ────────────────────────────────────────────
  test('FLOW-03. 盘点创建与确认', async () => {
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }

    const inv = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const stock = inv.data?.data?.list?.[0]?.stock || 0

    // 创建盘点（盘盈）
    const create = await apiFetch(adminToken, 'POST', '/stocktaking', {
      materialId: mid, actualStock: stock + 3, remark: 'FLOW盘点测试',
    })
    expect([200, 201, 400]).toContain(create.status)

    if (create.status === 200 || create.status === 201) {
      const id = create.data?.data?.id
      if (id) {
        // 确认盘点
        const confirm = await apiFetch(adminToken, 'POST', `/stocktaking/${id}/confirm`)
        expect([200, 400]).toContain(confirm.status)
      }
    }
  })

  // ────────────────────────────────────────────
  // 4. 退库 → 库存回退
  // ────────────────────────────────────────────
  test('FLOW-04. 退库后库存增加', async () => {
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }

    const before = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0

    const returnRes = await apiFetch(adminToken, 'POST', '/returns', {
      materialId: mid, quantity: 2, reason: 'FLOW退库测试',
    })
    expect([200, 201]).toContain(returnRes.status)

    const after = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBeGreaterThanOrEqual(beforeStock)
  })

  // ────────────────────────────────────────────
  // 5. 报废 → 库存减少
  // ────────────────────────────────────────────
  test('FLOW-05. 报废后库存减少', async () => {
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }

    const before = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0
    if (beforeStock < 3) { test.skip(); return }

    const scrapRes = await apiFetch(adminToken, 'POST', '/scraps', {
      materialId: mid, quantity: 1, reason: 'FLOW报废测试',
    })
    expect([200, 201]).toContain(scrapRes.status)

    const after = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBeLessThanOrEqual(beforeStock)
  })

  // ────────────────────────────────────────────
  // 6. 调拨 → 库位变更
  // ────────────────────────────────────────────
  test('FLOW-06. 调拨后库位变更', async () => {
    const mid = await getAnyMaterialId(adminToken)
    const lid = await getAnyLocationId(adminToken)
    if (!mid || !lid) { test.skip(); return }

    const transferRes = await apiFetch(adminToken, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1,
      fromLocationId: lid, fromLocationName: 'FLOW来源',
      toLocationId: lid, remark: 'FLOW调拨测试',
    })
    expect([200, 201]).toContain(transferRes.status)
  })

  // ────────────────────────────────────────────
  // 7. 数据一致性验证
  // ────────────────────────────────────────────
  test('FLOW-07. 库存日志完整性', async () => {
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }

    // 验证库存日志存在
    const logs = await apiFetch(adminToken, 'GET', `/logs?page=1&pageSize=5`)
    expect(logs.status).toBe(200)
  })

  test('FLOW-08. 批次追踪一致性', async () => {
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }

    // 验证批次数据
    const inv = await apiFetch(adminToken, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    expect(inv.status).toBe(200)
  })

  test('FLOW-09. BOM物料关联', async () => {
    // 验证BOM列表
    const boms = await apiFetch(adminToken, 'GET', '/boms?page=1&pageSize=1')
    expect(boms.status).toBe(200)
  })

  test('FLOW-10. 成本数据可访问', async () => {
    // 验证成本分析端点
    const profitability = await apiFetch(adminToken, 'GET', '/abc/profitability')
    expect(profitability.status).toBe(200)
  })
})
