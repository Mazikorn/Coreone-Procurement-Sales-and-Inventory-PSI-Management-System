import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { allocateBatches, allocateGroupBatches, BatchAllocation, GroupBatchAllocation } from '../utils/allocation.js'

const router = Router()

import { checkStockAlerts } from '../utils/alertChecker.js'
import { generateNo } from '../utils/generateNo.js'
import { calculateSlideCostWithFee } from '../utils/cost-calculator.js'
import { errorMessage, recordCostException } from '../utils/cost-exceptions.js'

function generateOutboundNo(): string {
  return generateNo('OB')
}

router.get('/', (req, res) => {
  try {
    let { page = 1, pageSize = 20, projectId, status, keyword, materialId, type, startDate, endDate } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(100, Number(pageSize) || 20))
    const db = getDatabase()
    let where = 'r.is_deleted = 0'
    const params: any[] = []
    if (projectId) { where += ' AND r.project_id = ?'; params.push(projectId) }
    if (status) { where += ' AND r.status = ?'; params.push(status) }
    if (type) { where += ' AND r.type = ?'; params.push(type) }
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }
    if (keyword) {
      where += ` AND (r.outbound_no LIKE ? OR EXISTS (
        SELECT 1 FROM outbound_items oi JOIN materials m ON oi.material_id = m.id
        WHERE oi.outbound_id = r.id AND m.is_deleted = 0 AND m.name LIKE ?
      ))`
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (materialId) {
      where += ` AND EXISTS (
        SELECT 1 FROM outbound_items oi WHERE oi.outbound_id = r.id AND oi.material_id = ?
      )`
      params.push(materialId)
    }

    const count = (db.prepare(`SELECT COUNT(*) as total FROM outbound_records r WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)

    const records = db.prepare(`
      SELECT r.*, p.name as project_name
      FROM outbound_records r
      LEFT JOIN projects p ON r.project_id = p.id AND p.is_deleted = 0
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), offset) as any[]

    // 批量查询 items，避免 N+1
    const recordIds = records.map((r: any) => r.id)
    const itemsMap = new Map<string, any[]>()
    if (recordIds.length > 0) {
      const placeholders = recordIds.map(() => '?').join(',')
      const allItems = db.prepare(
        `SELECT oi.*, m.name as material_name FROM outbound_items oi
         LEFT JOIN materials m ON oi.material_id = m.id AND m.is_deleted = 0
         WHERE oi.outbound_id IN (${placeholders})`
      ).all(...recordIds) as any[]
      for (const item of allItems) {
        if (!itemsMap.has(item.outbound_id)) itemsMap.set(item.outbound_id, [])
        itemsMap.get(item.outbound_id)!.push(item)
      }
    }

    const result = records.map((r: any) => {
      const items = itemsMap.get(r.id) || []
      return {
        id: r.id, outboundNo: r.outbound_no, type: r.type, projectId: r.project_id,
        projectName: r.project_name, sampleCount: r.sample_count,
        items: items.map((i: any) => ({
          id: i.id, materialId: i.material_id, materialName: i.material_name,
          batchId: i.batch_id, batchNo: i.batch_no, quantity: i.quantity, unit: i.unit,
          unitCost: i.unit_cost, totalCost: i.total_cost,
        })),
        totalCost: r.total_cost, operator: r.operator, status: r.status,
        remark: r.remark, createdAt: r.created_at,
        abcTotalCost: r.abc_total_cost || 0, abcActivityCost: r.abc_activity_cost || 0,
        feeAmount: r.fee_amount || 0, profit: r.profit || 0,
      }
    })

    successList(res, result, Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const total = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0").get() as any)?.c || 0
    const completed = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND status = 'completed'").get() as any)?.c || 0
    const pending = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND status = 'pending'").get() as any)?.c || 0
    const cancelled = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND status = 'cancelled'").get() as any)?.c || 0
    const totalCost = (db.prepare("SELECT COALESCE(SUM(total_cost),0) as c FROM outbound_records WHERE is_deleted = 0 AND status = 'completed'").get() as any)?.c || 0
    success(res, { total, completed, pending, cancelled, totalCost })
  } catch (err: any) { error(res, err.message) }
})

