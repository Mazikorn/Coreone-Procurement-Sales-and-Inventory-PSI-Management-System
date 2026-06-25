import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'
import { calculateLaborCost, calculateEquipmentCost, calculateQCCost, calculateIndirectCost, calculateSlideCostWithFee } from '../utils/cost-calculator.js'
import { runCostRecalculation } from '../utils/cost-runs.js'
import { calculateBomSupportableSamples } from '../utils/bom-support.js'
import { normalizeDisplayText, requireValidText, type TextGuardResult } from '../utils/text-guard.js'
import { logOperation } from '../utils/operation-logger.js'

const router = Router()
const requireBomWrite = requireRole()
const VALID_BOM_TYPES = new Set(['he', 'ihc', 'ss', 'mp', 'cyto', 'project'])

function parseJsonOrNull(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (_e) {
    return null
  }
}

function versionNumber(version: string) {
  const [major = 0, minor = 0] = String(version || 'v0.0')
    .replace(/^v/i, '')
    .split('.')
    .map(part => Number(part) || 0)
  return major * 1000 + minor
}

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean)))
}

type BomLineTextResult = Extract<TextGuardResult, { ok: false }> | { ok: true; items: unknown }
type BomTextPayloadResult = Extract<TextGuardResult, { ok: false }> | { ok: true; payload: any }

function normalizeBomLineText(rawItems: unknown, label: string): BomLineTextResult {
  if (!Array.isArray(rawItems)) return { ok: true, items: rawItems }
  const items: any[] = []
  for (const item of rawItems as any[]) {
    const unitText = normalizeDisplayText(item?.unit, `${label}单位`, { maxLength: 40 })
    if ('message' in unitText) return unitText
    const groupText = normalizeDisplayText(item?.groupName, `${label}分组`, { maxLength: 80 })
    if ('message' in groupText) return groupText
    const allocationText = normalizeDisplayText(item?.allocationType, `${label}分摊方式`, { maxLength: 40 })
    if ('message' in allocationText) return allocationText
    items.push({
      ...item,
      unit: unitText.value,
      groupName: groupText.value,
      allocationType: allocationText.value,
    })
  }
  return { ok: true, items }
}

function normalizeBomTextPayload(payload: any, options: { requireCode?: boolean; requireName?: boolean }): BomTextPayloadResult {
  const normalized = { ...payload }
  if (options.requireCode || payload?.code !== undefined) {
    const codeText = options.requireCode
      ? requireValidText(payload?.code, 'BOM编码', 100)
      : normalizeDisplayText(payload?.code, 'BOM编码', { maxLength: 100 })
    if ('message' in codeText) return codeText
    normalized.code = codeText.value
  }
  if (options.requireName || payload?.name !== undefined) {
    const nameText = options.requireName
      ? requireValidText(payload?.name, 'BOM名称')
      : normalizeDisplayText(payload?.name, 'BOM名称')
    if ('message' in nameText) return nameText
    normalized.name = nameText.value
  }
  if (payload?.description !== undefined) {
    const descriptionText = normalizeDisplayText(payload.description, 'BOM描述', { maxLength: 500 })
    if ('message' in descriptionText) return descriptionText
    normalized.description = descriptionText.value
  }
  if (payload?.feeCategory !== undefined) {
    const feeCategoryText = normalizeDisplayText(payload.feeCategory, '收费分类', { maxLength: 80 })
    if ('message' in feeCategoryText) return feeCategoryText
    normalized.feeCategory = feeCategoryText.value
  }
  const groups = [
    ['materials', '特异性试剂'],
    ['generalReagents', '通用试剂'],
    ['generalConsumables', '通用耗材'],
    ['qualityControls', '质控品'],
  ] as const
  for (const [field, label] of groups) {
    if (payload?.[field] !== undefined) {
      const groupText = normalizeBomLineText(payload[field], label)
      if ('message' in groupText) return groupText
      normalized[field] = groupText.items
    }
  }
  return { ok: true, payload: normalized }
}

function getBomReferences(db: any, bomId: string) {
  const check = buildBomDeleteCheck(db, bomId)
  if (!check) return []
  return [
    { label: '检测项目', count: check.impacts.projectCount },
    { label: '出库成本明细', count: check.impacts.outboundDetailCount },
  ].filter(item => item.count > 0)
}

function buildBomDeleteCheck(db: any, bomId: string) {
  const bom = db.prepare(`
    SELECT id, code, name
    FROM boms
    WHERE id = ? AND is_deleted = 0
  `).get(bomId) as any
  if (!bom) return null

  const checks = [
    {
      label: '检测项目',
      count: (db.prepare('SELECT COUNT(*) as count FROM projects WHERE bom_id = ? AND is_deleted = 0').get(bomId) as any)?.count || 0,
    },
    {
      label: '出库成本明细',
      count: (db.prepare('SELECT COUNT(*) as count FROM outbound_abc_details WHERE bom_id = ?').get(bomId) as any)?.count || 0,
    },
  ]
  const reasons = checks
    .filter(item => item.count > 0)
    .map(item => `存在 ${item.count} ${item.label === '检测项目' ? '个' : '条'}${item.label}引用`)

  return {
    bom: {
      id: bom.id,
      code: bom.code,
      name: bom.name,
    },
    deletable: reasons.length === 0,
    impacts: {
      projectCount: checks[0].count,
      outboundDetailCount: checks[1].count,
    },
    reasons,
  }
}

