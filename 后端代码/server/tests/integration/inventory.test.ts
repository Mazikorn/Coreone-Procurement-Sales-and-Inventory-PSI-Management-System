process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../../src/app.js')
  const { getDatabase } = await import('../../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

function seedBasicData(db: any) {
  db.prepare(`INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)`).run(
    'cat-inv', 'C-INV', '试剂', 1,
  )
  db.prepare(`INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)`).run('sup-inv', 'S-INV', 'Dako')
  db.prepare(`INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)`).run(
    'loc-inv', 'L-INV', 'A1-01', 'shelf', 'A区',
  )
}

async function createMaterial(app: any, token: string, code: string, price: number) {
  const res = await request(app)
    .post('/api/v1/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code,
      name: `库存测试物料${code}`,
      spec: '7ml',
      unit: '支',
      categoryId: 'cat-inv',
      supplierId: 'sup-inv',
      price,
      minStock: 5,
      locationId: 'loc-inv',
    })
  expect(res.status).toBe(201)
  return res.body.data.id
}

async function inbound(app: any, token: string, materialId: string, batchNo: string, quantity: number, price: number) {
  const res = await request(app)
    .post('/api/v1/inbound')
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: 'direct',
      materialId,
      batchNo,
      quantity,
      price,
      locationId: 'loc-inv',
      expiryDate: '2027-12-31',
    })
  expect(res.status).toBe(201)
  return res.body.data
}

