import { v4 as uuidv4 } from 'uuid'

type Db = any

const EPSILON = 0.000001

type AdjustmentContext = {
  relatedType: string
  relatedId: string
  operator?: string
}

type LocationQuantity = {
  locationId: string
  quantity: number
}

function recordBatchLocationAdjustment(
  db: Db,
  context: AdjustmentContext | undefined,
  batchId: string,
  materialId: string,
  locationId: string,
  quantityDelta: number,
) {
  if (!context || Math.abs(quantityDelta) <= EPSILON) return
  db.prepare(`
    INSERT INTO batch_location_adjustments
    (id, related_type, related_id, batch_id, material_id, location_id, quantity_delta, operator)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), context.relatedType, context.relatedId, batchId, materialId, locationId, quantityDelta, context.operator || null)
}

export function ensureBatchLocationRows(db: Db, batchId: string) {
  const existing = db.prepare('SELECT COUNT(*) as count FROM batch_location_balances WHERE batch_id = ?').get(batchId) as any
  if (Number(existing?.count || 0) > 0) return

  const batch = db.prepare(`
    SELECT b.id, b.material_id, b.remaining, b.inbound_id,
           ir.location_id as inbound_location_id,
           inv.location_id as inventory_location_id,
           m.location_id as material_location_id
    FROM batches b
    LEFT JOIN inbound_records ir ON ir.id = b.inbound_id AND ir.is_deleted = 0
    LEFT JOIN inventory inv ON inv.material_id = b.material_id
    LEFT JOIN materials m ON m.id = b.material_id AND m.is_deleted = 0
    WHERE b.id = ?
  `).get(batchId) as any
  const remaining = Number(batch?.remaining || 0)
  const locationId = batch?.inbound_location_id || batch?.inventory_location_id || batch?.material_location_id
  if (!batch || !locationId || remaining <= EPSILON) return

  db.prepare(`
    INSERT INTO batch_location_balances (id, batch_id, material_id, location_id, remaining)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), batch.id, batch.material_id, locationId, remaining)
}

export function getBatchLocationStock(db: Db, batchId: string, locationId: string): number {
  ensureBatchLocationRows(db, batchId)
  const row = db.prepare(`
    SELECT remaining
    FROM batch_location_balances
    WHERE batch_id = ? AND location_id = ?
  `).get(batchId, locationId) as any
  return Number(row?.remaining || 0)
}

export function getBatchLocationIds(db: Db, batchId: string, materialId: string): string[] {
  ensureBatchLocationRows(db, batchId)
  const rows = db.prepare(`
    SELECT location_id
    FROM batch_location_balances
    WHERE batch_id = ? AND material_id = ? AND remaining > 0
    ORDER BY remaining DESC, updated_at DESC
  `).all(batchId, materialId) as any[]
  return rows.map(row => row.location_id).filter(Boolean)
}

export function adjustBatchLocationStock(
  db: Db,
  batchId: string,
  materialId: string,
  locationId: string,
  delta: number,
  context?: AdjustmentContext,
) {
  if (Number(delta) < 0) ensureBatchLocationRows(db, batchId)
  const existing = db.prepare(`
    SELECT id, remaining
    FROM batch_location_balances
    WHERE batch_id = ? AND location_id = ?
  `).get(batchId, locationId) as any
  const nextRemaining = Number(existing?.remaining || 0) + Number(delta)
  if (nextRemaining < -EPSILON) {
    throw new Error('BATCH_LOCATION_STOCK_NEGATIVE')
  }

  if (existing) {
    if (nextRemaining <= EPSILON) {
      db.prepare('DELETE FROM batch_location_balances WHERE id = ?').run(existing.id)
    } else {
      db.prepare(`
        UPDATE batch_location_balances
        SET remaining = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextRemaining, existing.id)
    }
  } else if (nextRemaining > EPSILON) {
    db.prepare(`
      INSERT INTO batch_location_balances (id, batch_id, material_id, location_id, remaining)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), batchId, materialId, locationId, nextRemaining)
  }

  recordBatchLocationAdjustment(db, context, batchId, materialId, locationId, Number(delta))
}

export function moveBatchLocationStock(
  db: Db,
  batchId: string,
  materialId: string,
  fromLocationId: string,
  toLocationId: string,
  quantity: number,
  context?: AdjustmentContext,
) {
  const transferQuantity = Number(quantity)
  if (!Number.isFinite(transferQuantity) || transferQuantity <= 0) return
  adjustBatchLocationStock(db, batchId, materialId, fromLocationId, -transferQuantity, context)
  adjustBatchLocationStock(db, batchId, materialId, toLocationId, transferQuantity, context)
}

