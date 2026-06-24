import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { generateNo } from '../utils/generateNo.js'
import { consumeInventoryLocationStock, restoreInventoryLocationStock } from '../utils/inventory-locations.js'
import { consumeBatchLocationStockByLocations, getBatchLocationIds, restoreBatchLocationStock } from '../utils/batch-locations.js'
import { logOperation } from '../utils/operation-logger.js'
import { checkStockAlerts } from '../utils/alertChecker.js'

const router = Router()
const BATCH_RESTORE_EPSILON = 0.000001
const SCRAP_REASON_CODES = new Set(['expired', 'damaged', 'quality_issue', 'obsolete', 'spoiled', 'other'])
const HIGH_VALUE_SCRAP_AMOUNT_THRESHOLD = 1000

function generateScrapNo(): string {
  return generateNo('SC')
}

function pickBatch(db: any, materialId: string, quantity: number, batchId?: string) {
  if (batchId) {
    return db.prepare(`
      SELECT id, batch_no, remaining, status
      FROM batches
      WHERE id = ? AND material_id = ?
    `).get(batchId, materialId) as any
  }

  return db.prepare(`
    SELECT id, batch_no, remaining, status
    FROM batches
    WHERE material_id = ? AND status = 1 AND remaining >= ?
    ORDER BY
      CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
      expiry_date ASC,
      created_at ASC
    LIMIT 1
  `).get(materialId, quantity) as any
}

function hasActiveBatch(db: any, materialId: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM batches
    WHERE material_id = ? AND status = 1 AND remaining > 0
  `).get(materialId) as any
  return Number(row?.count || 0) > 0
}

function validateBatchForDeduction(db: any, materialId: string, quantity: number, batchId?: string) {
  const batch = pickBatch(db, materialId, quantity, batchId)
  if (batchId && !batch) {
    return { error: { message: '报废批次不存在或不属于该物料', code: 'BATCH_NOT_FOUND', status: 404 } }
  }
  if (batch && (Number(batch.status) !== 1 || Number(batch.remaining) < quantity)) {
    return { error: { message: '批次库存不足', code: 'BATCH_STOCK_INSUFFICIENT', status: 422 } }
  }
  if (!batch && hasActiveBatch(db, materialId)) {
    return { error: { message: '请选择库存充足的报废批次', code: 'BATCH_REQUIRED', status: 422 } }
  }
  return { batch }
}

function handleScrapStockError(res: any, err: any): boolean {
  if (!['LOCATION_STOCK_INSUFFICIENT', 'BATCH_LOCATION_STOCK_NEGATIVE', 'BATCH_LOCATION_STOCK_INSUFFICIENT'].includes(err?.message)) return false
  error(res, '库位库存不足，无法创建报废记录', 'STOCK_INSUFFICIENT', 422)
  return true
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function buildScrapReviewFacts(material: any, quantity: number, payload: any) {
  const scrapAmount = Number((Number(material?.price || 0) * quantity).toFixed(4))
  const requiresReview = scrapAmount >= HIGH_VALUE_SCRAP_AMOUNT_THRESHOLD
  const responsiblePerson = normalizeOptionalText(payload?.responsiblePerson)
  const responsibleDepartment = normalizeOptionalText(payload?.responsibleDepartment)

  if (requiresReview && (!responsiblePerson || !responsibleDepartment)) {
    return {
      error: {
        message: '高价值报废必须填写责任人和责任部门',
        code: 'SCRAP_RESPONSIBILITY_REQUIRED',
        status: 400,
      },
    }
  }

  return {
    scrapAmount,
    requiresReview,
    responsiblePerson,
    responsibleDepartment,
    reviewStatus: requiresReview ? 'pending' : 'not_required',
    status: requiresReview ? 'pending_review' : 'completed',
  }
}

function mapReviewStatus(row: any) {
  return {
    status: row?.status,
    reviewStatus: row?.review_status,
    reviewedBy: row?.reviewed_by || null,
    reviewReason: row?.review_reason || null,
  }
}

function parseScrapPagination(query: any) {
  const rawPage = query.page === undefined ? '1' : String(query.page).trim()
  const rawPageSize = query.pageSize === undefined ? '20' : String(query.pageSize).trim()
  const page = Number(rawPage)
  const pageSize = Number(rawPageSize)

  if (!Number.isInteger(page) || page < 1) {
    return { error: '页码必须为正整数' }
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    return { error: '每页数量必须为 1-1000 的整数' }
  }

  return { page, pageSize }
}

function buildScrapListFilter(query: any) {
  const whereParts = ['s.is_deleted = 0']
  const params: any[] = []
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : ''

  if (keyword) {
    const like = `%${keyword}%`
    whereParts.push(`(
      s.scrap_no LIKE ?
      OR s.reason LIKE ?
      OR s.remark LIKE ?
      OR s.operator LIKE ?
      OR s.status LIKE ?
      OR s.review_status LIKE ?
      OR s.responsible_person LIKE ?
      OR s.responsible_department LIKE ?
      OR m.name LIKE ?
      OR m.code LIKE ?
      OR b.batch_no LIKE ?
    )`)
    params.push(like, like, like, like, like, like, like, like, like, like, like)
  }

  return {
    whereSql: whereParts.join(' AND '),
    params,
  }
}

router.get('/', (req, res) => {
  try {
    const pagination = parseScrapPagination(req.query)
    if (pagination.error) {
      error(res, pagination.error, 'INVALID_PARAMETER', 400)
      return
    }

    const normalizedPage = pagination.page
    const normalizedPageSize = pagination.pageSize
    const db = getDatabase()
    const filter = buildScrapListFilter(req.query)
    const count = (db.prepare(`
      SELECT COUNT(*) as total
      FROM scrap_records s
      LEFT JOIN materials m ON s.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN batches b ON s.batch_id = b.id
      WHERE ${filter.whereSql}
    `).get(...filter.params) as any)?.total || 0
    const offset = (normalizedPage - 1) * normalizedPageSize
    const list = db.prepare(`
      SELECT s.*, m.name as material_name, m.unit as material_unit, b.batch_no
      FROM scrap_records s
      LEFT JOIN materials m ON s.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN batches b ON s.batch_id = b.id
      WHERE ${filter.whereSql}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...filter.params, normalizedPageSize, offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, scrapNo: r.scrap_no, materialId: r.material_id, materialName: r.material_name,
      unit: r.material_unit,
      batchId: r.batch_id, batchNo: r.batch_no,
      quantity: r.quantity, reason: r.reason, operator: r.operator,
      status: r.status, remark: r.remark, createdAt: r.created_at,
      responsiblePerson: r.responsible_person,
      responsibleDepartment: r.responsible_department,
      scrapAmount: Number(r.scrap_amount || 0),
      requiresReview: Number(r.requires_review || 0) === 1,
      reviewStatus: r.review_status,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      reviewReason: r.review_reason,
    })), normalizedPage, normalizedPageSize, count)
  } catch (err: any) { error(res, err.message) }
})

