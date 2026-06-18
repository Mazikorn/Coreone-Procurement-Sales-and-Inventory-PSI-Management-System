import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { requireStrictRole } from '../middleware/auth.js'
import { normalizeDisplayText, requireValidText, type TextGuardResult } from '../utils/text-guard.js'

const router = Router()

// 计算设备折旧
// 注意：直线法使用日历年度（365天/年 × 24小时/天 × 60分钟/小时 = 525,600分钟/年）
// 设备无论是否使用都会折旧（老化、技术淘汰等）
// 与 cost-calculator.ts 中的 calculateEquipmentCost 保持一致
function calculateDepreciation(
  purchasePrice: number,
  residualValue: number,
  depreciableLifeYears: number,
  depreciationMethod: string,
  totalCapacity?: number,
  usedCapacity?: number
): number {
  const depreciableAmount = purchasePrice - residualValue
  if (depreciableAmount <= 0) return 0

  if (depreciationMethod === 'units_of_production' && totalCapacity && totalCapacity > 0 && usedCapacity) {
    // 工作量法
    return (depreciableAmount / totalCapacity) * usedCapacity
  }
  // 直线法（默认）- 返回年折旧额
  if (!depreciableLifeYears || depreciableLifeYears <= 0) return 0
  return depreciableAmount / depreciableLifeYears
}

