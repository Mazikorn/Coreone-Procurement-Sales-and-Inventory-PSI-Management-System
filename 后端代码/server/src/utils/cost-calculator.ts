export interface SlideCostInput {
  bomId?: string
  slideCount?: number
  blockCount?: number
  month?: string
  materialCost?: number
}

export interface ActivityCost {
  activityCenterId: string
  activityCenterName: string
  activityCenterCode: string
  quantity: number
  unitCost: number
  totalCost: number
}

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100
const round4 = (value: number): number => Math.round((Number(value) || 0) * 10000) / 10000

export interface TierRule {
  maxQuantity?: number
  unitPrice: number
}

export function calculateTieredCost(quantity: number, tiers: TierRule[], capAmount?: number | null): number {
  const safeQuantity = Math.max(0, Number(quantity) || 0)
  if (safeQuantity <= 0 || !tiers.length) return 0

  let remaining = safeQuantity
  let previousMax = 0
  let total = 0

  for (const tier of tiers) {
    if (remaining <= 0) break

    const maxQuantity = Number(tier.maxQuantity) || 0
    const tierSize = maxQuantity > previousMax ? Math.min(remaining, maxQuantity - previousMax) : remaining
    total += tierSize * (Number(tier.unitPrice) || 0)
    remaining -= tierSize
    if (maxQuantity > previousMax) previousMax = maxQuantity
  }

  const rounded = round2(total)
  return capAmount && capAmount > 0 ? Math.min(rounded, capAmount) : rounded
}

export function calculateFeeAmountFromStandard(feeStandard: any, quantity: number): number {
  const safeQuantity = Math.max(0, Number(quantity) || 0)
  if (!feeStandard || safeQuantity <= 0) return 0

  const basePrice = Number(feeStandard.base_price ?? feeStandard.fee_per_slide) || 0
  const capAmount = Number(feeStandard.cap_amount) || null

  if (feeStandard.tier_rules) {
    try {
      const tiers = JSON.parse(feeStandard.tier_rules) as TierRule[]
      if (Array.isArray(tiers) && tiers.length) {
        return calculateTieredCost(safeQuantity, tiers, capAmount)
      }
    } catch (_e) {
      // Fall back to the base price when historical tier rules are malformed.
    }
  }

  return round2(basePrice * safeQuantity)
}

export function getDriverRate(db: any, activityCenterId: string, month: string): number {
  const current = db.prepare(`
    SELECT driver_rate
    FROM abc_cost_pools
    WHERE activity_center_id = ? AND year_month = ?
  `).get(activityCenterId, month) as any
  if (Number(current?.driver_rate) > 0) return round2(Number(current.driver_rate))

  const previousMonth = getPreviousMonth(month)
  const previous = db.prepare(`
    SELECT driver_rate
    FROM abc_cost_pools
    WHERE activity_center_id = ? AND year_month = ?
  `).get(activityCenterId, previousMonth) as any
  if (Number(previous?.driver_rate) > 0) return round2(Number(previous.driver_rate))

  const average = db.prepare(`
    SELECT AVG(b.standard_activity_cost) as avg_rate
    FROM boms b
    JOIN bom_activity_links bal ON bal.bom_id = b.id
    WHERE bal.activity_center_id = ? AND b.is_deleted = 0
  `).get(activityCenterId) as any

  return round2(Number(average?.avg_rate) || 0)
}

function getPreviousMonth(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number)
  if (!year || !monthIndex) return month
  const date = new Date(Date.UTC(year, monthIndex - 2, 1))
  return date.toISOString().slice(0, 7)
}