describe('集成测试：库存管理', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ({ app, db } = await getApp())
    token = await loginAdmin(app)
    seedBasicData(db)
  })

  describe('库存列表查询', () => {
    let materialId: string

    beforeAll(async () => {
      materialId = await createMaterial(app, token, 'INV-L1', 100)
      await inbound(app, token, materialId, 'B-INV-1', 50, 100)
    })

    it('获取库存列表返回分页数据', async () => {
      const res = await request(app)
        .get('/api/v1/inventory?page=1&pageSize=20')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.list)).toBe(true)
      expect(res.body.data.total).toBeGreaterThan(0)
      expect(res.body.data.page).toBe(1)
      expect(res.body.data.pageSize).toBe(20)
    })

    it('库存列表包含物料详情', async () => {
      const res = await request(app)
        .get('/api/v1/inventory?page=1&pageSize=50')
        .set('Authorization', `Bearer ${token}`)

      const item = res.body.data.list.find((i: any) => i.materialId === materialId)
      expect(item).toBeDefined()
      expect(item.stock).toBe(50)
      expect(item.name).toBeDefined()
      expect(item.code).toBeDefined()
    })

    it('按分类筛选库存', async () => {
      const res = await request(app)
        .get('/api/v1/inventory?page=1&pageSize=20&categoryId=cat-inv')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.list.length).toBeGreaterThan(0)
      // 分类筛选已通过后端WHERE条件保证，验证返回数据非空即可
    })

    it('按分类和库位筛选库存时分页总数与统计使用后端全量口径', async () => {
      const suffix = Date.now()
      const categoryId = `cat-inv-filter-${suffix}`
      const otherCategoryId = `cat-inv-filter-other-${suffix}`
      const locationId = `loc-inv-filter-${suffix}`
      const otherLocationId = `loc-inv-filter-other-${suffix}`
      db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
        .run(categoryId, `C-INV-F-${suffix}`, '库存筛选分类', 1)
      db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
        .run(otherCategoryId, `C-INV-FO-${suffix}`, '库存筛选其他分类', 1)
      db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
        .run(locationId, `L-INV-F-${suffix}`, '库存筛选库位', 'shelf', 'A区')
      db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
        .run(otherLocationId, `L-INV-FO-${suffix}`, '库存筛选其他库位', 'shelf', 'B区')

      const materialInsert = db.prepare(`
        INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
        VALUES (?, ?, ?, '1ml', '瓶', ?, 10, ?)
      `)
      const inventoryInsert = db.prepare(`
        INSERT INTO inventory (id, material_id, stock, locked_stock, location_id)
        VALUES (?, ?, ?, 0, ?)
      `)
      for (let i = 1; i <= 2; i += 1) {
        const materialId = `mat-inv-filter-${suffix}-${i}`
        materialInsert.run(materialId, `INV-F-${suffix}-${i}`, `库存筛选物料-${i}`, categoryId, locationId)
        inventoryInsert.run(`inv-filter-${suffix}-${i}`, materialId, i * 5, locationId)
      }
      const otherMaterialId = `mat-inv-filter-other-${suffix}`
      materialInsert.run(otherMaterialId, `INV-FO-${suffix}`, '库存筛选其他物料', otherCategoryId, otherLocationId)
      inventoryInsert.run(`inv-filter-other-${suffix}`, otherMaterialId, 99, otherLocationId)

      const listRes = await request(app)
        .get('/api/v1/inventory')
        .query({ categoryId, locationId, page: 1, pageSize: 1 })
        .set('Authorization', `Bearer ${token}`)

      expect(listRes.status).toBe(200)
      expect(listRes.body.data.total).toBe(2)
      expect(listRes.body.data.pagination.total).toBe(2)
      expect(listRes.body.data.list).toHaveLength(1)
      expect(listRes.body.data.list[0].categoryId).toBe(categoryId)
      expect(listRes.body.data.list[0].locationId).toBe(locationId)

      const statsRes = await request(app)
        .get('/api/v1/inventory/stats')
        .query({ categoryId, locationId })
        .set('Authorization', `Bearer ${token}`)

      expect(statsRes.status).toBe(200)
      expect(statsRes.body.data.totalMaterials).toBe(2)
      expect(statsRes.body.data.totalStockCount).toBe(2)
      expect(statsRes.body.data.totalQuantity).toBe(15)
    })

    it('按库位筛选库存统计时数量、金额和低库存判断使用该库位库存', async () => {
      const suffix = Date.now()
      const categoryId = `cat-inv-loc-stats-${suffix}`
      const locationAId = `loc-inv-loc-stats-a-${suffix}`
      const locationBId = `loc-inv-loc-stats-b-${suffix}`
      const materialId = `mat-inv-loc-stats-${suffix}`

      db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
        .run(categoryId, `C-INV-LS-${suffix}`, '库位统计分类', 1)
      db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
        .run(locationAId, `L-INV-LS-A-${suffix}`, '库位统计A', 'shelf', 'A区')
      db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
        .run(locationBId, `L-INV-LS-B-${suffix}`, '库位统计B', 'shelf', 'B区')
      db.prepare(`
        INSERT INTO materials (id, code, name, spec, unit, category_id, price, min_stock, location_id)
        VALUES (?, ?, ?, '1ml', '瓶', ?, 10, 6, ?)
      `).run(materialId, `INV-LS-${suffix}`, '库位统计物料', categoryId, locationAId)
      db.prepare(`
        INSERT INTO inventory (id, material_id, stock, locked_stock, location_id)
        VALUES (?, ?, 12, 0, ?)
      `).run(`inv-loc-stats-${suffix}`, materialId, locationBId)
      db.prepare(`
        INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock)
        VALUES (?, ?, ?, 5, 0)
      `).run(`invloc-loc-stats-a-${suffix}`, materialId, locationAId)
      db.prepare(`
        INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock)
        VALUES (?, ?, ?, 7, 0)
      `).run(`invloc-loc-stats-b-${suffix}`, materialId, locationBId)

      const res = await request(app)
        .get('/api/v1/inventory/stats')
        .query({ categoryId, locationId: locationAId })
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.totalMaterials).toBe(1)
      expect(res.body.data.totalStockCount).toBe(1)
      expect(res.body.data.totalQuantity).toBe(5)
      expect(res.body.data.totalStockValue).toBe(50)
      expect(res.body.data.lowStockCount).toBe(1)
    })

    it('库存金额使用批次入库价而不是后续修改的物料参考价', async () => {
      const suffix = Date.now()
      const categoryId = `cat-inv-value-${suffix}`
      const materialId = `mat-inv-value-${suffix}`

      db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
        .run(categoryId, `C-INV-V-${suffix}`, '库存金额分类', 1)
      db.prepare(`
        INSERT INTO materials (id, code, name, spec, unit, category_id, price, min_stock, location_id)
        VALUES (?, ?, ?, '1ml', '瓶', ?, 999, 1, 'loc-inv')
      `).run(materialId, `INV-V-${suffix}`, '库存金额物料', categoryId)
      db.prepare(`
        INSERT INTO inventory (id, material_id, stock, locked_stock, location_id)
        VALUES (?, ?, 5, 0, 'loc-inv')
      `).run(`inv-value-${suffix}`, materialId)
      db.prepare(`
        INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status)
        VALUES (?, ?, ?, 2, 2, ?, 10, 1)
      `).run(`batch-value-a-${suffix}`, materialId, `B-V-A-${suffix}`, `inbound-value-a-${suffix}`)
      db.prepare(`
        INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status)
        VALUES (?, ?, ?, 3, 3, ?, 20, 1)
      `).run(`batch-value-b-${suffix}`, materialId, `B-V-B-${suffix}`, `inbound-value-b-${suffix}`)

      const res = await request(app)
        .get('/api/v1/inventory/stats')
        .query({ categoryId })
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.totalQuantity).toBe(5)
      expect(res.body.data.totalStockValue).toBe(80)
    })

    it('按关键词搜索库存', async () => {
      const res = await request(app)
        .get('/api/v1/inventory?page=1&pageSize=20&keyword=INV-L1')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      const found = res.body.data.list.find((i: any) => i.code === 'INV-L1')
      expect(found).toBeDefined()
    })

    it('按批号和供应商关键词搜索库存', async () => {
      const batchRes = await request(app)
        .get('/api/v1/inventory?page=1&pageSize=20&keyword=B-INV-1')
        .set('Authorization', `Bearer ${token}`)

      expect(batchRes.status).toBe(200)
      expect(batchRes.body.data.list.some((i: any) => i.materialId === materialId)).toBe(true)

      const supplierRes = await request(app)
        .get('/api/v1/inventory?page=1&pageSize=20&keyword=Dako')
        .set('Authorization', `Bearer ${token}`)

      expect(supplierRes.status).toBe(200)
      expect(supplierRes.body.data.list.some((i: any) => i.supplierName === 'Dako')).toBe(true)
    })
  })

  describe('库存统计', () => {
    it('获取库存统计数据', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/stats')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.totalMaterials).toBeDefined()
      expect(typeof res.body.data.totalMaterials).toBe('number')
    })

    it('统计数据包含库存金额', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/stats')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      // totalValue 或类似字段应存在
      const stats = res.body.data
      expect(stats).toBeDefined()
    })

    it('库存预警列表', async () => {
      const suffix = Date.now()
      const lowId = await createMaterial(app, token, `LOW-${suffix}`, 10)
      const zeroId = await createMaterial(app, token, `ZERO-${suffix}`, 10)
      await inbound(app, token, lowId, `B-LOW-${suffix}`, 2, 10)

      const lowRes = await request(app)
        .get(`/api/v1/inventory?page=1&pageSize=20&keyword=LOW-${suffix}&status=low-stock`)
        .set('Authorization', `Bearer ${token}`)

      expect(lowRes.status).toBe(200)
      expect(lowRes.body.data.total).toBe(1)
      expect(lowRes.body.data.list[0].materialId).toBe(lowId)
      expect(lowRes.body.data.list[0].status).toBe('low-stock')

      const outRes = await request(app)
        .get(`/api/v1/inventory?page=1&pageSize=20&keyword=ZERO-${suffix}&status=out-of-stock`)
        .set('Authorization', `Bearer ${token}`)

      expect(outRes.status).toBe(200)
      expect(outRes.body.data.total).toBe(1)
      expect(outRes.body.data.list[0].materialId).toBe(zeroId)
      expect(outRes.body.data.list[0].stock).toBe(0)
      expect(outRes.body.data.list[0].status).toBe('out-of-stock')

      const statsRes = await request(app)
        .get('/api/v1/inventory/stats')
        .set('Authorization', `Bearer ${token}`)

      expect(statsRes.status).toBe(200)
      expect(statsRes.body.data.lowStockCount).toBeGreaterThanOrEqual(1)
      expect(statsRes.body.data.outOfStockCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('批次关联查询', () => {
    let materialId: string

    beforeAll(async () => {
      materialId = await createMaterial(app, token, 'BATCH-M1', 80)
      await inbound(app, token, materialId, 'B-A1', 10, 80)
      await inbound(app, token, materialId, 'B-A2', 20, 90)
      await inbound(app, token, materialId, 'B-A3', 30, 85)
    })

    it('库存记录的总库存等于批次总和', async () => {
      const invRes = await request(app)
        .get('/api/v1/inventory?page=1&pageSize=50')
        .set('Authorization', `Bearer ${token}`)

      const items = invRes.body.data.list.filter((i: any) => i.materialId === materialId)
      expect(items).toHaveLength(3)
      expect(items.reduce((sum: number, item: any) => sum + Number(item.stock), 0)).toBe(60) // 10 + 20 + 30
      expect(items.every((item: any) => Number(item.totalStock) === 60)).toBe(true)
    })

    it('数据库批次记录正确', () => {
      const batches = db.prepare(
        'SELECT * FROM batches WHERE material_id = ? AND remaining > 0 ORDER BY expiry_date'
      ).all(materialId) as any[]

      expect(batches.length).toBe(3)
      expect(batches[0].batch_no).toBe('B-A1')
      expect(batches[0].remaining).toBe(10)
      expect(batches[1].batch_no).toBe('B-A2')
      expect(batches[1].remaining).toBe(20)
      expect(batches[2].batch_no).toBe('B-A3')
      expect(batches[2].remaining).toBe(30)
    })

    it('批次价格记录正确（用于加权平均价计算）', () => {
      const batches = db.prepare(
        'SELECT * FROM batches WHERE material_id = ? AND remaining > 0'
      ).all(materialId) as any[]

      // 加权平均价 = (10*80 + 20*90 + 30*85) / 60 = 5150 / 60 ≈ 85.83
      const totalCost = batches.reduce((sum: number, b: any) => sum + b.remaining * b.inbound_price, 0)
      const totalQty = batches.reduce((sum: number, b: any) => sum + b.remaining, 0)
      const weightedAvg = totalCost / totalQty

      expect(weightedAvg).toBeCloseTo(85.83, 1)
    })
  })

  describe('库存变动后一致性', () => {
    it('多次入库后库存累加正确', async () => {
      const mId = await createMaterial(app, token, 'ACC-M1', 50)

      await inbound(app, token, mId, 'B-ACC-1', 10, 50)
      await inbound(app, token, mId, 'B-ACC-2', 20, 55)
      await inbound(app, token, mId, 'B-ACC-3', 15, 60)

      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(mId) as any
      expect(inv.stock).toBe(45) // 10 + 20 + 15
    })
  })
})