// 获取设备折旧统计（按设备类型聚合）
router.get('/depreciation-stats', (req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT
        et.id as type_id,
        et.code as type_code,
        et.name as type_name,
        COUNT(e.id) as equipment_count,
        COALESCE(SUM(e.purchase_price), 0) as total_purchase_price,
        COALESCE(SUM(CASE WHEN e.depreciation_method = 'straight_line' AND e.depreciable_life_years > 0
          THEN (e.purchase_price - e.residual_value) / e.depreciable_life_years ELSE 0 END), 0) as total_annual_depreciation,
        COALESCE(SUM(CASE WHEN e.depreciation_method = 'straight_line' AND e.depreciable_life_years > 0
          THEN (e.purchase_price - e.residual_value) / e.depreciable_life_years / 12 ELSE 0 END), 0) as total_monthly_depreciation
      FROM equipment_types et
      LEFT JOIN equipment e ON e.type_id = et.id AND e.status != 2
      GROUP BY et.id
      ORDER BY total_annual_depreciation DESC
    `).all() as any[]

    const stats = rows.map((r: any) => ({
      typeId: r.type_id,
      typeCode: r.type_code,
      typeName: r.type_name,
      equipmentCount: r.equipment_count || 0,
      totalPurchasePrice: Math.round((r.total_purchase_price || 0) * 100) / 100,
      totalAnnualDepreciation: Math.round((r.total_annual_depreciation || 0) * 100) / 100,
      totalMonthlyDepreciation: Math.round((r.total_monthly_depreciation || 0) * 100) / 100,
    }))

    const unclassified = db.prepare(`
      SELECT
        COUNT(e.id) as equipment_count,
        COALESCE(SUM(e.purchase_price), 0) as total_purchase_price,
        COALESCE(SUM(CASE WHEN e.depreciation_method = 'straight_line' AND e.depreciable_life_years > 0
          THEN (e.purchase_price - e.residual_value) / e.depreciable_life_years ELSE 0 END), 0) as total_annual_depreciation,
        COALESCE(SUM(CASE WHEN e.depreciation_method = 'straight_line' AND e.depreciable_life_years > 0
          THEN (e.purchase_price - e.residual_value) / e.depreciable_life_years / 12 ELSE 0 END), 0) as total_monthly_depreciation
      FROM equipment e
      WHERE e.type_id IS NULL AND e.status != 2
    `).get() as any

    if ((unclassified?.equipment_count || 0) > 0) {
      stats.push({
        typeId: 'unclassified',
        typeCode: 'UNCLASSIFIED',
        typeName: '未分类',
        equipmentCount: unclassified.equipment_count || 0,
        totalPurchasePrice: Math.round((unclassified.total_purchase_price || 0) * 100) / 100,
        totalAnnualDepreciation: Math.round((unclassified.total_annual_depreciation || 0) * 100) / 100,
        totalMonthlyDepreciation: Math.round((unclassified.total_monthly_depreciation || 0) * 100) / 100,
      })
    }

    const summary = {
      totalEquipment: stats.reduce((s: number, r: any) => s + r.equipmentCount, 0),
      totalPurchasePrice: stats.reduce((s: number, r: any) => s + r.totalPurchasePrice, 0),
      totalAnnualDepreciation: stats.reduce((s: number, r: any) => s + r.totalAnnualDepreciation, 0),
      totalMonthlyDepreciation: stats.reduce((s: number, r: any) => s + r.totalMonthlyDepreciation, 0),
    }

    success(res, { summary, stats })
  } catch (err: any) { error(res, err.message) }
})

// 获取设备列表
function buildEquipmentWhere(query: any) {
  const { keyword, status, typeId } = query
  let where = '1=1'
  const params: any[] = []
  if (keyword) {
    where += ' AND (e.code LIKE ? OR e.name LIKE ? OR e.model LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  if (status && status !== 'all') {
    where += ' AND e.status = ?'
    params.push(status === 'active' ? 1 : status === 'inactive' ? 0 : 2)
  }
  if (typeId) {
    where += ' AND e.type_id = ?'
    params.push(typeId)
  }
  return { where, params }
}

function sendTextError(res: any, result: TextGuardResult): result is Extract<TextGuardResult, { ok: false }> {
  if ('message' in result) {
    error(res, result.message, result.code, result.status)
    return true
  }
  return false
}

type EquipmentStatusParse =
  | { ok: true; value: number }
  | { ok: false; message: string }

type DepreciationMethodParse =
  | { ok: true; value: string }
  | { ok: false; message: string }

type EquipmentValueValidation =
  | {
    ok: true
    purchasePrice: number
    depreciableLifeYears: number
    residualValue: number
    depreciationMethod: string
    totalCapacity: number
  }
  | { ok: false; message: string }

function parseEquipmentStatus(status: unknown, fallback = 1): EquipmentStatusParse {
  if (status === undefined || status === null || status === '') return { ok: true, value: fallback }
  if (status === 'active') return { ok: true, value: 1 }
  if (status === 'inactive') return { ok: true, value: 0 }
  if (status === 'scrapped') return { ok: true, value: 2 }
  return { ok: false, message: '设备状态无效' }
}

function parseDepreciationMethod(method: unknown, fallback = 'straight_line'): DepreciationMethodParse {
  const value = method === undefined || method === null || method === '' ? fallback : String(method)
  if (value === 'straight_line' || value === 'units_of_production') return { ok: true, value }
  return { ok: false, message: '折旧方式无效' }
}

function numberOrDefault(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === '') return fallback
  return Number(value)
}

function validateEquipmentValues(input: {
  purchasePrice: unknown
  depreciableLifeYears: unknown
  residualValue: unknown
  depreciationMethod: unknown
  totalCapacity: unknown
}): EquipmentValueValidation {
  const purchasePrice = numberOrDefault(input.purchasePrice, 0)
  const depreciableLifeYears = numberOrDefault(input.depreciableLifeYears, 5)
  const residualValue = numberOrDefault(input.residualValue, 0)
  const depreciationMethod = parseDepreciationMethod(input.depreciationMethod)
  const totalCapacity = numberOrDefault(input.totalCapacity, 0)

  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return { ok: false, message: '购置价格必须大于等于0' }
  if (!Number.isFinite(residualValue) || residualValue < 0) return { ok: false, message: '残值必须大于等于0' }
  if (residualValue > purchasePrice) return { ok: false, message: '残值不能大于购置价格' }
  if (!Number.isFinite(depreciableLifeYears) || depreciableLifeYears <= 0) return { ok: false, message: '折旧年限必须大于0' }
  if (depreciationMethod.ok === false) return { ok: false, message: depreciationMethod.message }
  if (!Number.isFinite(totalCapacity) || totalCapacity < 0) return { ok: false, message: '总工作量必须大于等于0' }
  if (depreciationMethod.value === 'units_of_production' && totalCapacity <= 0) return { ok: false, message: '工作量法必须填写大于0的总工作量' }

  return { ok: true, purchasePrice, depreciableLifeYears, residualValue, depreciationMethod: depreciationMethod.value, totalCapacity }
}

router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const db = getDatabase()
    const { where, params } = buildEquipmentWhere(req.query)

    const count = (db.prepare(`SELECT COUNT(*) as total FROM equipment e WHERE ${where}`).get(...params) as any)?.total || 0
    const pageNum = Math.max(1, Number(page))
    const safePageSize = Math.max(1, Math.min(1000, Number(pageSize)))
    const offset = (pageNum - 1) * safePageSize
    const list = db.prepare(`
      SELECT e.*, et.name as type_name, et.code as type_code
      FROM equipment e
      LEFT JOIN equipment_types et ON e.type_id = et.id
      WHERE ${where}
      ORDER BY e.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, safePageSize, offset) as any[]

    // 计算每个设备的累计折旧
    const usageSums = db.prepare('SELECT equipment_id, SUM(usage_minutes) as total_minutes, SUM(depreciation_cost) as total_depreciation FROM equipment_usage GROUP BY equipment_id').all() as any[]
    const usageMap = new Map(usageSums.map((u: any) => [u.equipment_id, u]))

    successList(res, list.map((r: any) => {
      const usage = usageMap.get(r.id)
      const annualDepreciation = calculateDepreciation(
        r.purchase_price || 0,
        r.residual_value || 0,
        r.depreciable_life_years || 5,
        r.depreciation_method || 'straight_line',
        r.total_capacity,
        usage?.total_minutes || 0
      )
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        model: r.model,
        manufacturer: r.manufacturer,
        purchasePrice: r.purchase_price,
        purchaseDate: r.purchase_date,
        depreciableLifeYears: r.depreciable_life_years,
        residualValue: r.residual_value,
        depreciationMethod: r.depreciation_method,
        totalCapacity: r.total_capacity,
        capacityUnit: r.capacity_unit,
        status: r.status === 1 ? 'active' : r.status === 0 ? 'inactive' : 'scrapped',
        locationId: r.location_id,
        typeId: r.type_id || null,
        typeName: r.type_name || null,
        annualDepreciation,
        accumulatedDepreciation: usage?.total_depreciation || 0,
        netBookValue: (r.purchase_price || 0) - (usage?.total_depreciation || 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }
    }), pageNum, safePageSize, count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const { where, params } = buildEquipmentWhere(req.query)
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN e.status = 1 THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN e.status = 0 THEN 1 ELSE 0 END), 0) as inactive,
        COALESCE(SUM(CASE WHEN e.status = 2 THEN 1 ELSE 0 END), 0) as scrapped,
        COALESCE(SUM(e.purchase_price), 0) as totalValue
      FROM equipment e
      WHERE ${where}
    `).get(...params) as any
    success(res, {
      total: row?.total || 0,
      active: row?.active || 0,
      inactive: row?.inactive || 0,
      scrapped: row?.scrapped || 0,
      totalValue: row?.totalValue || 0,
    })
  } catch (err: any) { error(res, err.message) }
})

// 获取设备详情
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const r = db.prepare(`
      SELECT e.*, et.name as type_name, et.code as type_code
      FROM equipment e
      LEFT JOIN equipment_types et ON e.type_id = et.id
      WHERE e.id = ?
    `).get(id) as any
    if (!r) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    // 计算折旧
    const purchasePrice = r.purchase_price || 0
    const residualValue = r.residual_value || 0
    const lifeYears = r.depreciable_life_years || 5
    let annualDepreciation = 0
    if (r.depreciation_method === 'straight_line') {
      annualDepreciation = (purchasePrice - residualValue) / lifeYears
    }

    // 查询累计折旧
    const usage = db.prepare('SELECT COALESCE(SUM(depreciation_cost), 0) as total_depreciation FROM equipment_usage WHERE equipment_id = ?').get(id) as any
    const accumulatedDepreciation = usage?.total_depreciation || 0
    const netBookValue = purchasePrice - accumulatedDepreciation

    success(res, {
      id: r.id,
      code: r.code,
      name: r.name,
      model: r.model,
      manufacturer: r.manufacturer,
      purchasePrice: r.purchase_price,
      purchaseDate: r.purchase_date,
      depreciableLifeYears: r.depreciable_life_years,
      residualValue: r.residual_value,
      depreciationMethod: r.depreciation_method,
      totalCapacity: r.total_capacity,
      capacityUnit: r.capacity_unit,
      status: r.status === 1 ? 'active' : r.status === 0 ? 'inactive' : 'scrapped',
      locationId: r.location_id,
      typeId: r.type_id || null,
      typeName: r.type_name || null,
      annualDepreciation: Math.round(annualDepreciation * 100) / 100,
      accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
      netBookValue: Math.round(netBookValue * 100) / 100,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })
  } catch (err: any) { error(res, err.message) }
})

// 创建设备
router.post('/', requireStrictRole('admin'), (req, res) => {
  try {
    const { code, name, model, manufacturer, purchasePrice, purchaseDate, depreciableLifeYears, residualValue, depreciationMethod, totalCapacity, capacityUnit, status, locationId, typeId } = req.body
    const codeText = requireValidText(code, '设备编码', 100)
    if (sendTextError(res, codeText)) return
    const nameText = requireValidText(name, '设备名称')
    if (sendTextError(res, nameText)) return
    const modelText = normalizeDisplayText(model, '设备型号', { maxLength: 120 })
    if (sendTextError(res, modelText)) return
    const manufacturerText = normalizeDisplayText(manufacturer, '设备厂商', { maxLength: 120 })
    if (sendTextError(res, manufacturerText)) return
    const capacityUnitText = normalizeDisplayText(capacityUnit, '工作量单位', { maxLength: 40 })
    if (sendTextError(res, capacityUnitText)) return
    const values = validateEquipmentValues({ purchasePrice, depreciableLifeYears, residualValue, depreciationMethod, totalCapacity })
    if (values.ok === false) { error(res, values.message, 'INVALID_PARAMETER', 400); return }
    const parsedStatus = parseEquipmentStatus(status, 1)
    if (parsedStatus.ok === false) { error(res, parsedStatus.message, 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()
    const id = uuidv4()
    db.prepare('INSERT INTO equipment (id, code, name, model, manufacturer, purchase_price, purchase_date, depreciable_life_years, residual_value, depreciation_method, total_capacity, capacity_unit, status, location_id, type_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, codeText.value, nameText.value, modelText.value, manufacturerText.value, values.purchasePrice, purchaseDate || null, values.depreciableLifeYears, values.residualValue, values.depreciationMethod, values.totalCapacity || null, capacityUnitText.value, parsedStatus.value, locationId || null, typeId || null)
    success(res, { id }, 'Created', 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, 'Code exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

// 更新设备
router.put('/:id', requireStrictRole('admin'), (req, res) => {
  try {
    const { id } = req.params
    const { name, model, manufacturer, purchasePrice, purchaseDate, depreciableLifeYears, residualValue, depreciationMethod, totalCapacity, capacityUnit, status, locationId, typeId } = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id) as any
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    const nameText = name !== undefined
      ? requireValidText(name, '设备名称')
      : { ok: true as const, value: existing.name }
    if (sendTextError(res, nameText)) return
    const modelText = model !== undefined
      ? normalizeDisplayText(model, '设备型号', { maxLength: 120 })
      : { ok: true as const, value: existing.model }
    if (sendTextError(res, modelText)) return
    const manufacturerText = manufacturer !== undefined
      ? normalizeDisplayText(manufacturer, '设备厂商', { maxLength: 120 })
      : { ok: true as const, value: existing.manufacturer }
    if (sendTextError(res, manufacturerText)) return
    const capacityUnitText = capacityUnit !== undefined
      ? normalizeDisplayText(capacityUnit, '工作量单位', { maxLength: 40 })
      : { ok: true as const, value: existing.capacity_unit }
    if (sendTextError(res, capacityUnitText)) return
    const values = validateEquipmentValues({
      purchasePrice: purchasePrice !== undefined ? purchasePrice : existing.purchase_price,
      depreciableLifeYears: depreciableLifeYears !== undefined ? depreciableLifeYears : existing.depreciable_life_years,
      residualValue: residualValue !== undefined ? residualValue : existing.residual_value,
      depreciationMethod: depreciationMethod !== undefined ? depreciationMethod : existing.depreciation_method,
      totalCapacity: totalCapacity !== undefined ? totalCapacity : existing.total_capacity,
    })
    if (values.ok === false) { error(res, values.message, 'INVALID_PARAMETER', 400); return }
    const parsedStatus = parseEquipmentStatus(status, existing.status)
    if (parsedStatus.ok === false) { error(res, parsedStatus.message, 'INVALID_PARAMETER', 400); return }

    db.prepare('UPDATE equipment SET name = ?, model = ?, manufacturer = ?, purchase_price = ?, purchase_date = ?, depreciable_life_years = ?, residual_value = ?, depreciation_method = ?, total_capacity = ?, capacity_unit = ?, status = ?, location_id = ?, type_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(
        nameText.value,
        modelText.value,
        manufacturerText.value,
        values.purchasePrice,
        purchaseDate !== undefined ? purchaseDate : existing.purchase_date,
        values.depreciableLifeYears,
        values.residualValue,
        values.depreciationMethod,
        values.totalCapacity || null,
        capacityUnitText.value || existing.capacity_unit,
        parsedStatus.value,
        locationId !== undefined ? locationId : existing.location_id,
        typeId !== undefined ? typeId : existing.type_id,
        id
      )
    success(res, { id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

// 删除设备
router.delete('/:id', requireStrictRole('admin'), (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    // 检查是否有使用记录
    const usageCount = (db.prepare('SELECT COUNT(*) as count FROM equipment_usage WHERE equipment_id = ?').get(id) as any)?.count || 0
    if (usageCount > 0) {
      error(res, `设备有 ${usageCount} 条使用记录，不可删除。请先归档使用记录`, 'CONFLICT', 409)
      return
    }
    const bomTemplateCount = (db.prepare('SELECT COUNT(*) as count FROM bom_equipment_templates WHERE equipment_id = ?').get(id) as any)?.count || 0
    if (bomTemplateCount > 0) {
      error(res, `设备已被 ${bomTemplateCount} 个BOM设备模板引用，不可删除`, 'CONFLICT', 409)
      return
    }

    db.prepare('DELETE FROM equipment WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

// 获取设备使用记录
router.get('/:id/usage', (req, res) => {
  try {
    const { id } = req.params
    const { page = 1, pageSize = 20 } = req.query
    const db = getDatabase()
    const equipment = db.prepare('SELECT id FROM equipment WHERE id = ?').get(id)
    if (!equipment) { error(res, 'Equipment not found', 'NOT_FOUND', 404); return }
    const count = (db.prepare('SELECT COUNT(*) as total FROM equipment_usage WHERE equipment_id = ?').get(id) as any)?.total || 0
    const pageNum = Math.max(1, Number(page))
    const safePageSize = Math.max(1, Math.min(1000, Number(pageSize)))
    const offset = (pageNum - 1) * safePageSize
    const list = db.prepare('SELECT * FROM equipment_usage WHERE equipment_id = ? ORDER BY usage_date DESC LIMIT ? OFFSET ?').all(id, safePageSize, offset) as any[]

    successList(res, list.map((u: any) => ({
      id: u.id,
      equipmentId: u.equipment_id,
      projectId: u.project_id,
      outboundId: u.outbound_id,
      usageMinutes: u.usage_minutes,
      usageCount: u.usage_count,
      depreciationCost: u.depreciation_cost,
      operator: u.operator,
      usageDate: u.usage_date,
      createdAt: u.created_at,
    })), pageNum, safePageSize, count)
  } catch (err: any) { error(res, err.message) }
})

// 登记设备使用
router.post('/:id/usage', (req, res) => {
  try {
    const { id } = req.params
    const { projectId, outboundId, usageMinutes, usageCount, usageDate } = req.body
    const parsedUsageMinutes = numberOrDefault(usageMinutes, 0)
    const parsedUsageCount = numberOrDefault(usageCount, 1)
    if (!Number.isFinite(parsedUsageMinutes) || parsedUsageMinutes <= 0) {
      error(res, '使用时长必须大于0', 'INVALID_PARAMETER', 400); return
    }
    if (!Number.isFinite(parsedUsageCount) || parsedUsageCount <= 0) {
      error(res, '使用次数必须大于0', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const operator = (req as any).user?.username || 'system'

    const equipment = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id) as any
    if (!equipment) { error(res, 'Equipment not found', 'NOT_FOUND', 404); return }
    if (Number(equipment.status) !== 1) { error(res, '设备未启用，不能登记使用', 'BUSINESS_RULE', 400); return }

    // 计算本次折旧成本
    // 注意：直线法使用日历年度（365天/年 × 24小时/天 × 60分钟/小时 = 525,600分钟/年）
    // 设备无论是否使用都会折旧（老化、技术淘汰等）
    const depreciableAmount = (equipment.purchase_price || 0) - (equipment.residual_value || 0)
    let depreciationCost = 0
    if (depreciableAmount > 0) {
      if (equipment.depreciation_method === 'units_of_production' && equipment.total_capacity) {
        depreciationCost = (depreciableAmount / equipment.total_capacity) * parsedUsageMinutes
      } else {
        // 直线法：按日历年度折旧（365天/年 × 24小时/天 × 60分钟/小时 = 525600分钟/年）
        const minutesPerYear = 365 * 24 * 60
        const totalMinutes = (equipment.depreciable_life_years || 5) * minutesPerYear
        if (totalMinutes > 0) {
          const depreciationPerMinute = depreciableAmount / totalMinutes
          depreciationCost = depreciationPerMinute * parsedUsageMinutes
        }
      }
    }

    const usageId = uuidv4()
    db.prepare('INSERT INTO equipment_usage (id, equipment_id, project_id, outbound_id, usage_minutes, usage_count, depreciation_cost, operator, usage_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(usageId, id, projectId || null, outboundId || null, parsedUsageMinutes, parsedUsageCount, depreciationCost, operator, usageDate || new Date().toISOString().split('T')[0])

    success(res, { id: usageId, depreciationCost }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

export default router
