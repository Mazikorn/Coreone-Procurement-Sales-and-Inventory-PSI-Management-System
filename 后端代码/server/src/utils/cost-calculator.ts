export interface SlideCostInput {
  bomId?: string
  slideCount?: number
  blockCount?: number
  month?: string
  materialCost?: number
  caseNo?: string | null
  applyCaseAggregation?: boolean
  feeMappingsOverride?: any[]
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
const activeStatusSql = (column: string) =>
  `(${column} = 'active' OR ${column} = 1 OR ${column} = '1')`

export interface TierRule {
  maxQuantity?: number
  unitPrice: number
}

interface FeeBreakdownItem {
  feeStandardId: string | null
  feeStandardName: string | null
  category: string | null
  quantity: number
  feeAmount: number
  aggregationScope: 'outbound' | 'case'
  chargeGroupId?: string | null
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

function getFeeMappings(db: any, bom: any): any[] {
  if (!bom?.id) return []
  const rows = db.prepare(`
    SELECT m.*, fs.name as fee_standard_name, fs.category, fs.project_type,
           fs.fee_per_slide, fs.base_price, fs.tier_rules, fs.cap_amount
    FROM bom_fee_mappings m
    JOIN fee_standards fs ON m.fee_standard_id = fs.id AND ${activeStatusSql('fs.status')}
    WHERE m.bom_id = ? AND ${activeStatusSql('m.status')}
    ORDER BY m.sort_order ASC, m.created_at ASC
  `).all(bom.id) as any[]

  if (rows.length) return rows
  if (!bom.fee_standard_id) return []

  const legacy = db.prepare(`SELECT * FROM fee_standards WHERE id = ? AND ${activeStatusSql('status')}`)
    .get(bom.fee_standard_id) as any
  return legacy ? [{
    id: `legacy-${bom.fee_standard_id}`,
    fee_standard_id: legacy.id,
    fee_standard_name: legacy.name,
    category: legacy.category,
    project_type: legacy.project_type,
    fee_per_slide: legacy.fee_per_slide,
    base_price: legacy.base_price,
    tier_rules: legacy.tier_rules,
    cap_amount: legacy.cap_amount,
    quantity_multiplier: 1,
    aggregation_scope: 'outbound',
  }] : []
}

export function buildBomSourceSnapshot(db: any, bomId: string) {
  const bom = db.prepare(`
    SELECT id, code, name, version, type, service_id, description,
           supportable_samples, fee_standard_id, fee_category, status, updated_at
    FROM boms
    WHERE id = ? AND is_deleted = 0
  `).get(bomId) as any
  if (!bom) return null

  const mapMaterialRow = (row: any) => ({
    materialId: row.material_id,
    materialCode: row.material_code,
    materialName: row.material_name,
    spec: row.spec || null,
    unit: row.unit || null,
    usagePerSample: row.usage_per_sample ?? null,
    usagePerBatch: row.usage_per_batch ?? null,
    coversSamples: row.covers_samples ?? null,
    allocationType: row.allocation_type || null,
    groupName: row.group_name || null,
    sortOrder: row.sort_order || 0,
  })

  const items = db.prepare(`
    SELECT bi.*, m.code as material_code, m.name as material_name, m.spec
    FROM bom_items bi
    LEFT JOIN materials m ON bi.material_id = m.id AND m.is_deleted = 0
    WHERE bi.bom_id = ?
    ORDER BY bi.sort_order ASC, bi.created_at ASC
  `).all(bomId).map(mapMaterialRow)

  const generalReagents = db.prepare(`
    SELECT gr.*, m.code as material_code, m.name as material_name, m.spec
    FROM bom_general_reagents gr
    LEFT JOIN materials m ON gr.material_id = m.id AND m.is_deleted = 0
    WHERE gr.bom_id = ?
    ORDER BY gr.sort_order ASC, gr.created_at ASC
  `).all(bomId).map(mapMaterialRow)

  const generalConsumables = db.prepare(`
    SELECT gc.*, m.code as material_code, m.name as material_name, m.spec
    FROM bom_general_consumables gc
    LEFT JOIN materials m ON gc.material_id = m.id AND m.is_deleted = 0
    WHERE gc.bom_id = ?
    ORDER BY gc.sort_order ASC, gc.created_at ASC
  `).all(bomId).map(mapMaterialRow)

  const qualityControls = db.prepare(`
    SELECT qc.*, m.code as material_code, m.name as material_name, m.spec
    FROM bom_quality_controls qc
    LEFT JOIN materials m ON qc.material_id = m.id AND m.is_deleted = 0
    WHERE qc.bom_id = ?
    ORDER BY qc.sort_order ASC, qc.created_at ASC
  `).all(bomId).map(mapMaterialRow)

  const feeMappings = getFeeMappings(db, bom).map(mapping => ({
    feeStandardId: mapping.fee_standard_id,
    feeStandardName: mapping.fee_standard_name,
    category: mapping.category || null,
    projectType: mapping.project_type || null,
    feePerSlide: Number(mapping.fee_per_slide) || 0,
    basePrice: Number(mapping.base_price) || 0,
    quantityMultiplier: Number(mapping.quantity_multiplier) || 1,
    aggregationScope: mapping.aggregation_scope === 'case' ? 'case' : 'outbound',
  }))

  return {
    id: bom.id,
    code: bom.code,
    name: bom.name,
    version: bom.version,
    type: bom.type,
    serviceId: bom.service_id || null,
    supportableSamples: bom.supportable_samples ?? null,
    feeStandardId: bom.fee_standard_id || null,
    feeCategory: bom.fee_category || null,
    status: bom.status,
    updatedAt: bom.updated_at,
    items,
    generalReagents,
    generalConsumables,
    qualityControls,
    feeMappings,
  }
}

function applyCaseChargeGroup(db: any, input: {
  caseNo: string
  month: string
  feeStandard: any
  quantity: number
}) {
  const groupId = `${input.caseNo}-${input.month}-${input.feeStandard.fee_standard_id}`
  const existing = db.prepare(`
    SELECT * FROM case_charge_groups
    WHERE case_no = ? AND year_month = ? AND fee_standard_id = ?
  `).get(input.caseNo, input.month, input.feeStandard.fee_standard_id) as any
  const previousQuantity = Number(existing?.total_quantity) || 0
  const previousFee = Number(existing?.total_fee) || 0
  const nextQuantity = previousQuantity + input.quantity
  const nextFee = calculateFeeAmountFromStandard(input.feeStandard, nextQuantity)
  const incrementalFee = round2(nextFee - previousFee)
  const snapshot = JSON.stringify({
    feeStandardId: input.feeStandard.fee_standard_id,
    feeStandardName: input.feeStandard.fee_standard_name,
    tierRules: input.feeStandard.tier_rules ? parseJson(input.feeStandard.tier_rules) : null,
    capAmount: input.feeStandard.cap_amount ?? null,
  })

  db.prepare(`
    INSERT INTO case_charge_groups (
      id, case_no, year_month, fee_standard_id,
      total_quantity, total_fee, outbound_count, rule_snapshot
    )
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(case_no, year_month, fee_standard_id) DO UPDATE SET
      total_quantity = excluded.total_quantity,
      total_fee = excluded.total_fee,
      outbound_count = case_charge_groups.outbound_count + 1,
      rule_snapshot = excluded.rule_snapshot,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    existing?.id || groupId,
    input.caseNo,
    input.month,
    input.feeStandard.fee_standard_id,
    nextQuantity,
    nextFee,
    snapshot,
  )

  return { groupId, incrementalFee, totalFee: nextFee, totalQuantity: nextQuantity }
}

function parseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch (_e) {
    return null
  }
}

function calculateFeeBreakdown(db: any, input: {
  bom: any
  slideCount: number
  month: string
  caseNo?: string | null
  applyCaseAggregation?: boolean
  feeMappingsOverride?: any[]
}): FeeBreakdownItem[] {
  const mappings = input.feeMappingsOverride || getFeeMappings(db, input.bom)
  return mappings.map(mapping => {
    const quantity = round4(input.slideCount * (Number(mapping.quantity_multiplier) || 1))
    const aggregationScope = mapping.aggregation_scope === 'case' ? 'case' : 'outbound'
    const feeStandard = {
      ...mapping,
      id: mapping.fee_standard_id,
      name: mapping.fee_standard_name,
    }

    if (aggregationScope === 'case' && input.caseNo && input.applyCaseAggregation) {
      const group = applyCaseChargeGroup(db, {
        caseNo: input.caseNo,
        month: input.month,
        feeStandard: mapping,
        quantity,
      })
      return {
        feeStandardId: mapping.fee_standard_id,
        feeStandardName: mapping.fee_standard_name,
        category: mapping.category,
        quantity,
        feeAmount: group.incrementalFee,
        aggregationScope,
        chargeGroupId: group.groupId,
      }
    }

    return {
      feeStandardId: mapping.fee_standard_id,
      feeStandardName: mapping.fee_standard_name,
      category: mapping.category,
      quantity,
      feeAmount: calculateFeeAmountFromStandard(feeStandard, quantity),
      aggregationScope,
      chargeGroupId: input.caseNo && aggregationScope === 'case'
        ? `${input.caseNo}-${input.month}-${mapping.fee_standard_id}`
        : null,
    }
  })
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
    WHERE COALESCE(is_deleted, 0) = 0
      AND (project_type = ? OR project_type = 'all')
  `).all(projectType) as any[]

  return round2(rows.reduce((sum, row) =>
    sum + (Number(row.standard_minutes) || 0) * (Number(row.labor_rate_per_minute) || 0) * sampleCount,
  0))
}

export function calculateEquipmentCost(db: any, bomId: string, sampleCount = 1): number {
  const rows = db.prepare(`
    SELECT bet.usage_minutes,
           e.purchase_price, e.residual_value, e.depreciable_life_years,
           e.depreciation_method, e.total_capacity,
           et.default_purchase_price, et.default_residual_value,
           et.default_depreciable_life_years, et.default_depreciation_method,
           et.default_total_capacity
    FROM bom_equipment_templates bet
    LEFT JOIN equipment e ON bet.equipment_id = e.id
    LEFT JOIN equipment_types et ON bet.equipment_type_id = et.id
    WHERE bet.bom_id = ?
  `).all(bomId) as any[]

  return calculateEquipmentCostFromRows(rows, sampleCount)
}

function calculateEquipmentTemplateCost(row: any, sampleCount: number): number {
  const purchasePrice = Number(row.purchase_price ?? row.default_purchase_price) || 0
  const residualValue = Number(row.residual_value ?? row.default_residual_value) || 0
  const depreciableAmount = Math.max(0, purchasePrice - residualValue)
  const usageMinutes = Number(row.usage_minutes) || 0
  const depreciationMethod = row.depreciation_method || row.default_depreciation_method || 'straight_line'
  const totalCapacity = Number(row.total_capacity ?? row.default_total_capacity) || 0

  if (depreciationMethod === 'units_of_production' && totalCapacity > 0) {
    return (depreciableAmount / totalCapacity) * usageMinutes * sampleCount
  }

  const years = Number(row.depreciable_life_years ?? row.default_depreciable_life_years) || 5
  const perMinute = years > 0 ? depreciableAmount / years / 525600 : 0
  return perMinute * usageMinutes * sampleCount
}

export function calculateEquipmentCostFromRows(rows: any[], sampleCount = 1): number {
  const total = rows.reduce((sum, row) => {
    return sum + calculateEquipmentTemplateCost(row, sampleCount)
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

  const feeBreakdown = calculateFeeBreakdown(db, {
    bom,
    slideCount,
    month,
    caseNo: input.caseNo,
    applyCaseAggregation: input.applyCaseAggregation,
    feeMappingsOverride: input.feeMappingsOverride,
  })
  const feeAmount = round2(feeBreakdown.reduce((sum, item) => sum + item.feeAmount, 0))
  const profit = round2(feeAmount - totalCost)
  const profitRate = feeAmount > 0 ? round4(profit / feeAmount) : 0
  const primaryFee = feeBreakdown.length === 1 ? feeBreakdown[0] : null

  return {
    materialCost,
    totalActivityCost,
    totalCost,
    costPerSlide: round2(totalCost / slideCount),
    feeCategory: primaryFee?.category || bom?.fee_category || null,
    feeStandardId: primaryFee?.feeStandardId || bom?.fee_standard_id || null,
    feeAmount,
    profit,
    profitRate,
    feeBreakdown,
    chargeGroupId: primaryFee?.chargeGroupId || null,
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