router.post('/', requireWriteAccess, (req, res) => {
  try {
    const { type, projectId, items, remark } = req.body
    if (!type || !Array.isArray(items) || items.length === 0) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const outboundNo = generateOutboundNo()
    const id = uuidv4()
    const operator = (req as any).user?.username || 'system'
    const sc = Number(req.body.sampleCount) || 1

    const materialUnits = db.prepare('SELECT id, unit FROM materials WHERE id IN (' + items.map(() => '?').join(',') + ')').all(...items.map((i: any) => i.materialId)) as any[]
    const unitMap = new Map(materialUnits.map((m: any) => [m.id, m.unit]))

    let totalCost = 0

    db.exec('BEGIN IMMEDIATE')
    try {
      const itemAllocations: Array<{
        materialId: string
        quantity: number
        usage: string
        receiver: string | null
        allocations: BatchAllocation[]
        itemTotalCost: number
      }> = []

      for (const item of items) {
        const { materialId, quantity } = item
        if (!materialId || quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) <= 0) {
          db.exec('ROLLBACK')
          error(res, 'Invalid quantity', 'INVALID_PARAMETER', 400); return
        }
        const qty = Number(quantity)
        const allocations = allocateBatches(db, materialId, qty)
        const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        totalCost += itemTotalCost

        itemAllocations.push({
          materialId,
          quantity: qty,
          usage: item.usage || 'self',
          receiver: item.receiver || null,
          allocations,
          itemTotalCost,
        })
      }

      db.prepare(`
        INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)
      `).run(id, outboundNo, type, projectId || null, totalCost, sc, operator, remark || null)

      for (const ia of itemAllocations) {
        for (const alloc of ia.allocations) {
          const itemId = uuidv4()
          const subtotal = alloc.quantity * alloc.unitCost

          // 保存 beforeStock（在 UPDATE 之前）
          const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(ia.materialId) as any)?.stock || 0

          db.prepare(`
            INSERT INTO outbound_items (id, outbound_id, material_id, batch_id, batch_no, quantity, unit, unit_cost, total_cost, usage, receiver)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(itemId, id, ia.materialId, alloc.batchId, alloc.batchNo, alloc.quantity, unitMap.get(ia.materialId) || 'pcs', alloc.unitCost, subtotal, ia.usage, ia.receiver)

          db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?').run(alloc.quantity, ia.materialId)

          if (alloc.batchId) {
            db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id = ?').run(alloc.quantity, alloc.batchId)
            const batchRemaining = (db.prepare('SELECT remaining FROM batches WHERE id = ?').get(alloc.batchId) as any)?.remaining
            if (batchRemaining <= 0) {
              db.prepare('UPDATE batches SET status = 0 WHERE id = ?').run(alloc.batchId)
            }
          }

          if (ia.usage === 'self' && alloc.batchId) {
            const mat = db.prepare('SELECT name, spec FROM materials WHERE id = ? AND is_deleted = 0').get(ia.materialId) as any
            const trkId = `TRK-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            const today = new Date().toISOString().split('T')[0]
            db.prepare(`
              INSERT INTO batch_usage_tracking
              (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, days_used, expected_days, progress, usage, receiver, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 'in-use', datetime('now'), datetime('now'))
            `).run(trkId, ia.materialId, mat?.name || '', alloc.batchNo || '', mat?.spec || '', alloc.quantity, alloc.quantity, unitMap.get(ia.materialId) || 'pcs', today, 30, 'self', null)
          }

          const logId = uuidv4()
          const afterStock = beforeStock - alloc.quantity
          db.prepare(`
            INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
            VALUES (?, 'outbound', ?, ?, ?, ?, ?, 'outbound', ?)
          `).run(logId, ia.materialId, -alloc.quantity, beforeStock, afterStock, id, operator)
        }
      }

      db.exec('COMMIT')

      // 自动检查库存预警（出库后库存可能不足）
      const outboundMaterialIds = itemAllocations.map((ia: any) => ia.materialId)
      checkStockAlerts(db, [...new Set(outboundMaterialIds)])
    } catch (err: any) {
      db.exec('ROLLBACK')
      if (err.message && err.message.includes('批次库存不足')) {
        error(res, err.message, 'STOCK_INSUFFICIENT', 422); return
      }
      throw err
    }

    success(res, { id, outboundNo, type, projectId, totalCost, status: 'completed', createdAt: new Date().toISOString() }, 'Outbound created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.post('/bom', (req, res) => {
  try {
    const { projectId, bomId, sampleCount, remark } = req.body
    if (!bomId || sampleCount === undefined || sampleCount === null) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    const sc = Number(sampleCount)
    if (isNaN(sc) || sc <= 0) {
      error(res, 'Invalid sampleCount', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const outboundNo = generateOutboundNo()
    const id = uuidv4()
    const operator = (req as any).user?.username || 'system'

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND is_deleted = 0').get(projectId) as any
    if (!project) { error(res, 'Project not found', 'NOT_FOUND', 404); return }

    const bomItems = db.prepare(`
      SELECT bi.*, m.name, m.spec FROM bom_items bi
      JOIN materials m ON bi.material_id = m.id AND m.is_deleted = 0
      WHERE bi.bom_id = ?
    `).all(bomId) as any[]
    if (!bomItems || bomItems.length === 0) {
      error(res, 'BOM is empty', 'INVALID_PARAMETER', 400); return
    }

    // 按 group_name 分组（无 group_name 的按 material_id 单独成组）
    const groupMap = new Map<string, any[]>()
    for (const item of bomItems) {
      const groupKey = item.group_name || `_single_${item.material_id}`
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
      groupMap.get(groupKey)!.push(item)
    }

    const materialUnits = db.prepare('SELECT id, unit FROM materials WHERE id IN (' + bomItems.map(() => '?').join(',') + ')').all(...bomItems.map((i: any) => i.material_id)) as any[]
    const unitMap = new Map(materialUnits.map((m: any) => [m.id, m.unit]))

    let totalCost = 0
    const skippedItems: Array<{ materialId: string; materialName: string; reason: string }> = []

    db.exec('BEGIN IMMEDIATE')
    try {
      const itemAllocations: Array<{
        materialId: string
        quantity: number
        allocations: GroupBatchAllocation[]
        itemTotalCost: number
      }> = []

      for (const [, groupItems] of groupMap) {
        const firstItem = groupItems[0]
        const quantity = firstItem.usage_per_sample * sc
        if (quantity <= 0) continue

        let allocations: GroupBatchAllocation[]
        if (groupItems.length === 1) {
          // 单物料（无品牌池），使用原有逻辑
          allocations = allocateBatches(db, firstItem.material_id, quantity).map(a => ({
            ...a,
            materialId: firstItem.material_id,
          }))
        } else {
          // 品牌池：在组内多物料间按 FEFO 分配
          allocations = allocateGroupBatches(db, groupItems, quantity)
        }

        const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        totalCost += itemTotalCost

        itemAllocations.push({
          materialId: firstItem.material_id,
          quantity,
          allocations,
          itemTotalCost,
        })
      }

      // 处理扩展配额：通用试剂
      const generalReagents = db.prepare(`
        SELECT gr.*, m.name, m.spec FROM bom_general_reagents gr
        JOIN materials m ON gr.material_id = m.id AND m.is_deleted = 0
        WHERE gr.bom_id = ?
      `).all(bomId) as any[]
      for (const gr of generalReagents) {
        const quantity = (gr.usage_per_sample || 0) * sc
        if (quantity <= 0) continue
        try {
          const allocations = allocateBatches(db, gr.material_id, quantity).map(a => ({
            ...a,
            materialId: gr.material_id,
          }))
          const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
          totalCost += itemTotalCost
          itemAllocations.push({ materialId: gr.material_id, quantity, allocations, itemTotalCost })
        } catch (e: any) {
          console.warn(`[BOM出库] 通用试剂 ${gr.material_id} 库存不足，跳过: ${e.message}`)
          skippedItems.push({ materialId: gr.material_id, materialName: gr.name || gr.material_id, reason: e.message })
        }
      }

      // 处理扩展配额：通用耗材
      const generalConsumables = db.prepare(`
        SELECT gc.*, m.name, m.spec FROM bom_general_consumables gc
        JOIN materials m ON gc.material_id = m.id AND m.is_deleted = 0
        WHERE gc.bom_id = ?
      `).all(bomId) as any[]
      for (const gc of generalConsumables) {
        const quantity = (gc.usage_per_sample || 0) * sc
        if (quantity <= 0) continue
        try {
          const allocations = allocateBatches(db, gc.material_id, quantity).map(a => ({
            ...a,
            materialId: gc.material_id,
          }))
          const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
          totalCost += itemTotalCost
          itemAllocations.push({ materialId: gc.material_id, quantity, allocations, itemTotalCost })
        } catch (e: any) {
          console.warn(`[BOM出库] 通用耗材 ${gc.material_id} 库存不足，跳过: ${e.message}`)
          skippedItems.push({ materialId: gc.material_id, materialName: gc.name || gc.material_id, reason: e.message })
        }
      }

      // 处理扩展配额：质控品（按批次覆盖样本数计算）
      const qualityControls = db.prepare(`
        SELECT qc.*, m.name, m.spec FROM bom_quality_controls qc
        JOIN materials m ON qc.material_id = m.id AND m.is_deleted = 0
        WHERE qc.bom_id = ?
      `).all(bomId) as any[]
      for (const qc of qualityControls) {
        const coverage = qc.covers_samples || 1
        const usagePerBatch = qc.usage_per_batch || 1
        const batchesNeeded = Math.ceil(sc / coverage)
        const quantity = batchesNeeded * usagePerBatch
        if (quantity <= 0) continue
        try {
          const allocations = allocateBatches(db, qc.material_id, quantity).map(a => ({
            ...a,
            materialId: qc.material_id,
          }))
          const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
          totalCost += itemTotalCost
          itemAllocations.push({ materialId: qc.material_id, quantity, allocations, itemTotalCost })
        } catch (e: any) {
          console.warn(`[BOM出库] 质控品 ${qc.material_id} 库存不足，跳过: ${e.message}`)
          skippedItems.push({ materialId: qc.material_id, materialName: qc.name || qc.material_id, reason: e.message })
        }
      }

      db.prepare(`
        INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)
      `).run(id, outboundNo, 'bom', projectId || null, totalCost, sc, operator, remark || null)

      for (const ia of itemAllocations) {
        for (const alloc of ia.allocations) {
          const itemId = uuidv4()
          const subtotal = alloc.quantity * alloc.unitCost

          // 保存 beforeStock（在 UPDATE 之前）
          const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(alloc.materialId) as any)?.stock || 0

          db.prepare(`
            INSERT INTO outbound_items (id, outbound_id, material_id, batch_id, batch_no, quantity, unit, unit_cost, total_cost, usage, receiver)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(itemId, id, alloc.materialId, alloc.batchId, alloc.batchNo, alloc.quantity, unitMap.get(alloc.materialId) || 'pcs', alloc.unitCost, subtotal, 'self', null)

          db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?').run(alloc.quantity, alloc.materialId)

          if (alloc.batchId) {
            db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id = ?').run(alloc.quantity, alloc.batchId)
            const batchRemaining = (db.prepare('SELECT remaining FROM batches WHERE id = ?').get(alloc.batchId) as any)?.remaining
            if (batchRemaining <= 0) {
              db.prepare('UPDATE batches SET status = 0 WHERE id = ?').run(alloc.batchId)
            }
          }

          if (alloc.batchId) {
            const mat = db.prepare('SELECT name, spec FROM materials WHERE id = ? AND is_deleted = 0').get(alloc.materialId) as any
            const trkId = `TRK-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            const today = new Date().toISOString().split('T')[0]
            db.prepare(`
              INSERT INTO batch_usage_tracking
              (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, days_used, expected_days, progress, usage, receiver, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 'in-use', datetime('now'), datetime('now'))
            `).run(trkId, alloc.materialId, mat?.name || '', alloc.batchNo || '', mat?.spec || '', alloc.quantity, alloc.quantity, unitMap.get(alloc.materialId) || 'pcs', today, 30, 'self', null)
          }

          const logId = uuidv4()
          const afterStock = beforeStock - alloc.quantity
          db.prepare(`
            INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
            VALUES (?, 'outbound', ?, ?, ?, ?, ?, 'outbound', ?)
          `).run(logId, alloc.materialId, -alloc.quantity, beforeStock, afterStock, id, operator)
        }
      }

      const costMonth = new Date().toISOString().slice(0, 7)
      if (skippedItems.length > 0) {
        recordCostException(db, {
          sourceModule: 'outbound',
          sourceType: 'bom_outbound',
          sourceId: id,
          projectId: projectId || null,
          bomId,
          outboundId: id,
          yearMonth: costMonth,
          exceptionType: 'bom_material_skipped',
          severity: 'warning',
          message: 'BOM出库跳过了扩展物料，出库成本可能低估',
          details: {
            outboundNo,
            sampleCount: sc,
            skippedItems,
          },
        })
      }

      // ===== ABC 成本计算（失败不阻断出库）=====
      try {
        const slideCostResult = calculateSlideCostWithFee(db, {
          bomId,
          slideCount: sc,
          blockCount: 1,
          month: costMonth,
          materialCost: totalCost,
        })

        // 写入 outbound_abc_details
        const abcDetailId = uuidv4()
        db.prepare(`
          INSERT INTO outbound_abc_details
          (id, outbound_id, bom_id, project_id, sample_count, slide_count, block_count,
           material_cost, activity_cost, total_cost, cost_per_slide,
           fee_category, fee_standard_id, fee_amount, profit, profit_rate,
           activity_details, cost_month)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          abcDetailId, id, bomId, projectId || null,
          sc, sc, 1,
          slideCostResult.materialCost, slideCostResult.totalActivityCost, slideCostResult.totalCost,
          sc > 0 ? slideCostResult.totalCost / sc : 0,
          slideCostResult.feeCategory, slideCostResult.feeStandardId,
          slideCostResult.feeAmount, slideCostResult.profit, slideCostResult.profitRate,
          JSON.stringify(slideCostResult.activityCosts),
          costMonth
        )

        // 更新 outbound_records 的 ABC 字段
        db.prepare(`
          UPDATE outbound_records SET
            abc_total_cost = ?, abc_activity_cost = ?, fee_amount = ?, profit = ?
          WHERE id = ?
        `).run(slideCostResult.totalCost, slideCostResult.totalActivityCost, slideCostResult.feeAmount, slideCostResult.profit, id)
      } catch (abcErr) {
        const message = errorMessage(abcErr)
        console.error('ABC calculation failed, outbound continues:', abcErr)
        recordCostException(db, {
          sourceModule: 'abc',
          sourceType: 'bom_outbound',
          sourceId: id,
          projectId: projectId || null,
          bomId,
          outboundId: id,
          yearMonth: costMonth,
          exceptionType: 'abc_calculation_failed',
          severity: 'error',
          message: 'BOM出库已完成，但ABC成本计算失败',
          details: {
            outboundNo,
            sampleCount: sc,
            materialCost: totalCost,
            error: message,
          },
        })
      }

      db.exec('COMMIT')

      // 自动检查库存预警（BOM出库后库存可能不足）
      const bomMaterialIds = itemAllocations.map((ia: any) => ia.materialId)
      checkStockAlerts(db, [...new Set(bomMaterialIds)])
    } catch (err: any) {
      db.exec('ROLLBACK')
      if (err.message && err.message.includes('批次库存不足')) {
        error(res, err.message, 'STOCK_INSUFFICIENT', 422); return
      }
      throw err
    }

    success(res, { id, outboundNo, type: 'bom', projectId, totalCost, skippedItems, status: 'completed', createdAt: new Date().toISOString() }, 'BOM outbound created', 201)
  } catch (err: any) { error(res, err.message) }
})

// 写入权限检查
function requireWriteAccess(req: any, res: any, next: any) {
  const role = req.user?.role
  if (role === 'admin' || role === 'warehouse_manager') {
    next()
    return
  }
  error(res, 'Forbidden: insufficient permissions', 'FORBIDDEN', 403)
}

router.put('/:id', requireWriteAccess, (req, res) => {
  try {
    const { id } = req.params
    const { type, projectId, items: newItems, remark } = req.body
    if (!Array.isArray(newItems) || newItems.length === 0) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const record = db.prepare('SELECT * FROM outbound_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const oldItems = db.prepare('SELECT * FROM outbound_items WHERE outbound_id = ?').all(id) as any[]
    const materialUnits = db.prepare('SELECT id, unit FROM materials WHERE id IN (' + newItems.map(() => '?').join(',') + ')').all(...newItems.map((i: any) => i.materialId)) as any[]
    const unitMap = new Map(materialUnits.map((m: any) => [m.id, m.unit]))

    let newTotalCost = 0

    db.exec('BEGIN IMMEDIATE')
    try {
      // 1. 回退旧 items 库存
      for (const item of oldItems) {
        db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(item.quantity, item.material_id)
        if (item.batch_id) {
          db.prepare('UPDATE batches SET remaining = remaining + ?, status = 1 WHERE id = ?').run(item.quantity, item.batch_id)
        }
        if (item.batch_no) {
          db.prepare("DELETE FROM batch_usage_tracking WHERE material_id = ? AND batch = ? AND status = 'in-use'").run(item.material_id, item.batch_no)
        }
      }

      // 2. 删除旧 items
      db.prepare('DELETE FROM outbound_items WHERE outbound_id = ?').run(id)

      // 3. 重新分配批次并扣减
      const processedItems: Array<{
        materialId: string
        quantity: number
        usage: string
        receiver: string | null
        allocations: BatchAllocation[]
      }> = []

      for (const item of newItems) {
        const { materialId, quantity } = item
        if (!materialId || quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) <= 0) {
          db.exec('ROLLBACK')
          error(res, 'Invalid quantity', 'INVALID_PARAMETER', 400); return
        }
        const qty = Number(quantity)
        const allocations = allocateBatches(db, materialId, qty)
        const itemCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        newTotalCost += itemCost

        processedItems.push({
          materialId,
          quantity: qty,
          usage: item.usage || 'self',
          receiver: item.receiver || null,
          allocations,
        })
      }

      // 4. 更新记录
      db.prepare('UPDATE outbound_records SET type = ?, project_id = ?, total_cost = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(type || 'project', projectId || null, newTotalCost, remark || null, id)

      // 5. 创建新 items 并扣减库存
      for (const pi of processedItems) {
        for (const alloc of pi.allocations) {
          const itemId = uuidv4()
          const subtotal = alloc.quantity * alloc.unitCost

          // 保存 beforeStock（在 UPDATE 之前）
          const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(pi.materialId) as any)?.stock || 0

          db.prepare(`
            INSERT INTO outbound_items (id, outbound_id, material_id, batch_id, batch_no, quantity, unit, unit_cost, total_cost, usage, receiver)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(itemId, id, pi.materialId, alloc.batchId, alloc.batchNo, alloc.quantity, unitMap.get(pi.materialId) || 'pcs', alloc.unitCost, subtotal, pi.usage, pi.receiver)

          db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?').run(alloc.quantity, pi.materialId)
          if (alloc.batchId) {
            db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id = ?').run(alloc.quantity, alloc.batchId)
            const remaining = (db.prepare('SELECT remaining FROM batches WHERE id = ?').get(alloc.batchId) as any)?.remaining
            if (remaining <= 0) {
              db.prepare('UPDATE batches SET status = 0 WHERE id = ?').run(alloc.batchId)
            }
          }

          if (pi.usage === 'self' && alloc.batchId) {
            const mat = db.prepare('SELECT name, spec FROM materials WHERE id = ? AND is_deleted = 0').get(pi.materialId) as any
            const trkId = `TRK-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            const today = new Date().toISOString().split('T')[0]
            db.prepare(`
              INSERT INTO batch_usage_tracking
              (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, days_used, expected_days, progress, usage, receiver, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 'in-use', datetime('now'), datetime('now'))
            `).run(trkId, pi.materialId, mat?.name || '', alloc.batchNo || '', mat?.spec || '', alloc.quantity, alloc.quantity, unitMap.get(pi.materialId) || 'pcs', today, 30, 'self', null)
          }

          const logId = uuidv4()
          const afterStock = beforeStock - alloc.quantity
          db.prepare(`
            INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
            VALUES (?, 'outbound', ?, ?, ?, ?, ?, 'outbound', ?)
          `).run(logId, pi.materialId, -alloc.quantity, beforeStock, afterStock, id, (req as any).user?.username || 'system')
        }
      }

      db.exec('COMMIT')
    } catch (err: any) {
      db.exec('ROLLBACK')
      if (err.message && err.message.includes('批次库存不足')) {
        error(res, err.message, 'STOCK_INSUFFICIENT', 422); return
      }
      throw err
    }

    success(res, { id, totalCost: newTotalCost }, 'Outbound updated')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', requireWriteAccess, (req, res) => {
  try {
    const { id } = req.params
    const { reason, remark } = req.body
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM outbound_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const items = db.prepare('SELECT * FROM outbound_items WHERE outbound_id = ?').all(id) as any[]

    db.exec('BEGIN IMMEDIATE')
    try {
      // 先读取 before_stock，再更新库存（修复 stock_logs 时序）
      const beforeStocks: Record<string, number> = {}
      for (const item of items) {
        beforeStocks[item.material_id] = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(item.material_id) as any)?.stock || 0
      }

      for (const item of items) {
        db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(item.quantity, item.material_id)
        if (item.batch_id) {
          db.prepare('UPDATE batches SET remaining = remaining + ?, status = 1 WHERE id = ?').run(item.quantity, item.batch_id)
        }
        if (item.batch_no) {
          db.prepare("DELETE FROM batch_usage_tracking WHERE material_id = ? AND batch = ? AND status = 'in-use'").run(item.material_id, item.batch_no)
        }
      }

      // 保存取消原因和备注
      db.prepare('UPDATE outbound_records SET is_deleted = 1, cancel_reason = ?, cancel_remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(reason || null, remark || null, id)

      for (const item of items) {
        const before = beforeStocks[item.material_id] || 0
        const after = before + item.quantity
        const logId = uuidv4()
        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'delete', ?, ?, ?, ?, ?, 'outbound_delete', ?, ?)
        `).run(logId, item.material_id, item.quantity, before, after, id, (req as any).user?.username || 'system', reason || '删除出库记录')
      }

      // 同步清理 ABC 记录
      db.prepare('DELETE FROM outbound_abc_details WHERE outbound_id = ?').run(id)

      db.exec('COMMIT')
      success(res, null, '删除成功，库存已同步回退')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