function getDeletableBoms(db: any, ids: string[]) {
  const existing = db.prepare(`
    SELECT id, name
    FROM boms
    WHERE is_deleted = 0 AND id IN (${ids.map(() => '?').join(',')})
  `).all(...ids) as any[]
  const existingIds = new Set(existing.map(row => row.id))
  const missingIds = ids.filter(id => !existingIds.has(id))
  const blocked = existing
    .map(row => ({ ...row, references: getBomReferences(db, row.id) }))
    .filter(row => row.references.length > 0)

  return { existing, missingIds, blocked }
}

function getActiveProjectReferencedBoms(db: any, ids: string[]) {
  if (ids.length === 0) return []
  return db.prepare(`
    SELECT b.id, b.code, b.name, COUNT(p.id) as project_count
    FROM boms b
    INNER JOIN projects p ON p.bom_id = b.id AND p.is_deleted = 0 AND p.status = 1
    WHERE b.is_deleted = 0 AND b.id IN (${ids.map(() => '?').join(',')})
    GROUP BY b.id, b.code, b.name
  `).all(...ids) as any[]
}

function getBomActivationDependencyImpacts(db: any, bomId: string) {
  const coreMaterialCount = Number((db.prepare(`
    SELECT COUNT(*) as count
    FROM bom_items
    WHERE bom_id = ?
  `).get(bomId) as any)?.count || 0)
  const materialSources = [
    'bom_items',
    'bom_general_reagents',
    'bom_general_consumables',
    'bom_quality_controls',
  ]
  const inactiveMaterialIds = new Set<string>()

  for (const table of materialSources) {
    const rows = db.prepare(`
      SELECT DISTINCT src.material_id
      FROM ${table} src
      LEFT JOIN materials m ON m.id = src.material_id AND m.is_deleted = 0
      WHERE src.bom_id = ?
        AND (m.id IS NULL OR m.status <> 1)
    `).all(bomId) as any[]
    rows.forEach(row => inactiveMaterialIds.add(String(row.material_id)))
  }

  const inactiveEquipmentCount = Number((db.prepare(`
    SELECT COUNT(*) as count
    FROM bom_equipment_templates bet
    LEFT JOIN equipment e ON e.id = bet.equipment_id
    WHERE bet.bom_id = ?
      AND bet.equipment_id IS NOT NULL
      AND (e.id IS NULL OR e.status <> 1)
  `).get(bomId) as any)?.count || 0)

  const inactiveEquipmentTypeCount = Number((db.prepare(`
    SELECT COUNT(*) as count
    FROM bom_equipment_templates bet
    LEFT JOIN equipment_types et ON et.id = bet.equipment_type_id
    WHERE bet.bom_id = ?
      AND bet.equipment_type_id IS NOT NULL
      AND (et.id IS NULL OR et.status <> 1)
  `).get(bomId) as any)?.count || 0)

  return {
    coreMaterialCount,
    inactiveMaterialCount: inactiveMaterialIds.size,
    inactiveEquipmentCount,
    inactiveEquipmentTypeCount,
  }
}

function buildBomStatusCheck(db: any, bomId: string, targetStatus: 'active' | 'inactive') {
  const bom = db.prepare(`
    SELECT id, code, name
    FROM boms
    WHERE id = ? AND is_deleted = 0
  `).get(bomId) as any
  if (!bom) return null

  const activeProjectCount = targetStatus === 'inactive'
    ? Number((db.prepare(`
      SELECT COUNT(*) as count
      FROM projects
      WHERE bom_id = ? AND is_deleted = 0 AND status = 1
    `).get(bomId) as any)?.count || 0)
    : 0
  const activationImpacts = targetStatus === 'active'
    ? getBomActivationDependencyImpacts(db, bomId)
    : {
      coreMaterialCount: 0,
      inactiveMaterialCount: 0,
      inactiveEquipmentCount: 0,
      inactiveEquipmentTypeCount: 0,
    }
  const reasons: string[] = []

  if (activeProjectCount > 0) reasons.push(`存在 ${activeProjectCount} 个启用检测项目引用`)
  if (targetStatus === 'active' && activationImpacts.coreMaterialCount <= 0) reasons.push('缺少核心物料明细')
  if (activationImpacts.inactiveMaterialCount > 0) reasons.push(`存在 ${activationImpacts.inactiveMaterialCount} 个停用或已删除物料依赖`)
  if (activationImpacts.inactiveEquipmentCount > 0) reasons.push(`存在 ${activationImpacts.inactiveEquipmentCount} 个未启用设备依赖`)
  if (activationImpacts.inactiveEquipmentTypeCount > 0) reasons.push(`存在 ${activationImpacts.inactiveEquipmentTypeCount} 个未启用设备类型依赖`)

  return {
    bom: {
      id: bom.id,
      code: bom.code,
      name: bom.name,
    },
    targetStatus,
    canChange: reasons.length === 0,
    impacts: {
      activeProjectCount,
      ...activationImpacts,
    },
    reasons,
  }
}

function getStatusBlockedBoms(db: any, ids: string[], targetStatus: 'active' | 'inactive') {
  return ids
    .map(id => buildBomStatusCheck(db, id, targetStatus))
    .filter((check: any) => check && !check.canChange)
}