router.post('/batch', (req, res) => {
  try {
    const records = Array.isArray(req.body?.records) ? req.body.records : []
    const operator = (req as any).user?.username || 'system'
    if (records.length === 0) {
      error(res, '报废数据不能为空', 'INVALID_PARAMETER', 400); return
    }
    if (records.length > 100) {
      error(res, '单次最多批量报废 100 条', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const errors: string[] = []
    let errorStatus = 400
    let errorCode = 'INVALID_PARAMETER'
    const stockByMaterial = new Map<string, number>()
    const validRecords = records.map((record: any, index: number) => {
      const row = index + 1
      const materialId = typeof record.materialId === 'string' ? record.materialId.trim() : ''
      const quantity = Number(record.quantity)
      const batchId = typeof record.batchId === 'string' ? record.batchId.trim() : undefined
      const reason = typeof record.reason === 'string' ? record.reason.trim() : ''
      const remark = typeof record.remark === 'string' ? record.remark.trim() : undefined
      const responsiblePerson = normalizeOptionalText(record.responsiblePerson)
      const responsibleDepartment = normalizeOptionalText(record.responsibleDepartment)
      let reviewFacts: any = null

      if (!materialId) errors.push(`第 ${row} 行物料不能为空`)
      if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`第 ${row} 行数量必须大于 0`)
      if (!reason) {
        errors.push(`第 ${row} 行报废原因不能为空`)
      } else if (!SCRAP_REASON_CODES.has(reason)) {
        errors.push(`第 ${row} 行报废原因分类无效`)
      }
      if (materialId) {
        const material = db.prepare('SELECT id, status, price FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
        if (!material) {
          errors.push(`第 ${row} 行物料不存在或已删除`)
        } else if (Number(material.status) !== 1) {
          errors.push(`第 ${row} 行物料已停用，不能创建报废记录`)
          errorStatus = 409
          errorCode = 'CONFLICT'
        } else if (Number.isFinite(quantity) && quantity > 0) {
          reviewFacts = buildScrapReviewFacts(material, quantity, record)
          if (reviewFacts.error) {
            errors.push(`第 ${row} 行${reviewFacts.error.message}`)
            errorStatus = reviewFacts.error.status
            errorCode = reviewFacts.error.code
          }
        }
      }

      stockByMaterial.set(materialId, (stockByMaterial.get(materialId) || 0) + (Number.isFinite(quantity) ? quantity : 0))
      return {
        materialId,
        batchId,
        quantity,
        reason,
        remark,
        responsiblePerson,
        responsibleDepartment,
        reviewFacts,
      }
    })

    for (const [materialId, requiredQty] of stockByMaterial.entries()) {
      if (!materialId) continue
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      if (!inv || Number(inv.stock) < requiredQty) {
        errors.push(`物料 ${materialId} 库存不足，当前可用: ${inv?.stock || 0}`)
      }
    }

    if (errors.length > 0) {
      error(res, errors[0], errorCode, errorStatus, { errors })
      return
    }

    const createdIds: string[] = []
    const changedMaterialIds = new Set<string>()
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const record of validRecords) {
        const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.materialId) as any
        const beforeStock = Number(inv?.stock || 0)
        if (beforeStock < record.quantity) {
          db.exec('ROLLBACK')
          error(res, `库存不足，当前可用: ${beforeStock}`, 'STOCK_INSUFFICIENT', 422)
          return
        }
        const batchResult = validateBatchForDeduction(db, record.materialId, record.quantity, record.batchId)
        if (batchResult.error) {
          db.exec('ROLLBACK')
          error(res, batchResult.error.message, batchResult.error.code, batchResult.error.status)
          return
        }

        const id = uuidv4()
        const afterStock = beforeStock - record.quantity
        const reviewFacts = record.reviewFacts || {
          scrapAmount: 0,
          requiresReview: false,
          reviewStatus: 'not_required',
          status: 'completed',
          responsiblePerson: record.responsiblePerson,
          responsibleDepartment: record.responsibleDepartment,
        }
        db.prepare(`
          INSERT INTO scrap_records (
            id, scrap_no, material_id, batch_id, quantity, reason, operator, remark,
            responsible_person, responsible_department, scrap_amount,
            requires_review, review_status, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          generateScrapNo(),
          record.materialId,
          batchResult.batch?.id || null,
          record.quantity,
          record.reason,
          operator,
          record.remark || null,
          reviewFacts.responsiblePerson,
          reviewFacts.responsibleDepartment,
          reviewFacts.scrapAmount,
          reviewFacts.requiresReview ? 1 : 0,
          reviewFacts.reviewStatus,
          reviewFacts.status,
        )
        db.prepare('UPDATE inventory SET stock = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
          .run(afterStock, record.materialId)
        const batchLocationIds = batchResult.batch ? getBatchLocationIds(db, batchResult.batch.id, record.materialId) : []
        const consumedLocations = consumeInventoryLocationStock(
          db,
          record.materialId,
          record.quantity,
          { relatedType: 'scrap', relatedId: id },
          { preferredLocationIds: batchLocationIds },
        )
        if (batchResult.batch) {
          consumeBatchLocationStockByLocations(
            db,
            batchResult.batch.id,
            record.materialId,
            consumedLocations,
            { relatedType: 'scrap', relatedId: id, operator },
          )
          const remaining = Number(batchResult.batch.remaining) - record.quantity
          db.prepare(`
            UPDATE batches
            SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(remaining, remaining <= 0 ? 0 : Number(batchResult.batch.status), batchResult.batch.id)
        }
        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'scrap', ?, ?, ?, ?, ?, 'scrap_batch', ?, ?)
        `).run(uuidv4(), record.materialId, -record.quantity, beforeStock, afterStock, id, operator, '批量报废')
        createdIds.push(id)
        changedMaterialIds.add(record.materialId)
      }

      db.exec('COMMIT')
      checkStockAlerts(db, Array.from(changedMaterialIds))
      logOperation(db, req as any, {
        operation: 'POST /scraps/batch',
        description: `批量创建报废记录 ${createdIds.length} 条`,
        requestData: {
          module: 'scraps',
          ids: createdIds,
          createdCount: createdIds.length,
          records: validRecords.map(record => ({
            materialId: record.materialId,
            batchId: record.batchId || null,
            quantity: record.quantity,
            reason: record.reason,
            responsiblePerson: record.responsiblePerson || null,
            responsibleDepartment: record.responsibleDepartment || null,
            scrapAmount: record.reviewFacts?.scrapAmount || 0,
            requiresReview: !!record.reviewFacts?.requiresReview,
            reviewStatus: record.reviewFacts?.reviewStatus || 'not_required',
          })),
        },
        responseData: { createdCount: createdIds.length, ids: createdIds },
      })
      success(res, { createdCount: createdIds.length, ids: createdIds }, 'Batch scrap created')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) {
    if (handleScrapStockError(res, err)) return
    error(res, err.message)
  }
})

router.post('/', (req, res) => {
  try {
    const { materialId, batchId, quantity, reason, remark } = req.body
    const scrapQuantity = Number(quantity)
    const operator = (req as any).user?.username || 'system'
    if (!materialId || quantity === undefined || quantity === null || !Number.isFinite(scrapQuantity) || scrapQuantity <= 0 || !reason) {
      error(res, 'Missing or invalid fields', 'INVALID_PARAMETER', 400); return
    }
    const normalizedReason = String(reason || '').trim()
    if (!SCRAP_REASON_CODES.has(normalizedReason)) {
      error(res, '报废原因分类无效', 'INVALID_PARAMETER', 400)
      return
    }
    const db = getDatabase()
    const material = db.prepare('SELECT * FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
    if (!material) { error(res, '物料不存在或已删除', 'NOT_FOUND', 404); return }
    if (Number(material.status) !== 1) { error(res, '物料已停用，不能创建报废记录', 'CONFLICT', 409); return }
    const reviewFacts = buildScrapReviewFacts(material, scrapQuantity, req.body)
    if (reviewFacts.error) {
      error(res, reviewFacts.error.message, reviewFacts.error.code, reviewFacts.error.status)
      return
    }
    const id = uuidv4()
    const scrapNo = generateScrapNo()
    let selectedBatchId: string | null = null

    // 库存检查移入事务内（防止 TOCTOU 竞态条件）
    db.exec('BEGIN IMMEDIATE')
    try {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      if (!inv || Number(inv.stock) < scrapQuantity) {
        db.exec('ROLLBACK')
        error(res, `库存不足，当前可用: ${inv?.stock || 0}`, 'STOCK_INSUFFICIENT', 422)
        return
      }
      const batchResult = validateBatchForDeduction(db, materialId, scrapQuantity, batchId)
      if (batchResult.error) {
        db.exec('ROLLBACK')
        error(res, batchResult.error.message, batchResult.error.code, batchResult.error.status)
        return
      }
      selectedBatchId = batchResult.batch?.id || null
      db.prepare(`
        INSERT INTO scrap_records (
          id, scrap_no, material_id, batch_id, quantity, reason, operator, remark,
          responsible_person, responsible_department, scrap_amount,
          requires_review, review_status, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        scrapNo,
        materialId,
        batchResult.batch?.id || null,
        scrapQuantity,
        normalizedReason,
        operator || 'system',
        remark || null,
        reviewFacts.responsiblePerson,
        reviewFacts.responsibleDepartment,
        reviewFacts.scrapAmount,
        reviewFacts.requiresReview ? 1 : 0,
        reviewFacts.reviewStatus,
        reviewFacts.status,
      )
      db.prepare('UPDATE inventory SET stock = stock - ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(scrapQuantity, materialId)
      const batchLocationIds = batchResult.batch ? getBatchLocationIds(db, batchResult.batch.id, materialId) : []
      const consumedLocations = consumeInventoryLocationStock(
        db,
        materialId,
        scrapQuantity,
        { relatedType: 'scrap', relatedId: id },
        { preferredLocationIds: batchLocationIds },
      )

      if (batchResult.batch) {
        consumeBatchLocationStockByLocations(
          db,
          batchResult.batch.id,
          materialId,
          consumedLocations,
          { relatedType: 'scrap', relatedId: id, operator },
        )
        const remaining = Number(batchResult.batch.remaining) - scrapQuantity
        db.prepare(`
          UPDATE batches
          SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(remaining, remaining <= 0 ? 0 : Number(batchResult.batch.status), batchResult.batch.id)
      }

      // 负库存兜底
      const afterCheck = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any)?.stock
      if (afterCheck < 0) {
        db.exec('ROLLBACK')
        error(res, '库存不能为负数', 'STOCK_NEGATIVE', 422)
        return
      }

      const afterStock = Number(inv?.stock || 0) - scrapQuantity
      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
        VALUES (?, 'scrap', ?, ?, ?, ?, ?, 'scrap', ?)
      `).run(logId, materialId, -scrapQuantity, Number(inv?.stock || 0), afterStock, id, operator || 'system')

      db.exec('COMMIT')
      checkStockAlerts(db, [materialId])
      logOperation(db, req as any, {
        operation: 'POST /scraps',
        description: `创建报废记录 ${scrapNo}`,
        requestData: {
          module: 'scraps',
          id,
          scrapNo,
          materialId,
          batchId: selectedBatchId,
          quantity: scrapQuantity,
          reason: normalizedReason,
          responsiblePerson: reviewFacts.responsiblePerson,
          responsibleDepartment: reviewFacts.responsibleDepartment,
          scrapAmount: reviewFacts.scrapAmount,
          requiresReview: reviewFacts.requiresReview,
          reviewStatus: reviewFacts.reviewStatus,
        },
        responseData: { id, scrapNo, status: reviewFacts.status, reviewStatus: reviewFacts.reviewStatus },
      })
      success(res, {
        id,
        scrapNo,
        status: reviewFacts.status,
        reviewStatus: reviewFacts.reviewStatus,
        requiresReview: reviewFacts.requiresReview,
        scrapAmount: reviewFacts.scrapAmount,
      }, 'Scrap created')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) {
    if (handleScrapStockError(res, err)) return
    error(res, err.message)
  }
})

router.post('/:id/review', (req, res) => {
  try {
    const { id } = req.params
    const reviewAction = String(req.body?.status || '').trim()
    const reviewReason = normalizeOptionalText(req.body?.reason)
    const reviewer = (req as any).user?.username || 'system'

    if (!['approved', 'rejected'].includes(reviewAction)) {
      error(res, '复核结果必须为 approved 或 rejected', 'INVALID_PARAMETER', 400)
      return
    }
    if (reviewAction === 'rejected' && !reviewReason) {
      error(res, '驳回复核必须填写原因', 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const record = db.prepare('SELECT * FROM scrap_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }
    if (Number(record.requires_review || 0) !== 1 || record.review_status !== 'pending' || record.status !== 'pending_review') {
      error(res, '该报废记录不在待复核状态', 'SCRAP_REVIEW_NOT_ALLOWED', 409)
      return
    }
    if (record.operator === reviewer) {
      error(res, '高价值报废不能由创建人自审', 'SCRAP_SELF_REVIEW_FORBIDDEN', 403)
      return
    }

    const before = mapReviewStatus(record)
    db.exec('BEGIN IMMEDIATE')
    try {
      let nextStatus = 'completed'
      let nextReviewStatus = 'approved'

      if (reviewAction === 'rejected') {
        const restoreBatch = record.batch_id
          ? db.prepare('SELECT id, quantity, remaining FROM batches WHERE id = ? AND material_id = ?')
            .get(record.batch_id, record.material_id) as any
          : null
        if (record.batch_id && !restoreBatch) {
          db.exec('ROLLBACK')
          error(res, '报废批次不存在，无法恢复批次库存', 'BATCH_NOT_FOUND', 409)
          return
        }
        if (restoreBatch) {
          const nextRemaining = Number(restoreBatch.remaining || 0) + Number(record.quantity || 0)
          const batchQuantity = Number(restoreBatch.quantity || 0)
          if (nextRemaining - batchQuantity > BATCH_RESTORE_EPSILON) {
            db.exec('ROLLBACK')
            error(res, '批次数量已被后续业务调整，无法驳回报废记录', 'BATCH_RESTORE_CONFLICT', 409)
            return
          }
        }

        const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
        if (!inv) {
          db.exec('ROLLBACK')
          error(res, '物料无库存记录，无法驳回报废记录', 'NOT_FOUND', 404)
          return
        }

        const beforeStock = Number(inv.stock || 0)
        const restoreQuantity = Number(record.quantity || 0)
        db.prepare('UPDATE inventory SET stock = stock + ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
          .run(restoreQuantity, record.material_id)
        restoreInventoryLocationStock(db, record.material_id, restoreQuantity, { relatedType: 'scrap', relatedId: id })
        const afterStock = beforeStock + restoreQuantity

        if (record.batch_id) {
          restoreBatchLocationStock(db, record.batch_id, record.material_id, restoreQuantity, { relatedType: 'scrap', relatedId: id, operator: reviewer })
          db.prepare(`
            UPDATE batches
            SET remaining = remaining + ?, status = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(restoreQuantity, record.batch_id)
        }

        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'scrap_reject', ?, '驳回高价值报废，恢复库存')
        `).run(uuidv4(), record.material_id, restoreQuantity, beforeStock, afterStock, id, reviewer)

        nextStatus = 'rejected'
        nextReviewStatus = 'rejected'
      }

      db.prepare(`
        UPDATE scrap_records
        SET status = ?,
            review_status = ?,
            reviewed_by = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            review_reason = ?
        WHERE id = ?
      `).run(nextStatus, nextReviewStatus, reviewer, reviewReason, id)

      db.exec('COMMIT')
      if (reviewAction === 'rejected') {
        checkStockAlerts(db, [record.material_id])
      }

      const after = { status: nextStatus, reviewStatus: nextReviewStatus }
      logOperation(db, req as any, {
        operation: 'POST /scraps/:id/review',
        description: `${reviewAction === 'approved' ? '通过' : '驳回'}高价值报废复核 ${id}`,
        requestData: {
          module: 'scraps',
          id,
          materialId: record.material_id,
          batchId: record.batch_id || null,
          quantity: Number(record.quantity || 0),
          scrapAmount: Number(record.scrap_amount || 0),
          responsiblePerson: record.responsible_person || null,
          responsibleDepartment: record.responsible_department || null,
          before,
          after,
          reason: reviewReason,
        },
        responseData: { id, ...after },
      })

      success(res, { id, ...after }, 'Scrap reviewed')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) {
    error(res, err.message)
  }
})

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM scrap_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      const restoreBatch = record.batch_id
        ? db.prepare('SELECT id, quantity, remaining FROM batches WHERE id = ? AND material_id = ?')
          .get(record.batch_id, record.material_id) as any
        : null
      if (record.batch_id && !restoreBatch) {
        db.exec('ROLLBACK')
        error(res, '报废批次不存在，无法恢复批次库存', 'BATCH_NOT_FOUND', 409)
        return
      }
      if (restoreBatch) {
        const nextRemaining = Number(restoreBatch.remaining || 0) + Number(record.quantity || 0)
        const batchQuantity = Number(restoreBatch.quantity || 0)
        if (nextRemaining - batchQuantity > BATCH_RESTORE_EPSILON) {
          db.exec('ROLLBACK')
          error(res, '批次数量已被后续业务调整，无法撤销报废记录', 'BATCH_RESTORE_CONFLICT', 409)
          return
        }
      }

      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
      if (!inv) {
        db.exec('ROLLBACK')
        error(res, '物料无库存记录，无法撤销报废记录', 'NOT_FOUND', 404)
        return
      }

      db.prepare('UPDATE scrap_records SET is_deleted = 1 WHERE id = ?').run(id)

      const beforeStock = Number(inv.stock || 0)
      db.prepare('UPDATE inventory SET stock = stock + ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(record.quantity, record.material_id)
      restoreInventoryLocationStock(db, record.material_id, Number(record.quantity), { relatedType: 'scrap', relatedId: id })
      const afterStock = beforeStock + record.quantity

      if (record.batch_id) {
        restoreBatchLocationStock(db, record.batch_id, record.material_id, Number(record.quantity), { relatedType: 'scrap', relatedId: id, operator: (req as any).user?.username || 'system' })
        db.prepare(`
          UPDATE batches
          SET remaining = remaining + ?, status = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(Number(record.quantity), record.batch_id)
      }

      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'scrap_cancel', ?, '撤销报废记录')
      `).run(logId, record.material_id, record.quantity, beforeStock, afterStock, id, (req as any).user?.username || 'system')

      db.exec('COMMIT')
      checkStockAlerts(db, [record.material_id])
      logOperation(db, req as any, {
        operation: 'DELETE /scraps/:id',
        description: `撤销报废记录 ${id}`,
        requestData: {
          module: 'scraps',
          id,
          materialId: record.material_id,
          batchId: record.batch_id || null,
          quantity: Number(record.quantity || 0),
          reason: record.reason,
        },
        responseData: { id, status: 'cancelled' },
      })
      success(res, null, '报废记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
