process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('基础资料操作审计', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('MDA-001: 管理员成功维护核心基础资料后写入操作日志', async () => {
    const suffix = Date.now()

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `审计分类-${suffix}`, auditGroup: `role-story-002-${suffix}` })
    expect(category.status).toBe(201)

    const location = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `审计库位-${suffix}`, type: 'shelf', zone: `Z${suffix}`, capacity: 100, auditGroup: `role-story-002-${suffix}` })
    expect(location.status).toBe(201)

    const material = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `审计物料-${suffix}`,
        unit: '支',
        categoryId: category.body.data.id,
        locationId: location.body.data.id,
        price: 10,
        auditGroup: `role-story-002-${suffix}`,
      })
    expect(material.status).toBe(201)

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `AUD-PRJ-${suffix}`, name: `审计项目-${suffix}`, type: 'ihc', auditGroup: `role-story-002-${suffix}` })
    expect(project.status).toBe(201)

    const equipment = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `AUD-EQ-${suffix}`,
        name: `审计设备-${suffix}`,
        purchasePrice: 10000,
        residualValue: 1000,
        depreciableLifeYears: 5,
        depreciationMethod: 'straight_line',
        auditGroup: `role-story-002-${suffix}`,
      })
    expect(equipment.status).toBe(201)

    const bom = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `AUD-BOM-${suffix}`,
        name: `审计BOM-${suffix}`,
        type: 'ihc',
        serviceId: project.body.data.id,
        materials: [{ materialId: material.body.data.id, usagePerSample: 1, unit: '支' }],
        equipmentTemplates: [{ equipmentId: equipment.body.data.id, usageMinutes: 10 }],
        auditGroup: `role-story-002-${suffix}`,
      })
    expect(bom.status).toBe(201)

    const modules = db.prepare(`
      SELECT operation, request_data
      FROM operation_logs
      WHERE request_data LIKE ?
      ORDER BY rowid ASC
    `).all(`%"auditGroup":"role-story-002-${suffix}"%`) as any[]

    expect(modules.map(row => row.operation)).toEqual([
      'POST /categories',
      'POST /locations',
      'POST /materials',
      'POST /projects',
      'POST /equipment',
      'POST /boms',
    ])
  })

  it('MDA-002: 物料主数据写入审计必须提供可回跳到物料页的业务关键字', async () => {
    const suffix = Date.now()

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `物料审计分类-${suffix}` })
    expect(category.status).toBe(201)

    const materialCode = `MAT-AUDIT-LINK-${suffix}`
    const created = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: materialCode,
        name: `审计回跳物料-${suffix}`,
        unit: '支',
        categoryId: category.body.data.id,
        price: 12,
      })
    expect(created.status).toBe(201)
    const materialId = created.body.data.id

    const updated = await request(app)
      .put(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `审计回跳物料已更新-${suffix}`, price: 15 })
    expect(updated.status).toBe(200)

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: suffix, pageSize: 100 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'POST /materials',
        module: 'materials',
        businessId: materialCode,
        businessUrl: `/materials?keyword=${materialCode}`,
        auditEvent: expect.objectContaining({
          eventCode: 'operation.materials.create',
          subjectId: materialCode,
          businessUrl: `/materials?keyword=${materialCode}`,
          evidenceSource: 'operation_logs',
        }),
      }),
      expect.objectContaining({
        operation: 'PUT /materials/:id',
        module: 'materials',
        businessId: materialId,
        businessUrl: `/materials?keyword=${materialId}`,
        auditEvent: expect.objectContaining({
          eventCode: 'operation.materials.update',
          subjectId: materialId,
          businessUrl: `/materials?keyword=${materialId}`,
          evidenceSource: 'operation_logs',
        }),
      }),
    ]))

    const linkedList = await request(app)
      .get('/api/v1/materials')
      .query({ keyword: materialId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(linkedList.status).toBe(200)
    expect(linkedList.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: materialId,
        code: materialCode,
        name: `审计回跳物料已更新-${suffix}`,
      }),
    ]))
  })

  it('MDA-003: 基础资料编辑审计使用的业务关键字必须能在各自页面搜回对象', async () => {
    const suffix = Date.now()

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-CAT-${suffix}`, name: `回跳分类-${suffix}` })
    expect(category.status).toBe(201)
    const categoryId = category.body.data.id

    const location = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `回跳库位-${suffix}`, type: 'shelf', zone: `MDA-Z-${suffix}`, capacity: 100 })
    expect(location.status).toBe(201)
    const locationId = location.body.data.id

    const material = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-MAT-${suffix}`,
        name: `回跳物料-${suffix}`,
        unit: '支',
        categoryId,
        locationId,
        price: 12,
      })
    expect(material.status).toBe(201)
    const materialId = material.body.data.id

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-PRJ-${suffix}`, name: `回跳项目-${suffix}`, type: 'ihc' })
    expect(project.status).toBe(201)
    const projectId = project.body.data.id

    const equipmentType = await request(app)
      .post('/api/v1/equipment-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-EQT-${suffix}`,
        name: `回跳设备类型-${suffix}`,
        defaultPurchasePrice: 10000,
        defaultValue: 1000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
      })
    expect(equipmentType.status).toBe(201)
    const equipmentTypeId = equipmentType.body.data.id

    const equipment = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-EQ-${suffix}`,
        name: `回跳设备-${suffix}`,
        typeId: equipmentTypeId,
        purchasePrice: 10000,
        residualValue: 1000,
        depreciableLifeYears: 5,
        depreciationMethod: 'straight_line',
      })
    expect(equipment.status).toBe(201)
    const equipmentId = equipment.body.data.id

    const bom = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-BOM-${suffix}`,
        name: `回跳BOM-${suffix}`,
        type: 'ihc',
        serviceId: projectId,
        materials: [{ materialId, usagePerSample: 1, unit: '支' }],
        equipmentTemplates: [{ equipmentId, usageMinutes: 10 }],
      })
    expect(bom.status).toBe(201)
    const bomId = bom.body.data.id

    const updates = [
      { url: `/api/v1/categories/${categoryId}`, payload: { code: `MDA-CAT-${suffix}`, name: `回跳分类已更新-${suffix}` } },
      { url: `/api/v1/locations/${locationId}`, payload: { name: `回跳库位已更新-${suffix}` } },
      { url: `/api/v1/projects/${projectId}`, payload: { code: `MDA-PRJ-${suffix}`, name: `回跳项目已更新-${suffix}`, type: 'ihc' } },
      { url: `/api/v1/equipment-types/${equipmentTypeId}`, payload: { code: `MDA-EQT-${suffix}`, name: `回跳设备类型已更新-${suffix}` } },
      { url: `/api/v1/equipment/${equipmentId}`, payload: { code: `MDA-EQ-${suffix}`, name: `回跳设备已更新-${suffix}` } },
      { url: `/api/v1/boms/${bomId}`, payload: { code: `MDA-BOM-${suffix}`, name: `回跳BOM已更新-${suffix}` } },
    ]

    for (const item of updates) {
      const res = await request(app)
        .put(item.url)
        .set('Authorization', `Bearer ${token}`)
        .send(item.payload)
      expect(res.status).toBe(200)
    }

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: suffix, pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'PUT /categories/:id', businessId: categoryId, businessUrl: `/categories?keyword=${categoryId}` }),
      expect.objectContaining({ operation: 'PUT /locations/:id', businessId: locationId, businessUrl: `/locations?keyword=${locationId}` }),
      expect.objectContaining({ operation: 'PUT /projects/:id', businessId: projectId, businessUrl: `/projects?keyword=${projectId}` }),
      expect.objectContaining({ operation: 'PUT /equipment-types/:id', businessId: equipmentTypeId, businessUrl: `/equipment/types?keyword=${equipmentTypeId}` }),
      expect.objectContaining({ operation: 'PUT /equipment/:id', businessId: equipmentId, businessUrl: `/equipment?keyword=${equipmentId}` }),
      expect.objectContaining({ operation: 'PUT /boms/:id', businessId: bomId, businessUrl: `/bom?keyword=${bomId}` }),
    ]))

    const searchableLinks = [
      { url: '/api/v1/categories', id: categoryId, name: `回跳分类已更新-${suffix}` },
      { url: '/api/v1/locations', id: locationId, name: `回跳库位已更新-${suffix}` },
      { url: '/api/v1/projects', id: projectId, name: `回跳项目已更新-${suffix}` },
      { url: '/api/v1/equipment-types', id: equipmentTypeId, name: `回跳设备类型已更新-${suffix}` },
      { url: '/api/v1/equipment', id: equipmentId, name: `回跳设备已更新-${suffix}` },
      { url: '/api/v1/boms', id: bomId, name: `回跳BOM已更新-${suffix}` },
    ]

    for (const link of searchableLinks) {
      const listed = await request(app)
        .get(link.url)
        .query({ keyword: link.id, page: 1, pageSize: 20 })
        .set('Authorization', `Bearer ${token}`)
      expect(listed.status).toBe(200)
      expect(listed.body.data.list).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: link.id, name: link.name }),
      ]))
    }
  })

  it('MDA-004: 批量状态写入审计必须保留整批受影响对象并提供可回跳链接', async () => {
    const suffix = Date.now()

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-BATCH-CAT-${suffix}`, name: `批量回跳分类-${suffix}` })
    expect(category.status).toBe(201)
    const categoryId = category.body.data.id

    const statusMaterialA = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-BATCH-MAT-A-${suffix}`, name: `批量物料A-${suffix}`, unit: '支', categoryId, price: 12 })
    expect(statusMaterialA.status).toBe(201)
    const statusMaterialB = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-BATCH-MAT-B-${suffix}`, name: `批量物料B-${suffix}`, unit: '支', categoryId, price: 12 })
    expect(statusMaterialB.status).toBe(201)
    const materialIds = [statusMaterialA.body.data.id, statusMaterialB.body.data.id]

    const bomMaterialA = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-BATCH-BOM-MAT-A-${suffix}`, name: `批量BOM物料A-${suffix}`, unit: '支', categoryId, price: 12 })
    expect(bomMaterialA.status).toBe(201)
    const bomMaterialB = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-BATCH-BOM-MAT-B-${suffix}`, name: `批量BOM物料B-${suffix}`, unit: '支', categoryId, price: 12 })
    expect(bomMaterialB.status).toBe(201)

    const projectA = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-BATCH-PRJ-A-${suffix}`, name: `批量项目A-${suffix}`, type: 'ihc' })
    expect(projectA.status).toBe(201)
    const projectB = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-BATCH-PRJ-B-${suffix}`, name: `批量项目B-${suffix}`, type: 'ihc' })
    expect(projectB.status).toBe(201)
    const projectIds = [projectA.body.data.id, projectB.body.data.id]

    const supplierA = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `批量供应商A-${suffix}`, contact: '测试联系人', phone: '13800138000' })
    expect(supplierA.status).toBe(201)
    const supplierB = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `批量供应商B-${suffix}`, contact: '测试联系人', phone: '13800138000' })
    expect(supplierB.status).toBe(201)
    const supplierIds = [supplierA.body.data.id, supplierB.body.data.id]

    const bomA = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-BATCH-BOM-A-${suffix}`,
        name: `批量BOMA-${suffix}`,
        type: 'ihc',
        materials: [{ materialId: bomMaterialA.body.data.id, usagePerSample: 1, unit: '支' }],
      })
    expect(bomA.status).toBe(201)
    const bomB = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-BATCH-BOM-B-${suffix}`,
        name: `批量BOMB-${suffix}`,
        type: 'ihc',
        materials: [{ materialId: bomMaterialB.body.data.id, usagePerSample: 1, unit: '支' }],
      })
    expect(bomB.status).toBe(201)
    const bomIds = [bomA.body.data.id, bomB.body.data.id]

    const batchUpdates = [
      { url: '/api/v1/materials/batch-status', ids: materialIds },
      { url: '/api/v1/suppliers/batch-status', ids: supplierIds },
      { url: '/api/v1/projects/batch-status', ids: projectIds },
      { url: '/api/v1/boms/batch-status', ids: bomIds },
    ]

    for (const item of batchUpdates) {
      const res = await request(app)
        .patch(item.url)
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: item.ids, status: 'inactive' })
      expect(res.status).toBe(200)
    }

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: 'batch-status', pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'PATCH /materials/batch-status',
        module: 'materials',
        businessId: materialIds[0],
        businessUrl: `/materials?keyword=${materialIds[0]}`,
        affectedBusinessIds: materialIds,
        affectedBusinessUrls: materialIds.map(id => `/materials?keyword=${id}`),
        auditEvent: expect.objectContaining({
          subjectId: materialIds[0],
          affectedSubjectIds: materialIds,
        }),
      }),
      expect.objectContaining({
        operation: 'PATCH /projects/batch-status',
        module: 'projects',
        businessId: projectIds[0],
        businessUrl: `/projects?keyword=${projectIds[0]}`,
        affectedBusinessIds: projectIds,
        affectedBusinessUrls: projectIds.map(id => `/projects?keyword=${id}`),
        auditEvent: expect.objectContaining({
          subjectId: projectIds[0],
          affectedSubjectIds: projectIds,
        }),
      }),
      expect.objectContaining({
        operation: 'PATCH /suppliers/batch-status',
        module: 'suppliers',
        businessId: supplierIds[0],
        businessUrl: `/suppliers?keyword=${supplierIds[0]}`,
        affectedBusinessIds: supplierIds,
        affectedBusinessUrls: supplierIds.map(id => `/suppliers?keyword=${id}`),
        auditEvent: expect.objectContaining({
          subjectId: supplierIds[0],
          affectedSubjectIds: supplierIds,
        }),
      }),
      expect.objectContaining({
        operation: 'PATCH /boms/batch-status',
        module: 'bom',
        businessId: bomIds[0],
        businessUrl: `/bom?keyword=${bomIds[0]}`,
        affectedBusinessIds: bomIds,
        affectedBusinessUrls: bomIds.map(id => `/bom?keyword=${id}`),
        auditEvent: expect.objectContaining({
          subjectId: bomIds[0],
          affectedSubjectIds: bomIds,
        }),
      }),
    ]))

    const searchableLinks = [
      { url: '/api/v1/materials', ids: materialIds },
      { url: '/api/v1/suppliers', ids: supplierIds },
      { url: '/api/v1/projects', ids: projectIds },
      { url: '/api/v1/boms', ids: bomIds },
    ]

    for (const link of searchableLinks) {
      for (const id of link.ids) {
        const listed = await request(app)
          .get(link.url)
          .query({ keyword: id, page: 1, pageSize: 20 })
          .set('Authorization', `Bearer ${token}`)
        expect(listed.status).toBe(200)
        expect(listed.body.data.list).toEqual(expect.arrayContaining([
          expect.objectContaining({ id, status: 'inactive' }),
        ]))
      }
    }
  })

  it('MDA-005: 删除供应商审计必须能回看已删除采购源头资料', async () => {
    const suffix = Date.now()

    const single = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `删除回看供应商-${suffix}`, contact: '审计联系人', phone: '13800138000' })
    expect(single.status).toBe(201)
    const singleId = single.body.data.id

    const batchA = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `批量删除回看供应商A-${suffix}`, contact: '审计联系人', phone: '13800138000' })
    expect(batchA.status).toBe(201)
    const batchB = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `批量删除回看供应商B-${suffix}`, contact: '审计联系人', phone: '13800138000' })
    expect(batchB.status).toBe(201)
    const batchIds = [batchA.body.data.id, batchB.body.data.id]

    const deleted = await request(app)
      .delete(`/api/v1/suppliers/${singleId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleted.status).toBe(200)

    const batchDeleted = await request(app)
      .delete('/api/v1/suppliers/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: batchIds })
    expect(batchDeleted.status).toBe(200)

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: 'suppliers', pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /suppliers/:id',
        module: 'suppliers',
        businessId: singleId,
        businessUrl: `/suppliers?keyword=${singleId}&includeDeleted=true`,
        affectedBusinessIds: [singleId],
        affectedBusinessUrls: [`/suppliers?keyword=${singleId}&includeDeleted=true`],
        auditEvent: expect.objectContaining({
          subjectId: singleId,
          affectedSubjectIds: [singleId],
          businessUrl: `/suppliers?keyword=${singleId}&includeDeleted=true`,
        }),
      }),
      expect.objectContaining({
        operation: 'DELETE /suppliers/batch',
        module: 'suppliers',
        businessId: batchIds[0],
        businessUrl: `/suppliers?keyword=${batchIds[0]}&includeDeleted=true`,
        affectedBusinessIds: batchIds,
        affectedBusinessUrls: batchIds.map(id => `/suppliers?keyword=${id}&includeDeleted=true`),
        auditEvent: expect.objectContaining({
          subjectId: batchIds[0],
          affectedSubjectIds: batchIds,
          businessUrl: `/suppliers?keyword=${batchIds[0]}&includeDeleted=true`,
        }),
      }),
    ]))

    const hiddenByDefault = await request(app)
      .get('/api/v1/suppliers')
      .query({ keyword: singleId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(hiddenByDefault.status).toBe(200)
    expect(hiddenByDefault.body.data.list).toEqual([])

    const deletedLinks = [singleId, ...batchIds]
    for (const id of deletedLinks) {
      const linked = await request(app)
        .get('/api/v1/suppliers')
        .query({ keyword: id, includeDeleted: 'true', page: 1, pageSize: 20 })
        .set('Authorization', `Bearer ${token}`)
      expect(linked.status).toBe(200)
      expect(linked.body.data.list).toEqual(expect.arrayContaining([
        expect.objectContaining({ id, isDeleted: true }),
      ]))
    }
  })

  it('MDA-006: 删除物料审计必须能回看已删除成本源头资料', async () => {
    const suffix = Date.now()

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-MAT-CAT-${suffix}`, name: `删除回看物料分类-${suffix}` })
    expect(category.status).toBe(201)
    const categoryId = category.body.data.id

    const single = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-MAT-${suffix}`, name: `删除回看物料-${suffix}`, unit: '支', categoryId, price: 12 })
    expect(single.status).toBe(201)
    const singleId = single.body.data.id

    const batchA = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-MAT-A-${suffix}`, name: `批量删除回看物料A-${suffix}`, unit: '支', categoryId, price: 12 })
    expect(batchA.status).toBe(201)
    const batchB = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-MAT-B-${suffix}`, name: `批量删除回看物料B-${suffix}`, unit: '支', categoryId, price: 12 })
    expect(batchB.status).toBe(201)
    const batchIds = [batchA.body.data.id, batchB.body.data.id]

    const deleted = await request(app)
      .delete(`/api/v1/materials/${singleId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleted.status).toBe(200)

    const batchDeleted = await request(app)
      .delete('/api/v1/materials/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: batchIds })
    expect(batchDeleted.status).toBe(200)

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: 'materials', pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /materials/:id',
        module: 'materials',
        businessId: singleId,
        businessUrl: `/materials?keyword=${singleId}&includeDeleted=true`,
        affectedBusinessIds: [singleId],
        affectedBusinessUrls: [`/materials?keyword=${singleId}&includeDeleted=true`],
        auditEvent: expect.objectContaining({
          subjectId: singleId,
          affectedSubjectIds: [singleId],
          businessUrl: `/materials?keyword=${singleId}&includeDeleted=true`,
        }),
      }),
      expect.objectContaining({
        operation: 'DELETE /materials/batch',
        module: 'materials',
        businessId: batchIds[0],
        businessUrl: `/materials?keyword=${batchIds[0]}&includeDeleted=true`,
        affectedBusinessIds: batchIds,
        affectedBusinessUrls: batchIds.map(id => `/materials?keyword=${id}&includeDeleted=true`),
        auditEvent: expect.objectContaining({
          subjectId: batchIds[0],
          affectedSubjectIds: batchIds,
          businessUrl: `/materials?keyword=${batchIds[0]}&includeDeleted=true`,
        }),
      }),
    ]))

    const hiddenByDefault = await request(app)
      .get('/api/v1/materials')
      .query({ keyword: singleId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(hiddenByDefault.status).toBe(200)
    expect(hiddenByDefault.body.data.list).toEqual([])

    const deletedLinks = [singleId, ...batchIds]
    for (const id of deletedLinks) {
      const linked = await request(app)
        .get('/api/v1/materials')
        .query({ keyword: id, includeDeleted: 'true', page: 1, pageSize: 20 })
        .set('Authorization', `Bearer ${token}`)
      expect(linked.status).toBe(200)
      expect(linked.body.data.list).toEqual(expect.arrayContaining([
        expect.objectContaining({ id, isDeleted: true }),
      ]))
    }
  })

  it('MDA-007: 删除库位审计必须能回看已删除仓储位置事实', async () => {
    const suffix = Date.now()

    const single = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-LOC-${suffix}`, name: `删除回看库位-${suffix}`, type: 'shelf', zone: `Z-${suffix}`, capacity: 100 })
    expect(single.status).toBe(201)
    const singleId = single.body.data.id

    const deleted = await request(app)
      .delete(`/api/v1/locations/${singleId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleted.status).toBe(200)

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: 'locations', pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /locations/:id',
        module: 'locations',
        businessId: singleId,
        businessUrl: `/locations?keyword=${singleId}&includeDeleted=true`,
        affectedBusinessIds: [singleId],
        affectedBusinessUrls: [`/locations?keyword=${singleId}&includeDeleted=true`],
        auditEvent: expect.objectContaining({
          subjectId: singleId,
          affectedSubjectIds: [singleId],
          businessUrl: `/locations?keyword=${singleId}&includeDeleted=true`,
        }),
      }),
    ]))

    const hiddenByDefault = await request(app)
      .get('/api/v1/locations')
      .query({ keyword: singleId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(hiddenByDefault.status).toBe(200)
    expect(hiddenByDefault.body.data.list).toEqual([])

    const linked = await request(app)
      .get('/api/v1/locations')
      .query({ keyword: singleId, includeDeleted: 'true', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(linked.status).toBe(200)
    expect(linked.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: singleId,
        name: `删除回看库位-${suffix}`,
        isDeleted: true,
      }),
    ]))
  })

  it('MDA-008: 删除分类审计必须能回看已删除物料归类口径', async () => {
    const suffix = Date.now()

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-CAT-${suffix}`, name: `删除回看分类-${suffix}` })
    expect(category.status).toBe(201)
    const categoryId = category.body.data.id

    const deleted = await request(app)
      .delete(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleted.status).toBe(200)

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: 'categories', pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /categories/:id',
        module: 'categories',
        businessId: categoryId,
        businessUrl: `/categories?keyword=${categoryId}&includeDeleted=true`,
        affectedBusinessIds: [categoryId],
        affectedBusinessUrls: [`/categories?keyword=${categoryId}&includeDeleted=true`],
        auditEvent: expect.objectContaining({
          subjectId: categoryId,
          affectedSubjectIds: [categoryId],
          businessUrl: `/categories?keyword=${categoryId}&includeDeleted=true`,
        }),
      }),
    ]))

    const hiddenByDefault = await request(app)
      .get('/api/v1/categories')
      .query({ keyword: categoryId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(hiddenByDefault.status).toBe(200)
    expect(hiddenByDefault.body.data.list).toEqual([])

    const linked = await request(app)
      .get('/api/v1/categories')
      .query({ keyword: categoryId, includeDeleted: 'true', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(linked.status).toBe(200)
    expect(linked.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: categoryId,
        name: `删除回看分类-${suffix}`,
        isDeleted: true,
      }),
    ]))

    const tree = await request(app)
      .get('/api/v1/categories/tree')
      .query({ includeDeleted: 'true' })
      .set('Authorization', `Bearer ${token}`)
    expect(tree.status).toBe(200)
    expect(tree.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: categoryId,
        name: `删除回看分类-${suffix}`,
        isDeleted: true,
      }),
    ]))
  })

  it('MDA-009: 删除检测项目审计必须能回看已删除成本归集口径', async () => {
    const suffix = Date.now()

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-PRJ-${suffix}`, name: `删除回看项目-${suffix}`, type: 'ihc' })
    expect(project.status).toBe(201)
    const projectId = project.body.data.id

    const deleted = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleted.status).toBe(200)

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: 'projects', pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /projects/:id',
        module: 'projects',
        businessId: projectId,
        businessUrl: `/projects?keyword=${projectId}&includeDeleted=true`,
        affectedBusinessIds: [projectId],
        affectedBusinessUrls: [`/projects?keyword=${projectId}&includeDeleted=true`],
        auditEvent: expect.objectContaining({
          subjectId: projectId,
          affectedSubjectIds: [projectId],
          businessUrl: `/projects?keyword=${projectId}&includeDeleted=true`,
        }),
      }),
    ]))

    const hiddenByDefault = await request(app)
      .get('/api/v1/projects')
      .query({ keyword: projectId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(hiddenByDefault.status).toBe(200)
    expect(hiddenByDefault.body.data.list).toEqual([])

    const linked = await request(app)
      .get('/api/v1/projects')
      .query({ keyword: projectId, includeDeleted: 'true', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(linked.status).toBe(200)
    expect(linked.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: projectId,
        code: `MDA-DEL-PRJ-${suffix}`,
        name: `删除回看项目-${suffix}`,
        isDeleted: true,
      }),
    ]))

    const stats = await request(app)
      .get('/api/v1/projects/stats')
      .query({ keyword: projectId, includeDeleted: 'true' })
      .set('Authorization', `Bearer ${token}`)
    expect(stats.status).toBe(200)
    expect(stats.body.data.total).toBe(1)
  })

  it('MDA-010: 删除设备和设备类型审计必须能回看已删除折旧与设备口径', async () => {
    const suffix = Date.now()

    const equipmentType = await request(app)
      .post('/api/v1/equipment-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-DEL-EQT-${suffix}`,
        name: `删除回看设备类型-${suffix}`,
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
      })
    expect(equipmentType.status).toBe(201)
    const equipmentTypeId = equipmentType.body.data.id

    const equipment = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-DEL-EQ-${suffix}`,
        name: `删除回看设备-${suffix}`,
        typeId: equipmentTypeId,
        purchasePrice: 100000,
        residualValue: 10000,
        depreciableLifeYears: 5,
        depreciationMethod: 'straight_line',
      })
    expect(equipment.status).toBe(201)
    const equipmentId = equipment.body.data.id

    const deletedEquipment = await request(app)
      .delete(`/api/v1/equipment/${equipmentId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deletedEquipment.status).toBe(200)

    const deletedType = await request(app)
      .delete(`/api/v1/equipment-types/${equipmentTypeId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deletedType.status).toBe(200)

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: 'equipment', pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /equipment/:id',
        module: 'equipment',
        businessId: equipmentId,
        businessUrl: `/equipment?keyword=${equipmentId}&includeDeleted=true`,
        affectedBusinessIds: [equipmentId],
        affectedBusinessUrls: [`/equipment?keyword=${equipmentId}&includeDeleted=true`],
        auditEvent: expect.objectContaining({
          subjectId: equipmentId,
          affectedSubjectIds: [equipmentId],
          businessUrl: `/equipment?keyword=${equipmentId}&includeDeleted=true`,
        }),
      }),
      expect.objectContaining({
        operation: 'DELETE /equipment-types/:id',
        module: 'equipment_types',
        businessId: equipmentTypeId,
        businessUrl: `/equipment/types?keyword=${equipmentTypeId}&includeDeleted=true`,
        affectedBusinessIds: [equipmentTypeId],
        affectedBusinessUrls: [`/equipment/types?keyword=${equipmentTypeId}&includeDeleted=true`],
        auditEvent: expect.objectContaining({
          subjectId: equipmentTypeId,
          affectedSubjectIds: [equipmentTypeId],
          businessUrl: `/equipment/types?keyword=${equipmentTypeId}&includeDeleted=true`,
        }),
      }),
    ]))

    const equipmentHiddenByDefault = await request(app)
      .get('/api/v1/equipment')
      .query({ keyword: equipmentId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(equipmentHiddenByDefault.status).toBe(200)
    expect(equipmentHiddenByDefault.body.data.list).toEqual([])

    const equipmentLinked = await request(app)
      .get('/api/v1/equipment')
      .query({ keyword: equipmentId, includeDeleted: 'true', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(equipmentLinked.status).toBe(200)
    expect(equipmentLinked.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: equipmentId,
        code: `MDA-DEL-EQ-${suffix}`,
        name: `删除回看设备-${suffix}`,
        isDeleted: true,
      }),
    ]))

    const typeHiddenByDefault = await request(app)
      .get('/api/v1/equipment-types')
      .query({ keyword: equipmentTypeId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(typeHiddenByDefault.status).toBe(200)
    expect(typeHiddenByDefault.body.data.list).toEqual([])

    const typeLinked = await request(app)
      .get('/api/v1/equipment-types')
      .query({ keyword: equipmentTypeId, includeDeleted: 'true', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(typeLinked.status).toBe(200)
    expect(typeLinked.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: equipmentTypeId,
        code: `MDA-DEL-EQT-${suffix}`,
        name: `删除回看设备类型-${suffix}`,
        isDeleted: true,
      }),
    ]))

    const equipmentStats = await request(app)
      .get('/api/v1/equipment/stats')
      .query({ keyword: equipmentId, includeDeleted: 'true' })
      .set('Authorization', `Bearer ${token}`)
    expect(equipmentStats.status).toBe(200)
    expect(equipmentStats.body.data.total).toBe(1)

    const typeStats = await request(app)
      .get('/api/v1/equipment-types/stats')
      .query({ keyword: equipmentTypeId, includeDeleted: 'true' })
      .set('Authorization', `Bearer ${token}`)
    expect(typeStats.status).toBe(200)
    expect(typeStats.body.data.total).toBe(1)
  })

  it('MDA-011: 删除BOM审计必须能回看已删除成本模型口径', async () => {
    const suffix = Date.now()

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-BOM-CAT-${suffix}`, name: `删除回看BOM分类-${suffix}` })
    expect(category.status).toBe(201)
    const categoryId = category.body.data.id

    const material = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MDA-DEL-BOM-MAT-${suffix}`, name: `删除回看BOM物料-${suffix}`, unit: '支', categoryId, price: 12 })
    expect(material.status).toBe(201)
    const materialId = material.body.data.id

    const single = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-DEL-BOM-${suffix}`,
        name: `删除回看BOM-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '支' }],
      })
    expect(single.status).toBe(201)
    const singleId = single.body.data.id

    const batchA = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-DEL-BOM-A-${suffix}`,
        name: `批量删除回看BOMA-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '支' }],
      })
    expect(batchA.status).toBe(201)
    const batchB = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MDA-DEL-BOM-B-${suffix}`,
        name: `批量删除回看BOMB-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '支' }],
      })
    expect(batchB.status).toBe(201)
    const batchIds = [batchA.body.data.id, batchB.body.data.id]

    const deleted = await request(app)
      .delete(`/api/v1/boms/${singleId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleted.status).toBe(200)

    const batchDeleted = await request(app)
      .delete('/api/v1/boms/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: batchIds })
    expect(batchDeleted.status).toBe(200)

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: 'boms', pageSize: 200 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /boms/:id',
        module: 'bom',
        businessId: singleId,
        businessUrl: `/bom?keyword=${singleId}&includeDeleted=true`,
        affectedBusinessIds: [singleId],
        affectedBusinessUrls: [`/bom?keyword=${singleId}&includeDeleted=true`],
        auditEvent: expect.objectContaining({
          subjectId: singleId,
          affectedSubjectIds: [singleId],
          businessUrl: `/bom?keyword=${singleId}&includeDeleted=true`,
        }),
      }),
      expect.objectContaining({
        operation: 'DELETE /boms/batch',
        module: 'bom',
        businessId: batchIds[0],
        businessUrl: `/bom?keyword=${batchIds[0]}&includeDeleted=true`,
        affectedBusinessIds: batchIds,
        affectedBusinessUrls: batchIds.map(id => `/bom?keyword=${id}&includeDeleted=true`),
        auditEvent: expect.objectContaining({
          subjectId: batchIds[0],
          affectedSubjectIds: batchIds,
          businessUrl: `/bom?keyword=${batchIds[0]}&includeDeleted=true`,
        }),
      }),
    ]))

    const hiddenByDefault = await request(app)
      .get('/api/v1/boms')
      .query({ keyword: singleId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(hiddenByDefault.status).toBe(200)
    expect(hiddenByDefault.body.data.list).toEqual([])

    const deletedLinks = [singleId, ...batchIds]
    for (const id of deletedLinks) {
      const linked = await request(app)
        .get('/api/v1/boms')
        .query({ keyword: id, includeDeleted: 'true', page: 1, pageSize: 20 })
        .set('Authorization', `Bearer ${token}`)
      expect(linked.status).toBe(200)
      expect(linked.body.data.list).toEqual(expect.arrayContaining([
        expect.objectContaining({ id, isDeleted: true }),
      ]))
    }
  })
})