function buildBomVersionSnapshot(db: any, bomId: string) {
  const bom = db.prepare(`
    SELECT id, code, name, version, type, service_id, description,
           supportable_samples, fee_standard_id, fee_category, status,
           unit_cost, standard_labor_cost, standard_equipment_cost,
           standard_indirect_cost, standard_total_cost, standard_slide_cost,
           standard_fee_per_slide, standard_margin_rate, updated_at
    FROM boms
    WHERE id = ? AND is_deleted = 0
  `).get(bomId) as any
  if (!bom) return null

  const mapMaterialRow = (row: any) => ({
    materialId: row.material_id,
    materialCode: row.material_code || null,
    materialName: row.material_name || null,
    spec: row.spec || null,
    unit: row.unit || null,
    usagePerSample: row.usage_per_sample ?? null,
    usagePerBatch: row.usage_per_batch ?? null,
    coversSamples: row.covers_samples ?? null,
    allocationType: row.allocation_type || null,
    groupName: row.group_name || null,
    sortOrder: row.sort_order || 0,
  })

  const materials = db.prepare(`
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
  `).all(bomId).map((row: any) => ({
    equipmentId: row.equipment_id || null,
    equipmentTypeId: row.equipment_type_id || null,
    equipmentName: row.equipment_name || null,
    equipmentTypeName: row.type_name || null,
    model: row.model || null,
    usageMinutes: Number(row.usage_minutes) || 0,
    sortOrder: row.sort_order || 0,
  }))

  return {
    id: bom.id,
    code: bom.code,
    name: bom.name,
    version: bom.version,
    type: bom.type,
    serviceId: bom.service_id || null,
    description: bom.description || null,
    supportableSamples: bom.supportable_samples ?? null,
    feeStandardId: bom.fee_standard_id || null,
    feeCategory: bom.fee_category || null,
    status: bom.status,
    unitCost: Number(bom.unit_cost) || 0,
    standardLaborCost: Number(bom.standard_labor_cost) || 0,
    standardEquipmentCost: Number(bom.standard_equipment_cost) || 0,
    standardIndirectCost: Number(bom.standard_indirect_cost) || 0,
    standardTotalCost: Number(bom.standard_total_cost) || 0,
    standardSlideCost: Number(bom.standard_slide_cost) || 0,
    standardFeePerSlide: Number(bom.standard_fee_per_slide) || 0,
    standardMarginRate: Number(bom.standard_margin_rate) || 0,
    updatedAt: bom.updated_at,
    materials,
    generalReagents,
    generalConsumables,
    qualityControls,
    equipmentTemplates,
  }
}

function diffMaterialList(beforeItems: any[] = [], afterItems: any[] = []) {
  const beforeMap = new Map(beforeItems.map(item => [item.materialId, item]))
  const afterMap = new Map(afterItems.map(item => [item.materialId, item]))
  const addedMaterials = afterItems.filter(item => !beforeMap.has(item.materialId))
  const removedMaterials = beforeItems.filter(item => !afterMap.has(item.materialId))
  const changedMaterials = afterItems.flatMap(item => {
    const before = beforeMap.get(item.materialId)
    if (!before) return []
    const changed = Number(before.usagePerSample) !== Number(item.usagePerSample)
      || String(before.unit || '') !== String(item.unit || '')
      || String(before.groupName || '') !== String(item.groupName || '')
    return changed ? [{ materialId: item.materialId, materialName: item.materialName, before, after: item }] : []
  })
  return { addedMaterials, removedMaterials, changedMaterials }
}

function buildBomVersionDiff(beforeSnapshot: any, afterSnapshot: any) {
  if (!beforeSnapshot) {
    return { changedFields: [], addedMaterials: [], removedMaterials: [], changedMaterials: [] }
  }
  const changedFields = [
    ['name', '名称'],
    ['type', '类型'],
    ['serviceId', '关联检测服务'],
    ['description', '描述'],
    ['supportableSamples', '支持样本数'],
    ['feeStandardId', '收费标准'],
    ['feeCategory', '收费分类'],
  ].flatMap(([field, label]) => (
    String(beforeSnapshot[field] ?? '') === String(afterSnapshot[field] ?? '')
      ? []
      : [{ field, label, before: beforeSnapshot[field] ?? null, after: afterSnapshot[field] ?? null }]
  ))
  return {
    changedFields,
    ...diffMaterialList(beforeSnapshot.materials || [], afterSnapshot.materials || []),
  }
}

function summarizeBomVersionDiff(diff: any, hasPrevious: boolean) {
  if (!hasPrevious) return '初始版本'
  const parts: string[] = []
  if (diff.changedFields?.length) {
    parts.push(`${diff.changedFields.map((item: any) => item.label).join('、')}变更`)
  }
  if (diff.addedMaterials?.length) parts.push(`新增物料 ${diff.addedMaterials.length} 项`)
  if (diff.removedMaterials?.length) parts.push(`移除物料 ${diff.removedMaterials.length} 项`)
  if (diff.changedMaterials?.length) parts.push(`物料用量 ${diff.changedMaterials.length} 项调整`)
  return parts.length ? parts.join('；') : '版本更新'
}

function buildBomChangeImpact(db: any, bomId: string) {
  const rows = db.prepare(`
    SELECT
      COALESCE(d.cost_month, substr(r.created_at, 1, 7)) as year_month,
      COALESCE(p.status, 'open') as period_status,
      COUNT(DISTINCT r.id) as outbound_count
    FROM outbound_records r
    LEFT JOIN outbound_abc_details d ON d.outbound_id = r.id
    LEFT JOIN abc_periods p ON p.year_month = COALESCE(d.cost_month, substr(r.created_at, 1, 7))
    WHERE r.is_deleted = 0
      AND r.status = 'completed'
      AND r.type = 'bom'
      AND (d.bom_id = ? OR r.project_id IN (
        SELECT id FROM projects WHERE bom_id = ? AND is_deleted = 0
      ))
    GROUP BY year_month, period_status
    ORDER BY year_month DESC
  `).all(bomId, bomId) as any[]

  const months = rows.map(row => ({
    yearMonth: row.year_month,
    periodStatus: row.period_status,
    outboundCount: Number(row.outbound_count) || 0,
    recalculable: row.period_status !== 'closed',
  }))

  return {
    totalOutboundCount: months.reduce((sum, item) => sum + item.outboundCount, 0),
    affectedMonthCount: months.length,
    closedMonthCount: months.filter(item => !item.recalculable).length,
    recalculableMonthCount: months.filter(item => item.recalculable).length,
    months,
  }
}

