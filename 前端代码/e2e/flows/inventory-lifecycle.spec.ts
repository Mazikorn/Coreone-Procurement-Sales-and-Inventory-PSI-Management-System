import { test, expect } from '@playwright/test'

/**
 * 跨模块集成测试：库存生命周期
 * 用隔离测试数据验证 入库 → 库存 → 出库 → 盘点 → 退库/报废 → 调拨 → 非 ABC 成本报表。
 */

const API_BASE = 'http://127.0.0.1:3001/api/v1'

async function apiLogin(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = (await res.json()) as any
  expect(res.status, `登录失败: ${JSON.stringify(data)}`).toBe(200)
  return data.data?.token || data.token
}

async function apiFetch(token: string, method: string, path: string, body?: any) {
  const opts: any = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  if (body && method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  return { status: res.status, data: (await res.json().catch(() => null)) as any }
}

function uniqueSuffix(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function dataId(res: { data: any }): string {
  return res.data?.data?.id || res.data?.id || ''
}

function expectStatus(res: { status: number, data: any }, expected: number, label: string) {
  expect(res.status, `${label}: ${JSON.stringify(res.data)}`).toBe(expected)
}

async function getOrCreateCategoryId(token: string): Promise<string> {
  const existing = await apiFetch(token, 'GET', '/categories?page=1&pageSize=1')
  expectStatus(existing, 200, '查询物料分类失败')
  const current = existing.data?.data?.list?.[0]?.id
  if (current) return current

  const created = await apiFetch(token, 'POST', '/categories', { name: `库存流转E2E分类-${uniqueSuffix('cat')}` })
  expectStatus(created, 201, '创建物料分类失败')
  const id = dataId(created)
  expect(id, `创建物料分类未返回 id: ${JSON.stringify(created.data)}`).toBeTruthy()
  return id
}

async function createLocation(token: string, suffix: string, namePart = '主库位'): Promise<string> {
  const res = await apiFetch(token, 'POST', '/locations', {
    name: `库存流转E2E${namePart}-${suffix}`,
    type: 'shelf',
    zone: `FLOW-${suffix}`.slice(0, 40),
    shelf: namePart,
    position: '01',
    capacity: 9999,
  })
  expectStatus(res, 201, '创建库位失败')
  const id = dataId(res)
  expect(id, `创建库位未返回 id: ${JSON.stringify(res.data)}`).toBeTruthy()
  return id
}

async function createMaterial(token: string, suffix: string, categoryId: string, locationId: string, price = 10): Promise<string> {
  const res = await apiFetch(token, 'POST', '/materials', {
    code: `FLOW-MAT-${suffix}`.slice(0, 64),
    name: `库存流转E2E物料-${suffix}`,
    spec: '1ml',
    unit: '瓶',
    categoryId,
    locationId,
    price,
    minStock: 0,
    safetyStock: 0,
    maxStock: 9999,
    remark: `库存生命周期E2E-${suffix}`,
  })
  expectStatus(res, 201, '创建物料失败')
  const id = dataId(res)
  expect(id, `创建物料未返回 id: ${JSON.stringify(res.data)}`).toBeTruthy()
  return id
}

async function createProject(token: string, suffix: string, bomId?: string): Promise<string> {
  const res = await apiFetch(token, 'POST', '/projects', {
    code: `FLOW-PRJ-${suffix}`.slice(0, 64),
    name: `库存流转E2E项目-${suffix}`,
    type: 'ihc',
    bomId,
    status: 'active',
  })
  expectStatus(res, 201, '创建项目失败')
  const id = dataId(res)
  expect(id, `创建项目未返回 id: ${JSON.stringify(res.data)}`).toBeTruthy()
  return id
}

async function createBom(token: string, suffix: string, materialId: string): Promise<string> {
  const res = await apiFetch(token, 'POST', '/boms', {
    code: `FLOW-BOM-${suffix}`.slice(0, 64),
    name: `库存流转E2E-BOM-${suffix}`,
    type: 'ihc',
    status: 'active',
    materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
  })
  expectStatus(res, 201, '创建 BOM 失败')
  const id = dataId(res)
  expect(id, `创建 BOM 未返回 id: ${JSON.stringify(res.data)}`).toBeTruthy()
  return id
}

async function inboundStock(token: string, materialId: string, locationId: string, suffix: string, quantity: number, price = 10, expiryDate = '2028-12-31') {
  const res = await apiFetch(token, 'POST', '/inbound', {
    type: 'direct',
    materialId,
    batchNo: `FLOW-BATCH-${suffix}`.slice(0, 64),
    quantity,
    price,
    locationId,
    productionDate: '2026-01-01',
    expiryDate,
    remark: `库存流转E2E入库-${suffix}`,
  })
  expectStatus(res, 201, '创建入库失败')
  return dataId(res)
}

async function createStockedMaterial(token: string, suffix: string, quantity = 20, price = 10) {
  const categoryId = await getOrCreateCategoryId(token)
  const locationId = await createLocation(token, suffix)
  const materialId = await createMaterial(token, suffix, categoryId, locationId, price)
  await inboundStock(token, materialId, locationId, suffix, quantity, price)
  await expect.poll(() => getInventoryTotalStock(token, materialId)).toBe(quantity)
  await expect.poll(() => getLocationStock(token, materialId, locationId)).toBe(quantity)
  return { materialId, locationId, quantity, price }
}

async function getInventoryRows(token: string, materialId: string, locationId?: string): Promise<any[]> {
  const query = new URLSearchParams({ page: '1', pageSize: '100', materialId })
  if (locationId) query.set('locationId', locationId)
  const res = await apiFetch(token, 'GET', `/inventory?${query.toString()}`)
  expectStatus(res, 200, '查询库存失败')
  const rows = res.data?.data?.list || []
  expect(rows.every((row: any) => row.materialId === materialId), `库存过滤返回了其他物料: ${JSON.stringify(rows)}`).toBe(true)
  return rows
}

async function getInventoryTotalStock(token: string, materialId: string): Promise<number> {
  const rows = await getInventoryRows(token, materialId)
  return Number(rows[0]?.totalStock ?? rows[0]?.stock ?? 0)
}

async function getLocationStock(token: string, materialId: string, locationId: string): Promise<number> {
  const rows = await getInventoryRows(token, materialId, locationId)
  return Number(rows[0]?.stock ?? 0)
}

async function getFirstBatchId(token: string, materialId: string): Promise<string> {
  const rows = await getInventoryRows(token, materialId)
  const batchId = rows.find((row: any) => row.batchId)?.batchId || ''
  expect(batchId, `物料没有可用批次: ${JSON.stringify(rows)}`).toBeTruthy()
  return batchId
}

test.describe('库存生命周期集成测试', () => {
  let adminToken = ''

  test.beforeAll(async () => {
    adminToken = await apiLogin('admin', 'admin123')
  })

  test('FLOW-01. 入库后总库存、库位库存和批次记录同步增加', async () => {
    const suffix = uniqueSuffix('inbound')
    const categoryId = await getOrCreateCategoryId(adminToken)
    const locationId = await createLocation(adminToken, suffix)
    const materialId = await createMaterial(adminToken, suffix, categoryId, locationId)

    await inboundStock(adminToken, materialId, locationId, suffix, 20, 8)

    await expect.poll(() => getInventoryTotalStock(adminToken, materialId)).toBe(20)
    await expect.poll(() => getLocationStock(adminToken, materialId, locationId)).toBe(20)
    const rows = await getInventoryRows(adminToken, materialId)
    expect(rows.some((row: any) => row.batchNo === `FLOW-BATCH-${suffix}`.slice(0, 64) && Number(row.stock) === 20)).toBe(true)
  })

  test('FLOW-02. 项目出库后库存、库位和出库记录同步扣减', async () => {
    const suffix = uniqueSuffix('outbound')
    const { materialId, locationId } = await createStockedMaterial(adminToken, suffix, 20, 12)
    const projectId = await createProject(adminToken, suffix)

    const outbound = await apiFetch(adminToken, 'POST', '/outbound', {
      type: 'project',
      projectId,
      sampleCount: 1,
      items: [{ materialId, quantity: 5, locationId }],
      remark: `库存流转E2E出库-${suffix}`,
    })
    expectStatus(outbound, 201, '创建出库失败')

    await expect.poll(() => getInventoryTotalStock(adminToken, materialId)).toBe(15)
    await expect.poll(() => getLocationStock(adminToken, materialId, locationId)).toBe(15)
    const outboundList = await apiFetch(adminToken, 'GET', '/outbound?page=1&pageSize=50')
    expectStatus(outboundList, 200, '查询出库记录失败')
    expect((outboundList.data?.data?.list || []).some((row: any) => row.id === dataId(outbound))).toBe(true)
  })

  test('FLOW-03. 盘点确认后批次、总库存和库位库存保持一致', async () => {
    const suffix = uniqueSuffix('stocktaking')
    const { materialId, locationId } = await createStockedMaterial(adminToken, suffix, 10, 9)

    const create = await apiFetch(adminToken, 'POST', '/stocktaking', {
      materialId,
      actualStock: 13,
      remark: `库存流转E2E盘点-${suffix}`,
    })
    expectStatus(create, 200, '创建盘点失败')

    const confirm = await apiFetch(adminToken, 'POST', `/stocktaking/${dataId(create)}/confirm`, {
      reason: 'physical',
      remark: `库存流转E2E盘点确认-${suffix}`,
    })
    expectStatus(confirm, 200, '确认盘点失败')

    await expect.poll(() => getInventoryTotalStock(adminToken, materialId)).toBe(13)
    await expect.poll(() => getLocationStock(adminToken, materialId, locationId)).toBe(13)
    const rows = await getInventoryRows(adminToken, materialId)
    expect(rows.reduce((sum: number, row: any) => sum + Number(row.batchNo?.startsWith('STK-') ? row.stock : 0), 0)).toBe(3)
  })

  test('FLOW-04. 退库后库存、库位和批次余额同步扣减', async () => {
    const suffix = uniqueSuffix('return')
    const { materialId, locationId } = await createStockedMaterial(adminToken, suffix, 10, 7)
    const batchId = await getFirstBatchId(adminToken, materialId)

    const returnRes = await apiFetch(adminToken, 'POST', '/returns', {
      materialId,
      batchId,
      quantity: 2,
      reason: `库存流转E2E退库-${suffix}`,
    })
    expectStatus(returnRes, 200, '创建退库失败')

    await expect.poll(() => getInventoryTotalStock(adminToken, materialId)).toBe(8)
    await expect.poll(() => getLocationStock(adminToken, materialId, locationId)).toBe(8)
    const rows = await getInventoryRows(adminToken, materialId)
    expect(Number(rows.find((row: any) => row.batchId === batchId)?.stock || 0)).toBe(8)
  })

  test('FLOW-05. 报废后库存、库位和批次余额同步扣减', async () => {
    const suffix = uniqueSuffix('scrap')
    const { materialId, locationId } = await createStockedMaterial(adminToken, suffix, 10, 7)
    const batchId = await getFirstBatchId(adminToken, materialId)

    const scrapRes = await apiFetch(adminToken, 'POST', '/scraps', {
      materialId,
      batchId,
      quantity: 3,
      reason: `库存流转E2E报废-${suffix}`,
    })
    expectStatus(scrapRes, 200, '创建报废失败')

    await expect.poll(() => getInventoryTotalStock(adminToken, materialId)).toBe(7)
    await expect.poll(() => getLocationStock(adminToken, materialId, locationId)).toBe(7)
    const rows = await getInventoryRows(adminToken, materialId)
    expect(Number(rows.find((row: any) => row.batchId === batchId)?.stock || 0)).toBe(7)
  })

  test('FLOW-06. 调拨后总库存不变且来源/目标库位同步变化', async () => {
    const suffix = uniqueSuffix('transfer')
    const { materialId, locationId: fromLocationId } = await createStockedMaterial(adminToken, suffix, 10, 7)
    const toLocationId = await createLocation(adminToken, `${suffix}-to`, '目标库位')

    const transferRes = await apiFetch(adminToken, 'POST', '/transfers/inbound', {
      materialId,
      quantity: 4,
      fromLocationId,
      fromLocationName: '库存流转E2E来源库位',
      toLocationId,
      remark: `库存流转E2E调拨-${suffix}`,
    })
    expectStatus(transferRes, 200, '创建调拨失败')

    await expect.poll(() => getInventoryTotalStock(adminToken, materialId)).toBe(10)
    await expect.poll(() => getLocationStock(adminToken, materialId, fromLocationId)).toBe(6)
    await expect.poll(() => getLocationStock(adminToken, materialId, toLocationId)).toBe(4)
  })

  test('FLOW-07. 业务动作生成可追踪库存流水', async () => {
    const suffix = uniqueSuffix('logs')
    const { materialId, locationId } = await createStockedMaterial(adminToken, suffix, 12, 6)
    const projectId = await createProject(adminToken, suffix)

    const outbound = await apiFetch(adminToken, 'POST', '/outbound', {
      type: 'project',
      projectId,
      items: [{ materialId, quantity: 2, locationId }],
      remark: `库存流转E2E日志-${suffix}`,
    })
    expectStatus(outbound, 201, '创建日志验证出库失败')

    const detail = await apiFetch(adminToken, 'GET', `/materials/${materialId}`)
    expectStatus(detail, 200, '查询物料详情失败')
    const stockLogs = detail.data?.data?.stockLogs || []
    expect(stockLogs.some((row: any) => row.type === 'inbound' && Number(row.quantity) === 12 && Number(row.afterStock) === 12)).toBe(true)
    expect(stockLogs.some((row: any) => row.type === 'outbound' && row.relatedId === dataId(outbound) && Number(row.quantity) === -2 && Number(row.afterStock) === 10)).toBe(true)
  })

  test('FLOW-08. BOM 出库后非 ABC 项目成本报表可按批次价格归集', async () => {
    const suffix = uniqueSuffix('cost')
    const categoryId = await getOrCreateCategoryId(adminToken)
    const locationId = await createLocation(adminToken, suffix)
    const materialId = await createMaterial(adminToken, suffix, categoryId, locationId, 100)

    await inboundStock(adminToken, materialId, locationId, `${suffix}-a`, 10, 100, '2028-01-31')
    await inboundStock(adminToken, materialId, locationId, `${suffix}-b`, 20, 120, '2028-12-31')
    await expect.poll(() => getInventoryTotalStock(adminToken, materialId)).toBe(30)

    const bomId = await createBom(adminToken, suffix, materialId)
    const projectId = await createProject(adminToken, suffix, bomId)

    const outbound = await apiFetch(adminToken, 'POST', '/outbound/bom', {
      projectId,
      bomId,
      sampleCount: 12,
      remark: `库存流转E2E成本归集-${suffix}`,
    })
    expectStatus(outbound, 201, '创建 BOM 出库失败')

    await expect.poll(() => getInventoryTotalStock(adminToken, materialId)).toBe(18)
    const report = await apiFetch(adminToken, 'GET', '/reports/cost-by-project')
    expectStatus(report, 200, '查询项目成本报表失败')
    const projectCost = (report.data?.data?.projects || []).find((row: any) => row.id === projectId)
    expect(projectCost, `成本报表未包含项目 ${projectId}: ${JSON.stringify(report.data)}`).toBeTruthy()
    expect(Number(projectCost.totalCost)).toBeCloseTo(1240, 5)
    expect(Number(projectCost.sampleCount)).toBe(12)
    expect(Number(projectCost.unitCost)).toBeCloseTo(1240 / 12, 5)
  })
})
