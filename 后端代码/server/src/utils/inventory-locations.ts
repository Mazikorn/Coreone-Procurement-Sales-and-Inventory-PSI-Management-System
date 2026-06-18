import { v4 as uuidv4 } from 'uuid'

type Db = any

const LOCATION_STOCK_EPSILON = 0.000001

type InventoryLocationAdjustmentContext = {
  relatedType: string
  relatedId: string
}

function recordInventoryLocationAdjustment(
  db: Db,
  context: InventoryLocationAdjustmentContext | undefined,
  materialId: string,
  locationId: string,
  quantityDelta: number,
): void {
  if (!context || Math.abs(quantityDelta) <= LOCATION_STOCK_EPSILON) return
  db.prepare(`
    INSERT INTO inventory_location_adjustments
    (id, related_type, related_id, material_id, location_id, quantity_delta)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), context.relatedType, context.relatedId, materialId, locationId, quantityDelta)
}

export function ensureInventoryLocationRows(db: Db, materialId: string): void {
  const existing = db.prepare('SELECT COUNT(*) as count FROM inventory_locations WHERE material_id = ?').get(materialId) as any
  if (Number(existing?.count || 0) > 0) return

  const inventory = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
  const stock = Number(inventory?.stock || 0)
  if (!inventory?.location_id || stock <= 0) return

  db.prepare(`
    INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock, update_time)
    VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
  `).run(uuidv4(), materialId, inventory.location_id, stock)
}

export function getInventoryLocationStock(db: Db, materialId: string, locationId: string): number {
  ensureInventoryLocationRows(db, materialId)
  const row = db.prepare(`
    SELECT stock
    FROM inventory_locations
    WHERE material_id = ? AND location_id = ?
  `).get(materialId, locationId) as any
  return Number(row?.stock || 0)
}

export function adjustInventoryLocationStock(db: Db, materialId: string, locationId: string, delta: number): number {
  if (Number(delta) < 0) {
    ensureInventoryLocationRows(db, materialId)
  }
  const existing = db.prepare(`
    SELECT id, stock
    FROM inventory_locations
    WHERE material_id = ? AND location_id = ?
  `).get(materialId, locationId) as any
  const nextStock = Number(existing?.stock || 0) + Number(delta)
  if (nextStock < -LOCATION_STOCK_EPSILON) {
    throw new Error('LOCATION_STOCK_NEGATIVE')
  }

  if (existing) {
    if (nextStock <= LOCATION_STOCK_EPSILON) {
      db.prepare('DELETE FROM inventory_locations WHERE id = ?').run(existing.id)
    } else {
      db.prepare(`
        UPDATE inventory_locations
        SET stock = ?, update_time = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextStock, existing.id)
    }
  } else if (nextStock > LOCATION_STOCK_EPSILON) {
    db.prepare(`
      INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock, update_time)
      VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(uuidv4(), materialId, locationId, nextStock)
  }

  return Math.max(0, nextStock)
}

export function consumeInventoryLocationStock(
  db: Db,
  materialId: string,
  quantity: number,
  context?: InventoryLocationAdjustmentContext,
): void {
  ensureInventoryLocationRows(db, materialId)
  const requiredQuantity = Number(quantity)
  if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) return

  const inventory = db.prepare('SELECT location_id FROM inventory WHERE material_id = ?').get(materialId) as any
  const primaryLocationId = inventory?.location_id || ''
  const rows = db.prepare(`
    SELECT id, location_id, stock
    FROM inventory_locations
    WHERE material_id = ? AND stock > 0
    ORDER BY
      CASE WHEN location_id = ? THEN 0 ELSE 1 END,
      stock DESC,
      update_time DESC
  `).all(materialId, primaryLocationId) as any[]

  const totalLocationStock = rows.reduce((sum, row) => sum + Number(row.stock || 0), 0)
  if (totalLocationStock + LOCATION_STOCK_EPSILON < requiredQuantity) {
    throw new Error('LOCATION_STOCK_INSUFFICIENT')
  }

  let remaining = requiredQuantity
  for (const row of rows) {
    if (remaining <= LOCATION_STOCK_EPSILON) break
    const currentStock = Number(row.stock || 0)
    const consumed = Math.min(currentStock, remaining)
    const nextStock = currentStock - consumed
    if (nextStock <= LOCATION_STOCK_EPSILON) {
      db.prepare('DELETE FROM inventory_locations WHERE id = ?').run(row.id)
    } else {
      db.prepare(`
        UPDATE inventory_locations
        SET stock = ?, update_time = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextStock, row.id)
    }
    recordInventoryLocationAdjustment(db, context, materialId, row.location_id, -consumed)
    remaining -= consumed
  }

  syncInventoryPrimaryLocation(db, materialId)
}

export function restoreInventoryLocationStock(
  db: Db,
  materialId: string,
  quantity: number,
  context?: InventoryLocationAdjustmentContext,
): void {
  if (context) {
    const rows = db.prepare(`
      SELECT location_id, SUM(quantity_delta) as quantity_delta
      FROM inventory_location_adjustments
      WHERE related_type = ? AND related_id = ? AND material_id = ?
      GROUP BY location_id
      HAVING SUM(quantity_delta) < 0
      ORDER BY MIN(created_at) ASC
    `).all(context.relatedType, context.relatedId, materialId) as any[]

    if (rows.length > 0) {
      for (const row of rows) {
        const restoredQuantity = Math.abs(Number(row.quantity_delta || 0))
        adjustInventoryLocationStock(db, materialId, row.location_id, restoredQuantity)
      }
      db.prepare(`
        DELETE FROM inventory_location_adjustments
        WHERE related_type = ? AND related_id = ? AND material_id = ?
      `).run(context.relatedType, context.relatedId, materialId)
      syncInventoryPrimaryLocation(db, materialId)
      return
    }
  }

  const inventory = db.prepare('SELECT location_id FROM inventory WHERE material_id = ?').get(materialId) as any
  const material = db.prepare('SELECT location_id FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
  const locationId = inventory?.location_id || material?.location_id
  if (!locationId) return
  adjustInventoryLocationStock(db, materialId, locationId, Number(quantity))
  recordInventoryLocationAdjustment(db, context, materialId, locationId, Number(quantity))
  syncInventoryPrimaryLocation(db, materialId)
}

export function syncInventoryPrimaryLocation(db: Db, materialId: string): void {
  ensureInventoryLocationRows(db, materialId)
  const row = db.prepare(`
    SELECT location_id
    FROM inventory_locations
    WHERE material_id = ? AND stock > 0
    ORDER BY stock DESC, update_time DESC
    LIMIT 1
  `).get(materialId) as any

  db.prepare(`
    UPDATE inventory
    SET location_id = ?, update_time = CURRENT_TIMESTAMP
    WHERE material_id = ?
  `).run(row?.location_id || null, materialId)
}