function normalizeEffectiveScope(value: unknown) {
  return value === 'retroactive' ? 'retroactive' : 'future_only'
}

function normalizeBomType(type: unknown) {
  return String(type || '').trim().toLowerCase()
}

function readPositiveUsage(item: any, field: 'usagePerSample' | 'usagePerBatch') {
  return Number(item?.[field] ?? item?.quantity)
}

function validateBomService(db: any, serviceId: unknown, bomType: string, bomId?: string) {
  const id = String(serviceId || '').trim()
  if (!id) return { ok: true, project: null }

  const project = db.prepare('SELECT id, name, type, status, bom_id FROM projects WHERE id = ? AND is_deleted = 0').get(id) as any
  if (!project) {
    return { ok: false, status: 404, message: '检测服务不存在', code: 'NOT_FOUND' }
  }
  if (Number(project.status) !== 1) {
    return { ok: false, status: 409, message: '停用检测服务不能关联到BOM', code: 'CONFLICT' }
  }
  if (bomType !== 'project' && project.type !== bomType) {
    return { ok: false, status: 422, message: 'BOM类型与检测服务类型不一致', code: 'BOM_PROJECT_TYPE_MISMATCH' }
  }
  if (project.bom_id && project.bom_id !== bomId) {
    return { ok: false, status: 409, message: '检测服务已关联其他BOM', code: 'CONFLICT' }
  }

  return { ok: true, project }
}

