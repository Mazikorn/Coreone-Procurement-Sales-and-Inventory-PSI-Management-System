import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'
import { calculateLaborCost, calculateEquipmentCost, calculateQCCost, calculateIndirectCost, calculateSlideCostWithFee } from '../utils/cost-calculator.js'

const router = Router()
const requireBomWrite = requireRole('admin')

/** 计算BOM标准成本并写入数据库 */
function updateBomStandardCost(db: any, bomId: string): void {
  try {
    // 1. 计算材料标准成本（基于当前加权平均价）
    const items = db.prepare(`
      SELECT bi.usage_per_sample, m.price
      FROM bom_items bi
      LEFT JOIN materials m ON bi.material_id = m.id AND m.is_deleted = 0
      WHERE bi.bom_id = ?
    `).all(bomId) as any[]

    // 获取物料的加权平均价
    const materialIds = items.map(i => i.material_id).filter(Boolean)
    let weightedPrices: Record<string, number> = {}
    if (materialIds.length > 0) {
      const placeholders = materialIds.map(() => '?').join(',')
      const batchPrices = db.prepare(`
        SELECT material_id, COALESCE(SUM(remaining * inbound_price) / NULLIF(SUM(remaining), 0), 0) as weighted_price
        FROM batches
        WHERE material_id IN (${placeholders}) AND remaining > 0 AND status = 1
        GROUP BY material_id
      `).all(...materialIds) as any[]
      for (const bp of batchPrices) {
        weightedPrices[bp.material_id] = bp.weighted_price || 0
      }
    }

    // 计算材料标准成本
    let materialStandardCost = 0
    for (const item of items) {
      const unitPrice = weightedPrices[item.material_id] || item.price || 0
      materialStandardCost += unitPrice * (item.usage_per_sample || 0)
    }

    // 2. 获取BOM类型（用于计算人工成本）
    const bom = db.prepare('SELECT type FROM boms WHERE id = ?').get(bomId) as any
    const projectType = bom?.type || 'ihc'

    // 3. 计算人工标准成本（使用默认样本数1）
    const laborStandardCost = calculateLaborCost(db, projectType, 1)

    // 4. 计算设备标准成本（使用默认样本数1）
    const equipmentStandardCost = calculateEquipmentCost(db, bomId, 1)

    // 5. 计算质控标准成本（使用默认样本数1）
    const qcStandardCost = calculateQCCost(db, bomId, 1)

    // 6. 计算间接标准成本（使用当前月份）
    const currentMonth = new Date().toISOString().slice(0, 7)
    const indirectStandardCost = calculateIndirectCost(db, currentMonth, 1)

    // 7. 计算总标准成本
    const totalStandardCost = materialStandardCost + laborStandardCost + equipmentStandardCost + qcStandardCost + indirectStandardCost

    // 8. 计算 ABC 标准切片成本和收费
    let standardSlideCost = 0
    let standardFeePerSlide = 0
    let standardMarginRate = 0
    try {
      const currentMonth = new Date().toISOString().slice(0, 7)
      const slideCostResult = calculateSlideCostWithFee(db, {
        bomId,
        slideCount: 1,
        blockCount: 1,
        month: currentMonth,
      })
      standardSlideCost = slideCostResult.totalCost
      standardFeePerSlide = slideCostResult.feeAmount
      standardMarginRate = slideCostResult.profitRate
    } catch (abcErr) {
      // ABC 计算失败不影响标准成本写入
      console.warn('ABC standard cost calculation failed for BOM:', bomId, abcErr)
    }

    // 9. 写入数据库
    db.prepare(`
      UPDATE boms SET
        standard_labor_cost = ?,
        standard_equipment_cost = ?,
        standard_indirect_cost = ?,
        standard_total_cost = ?,
        unit_cost = ?,
        standard_slide_cost = ?,
        standard_fee_per_slide = ?,
        standard_margin_rate = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      Math.round(laborStandardCost * 100) / 100,
      Math.round(equipmentStandardCost * 100) / 100,
      Math.round(indirectStandardCost * 100) / 100,
      Math.round(totalStandardCost * 100) / 100,
      Math.round(totalStandardCost * 100) / 100,
      Math.round(standardSlideCost * 100) / 100,
      Math.round(standardFeePerSlide * 100) / 100,
      Math.round(standardMarginRate * 10000) / 10000,
      bomId
    )
  } catch (err) {
    console.error('Failed to update BOM standard cost:', err)
  }
}

router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, type } = req.query
    const db = getDatabase()
    let where = 'is_deleted = 0'
    const params: any[] = []
    if (type) { where += ' AND type = ?'; params.push(type) }

    const count = (db.prepare(`SELECT COUNT(*) as total FROM boms WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`SELECT * FROM boms WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset) as any[]

    // 统计每个BOM的物料数量
    const counts = db.prepare('SELECT bom_id, COUNT(*) as cnt FROM bom_items GROUP BY bom_id').all() as any[]
    const countMap = new Map(counts.map((c: any) => [c.bom_id, c.cnt]))

    successList(res, list.map((r: any) => ({
      id: r.id, code: r.code, name: r.name, version: r.version, type: r.type,
      serviceId: r.service_id, materialCount: countMap.get(r.id) || 0, supportableSamples: r.supportable_samples,
      unitCost: r.unit_cost, status: r.status === 1 ? 'active' : 'inactive',
      feeStandardId: r.fee_standard_id, feeCategory: r.fee_category,
      standardSlideCost: r.standard_slide_cost, standardFeePerSlide: r.standard_fee_per_slide,
      standardMarginRate: r.standard_margin_rate,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const bom = db.prepare('SELECT * FROM boms WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!bom) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const items = db.prepare(`
      SELECT bi.*, m.name, m.spec, m.price, COALESCE(i.stock, 0) as stock
      FROM bom_items bi
      LEFT JOIN materials m ON bi.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN inventory i ON m.id = i.material_id
      WHERE bi.bom_id = ?
      ORDER BY bi.sort_order ASC, bi.created_at ASC
    `).all(id) as any[]

    // 动态计算理论成本：按各物料当前批次的加权平均价
    const materialIds = items.map((i: any) => i.material_id)
    const weightedPrices: Record<string, number> = {}
    if (materialIds.length > 0) {
      const placeholders = materialIds.map(() => '?').join(',')
      const batchPrices = db.prepare(`
        SELECT material_id, COALESCE(SUM(remaining * inbound_price) / NULLIF(SUM(remaining), 0), 0) as weighted_price
        FROM batches
        WHERE material_id IN (${placeholders}) AND remaining > 0 AND status = 1
        GROUP BY material_id
      `).all(...materialIds) as any[]
      for (const bp of batchPrices) {
        weightedPrices[bp.material_id] = bp.weighted_price || 0
      }
    }

    const materials = items.map((i: any) => {
      const unitPrice = weightedPrices[i.material_id] || i.price || 0
      return {
        id: i.material_id, name: i.name, spec: i.spec,
        usagePerSample: i.usage_per_sample, unit: i.unit,
        price: unitPrice, stock: i.stock, costRatio: 0,
        groupName: i.group_name || null,
      }
    })

    const totalCost = materials.reduce((sum: number, m: any) => sum + (m.price || 0) * m.usagePerSample, 0)
    materials.forEach((m: any) => { m.costRatio = totalCost > 0 ? (m.price || 0) * m.usagePerSample / totalCost : 0 })

    // 查询扩展配额
    const generalReagents = db.prepare(`
      SELECT bgr.*, m.name, m.spec
      FROM bom_general_reagents bgr
      LEFT JOIN materials m ON bgr.material_id = m.id AND m.is_deleted = 0
      WHERE bgr.bom_id = ?
      ORDER BY bgr.sort_order ASC, bgr.created_at ASC
    `).all(id) as any[]

    const generalConsumables = db.prepare(`
      SELECT bgc.*, m.name, m.spec
      FROM bom_general_consumables bgc
      LEFT JOIN materials m ON bgc.material_id = m.id AND m.is_deleted = 0
      WHERE bgc.bom_id = ?
      ORDER BY bgc.sort_order ASC, bgc.created_at ASC
    `).all(id) as any[]

    const qualityControls = db.prepare(`
      SELECT bqc.*, m.name, m.spec
      FROM bom_quality_controls bqc
      LEFT JOIN materials m ON bqc.material_id = m.id AND m.is_deleted = 0
      WHERE bqc.bom_id = ?
      ORDER BY bqc.sort_order ASC, bqc.created_at ASC
    `).all(id) as any[]

    const equipmentTemplates = db.prepare(`
      SELECT bet.*,
        COALESCE(et.name, e.name) as equipment_name,
        COALESCE(e.model, '') as model,
        et.name as type_name,
        et.code as type_code
      FROM bom_equipment_templates bet
      LEFT JOIN equipment_types et ON bet.equipment_type_id = et.id
      LEFT JOIN equipment e ON bet.equipment_id = e.id
      WHERE bet.bom_id = ?
      ORDER BY bet.sort_order ASC, bet.created_at ASC
    `).all(id) as any[]

    success(res, {
      id: bom.id, code: bom.code, name: bom.name, version: bom.version,
      type: bom.type, serviceId: bom.service_id, supportableSamples: bom.supportable_samples,
      unitCost: totalCost, status: bom.status === 1 ? 'active' : 'inactive',
      feeStandardId: bom.fee_standard_id, feeCategory: bom.fee_category,
      standardSlideCost: bom.standard_slide_cost, standardFeePerSlide: bom.standard_fee_per_slide,
      standardMarginRate: bom.standard_margin_rate,
      materials,
      generalReagents: generalReagents.map((r: any) => ({
        id: r.id, materialId: r.material_id, name: r.name, spec: r.spec,
        usagePerSample: r.usage_per_sample, unit: r.unit,
        allocationType: r.allocation_type,
      })),
      generalConsumables: generalConsumables.map((c: any) => ({
        id: c.id, materialId: c.material_id, name: c.name, spec: c.spec,
        usagePerSample: c.usage_per_sample, unit: c.unit,
        allocationType: c.allocation_type,
      })),
      qualityControls: qualityControls.map((q: any) => ({
        id: q.id, materialId: q.material_id, name: q.name, spec: q.spec,
        usagePerBatch: q.usage_per_batch, unit: q.unit,
        coversSamples: q.covers_samples, allocationType: q.allocation_type,
      })),
      equipmentTemplates: equipmentTemplates.map((e: any) => ({
        id: e.id,
        equipmentId: e.equipment_id,
        equipmentTypeId: e.equipment_type_id,
        equipmentName: e.equipment_name,
        equipmentTypeName: e.type_name || null,
        model: e.model,
        usageMinutes: e.usage_minutes,
      })),
      versionHistory: [{ version: bom.version, updatedAt: bom.updated_at, changeLog: 'Current' }],
    })
  } catch (err: any) { error(res, err.message) }
})

router.post('/', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const { code, name, type, serviceId, description, supportableSamples, feeStandardId, feeCategory, materials, generalReagents, generalConsumables, qualityControls, equipmentTemplates } = req.body
    if (!code || !name || !type) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    if (code.length > 100) {
      error(res, '编码长度不能超过100个字符', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const id = uuidv4()
    const version = 'v1.0'

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('INSERT INTO boms (id, code, name, version, type, service_id, description, supportable_samples, fee_standard_id, fee_category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .run(id, code, name, version, type, serviceId || null, description || null, supportableSamples || null, feeStandardId || null, feeCategory || null)

      for (const m of materials) {
        const itemId = uuidv4()
        const usage = Number(m.usagePerSample)
        if (isNaN(usage) || usage < 0) {
          db.exec('ROLLBACK')
          error(res, 'Invalid usage_per_sample', 'INVALID_PARAMETER', 400); return
        }
        // 验证物料存在性
        const material = db.prepare('SELECT id FROM materials WHERE id = ? AND is_deleted = 0').get(m.materialId) as any
        if (!material) {
          db.exec('ROLLBACK')
          error(res, `Material not found: ${m.materialId}`, 'NOT_FOUND', 404); return
        }
        db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, group_name) VALUES (?, ?, ?, ?, ?, ?)')
          .run(itemId, id, m.materialId, usage, m.unit, m.groupName || null)
      }

      // 保存通用试剂配额
      if (Array.isArray(generalReagents)) {
        for (const r of generalReagents) {
          db.prepare('INSERT INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, r.materialId, Number(r.usagePerSample) || 0, r.unit || 'ml', r.allocationType || 'per_slide', r.sortOrder || 0)
        }
      }

      // 保存通用耗材配额
      if (Array.isArray(generalConsumables)) {
        for (const c of generalConsumables) {
          db.prepare('INSERT INTO bom_general_consumables (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, c.materialId, Number(c.usagePerSample) || 0, c.unit || '个', c.allocationType || 'per_slide', c.sortOrder || 0)
        }
      }

      // 保存质控品配额
      if (Array.isArray(qualityControls)) {
        for (const q of qualityControls) {
          db.prepare('INSERT INTO bom_quality_controls (id, bom_id, material_id, usage_per_batch, unit, covers_samples, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, q.materialId, Number(q.usagePerBatch) || 0, q.unit || '片', Number(q.coversSamples) || 1, q.allocationType || 'per_batch', q.sortOrder || 0)
        }
      }

      // 保存设备模板（支持 equipmentTypeId 或 equipmentId）
      if (Array.isArray(equipmentTemplates)) {
        for (const e of equipmentTemplates) {
          db.prepare('INSERT INTO bom_equipment_templates (id, bom_id, equipment_id, equipment_type_id, usage_minutes, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, e.equipmentId || null, e.equipmentTypeId || null, Number(e.usageMinutes) || 0, e.sortOrder || 0)
        }
      }

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    // 计算并写入标准成本（在事务提交后独立执行，避免事务内失败导致事务状态损坏）
    try {
      updateBomStandardCost(db, id)
    } catch (costErr) {
      // 成本计算失败不影响BOM创建，仅记录日志
      console.error('Failed to update BOM standard cost:', costErr)
    }

    success(res, { id }, 'Created', 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT') { error(res, 'Code version exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

router.put('/:id', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const { id } = req.params
    const { name, description, supportableSamples, feeStandardId, feeCategory, materials, generalReagents, generalConsumables, qualityControls, equipmentTemplates } = req.body
    const db = getDatabase()

    const existing = db.prepare('SELECT * FROM boms WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const versionParts = existing.version.replace('v', '').split('.').map(Number)
    versionParts[1] = (versionParts[1] || 0) + 1
    const newVersion = `v${versionParts[0]}.${versionParts[1]}`

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE boms SET name = ?, version = ?, description = ?, supportable_samples = ?, fee_standard_id = ?, fee_category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name || existing.name, newVersion, description || existing.description, supportableSamples || existing.supportable_samples, feeStandardId !== undefined ? feeStandardId : existing.fee_standard_id, feeCategory !== undefined ? feeCategory : existing.fee_category, id)

      if (Array.isArray(materials)) {
        db.prepare('DELETE FROM bom_items WHERE bom_id = ?').run(id)
        for (const m of materials) {
          const itemId = uuidv4()
          const usage = Number(m.usagePerSample)
          if (isNaN(usage) || usage < 0) {
            db.exec('ROLLBACK')
            error(res, 'Invalid usage_per_sample', 'INVALID_PARAMETER', 400); return
          }
          // 验证物料存在性
          const material = db.prepare('SELECT id FROM materials WHERE id = ? AND is_deleted = 0').get(m.materialId) as any
          if (!material) {
            db.exec('ROLLBACK')
            error(res, `Material not found: ${m.materialId}`, 'NOT_FOUND', 404); return
          }
          db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, group_name) VALUES (?, ?, ?, ?, ?, ?)')
            .run(itemId, id, m.materialId, usage, m.unit, m.groupName || null)
        }
      }

      // 更新通用试剂配额
      if (Array.isArray(generalReagents)) {
        db.prepare('DELETE FROM bom_general_reagents WHERE bom_id = ?').run(id)
        for (const r of generalReagents) {
          db.prepare('INSERT INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, r.materialId, Number(r.usagePerSample) || 0, r.unit || 'ml', r.allocationType || 'per_slide', r.sortOrder || 0)
        }
      }

      // 更新通用耗材配额
      if (Array.isArray(generalConsumables)) {
        db.prepare('DELETE FROM bom_general_consumables WHERE bom_id = ?').run(id)
        for (const c of generalConsumables) {
          db.prepare('INSERT INTO bom_general_consumables (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, c.materialId, Number(c.usagePerSample) || 0, c.unit || '个', c.allocationType || 'per_slide', c.sortOrder || 0)
        }
      }

      // 更新质控品配额
      if (Array.isArray(qualityControls)) {
        db.prepare('DELETE FROM bom_quality_controls WHERE bom_id = ?').run(id)
        for (const q of qualityControls) {
          db.prepare('INSERT INTO bom_quality_controls (id, bom_id, material_id, usage_per_batch, unit, covers_samples, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, q.materialId, Number(q.usagePerBatch) || 0, q.unit || '片', Number(q.coversSamples) || 1, q.allocationType || 'per_batch', q.sortOrder || 0)
        }
      }

      // 更新设备模板（支持 equipmentTypeId 或 equipmentId）
      if (Array.isArray(equipmentTemplates)) {
        db.prepare('DELETE FROM bom_equipment_templates WHERE bom_id = ?').run(id)
        for (const e of equipmentTemplates) {
          db.prepare('INSERT INTO bom_equipment_templates (id, bom_id, equipment_id, equipment_type_id, usage_minutes, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, e.equipmentId || null, e.equipmentTypeId || null, Number(e.usageMinutes) || 0, e.sortOrder || 0)
        }
      }

      // 计算并写入标准成本（在事务内）
      updateBomStandardCost(db, id)

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    success(res, { id, version: newVersion }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

// ===== Phase 3.3: BOM 成本预览 =====
router.get('/:id/cost-preview', (req, res) => {
  try {
    const { id } = req.params
    const { costMode = 'equipment_average' } = req.query
    const db = getDatabase()

    const bom = db.prepare('SELECT * FROM boms WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!bom) { error(res, 'BOM不存在', 'NOT_FOUND', 404); return }

    // 1. 材料成本（加权平均价）
    const items = db.prepare(`
      SELECT bi.usage_per_sample, bi.material_id, m.name, m.price
      FROM bom_items bi
      LEFT JOIN materials m ON bi.material_id = m.id AND m.is_deleted = 0
      WHERE bi.bom_id = ?
    `).all(id) as any[]

    const materialIds = items.map((i: any) => i.material_id).filter(Boolean)
    let weightedPrices: Record<string, number> = {}
    if (materialIds.length > 0) {
      const placeholders = materialIds.map(() => '?').join(',')
      const batchPrices = db.prepare(`
        SELECT material_id, COALESCE(SUM(remaining * inbound_price) / NULLIF(SUM(remaining), 0), 0) as weighted_price
        FROM batches WHERE material_id IN (${placeholders}) AND remaining > 0 AND status = 1
        GROUP BY material_id
      `).all(...materialIds) as any[]
      for (const bp of batchPrices) { weightedPrices[bp.material_id] = bp.weighted_price || 0 }
    }

    let materialCost = 0
    const materialItems: Array<{ name: string; amount: number }> = []
    for (const item of items) {
      const unitPrice = weightedPrices[item.material_id] || item.price || 0
      const amount = unitPrice * (item.usage_per_sample || 0)
      materialCost += amount
      materialItems.push({ name: item.name, amount: Math.round(amount * 100) / 100 })
    }

    // 2. 人工成本
    const projectType = bom.type || 'ihc'
    const laborCost = calculateLaborCost(db, projectType, 1)

    // 3. 设备成本
    const equipmentCost = calculateEquipmentCost(db, id, 1)

    // 4. 间接成本
    const currentMonth = new Date().toISOString().slice(0, 7)
    const indirectCost = calculateIndirectCost(db, currentMonth, 1)

    const totalCost = materialCost + laborCost + equipmentCost + indirectCost

    success(res, {
      bomId: id,
      bomName: bom.name,
      totalCost: Math.round(totalCost * 100) / 100,
      breakdown: {
        materialCost: {
          amount: Math.round(materialCost * 100) / 100,
          percentage: totalCost > 0 ? Math.round(materialCost / totalCost * 10000) / 100 : 0,
          items: materialItems,
        },
        laborCost: {
          amount: laborCost,
          percentage: totalCost > 0 ? Math.round(laborCost / totalCost * 10000) / 100 : 0,
        },
        equipmentCost: {
          amount: equipmentCost,
          percentage: totalCost > 0 ? Math.round(equipmentCost / totalCost * 10000) / 100 : 0,
          priceSource: costMode as string,
        },
        indirectCost: {
          amount: indirectCost,
          percentage: totalCost > 0 ? Math.round(indirectCost / totalCost * 10000) / 100 : 0,
        },
      },
      costMode: costMode as string,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM boms WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    db.prepare('UPDATE boms SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