export function getOrCalculateProjectFullCost(db: any, projectId: string, month = new Date().toISOString().slice(0, 7)) {
  const cached = db.prepare(`
    SELECT *
    FROM project_cost_snapshots
    WHERE project_id = ? AND year_month = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(projectId, month) as any

  if (cached) return cached

  const project = db.prepare(`
    SELECT p.*, b.id as bom_id, b.unit_cost
    FROM projects p
    LEFT JOIN boms b ON p.bom_id = b.id
    WHERE p.id = ? AND p.is_deleted = 0
  `).get(projectId) as any

  if (!project) return null

  const sampleCount = Number(project.supportable_samples) || 1
  const materialCost = round2((Number(project.unit_cost) || 0) * sampleCount)
  const laborCost = calculateLaborCost(db, project.type || 'all', sampleCount)
  const equipmentCost = project.bom_id ? calculateEquipmentCost(db, project.bom_id, sampleCount) : 0
  const qcCost = project.bom_id ? calculateQCCost(db, project.bom_id, sampleCount) : 0
  const indirectCost = calculateIndirectCost(db, month, sampleCount)
  const totalCost = round2(materialCost + laborCost + equipmentCost + qcCost + indirectCost)

  return {
    project_id: projectId,
    year_month: month,
    material_cost: materialCost,
    labor_cost: laborCost,
    equipment_cost: equipmentCost,
    qc_cost: qcCost,
    indirect_cost: indirectCost,
    total_cost: totalCost,
  }
}

export function calculateLaborCost(db: any, projectType: string, sampleCount = 1): number {
  const rows = db.prepare(`
    SELECT standard_minutes, labor_rate_per_minute
    FROM standard_labor_times
    WHERE project_type = ? OR project_type = 'all'
  `).all(projectType) as any[]

  return round2(rows.reduce((sum, row) =>
    sum + (Number(row.standard_minutes) || 0) * (Number(row.labor_rate_per_minute) || 0) * sampleCount,
  0))
}

export function calculateEquipmentCost(db: any, bomId: string, sampleCount = 1): number {
  const rows = db.prepare(`
    SELECT bet.usage_minutes, e.purchase_price, e.residual_value, e.depreciable_life_years
    FROM bom_equipment_templates bet
    LEFT JOIN equipment e ON bet.equipment_id = e.id
    WHERE bet.bom_id = ?
  `).all(bomId) as any[]

  const total = rows.reduce((sum, row) => {
    const purchasePrice = Number(row.purchase_price) || 0
    const residualValue = Number(row.residual_value) || 0
    const years = Number(row.depreciable_life_years) || 5
    const perMinute = years > 0 ? (purchasePrice - residualValue) / years / 525600 : 0
    return sum + perMinute * (Number(row.usage_minutes) || 0) * sampleCount
  }, 0)

  return round2(total)
}

export function calculateEquipmentCostFromRows(rows: any[], sampleCount = 1): number {
  const total = rows.reduce((sum, row) => {
    const purchasePrice = Number(row.purchase_price) || 0
    const residualValue = Number(row.residual_value) || 0
    const years = Number(row.depreciable_life_years) || 5
    const perMinute = years > 0 ? (purchasePrice - residualValue) / years / 525600 : 0
    return sum + perMinute * (Number(row.usage_minutes) || 0) * sampleCount
  }, 0)

  return round2(total)
}

export function calculateQCCost(db: any, bomId: string, sampleCount = 1): number {
  const rows = db.prepare(`
    SELECT qc.usage_per_batch, qc.covers_samples, m.price
    FROM bom_quality_controls qc
    LEFT JOIN materials m ON qc.material_id = m.id AND m.is_deleted = 0
    WHERE qc.bom_id = ?
  `).all(bomId) as any[]

  const total = rows.reduce((sum, row) => {
    const coversSamples = Math.max(1, Number(row.covers_samples) || 1)
    const batchCount = Math.ceil(sampleCount / coversSamples)
    return sum + (Number(row.usage_per_batch) || 0) * (Number(row.price) || 0) * batchCount
  }, 0)

  return round2(total)
}

export function calculateIndirectCost(db: any, month: string, sampleCount = 1): number {
  const rows = db.prepare(`
    SELECT allocation_rate
    FROM indirect_cost_allocations
    WHERE year_month = ?
  `).all(month) as any[]

  return round2(rows.reduce((sum, row) => sum + (Number(row.allocation_rate) || 0) * sampleCount, 0))
}

export function calculateSlideCostWithFee(db: any, input: SlideCostInput) {
  const slideCount = Math.max(1, Number(input.slideCount) || 1)
  const blockCount = Math.max(1, Number(input.blockCount) || 1)
  const month = input.month || new Date().toISOString().slice(0, 7)
  const bomId = input.bomId || ''

  const bom = bomId
    ? db.prepare('SELECT * FROM boms WHERE id = ? AND is_deleted = 0').get(bomId) as any
    : null

  const materialCost = round2(input.materialCost ?? calculateMaterialCost(db, bomId, bom, slideCount))

  const links = bomId ? getBomActivityLinks(db, bomId) : []

  const activityCosts: ActivityCost[] = links.map(link => {
    const pool = db.prepare(`
      SELECT driver_rate, COALESCE(SUM(amount), 0) as amount
      FROM abc_cost_pools
      WHERE activity_center_id = ? AND year_month = ?
    `).get(link.activity_center_id, month) as any
    const unitCost = Number(pool?.driver_rate) || Number(pool?.amount) || 0
    const quantity = getDriverQuantity(link, slideCount, blockCount)
    return {
      activityCenterId: link.activity_center_id,
      activityCenterName: link.activity_center_name || '未命名作业中心',
      activityCenterCode: link.activity_center_code || '',
      quantity,
      unitCost,
      totalCost: round2(unitCost * quantity),
    }
  })

  const totalActivityCost = round2(activityCosts.reduce((sum, item) => sum + item.totalCost, 0))
  const totalCost = round2(materialCost + totalActivityCost)

  const feeStandard = bom?.fee_standard_id
    ? db.prepare('SELECT * FROM fee_standards WHERE id = ?').get(bom.fee_standard_id) as any
    : null

  const feeAmount = calculateFeeAmountFromStandard(feeStandard, slideCount)
  const profit = round2(feeAmount - totalCost)
  const profitRate = feeAmount > 0 ? round4(profit / feeAmount) : 0

  return {
    materialCost,
    totalActivityCost,
    totalCost,
    costPerSlide: round2(totalCost / slideCount),
    feeCategory: feeStandard?.category || bom?.fee_category || null,
    feeStandardId: feeStandard?.id || bom?.fee_standard_id || null,
    feeAmount,
    profit,
    profitRate,
    activityCosts,
  }
}

function calculateMaterialCost(db: any, bomId: string, bom: any, slideCount: number): number {
  if (!bomId) return 0

  const items = db.prepare(`
    SELECT bi.material_id, bi.usage_per_sample, m.price
    FROM bom_items bi
    LEFT JOIN materials m ON bi.material_id = m.id
    WHERE bi.bom_id = ?
  `).all(bomId) as any[]

  if (!items.length) return round2((Number(bom?.unit_cost) || 0) * slideCount)

  const batchPrices = db.prepare(`
    SELECT
      material_id,
      SUM(remaining * inbound_price) / NULLIF(SUM(remaining), 0) as weighted_price
    FROM batches
    WHERE material_id IN (${items.map(() => '?').join(',')})
    GROUP BY material_id
  `).all(...items.map(item => item.material_id)) as any[]
  const priceMap = new Map(batchPrices.map(row => [row.material_id, Number(row.weighted_price) || 0]))

  return round2(items.reduce((sum, item) => {
    const price = priceMap.get(item.material_id) || Number(item.price) || 0
    return sum + price * (Number(item.usage_per_sample) || 0)
  }, 0))
}

function getBomActivityLinks(db: any, bomId: string): any[] {
  try {
    const legacyLinks = db.prepare(`
      SELECT bal.*, bal.activity_center_name, bal.activity_center_code
      FROM abc_bom_activity_links bal
      WHERE bal.bom_id = ?
      ORDER BY bal.sort_order ASC
    `).all(bomId) as any[]
    if (legacyLinks.length) return legacyLinks
  } catch (_e) {
    // Fall back to the current table name below.
  }

  return db.prepare(`
    SELECT l.*, ac.name as activity_center_name, ac.code as activity_center_code
    FROM bom_activity_links l
    LEFT JOIN abc_activity_centers ac ON l.activity_center_id = ac.id
    WHERE l.bom_id = ?
    ORDER BY l.sort_order ASC
  `).all(bomId) as any[]
}

function getDriverQuantity(link: any, slideCount: number, blockCount: number): number {
  const configured = Number(link.driver_quantity ?? link.quantity)
  if (configured > 0) return configured

  if (link.activity_center_code === 'block_count') return blockCount
  if (link.cost_driver_type === 'slide_count') return slideCount

  return 1
}