function syncBomServiceLink(db: any, bomId: string, previousServiceId: string | null | undefined, nextServiceId: string | null | undefined) {
  const previous = previousServiceId || null
  const next = nextServiceId || null
  if (previous && previous !== next) {
    db.prepare('UPDATE projects SET bom_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND bom_id = ?')
      .run(previous, bomId)
  }
  if (next) {
    db.prepare('UPDATE projects SET bom_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(bomId, next)
  }
}

function validateMaterialGroup(db: any, rawItems: unknown, label: string, usageField: 'usagePerSample' | 'usagePerBatch', options?: { required?: boolean }) {
  const items = Array.isArray(rawItems) ? rawItems : []
  if (options?.required && items.length === 0) {
    return { ok: false, status: 400, message: `${label}至少需要配置一项物料`, code: 'INVALID_PARAMETER' }
  }

  const seen = new Set<string>()
  for (const item of items) {
    const materialId = String(item?.materialId || '').trim()
    if (!materialId) {
      return { ok: false, status: 400, message: `${label}存在未选择物料的明细`, code: 'INVALID_PARAMETER' }
    }
    if (seen.has(materialId)) {
      return { ok: false, status: 409, message: `${label}存在重复物料`, code: 'RESOURCE_CONFLICT' }
    }
    seen.add(materialId)

    const usage = readPositiveUsage(item, usageField)
    if (!Number.isFinite(usage) || usage <= 0) {
      return { ok: false, status: 400, message: `${label}用量必须大于0`, code: 'INVALID_PARAMETER' }
    }

    if (usageField === 'usagePerBatch') {
      const coversSamples = Number(item?.coversSamples || 0)
      if (!Number.isFinite(coversSamples) || coversSamples <= 0) {
        return { ok: false, status: 400, message: `${label}覆盖样本数必须大于0`, code: 'INVALID_PARAMETER' }
      }
    }

    const material = db.prepare('SELECT id, status FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
    if (!material) {
      return { ok: false, status: 404, message: `Material not found: ${materialId}`, code: 'NOT_FOUND' }
    }
    if (Number(material.status) !== 1) {
      return { ok: false, status: 409, message: `${label}包含已停用物料，不能用于BOM`, code: 'CONFLICT' }
    }
  }

  return { ok: true }
}

function readBomMaterialGroup(db: any, bomId: string, table: string) {
  return db.prepare(`SELECT material_id FROM ${table} WHERE bom_id = ?`)
    .all(bomId)
    .map((row: any) => ({ materialId: row.material_id }))
}

function validateBomMaterialUniqueness(db: any, payload: any, options?: { bomId?: string }) {
  const groups = [
    { field: 'materials', table: 'bom_items', label: '特异性试剂' },
    { field: 'generalReagents', table: 'bom_general_reagents', label: '通用试剂' },
    { field: 'generalConsumables', table: 'bom_general_consumables', label: '通用耗材' },
    { field: 'qualityControls', table: 'bom_quality_controls', label: '质控品' },
  ] as const
  const seen = new Map<string, string>()

  for (const group of groups) {
    const rawItems = payload?.[group.field]
    const items = Array.isArray(rawItems)
      ? rawItems
      : (options?.bomId ? readBomMaterialGroup(db, options.bomId, group.table) : [])

    for (const item of items) {
      const materialId = String(item?.materialId || '').trim()
      if (!materialId) continue
      const previousLabel = seen.get(materialId)
      if (previousLabel && previousLabel !== group.label) {
        return {
          ok: false,
          status: 409,
          message: `${previousLabel}与${group.label}存在重复物料`,
          code: 'RESOURCE_CONFLICT',
        }
      }
      seen.set(materialId, group.label)
    }
  }

  return { ok: true }
}

function validateEquipmentTemplates(db: any, rawItems: unknown) {
  const items = Array.isArray(rawItems) ? rawItems : []
  const seen = new Set<string>()

  for (const item of items) {
    const equipmentId = String(item?.equipmentId || '').trim()
    const equipmentTypeId = String(item?.equipmentTypeId || '').trim()
    if ((equipmentId && equipmentTypeId) || (!equipmentId && !equipmentTypeId)) {
      return { ok: false, status: 400, message: '设备模板必须且只能选择设备或设备类型之一', code: 'INVALID_PARAMETER' }
    }

    const usageMinutes = Number(item?.usageMinutes)
    if (!Number.isFinite(usageMinutes) || usageMinutes <= 0) {
      return { ok: false, status: 400, message: '设备模板使用分钟数必须大于0', code: 'INVALID_PARAMETER' }
    }

    const key = equipmentId ? `equipment:${equipmentId}` : `equipmentType:${equipmentTypeId}`
    if (seen.has(key)) {
      return { ok: false, status: 409, message: '设备模板存在重复设备或设备类型', code: 'RESOURCE_CONFLICT' }
    }
    seen.add(key)

    if (equipmentId) {
      const equipment = db.prepare('SELECT id, status FROM equipment WHERE id = ?').get(equipmentId) as any
      if (!equipment) {
        return { ok: false, status: 404, message: `Equipment not found: ${equipmentId}`, code: 'NOT_FOUND' }
      }
      if (Number(equipment.status) !== 1) {
        return { ok: false, status: 409, message: '设备模板包含未启用设备，不能用于BOM', code: 'CONFLICT' }
      }
    }

    if (equipmentTypeId) {
      const equipmentType = db.prepare('SELECT id, status FROM equipment_types WHERE id = ?').get(equipmentTypeId) as any
      if (!equipmentType) {
        return { ok: false, status: 404, message: `Equipment type not found: ${equipmentTypeId}`, code: 'NOT_FOUND' }
      }
      if (Number(equipmentType.status) !== 1) {
        return { ok: false, status: 409, message: '设备模板包含未启用设备类型，不能用于BOM', code: 'CONFLICT' }
      }
    }
  }

  return { ok: true }
}

function validateBomPayload(db: any, payload: any, options?: { requireCoreMaterials?: boolean; bomId?: string }) {
  const type = normalizeBomType(payload?.type)
  if (type && !VALID_BOM_TYPES.has(type)) {
    return { ok: false, status: 400, message: 'BOM类型不支持', code: 'INVALID_PARAMETER' }
  }

  const checks = [
    validateMaterialGroup(db, payload?.materials, '特异性试剂', 'usagePerSample', { required: options?.requireCoreMaterials }),
    validateMaterialGroup(db, payload?.generalReagents, '通用试剂', 'usagePerSample'),
    validateMaterialGroup(db, payload?.generalConsumables, '通用耗材', 'usagePerSample'),
    validateMaterialGroup(db, payload?.qualityControls, '质控品', 'usagePerBatch'),
    validateEquipmentTemplates(db, payload?.equipmentTemplates),
  ]
  return checks.find(check => !check.ok)
    || validateBomMaterialUniqueness(db, payload, { bomId: options?.bomId })
    || { ok: true }
}

function runRetroactiveBomRecalculation(db: any, impactSummary: any, operator: string) {
  const months = Array.isArray(impactSummary?.months) ? impactSummary.months : []
  return months
    .filter((month: any) => month.recalculable)
    .map((month: any) => runCostRecalculation(db, month.yearMonth, operator, 'bom_retroactive_recalculate'))
}

function writeBomVersionSnapshot(
  db: any,
  bomId: string,
  previousSnapshot?: any,
  operator?: string,
  options?: { effectiveScope?: string; impactSummary?: any },
) {
  const snapshot = buildBomVersionSnapshot(db, bomId)
  if (!snapshot) return null
  const diff = buildBomVersionDiff(previousSnapshot, snapshot)
  const changeLog = summarizeBomVersionDiff(diff, Boolean(previousSnapshot))
  db.prepare(`
    INSERT OR REPLACE INTO bom_versions (
      id, bom_id, version, snapshot, diff_summary, change_log,
      effective_scope, impact_summary, changed_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    bomId,
    snapshot.version,
    JSON.stringify(snapshot),
    JSON.stringify(diff),
    changeLog,
    normalizeEffectiveScope(options?.effectiveScope),
    options?.impactSummary ? JSON.stringify(options.impactSummary) : null,
    operator || null,
  )
  return { snapshot, diff, changeLog }
}

function getLatestBomVersionSnapshot(db: any, bomId: string) {
  const rows = db.prepare('SELECT version, snapshot FROM bom_versions WHERE bom_id = ?').all(bomId) as any[]
  const latest = rows.sort((a, b) => versionNumber(b.version) - versionNumber(a.version))[0]
  return parseJsonOrNull(latest?.snapshot)
}

function getBomVersionHistory(db: any, bomId: string, currentVersion: string) {
  const rows = db.prepare(`
    SELECT version, snapshot, diff_summary, change_log,
           effective_scope, impact_summary, changed_by, created_at
    FROM bom_versions
    WHERE bom_id = ?
  `).all(bomId) as any[]
  return rows
    .sort((a, b) => versionNumber(b.version) - versionNumber(a.version))
    .map(row => ({
      version: row.version,
      updatedAt: row.created_at,
      changeLog: row.change_log || '-',
      effectiveScope: row.effective_scope || 'future_only',
      impactSummary: parseJsonOrNull(row.impact_summary),
      changedBy: row.changed_by || null,
      isCurrent: row.version === currentVersion,
      snapshot: parseJsonOrNull(row.snapshot),
      diff: parseJsonOrNull(row.diff_summary) || {},
    }))
}

/** 计算BOM标准成本并写入数据库 */
function updateBomStandardCost(db: any, bomId: string): void {
  try {
    // 1. 计算材料标准成本（基于当前加权平均价）
    const items = db.prepare(`
      SELECT bi.material_id, bi.usage_per_sample, m.price
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
    const { page = 1, pageSize = 20, type, status, keyword } = req.query
    const includeDeleted = req.query?.includeDeleted === 'true'
    const db = getDatabase()
    let where = includeDeleted ? '1=1' : 'b.is_deleted = 0'
    const params: any[] = []
    if (type) { where += ' AND b.type = ?'; params.push(type) }
    if (status === 'active' || status === 'inactive') {
      where += ' AND b.status = ?'
      params.push(status === 'active' ? 1 : 0)
    }
    if (keyword) {
      where += ' AND (b.id LIKE ? OR b.code LIKE ? OR b.name LIKE ?)'
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }

    const count = (db.prepare(`SELECT COUNT(*) as total FROM boms b WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`
      SELECT b.*, p.name as service_name
      FROM boms b
      LEFT JOIN projects p ON b.service_id = p.id AND p.is_deleted = 0
      WHERE ${where}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), offset) as any[]

    // 统计每个BOM的物料数量
    const counts = db.prepare('SELECT bom_id, COUNT(*) as cnt FROM bom_items GROUP BY bom_id').all() as any[]
    const countMap = new Map(counts.map((c: any) => [c.bom_id, c.cnt]))

    successList(res, list.map((r: any) => ({
      id: r.id, code: r.code, name: r.name, version: r.version, type: r.type,
      serviceId: r.service_id, serviceName: r.service_name || null,
      materialCount: countMap.get(r.id) || 0, supportableSamples: calculateBomSupportableSamples(db, r.id),
      unitCost: r.unit_cost, status: r.status === 1 ? 'active' : 'inactive',
      isDeleted: Number(r.is_deleted || 0) !== 0,
      feeStandardId: r.fee_standard_id, feeCategory: r.fee_category,
      standardSlideCost: r.standard_slide_cost, standardFeePerSlide: r.standard_fee_per_slide,
      standardMarginRate: r.standard_margin_rate,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.patch('/batch-status', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    const { status } = req.body
    if (ids.length === 0 || (status !== 'active' && status !== 'inactive')) {
      error(res, 'BOM和状态必填', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    const existing = db.prepare(`
      SELECT id
      FROM boms
      WHERE is_deleted = 0 AND id IN (${placeholders})
    `).all(...ids) as any[]
    if (existing.length !== ids.length) {
      error(res, '存在不存在或已删除的BOM，批量状态未更新', 'NOT_FOUND', 404); return
    }
    const blocked = getStatusBlockedBoms(db, ids, status)
    if (blocked.length > 0) {
      error(
        res,
        status === 'inactive'
          ? '存在已被启用检测项目引用的BOM，批量停用未执行'
          : '存在依赖不可用的BOM，批量启用未执行',
        status === 'inactive' ? 'BOM_REFERENCED_BY_ACTIVE_PROJECT' : 'BOM_DEPENDENCY_INACTIVE',
        409,
        { blocked }
      )
      return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE boms
        SET status = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE id IN (${placeholders}) AND is_deleted = 0
      `).run(status === 'active' ? 1 : 0, (req as any).user?.username || 'system', ...ids)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    success(res, { updatedCount: ids.length }, '批量状态已更新')
  } catch (err: any) { error(res, err.message) }
})

router.patch('/:id/status', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    if (status !== 'active' && status !== 'inactive') {
      error(res, '状态值无效', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM boms WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    const check = buildBomStatusCheck(db, id, status)
    if (!check?.canChange) {
      error(
        res,
        status === 'inactive'
          ? 'BOM已被启用检测项目引用，不可停用'
          : 'BOM存在不可用依赖，不可启用',
        status === 'inactive' ? 'BOM_REFERENCED_BY_ACTIVE_PROJECT' : 'BOM_DEPENDENCY_INACTIVE',
        409,
        { check }
      )
      return
    }

    db.prepare('UPDATE boms SET status = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?')
      .run(status === 'active' ? 1 : 0, (req as any).user?.username || 'system', id)
    success(res, { id, status }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id/check-status', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const status = String(req.query.status || '').trim()
    if (status !== 'active' && status !== 'inactive') {
      error(res, '状态值无效', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const check = buildBomStatusCheck(db, req.params.id, status)
    if (!check) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    success(res, check)
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id/check-deletable', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const db = getDatabase()
    const check = buildBomDeleteCheck(db, req.params.id)
    if (!check) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    success(res, check)
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const bom = db.prepare(`
      SELECT b.*, p.name as service_name
      FROM boms b
      LEFT JOIN projects p ON b.service_id = p.id AND p.is_deleted = 0
      WHERE b.id = ? AND b.is_deleted = 0
    `).get(id) as any
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

    const versionHistory = getBomVersionHistory(db, id, bom.version)

    success(res, {
      id: bom.id, code: bom.code, name: bom.name, version: bom.version,
      type: bom.type, serviceId: bom.service_id, serviceName: bom.service_name || null,
      supportableSamples: calculateBomSupportableSamples(db, bom.id),
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
      versionHistory: versionHistory.length
        ? versionHistory
        : [{ version: bom.version, updatedAt: bom.updated_at, changeLog: '当前版本', isCurrent: true, snapshot: buildBomVersionSnapshot(db, id), diff: {} }],
    })
  } catch (err: any) { error(res, err.message) }
})

router.post('/', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const textPayload = normalizeBomTextPayload(req.body, { requireCode: true, requireName: true })
    if ('message' in textPayload) { error(res, textPayload.message, textPayload.code, textPayload.status); return }
    const normalizedPayload = textPayload.payload
    const { code, name, type, serviceId, description, supportableSamples, feeStandardId, feeCategory, materials, generalReagents, generalConsumables, qualityControls, equipmentTemplates } = normalizedPayload
    const normalizedType = normalizeBomType(type)
    if (!code || !name || !normalizedType) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const validation = validateBomPayload(db, normalizedPayload, { requireCoreMaterials: true })
    if (!validation.ok) { error(res, validation.message, validation.code, validation.status); return }
    const id = uuidv4()
    const serviceValidation = validateBomService(db, serviceId, normalizedType, id)
    if (!serviceValidation.ok) { error(res, serviceValidation.message, serviceValidation.code, serviceValidation.status); return }
    const normalizedServiceId = String(serviceId || '').trim() || null
    const version = 'v1.0'

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('INSERT INTO boms (id, code, name, version, type, service_id, description, supportable_samples, fee_standard_id, fee_category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .run(id, code, name, version, normalizedType, normalizedServiceId, description || null, supportableSamples || null, feeStandardId || null, feeCategory || null)
      syncBomServiceLink(db, id, null, normalizedServiceId)

      for (const m of materials) {
        const itemId = uuidv4()
        const usage = readPositiveUsage(m, 'usagePerSample')
        db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, group_name) VALUES (?, ?, ?, ?, ?, ?)')
          .run(itemId, id, m.materialId, usage, m.unit, m.groupName || null)
      }

      // 保存通用试剂配额
      if (Array.isArray(generalReagents)) {
        for (const r of generalReagents) {
          db.prepare('INSERT INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, r.materialId, readPositiveUsage(r, 'usagePerSample'), r.unit || 'ml', r.allocationType || 'per_slide', r.sortOrder || 0)
        }
      }

      // 保存通用耗材配额
      if (Array.isArray(generalConsumables)) {
        for (const c of generalConsumables) {
          db.prepare('INSERT INTO bom_general_consumables (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, c.materialId, readPositiveUsage(c, 'usagePerSample'), c.unit || '个', c.allocationType || 'per_slide', c.sortOrder || 0)
        }
      }

      // 保存质控品配额
      if (Array.isArray(qualityControls)) {
        for (const q of qualityControls) {
          db.prepare('INSERT INTO bom_quality_controls (id, bom_id, material_id, usage_per_batch, unit, covers_samples, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, q.materialId, readPositiveUsage(q, 'usagePerBatch'), q.unit || '片', Number(q.coversSamples), q.allocationType || 'per_batch', q.sortOrder || 0)
        }
      }

      // 保存设备模板（支持 equipmentTypeId 或 equipmentId）
      if (Array.isArray(equipmentTemplates)) {
        for (const e of equipmentTemplates) {
          db.prepare('INSERT INTO bom_equipment_templates (id, bom_id, equipment_id, equipment_type_id, usage_minutes, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, e.equipmentId || null, e.equipmentTypeId || null, Number(e.usageMinutes), e.sortOrder || 0)
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
      writeBomVersionSnapshot(db, id, null, (req as any).user?.username || 'system')
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
    const textPayload = normalizeBomTextPayload(req.body, { requireName: req.body?.name !== undefined })
    if ('message' in textPayload) { error(res, textPayload.message, textPayload.code, textPayload.status); return }
    const normalizedPayload = textPayload.payload
    const {
      name,
      description,
      supportableSamples,
      serviceId,
      feeStandardId,
      feeCategory,
      materials,
      generalReagents,
      generalConsumables,
      qualityControls,
      equipmentTemplates,
      effectiveScope,
    } = normalizedPayload
    const db = getDatabase()

    const existing = db.prepare('SELECT * FROM boms WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    if (normalizedPayload.code !== undefined && normalizedPayload.code !== existing.code) {
      error(res, 'BOM编号创建后不允许修改', 'INVALID_PARAMETER', 400); return
    }
    const validation = validateBomPayload(db, { type: existing.type, ...normalizedPayload }, { requireCoreMaterials: Array.isArray(materials), bomId: id })
    if (!validation.ok) { error(res, validation.message, validation.code, validation.status); return }
    const nextServiceId = serviceId === undefined ? existing.service_id : (String(serviceId || '').trim() || null)
    const serviceValidation = validateBomService(db, nextServiceId, existing.type, id)
    if (!serviceValidation.ok) { error(res, serviceValidation.message, serviceValidation.code, serviceValidation.status); return }
    const previousSnapshot = getLatestBomVersionSnapshot(db, id) || buildBomVersionSnapshot(db, id)
    const normalizedEffectiveScope = normalizeEffectiveScope(effectiveScope)
    const impactSummary = buildBomChangeImpact(db, id)
    let versionAudit: any = null

    const versionParts = existing.version.replace('v', '').split('.').map(Number)
    versionParts[1] = (versionParts[1] || 0) + 1
    const newVersion = `v${versionParts[0]}.${versionParts[1]}`

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE boms SET name = ?, version = ?, description = ?, service_id = ?, supportable_samples = ?, fee_standard_id = ?, fee_category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(
          name || existing.name,
          newVersion,
          description !== undefined ? description : existing.description,
          nextServiceId,
          supportableSamples || existing.supportable_samples,
          feeStandardId !== undefined ? feeStandardId : existing.fee_standard_id,
          feeCategory !== undefined ? feeCategory : existing.fee_category,
          id,
        )
      syncBomServiceLink(db, id, existing.service_id, nextServiceId)

      if (Array.isArray(materials)) {
        db.prepare('DELETE FROM bom_items WHERE bom_id = ?').run(id)
        for (const m of materials) {
          const itemId = uuidv4()
          const usage = readPositiveUsage(m, 'usagePerSample')
          db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, group_name) VALUES (?, ?, ?, ?, ?, ?)')
            .run(itemId, id, m.materialId, usage, m.unit, m.groupName || null)
        }
      }

      // 更新通用试剂配额
      if (Array.isArray(generalReagents)) {
        db.prepare('DELETE FROM bom_general_reagents WHERE bom_id = ?').run(id)
        for (const r of generalReagents) {
          db.prepare('INSERT INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, r.materialId, readPositiveUsage(r, 'usagePerSample'), r.unit || 'ml', r.allocationType || 'per_slide', r.sortOrder || 0)
        }
      }

      // 更新通用耗材配额
      if (Array.isArray(generalConsumables)) {
        db.prepare('DELETE FROM bom_general_consumables WHERE bom_id = ?').run(id)
        for (const c of generalConsumables) {
          db.prepare('INSERT INTO bom_general_consumables (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, c.materialId, readPositiveUsage(c, 'usagePerSample'), c.unit || '个', c.allocationType || 'per_slide', c.sortOrder || 0)
        }
      }

      // 更新质控品配额
      if (Array.isArray(qualityControls)) {
        db.prepare('DELETE FROM bom_quality_controls WHERE bom_id = ?').run(id)
        for (const q of qualityControls) {
          db.prepare('INSERT INTO bom_quality_controls (id, bom_id, material_id, usage_per_batch, unit, covers_samples, allocation_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, q.materialId, readPositiveUsage(q, 'usagePerBatch'), q.unit || '片', Number(q.coversSamples), q.allocationType || 'per_batch', q.sortOrder || 0)
        }
      }

      // 更新设备模板（支持 equipmentTypeId 或 equipmentId）
      if (Array.isArray(equipmentTemplates)) {
        db.prepare('DELETE FROM bom_equipment_templates WHERE bom_id = ?').run(id)
        for (const e of equipmentTemplates) {
          db.prepare('INSERT INTO bom_equipment_templates (id, bom_id, equipment_id, equipment_type_id, usage_minutes, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), id, e.equipmentId || null, e.equipmentTypeId || null, Number(e.usageMinutes), e.sortOrder || 0)
        }
      }

      // 计算并写入标准成本（在事务内）
      updateBomStandardCost(db, id)
      versionAudit = writeBomVersionSnapshot(db, id, previousSnapshot, (req as any).user?.username || 'system', {
        effectiveScope: normalizedEffectiveScope,
        impactSummary,
      })

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    const retroactiveRuns = normalizedEffectiveScope === 'retroactive'
      ? runRetroactiveBomRecalculation(db, impactSummary, (req as any).user?.username || 'system')
      : []
    const requiresRecalculation = normalizedEffectiveScope === 'retroactive'
      && impactSummary.recalculableMonthCount > 0
      && retroactiveRuns.some((run: any) => run.status !== 'completed')

    logOperation(db, req as any, {
      operation: 'PUT /boms/:id/version-impact',
      description: '更新BOM版本并记录成本影响',
      requestData: {
        module: 'bom',
        bomId: id,
        previousVersion: existing.version,
        nextVersion: newVersion,
        effectiveScope: normalizedEffectiveScope,
        changedFields: versionAudit?.diff?.changedFields || [],
        addedMaterialCount: versionAudit?.diff?.addedMaterials?.length || 0,
        removedMaterialCount: versionAudit?.diff?.removedMaterials?.length || 0,
        changedMaterialCount: versionAudit?.diff?.changedMaterials?.length || 0,
      },
      responseData: {
        id,
        version: newVersion,
        changeLog: versionAudit?.changeLog || '版本更新',
        impactSummary,
        retroactiveRunIds: retroactiveRuns.map((run: any) => run.id),
        requiresRecalculation,
      },
    })

    success(res, {
      id,
      version: newVersion,
      effectiveScope: normalizedEffectiveScope,
      impactSummary,
      retroactiveRuns,
      requiresRecalculation,
    }, 'Updated')
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

router.delete('/batch', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    if (ids.length === 0) { error(res, '请选择BOM', 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()
    const { missingIds, blocked } = getDeletableBoms(db, ids)
    if (missingIds.length > 0) {
      error(res, '存在不存在或已删除的BOM，批量删除未执行', 'NOT_FOUND', 404); return
    }
    if (blocked.length > 0) {
      error(res, '存在已被业务数据引用的BOM，批量删除未执行', 'CONFLICT', 409); return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE boms
        SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE id IN (${ids.map(() => '?').join(',')})
      `).run((req as any).user?.username || 'system', ...ids)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    success(res, { deletedCount: ids.length }, '批量删除成功')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', authenticateToken, requireBomWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM boms WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    const references = getBomReferences(db, id)
    if (references.length > 0) {
      error(res, 'BOM已被业务数据引用，不可删除', 'CONFLICT', 409)
      return
    }
    db.prepare('UPDATE boms SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