export function consumeBatchLocationStock(
  db: Db,
  batchId: string,
  materialId: string,
  quantity: number,
  context?: AdjustmentContext,
) {
  ensureBatchLocationRows(db, batchId)
  const requiredQuantity = Number(quantity)
  if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) return

  const inventory = db.prepare('SELECT location_id FROM inventory WHERE material_id = ?').get(materialId) as any
  const primaryLocationId = inventory?.location_id || ''
  const rows = db.prepare(`
    SELECT id, location_id, remaining
    FROM batch_location_balances
    WHERE batch_id = ? AND material_id = ? AND remaining > 0
    ORDER BY
      CASE WHEN location_id = ? THEN 0 ELSE 1 END,
      remaining DESC,
      updated_at DESC
  `).all(batchId, materialId, primaryLocationId) as any[]

  const total = rows.reduce((sum, row) => sum + Number(row.remaining || 0), 0)
  if (total + EPSILON < requiredQuantity) {
    throw new Error('BATCH_LOCATION_STOCK_INSUFFICIENT')
  }

  let remaining = requiredQuantity
  for (const row of rows) {
    if (remaining <= EPSILON) break
    const consumed = Math.min(Number(row.remaining || 0), remaining)
    adjustBatchLocationStock(db, batchId, materialId, row.location_id, -consumed, context)
    remaining -= consumed
  }
}

export function consumeBatchLocationStockByLocations(
  db: Db,
  batchId: string,
  materialId: string,
  locations: LocationQuantity[],
  context?: AdjustmentContext,
) {
  ensureBatchLocationRows(db, batchId)
  for (const location of locations) {
    const consumedQuantity = Number(location.quantity)
    if (!location.locationId || !Number.isFinite(consumedQuantity) || consumedQuantity <= 0) continue
    adjustBatchLocationStock(db, batchId, materialId, location.locationId, -consumedQuantity, context)
  }
}

export function restoreBatchLocationStock(
  db: Db,
  batchId: string,
  materialId: string,
  quantity: number,
  context?: AdjustmentContext,
) {
  if (context) {
    const rows = db.prepare(`
      SELECT location_id, SUM(quantity_delta) as quantity_delta
      FROM batch_location_adjustments
      WHERE related_type = ? AND related_id = ? AND batch_id = ? AND material_id = ?
      GROUP BY location_id
      HAVING SUM(quantity_delta) < 0
      ORDER BY MIN(created_at) ASC
    `).all(context.relatedType, context.relatedId, batchId, materialId) as any[]

    if (rows.length > 0) {
      for (const row of rows) {
        adjustBatchLocationStock(db, batchId, materialId, row.location_id, Math.abs(Number(row.quantity_delta || 0)))
      }
      db.prepare(`
        DELETE FROM batch_location_adjustments
        WHERE related_type = ? AND related_id = ? AND batch_id = ? AND material_id = ?
      `).run(context.relatedType, context.relatedId, batchId, materialId)
      return
    }
  }

  ensureBatchLocationRows(db, batchId)
  const row = db.prepare(`
    SELECT location_id
    FROM batch_location_balances
    WHERE batch_id = ? AND material_id = ?
    ORDER BY remaining DESC, updated_at DESC
    LIMIT 1
  `).get(batchId, materialId) as any
  if (!row?.location_id) return
  adjustBatchLocationStock(db, batchId, materialId, row.location_id, Number(quantity), context)
}

export function reverseBatchLocationRestore(
  db: Db,
  batchId: string,
  materialId: string,
  quantity: number,
  restoreContext?: AdjustmentContext,
  reverseContext?: AdjustmentContext,
) {
  if (restoreContext) {
    const rows = db.prepare(`
      SELECT location_id, SUM(quantity_delta) as quantity_delta
      FROM batch_location_adjustments
      WHERE related_type = ? AND related_id = ? AND batch_id = ? AND material_id = ?
      GROUP BY location_id
      HAVING SUM(quantity_delta) > 0
      ORDER BY MIN(created_at) ASC
    `).all(restoreContext.relatedType, restoreContext.relatedId, batchId, materialId) as any[]

    if (rows.length > 0) {
      for (const row of rows) {
        adjustBatchLocationStock(db, batchId, materialId, row.location_id, -Math.abs(Number(row.quantity_delta || 0)), reverseContext)
      }
      db.prepare(`
        DELETE FROM batch_location_adjustments
        WHERE related_type = ? AND related_id = ? AND batch_id = ? AND material_id = ?
      `).run(restoreContext.relatedType, restoreContext.relatedId, batchId, materialId)
      return
    }
  }

  consumeBatchLocationStock(db, batchId, materialId, quantity, reverseContext)
}
