import { Router } from 'express'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, error } from '../utils/response.js'
import {
  getOrCalculateProjectFullCost,
  calculateEquipmentCostFromRows,
  calculateLaborCost,
  calculateEquipmentCost,
  calculateQCCost,
  calculateIndirectCost,
} from '../utils/cost-calculator.js'

const router = Router()

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function formatYearMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getDateRange(query: any) {
  const timeRange = String(query.timeRange || '').trim()
  const monthMatch = timeRange.match(/^(\d+)m$/)
  const endDate = query.endDate ? String(query.endDate) : new Date().toISOString().slice(0, 10)
  let startDate = query.startDate ? String(query.startDate) : ''

  if (!startDate && monthMatch) {
    const months = Math.max(1, Math.min(36, Number(monthMatch[1])))
    const end = new Date(`${endDate}T00:00:00`)
    const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1)
    startDate = start.toISOString().slice(0, 10)
  }

  return { startDate, endDate }
}

router.get('/cost-by-project', (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const db = getDatabase()
    let where = "r.status = 'completed' AND r.is_deleted = 0"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }

    const rows = db.prepare(`
      SELECT r.project_id, p.name, p.type, SUM(r.total_cost) as total_cost, SUM(COALESCE(r.sample_count, 1)) as sample_count
      FROM outbound_records r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE ${where}
      GROUP BY r.project_id
      ORDER BY total_cost DESC
    `).all(...params) as any[]

    const totalCost = rows.reduce((sum: number, r: any) => sum + (r.total_cost || 0), 0)
    const totalSamples = rows.reduce((sum: number, r: any) => sum + r.sample_count, 0)

    success(res, {
      summary: { totalCost, projectCost: totalCost, publicCost: 0, totalSamples },
      projects: rows.map((r: any) => ({
        id: r.project_id, name: r.name || 'Unknown', category: r.type || 'other',
        sampleCount: r.sample_count,
        unitCost: r.sample_count > 0 ? r.total_cost / r.sample_count : 0,
        totalCost: r.total_cost || 0,
        ratio: totalCost > 0 ? Math.round(((r.total_cost || 0) / totalCost * 100) * 10) / 10 : 0,
        changeRate: 0, changeDirection: 'down' as const,
      })),
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/cost-by-material', (req, res) => {
  try {
    const { startDate, endDate, categoryId } = req.query
    const db = getDatabase()
    let where = "o.status = 'completed' AND o.is_deleted = 0"
    const params: any[] = []
    if (startDate) { where += ' AND o.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND o.created_at <= ?'; params.push(`${endDate}T23:59:59`) }
    if (categoryId) { where += ' AND m.category_id = ?'; params.push(categoryId) }

    // 1. 出库成本
    const outboundRows = db.prepare(`
      SELECT oi.material_id, m.name, m.spec, SUM(oi.quantity) as consumption, m.unit as consumption_unit, SUM(oi.total_cost) as total_cost
      FROM outbound_items oi
      JOIN outbound_records o ON oi.outbound_id = o.id
      JOIN materials m ON oi.material_id = m.id
      WHERE ${where}
      GROUP BY oi.material_id
      ORDER BY total_cost DESC
    `).all(...params) as any[]

    // 2. 退库成本（相同时间范围）
    let returnWhere = 'is_deleted = 0'
    const returnParams: any[] = []
    if (startDate) { returnWhere += ' AND created_at >= ?'; returnParams.push(startDate) }
    if (endDate) { returnWhere += ' AND created_at <= ?'; returnParams.push(`${endDate}T23:59:59`) }

    const returnRows = db.prepare(`
      SELECT material_id, SUM(total_cost) as return_cost
      FROM return_records
      WHERE ${returnWhere}
      GROUP BY material_id
    `).all(...returnParams) as any[]

    const returnMap = new Map(returnRows.map(r => [r.material_id, r.return_cost || 0]))

    // 3. 合并：净成本 = 出库成本 - 退库成本
    const rows = outboundRows.map((r: any) => ({
      ...r,
      total_cost: Math.max(0, (r.total_cost || 0) - (returnMap.get(r.material_id) || 0)),
    }))

    const totalCost = rows.reduce((sum: number, r: any) => sum + r.total_cost, 0)

    success(res, {
      materials: rows.map((r: any) => ({
        id: r.material_id, name: r.name, spec: r.spec,
        consumption: r.consumption, consumptionUnit: r.consumption_unit,
        totalCost: r.total_cost,
        ratio: totalCost > 0 ? parseFloat((r.total_cost / totalCost * 100).toFixed(1)) : 0,
        changeRate: 0, changeDirection: 'down' as const,
      })),
      trend: [],
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/cost-by-supplier', (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const db = getDatabase()
    let where = "r.status = 'completed' AND r.is_deleted = 0 AND (s.is_deleted = 0 OR s.id IS NULL)"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }

    const rows = db.prepare(`
      SELECT r.supplier_id, s.name, SUM(r.amount) as amount, COUNT(r.id) as order_count
      FROM inbound_records r
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      WHERE ${where} AND r.supplier_id IS NOT NULL
      GROUP BY r.supplier_id
      ORDER BY amount DESC
    `).all(...params) as any[]

    const totalAmount = rows.reduce((sum: number, r: any) => sum + (r.amount || 0), 0)

    success(res, {
      suppliers: rows.map((r: any) => ({
        id: r.supplier_id, name: r.name || 'Unknown',
        amount: r.amount, ratio: totalAmount > 0 ? parseFloat((r.amount / totalAmount * 100).toFixed(1)) : 0,
        orderCount: r.order_count, status: 'long-term',
      })),
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/cost-trend', (req, res) => {
  try {
    const { startDate, endDate, dimension = 'monthly', projectType } = req.query
    const db = getDatabase()
    let where = "r.status = 'completed' AND r.is_deleted = 0"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }
    if (projectType && projectType !== 'all') {
      where += ' AND p.type = ?'
      params.push(projectType)
    }

    if (dimension === 'quarterly') {
      // 季度聚合
      const quarterExpr = `
        strftime('%Y', r.created_at) || '-Q' ||
        CASE
          WHEN CAST(strftime('%m', r.created_at) AS INTEGER) BETWEEN 1 AND 3 THEN '1'
          WHEN CAST(strftime('%m', r.created_at) AS INTEGER) BETWEEN 4 AND 6 THEN '2'
          WHEN CAST(strftime('%m', r.created_at) AS INTEGER) BETWEEN 7 AND 9 THEN '3'
          WHEN CAST(strftime('%m', r.created_at) AS INTEGER) BETWEEN 10 AND 12 THEN '4'
        END
      `
      const rows = db.prepare(`
        SELECT ${quarterExpr} as period,
          SUM(r.total_cost) as cost,
          COUNT(*) as record_count,
          SUM(COALESCE(r.sample_count, 1)) as sample_count
        FROM outbound_records r
        LEFT JOIN projects p ON r.project_id = p.id AND p.is_deleted = 0
        WHERE ${where}
        GROUP BY period
        ORDER BY period
      `).all(...params) as any[]

      // 检查当前季度是否完整
      const now = new Date()
      const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}`
      const currentYear = now.getFullYear()
      const currentPeriod = `${currentYear}-${currentQuarter}`

      success(res, {
        dimension: 'quarterly',
        trend: rows.map((r: any) => ({
          period: r.period,
          cost: r.cost || 0,
          recordCount: r.record_count || 0,
          sampleCount: r.sample_count || 0,
          isComplete: r.period !== currentPeriod,
        })),
      })
    } else {
      // 月度聚合（默认）
      const rows = db.prepare(`
        SELECT strftime('%Y-%m', r.created_at) as period,
          SUM(r.total_cost) as cost,
          COUNT(*) as record_count,
          SUM(COALESCE(r.sample_count, 1)) as sample_count
        FROM outbound_records r
        LEFT JOIN projects p ON r.project_id = p.id AND p.is_deleted = 0
        WHERE ${where}
        GROUP BY period
        ORDER BY period
      `).all(...params) as any[]

      success(res, {
        dimension: 'monthly',
        trend: rows.map((r: any) => ({
          period: r.period,
          cost: r.cost || 0,
          recordCount: r.record_count || 0,
          sampleCount: r.sample_count || 0,
        })),
      })
    }
  } catch (err: any) { error(res, err.message) }
})

router.get('/cost-by-project-group', (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query
    const db = getDatabase()

    let where = "r.status = 'completed' AND r.is_deleted = 0"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }
    if (projectId) { where += ' AND r.project_id = ?'; params.push(projectId) }

    // 1. 按 project + group 汇总
    const groupRows = db.prepare(`
      SELECT
        r.project_id,
        p.name as project_name,
        COALESCE(bi.group_name, '未分组') as group_name,
        COUNT(DISTINCT r.id) as sample_count,
        SUM(oi.total_cost) as total_cost
      FROM outbound_records r
      JOIN outbound_items oi ON oi.outbound_id = r.id
      LEFT JOIN projects p ON r.project_id = p.id AND p.is_deleted = 0
      LEFT JOIN boms b ON b.id = p.bom_id AND b.is_deleted = 0
      LEFT JOIN bom_items bi ON bi.bom_id = b.id AND bi.material_id = oi.material_id
      WHERE ${where}
      GROUP BY r.project_id, COALESCE(bi.group_name, '未分组')
      ORDER BY r.project_id, total_cost DESC
    `).all(...params) as any[]

    // 2. 按 project + group + material 明细
    const detailRows = db.prepare(`
      SELECT
        r.project_id,
        COALESCE(bi.group_name, '未分组') as group_name,
        oi.material_id,
        m.name as material_name,
        SUM(oi.quantity) as quantity,
        SUM(oi.total_cost) as total_cost
      FROM outbound_records r
      JOIN outbound_items oi ON oi.outbound_id = r.id
      JOIN materials m ON oi.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN projects p ON r.project_id = p.id
      LEFT JOIN boms b ON b.id = p.bom_id
      LEFT JOIN bom_items bi ON bi.bom_id = b.id AND bi.material_id = oi.material_id
      WHERE ${where}
      GROUP BY r.project_id, COALESCE(bi.group_name, '未分组'), oi.material_id
      ORDER BY r.project_id, group_name, total_cost DESC
    `).all(...params) as any[]

    // 构建嵌套结构
    const projectMap = new Map<string, any>()

    for (const row of groupRows) {
      const pid = row.project_id
      if (!projectMap.has(pid)) {
        projectMap.set(pid, {
          projectId: pid,
          projectName: row.project_name || 'Unknown',
          totalCost: 0,
          sampleCount: 0,
          groups: [],
        })
      }
      const proj = projectMap.get(pid)
      proj.totalCost += row.total_cost || 0
      proj.sampleCount = Math.max(proj.sampleCount, row.sample_count || 0)
      proj.groups.push({
        groupName: row.group_name,
        sampleCount: row.sample_count || 0,
        totalCost: row.total_cost || 0,
        materials: [],
      })
    }

    for (const row of detailRows) {
      const pid = row.project_id
      const proj = projectMap.get(pid)
      if (!proj) continue
      const group = proj.groups.find((g: any) => g.groupName === row.group_name)
      if (group) {
        group.materials.push({
          materialId: row.material_id,
          materialName: row.material_name,
          quantity: row.quantity || 0,
          totalCost: row.total_cost || 0,
          ratio: 0, // 前端计算
        })
      }
    }

    // 计算各组内物料占比
    for (const proj of projectMap.values()) {
      for (const group of proj.groups) {
        const groupTotal = group.totalCost || 0
        for (const mat of group.materials) {
          mat.ratio = groupTotal > 0 ? parseFloat(((mat.totalCost / groupTotal) * 100).toFixed(1)) : 0
        }
        group.ratio = proj.totalCost > 0 ? parseFloat(((group.totalCost / proj.totalCost) * 100).toFixed(1)) : 0
      }
    }

    const result = Array.from(projectMap.values())
    const grandTotal = result.reduce((sum, p) => sum + p.totalCost, 0)

    success(res, {
      summary: { totalCost: grandTotal, projectCount: result.length },
      projects: result,
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/full-cost-by-project', (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const db = getDatabase()
    let where = "r.status = 'completed' AND r.is_deleted = 0"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }

    // 1. 查询出库记录（关联项目和BOM）
    const rows = db.prepare(`
      SELECT
        r.id as outbound_id,
        r.project_id,
        r.total_cost as material_cost,
        r.sample_count,
        p.name as project_name,
        p.type as project_type,
        p.bom_id,
        strftime('%Y-%m', r.created_at) as cost_month
      FROM outbound_records r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE ${where}
      ORDER BY r.project_id, r.created_at DESC
    `).all(...params) as any[]

    // 2. 批量预加载数据（避免对每个出库记录重复查询）
    const uniqueBomIds = [...new Set(rows.filter((r: any) => r.bom_id).map((r: any) => r.bom_id))]
    const uniqueMonths = [...new Set(rows.map((r: any) => r.cost_month || new Date().toISOString().slice(0, 7)))]
    const uniqueTypes = [...new Set(rows.map((r: any) => r.project_type || 'ihc'))]

    // 预加载标准工时（按项目类型）
    const laborCostMap: Record<string, number> = {}
    if (uniqueTypes.length > 0) {
      const typePlaceholders = uniqueTypes.map(() => '?').join(',')
      const laborRows = db.prepare(`
        SELECT project_type, standard_minutes, labor_rate_per_minute
        FROM standard_labor_times
        WHERE (project_type IN (${typePlaceholders}) OR project_type = 'all') AND is_equipment_step = 0
      `).all(...uniqueTypes) as any[]
      for (const r of laborRows) {
        const key = r.project_type
        if (!laborCostMap[key]) laborCostMap[key] = 0
        laborCostMap[key] += (r.standard_minutes || 0) * (r.labor_rate_per_minute || 0)
      }
    }

    // 预加载设备模板
    const equipmentMap: Record<string, any[]> = {}
    if (uniqueBomIds.length > 0) {
      const bomPlaceholders = uniqueBomIds.map(() => '?').join(',')
      const equipRows = db.prepare(`
        SELECT bet.bom_id, bet.usage_minutes,
               e.purchase_price, e.depreciable_life_years,
               e.residual_value, e.depreciation_method, e.total_capacity,
               et.default_purchase_price, et.default_depreciable_life_years,
               et.default_residual_value, et.default_depreciation_method,
               et.default_total_capacity
        FROM bom_equipment_templates bet
        LEFT JOIN equipment e ON bet.equipment_id = e.id
        LEFT JOIN equipment_types et ON bet.equipment_type_id = et.id
        WHERE bet.bom_id IN (${bomPlaceholders})
      `).all(...uniqueBomIds) as any[]
      for (const r of equipRows) {
        if (!equipmentMap[r.bom_id]) equipmentMap[r.bom_id] = []
        equipmentMap[r.bom_id].push(r)
      }
    }

    // 预加载质控品
    const qcMap: Record<string, any[]> = {}
    if (uniqueBomIds.length > 0) {
      const bomPlaceholders = uniqueBomIds.map(() => '?').join(',')
      const qcRows = db.prepare(`
        SELECT qc.bom_id, qc.usage_per_batch, qc.covers_samples, m.price
        FROM bom_quality_controls qc
        LEFT JOIN materials m ON qc.material_id = m.id
        WHERE qc.bom_id IN (${bomPlaceholders})
      `).all(...uniqueBomIds) as any[]
      for (const r of qcRows) {
        if (!qcMap[r.bom_id]) qcMap[r.bom_id] = []
        qcMap[r.bom_id].push(r)
      }
    }

    // 预加载间接成本分摊（按月份）
    const indirectMap: Record<string, number> = {}
    if (uniqueMonths.length > 0) {
      const monthPlaceholders = uniqueMonths.map(() => '?').join(',')
      const indirectRows = db.prepare(`
        SELECT year_month, allocation_rate FROM indirect_cost_allocations
        WHERE year_month IN (${monthPlaceholders})
      `).all(...uniqueMonths) as any[]
      for (const r of indirectRows) {
        if (!indirectMap[r.year_month]) indirectMap[r.year_month] = 0
        indirectMap[r.year_month] += r.allocation_rate || 0
      }
    }

    // 3. 按项目汇总全成本（使用预加载数据，避免重复查询）
    const projectMap = new Map<string, any>()

    for (const row of rows) {
      const pid = row.project_id || 'unknown'
      const projectType = row.project_type || 'ihc'
      const bomId = row.bom_id
      const sampleCount = row.sample_count || 1
      const materialCost = row.material_cost || 0
      const month = row.cost_month || new Date().toISOString().slice(0, 7)

      if (!projectMap.has(pid)) {
        projectMap.set(pid, {
          id: pid,
          name: row.project_name || 'Unknown',
          type: projectType,
          bomId: bomId, // 记录BOM ID，用于查询标准成本
          sampleCount: 0,
          materialCost: 0,
          laborCost: 0,
          equipmentCost: 0,
          qcCost: 0,
          indirectCost: 0,
          totalCost: 0,
        })
      }

      const proj = projectMap.get(pid)
      proj.sampleCount += sampleCount
      proj.materialCost += materialCost

      // 有BOM时才计算扩展成本
      if (bomId) {
        // 人工成本（all类型 + 特定项目类型）
        const laborRate = (laborCostMap[projectType] || 0) + (laborCostMap['all'] || 0)
        const laborCost = Math.round(laborRate * sampleCount * 100) / 100

        // 设备折旧（复用 cost-calculator 共享函数，消除内联重复代码）
        const equipTemplates = equipmentMap[bomId] || []
        const equipmentCost = calculateEquipmentCostFromRows(equipTemplates, sampleCount)

        // 质控成本（包含 usage_per_batch）
        let qcCost = 0
        const qcList = qcMap[bomId] || []
        for (const qc of qcList) {
          const usagePerBatch = qc.usage_per_batch || 1
          qcCost += ((qc.price || 0) * usagePerBatch / (qc.covers_samples || 1)) * sampleCount
        }
        qcCost = Math.round(qcCost * 100) / 100

        // 间接成本
        const indirectRate = indirectMap[month] || 0
        const indirectCost = Math.round(indirectRate * sampleCount * 100) / 100

        proj.laborCost += laborCost
        proj.equipmentCost += equipmentCost
        proj.qcCost += qcCost
        proj.indirectCost += indirectCost
        proj.totalCost += materialCost + laborCost + equipmentCost + qcCost + indirectCost
      } else {
        // 无BOM时：材料成本 + 人工成本 + 间接成本（设备和质控无法计算）
        // 人工成本（使用默认工时）
        const laborRate = (laborCostMap[projectType] || 0) + (laborCostMap['all'] || 0)
        const laborCost = Math.round(laborRate * sampleCount * 100) / 100

        // 间接成本
        const indirectRate = indirectMap[month] || 0
        const indirectCost = Math.round(indirectRate * sampleCount * 100) / 100

        proj.laborCost += laborCost
        proj.indirectCost += indirectCost
        proj.totalCost += materialCost + laborCost + indirectCost
      }
    }

    // 3. 获取BOM标准成本（用于差异分析）
    const bomIds = [...new Set(rows.filter((r: any) => r.bom_id).map((r: any) => r.bom_id))]
    const bomStandardCostMap: Record<string, any> = {}
    if (bomIds.length > 0) {
      const bomPlaceholders = bomIds.map(() => '?').join(',')
      const bomRows = db.prepare(`
        SELECT id, standard_labor_cost, standard_equipment_cost, standard_indirect_cost, standard_total_cost
        FROM boms
        WHERE id IN (${bomPlaceholders}) AND is_deleted = 0
      `).all(...bomIds) as any[]
      for (const b of bomRows) {
        const standardLaborCost = Number(b.standard_labor_cost) || 0
        const standardEquipmentCost = Number(b.standard_equipment_cost) || 0
        const standardIndirectCost = Number(b.standard_indirect_cost) || 0
        const standardTotalCost = Number(b.standard_total_cost) || 0
        bomStandardCostMap[b.id] = {
          standardMaterialCost: Math.max(0, standardTotalCost - standardLaborCost - standardEquipmentCost - standardIndirectCost),
          standardLaborCost,
          standardEquipmentCost,
          standardIndirectCost,
          standardTotalCost,
        }
      }
    }

    // 4. 格式化结果（包含BOM标准成本）
    const projects = Array.from(projectMap.values()).map((p: any) => {
      const bomStandard = bomStandardCostMap[p.bomId] || {}
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        sampleCount: p.sampleCount,
        materialCost: Math.round(p.materialCost * 100) / 100,
        laborCost: Math.round(p.laborCost * 100) / 100,
        equipmentCost: Math.round(p.equipmentCost * 100) / 100,
        qcCost: Math.round(p.qcCost * 100) / 100,
        indirectCost: Math.round(p.indirectCost * 100) / 100,
        totalCost: Math.round(p.totalCost * 100) / 100,
        unitCost: p.sampleCount > 0 ? Math.round((p.totalCost / p.sampleCount) * 100) / 100 : 0,
        // BOM标准成本（用于差异分析）
        standardMaterialCost: bomStandard.standardMaterialCost || 0,
        standardLaborCost: bomStandard.standardLaborCost || 0,
        standardEquipmentCost: bomStandard.standardEquipmentCost || 0,
        standardIndirectCost: bomStandard.standardIndirectCost || 0,
        standardTotalCost: bomStandard.standardTotalCost || 0,
      }
    })

    // 按总成本降序
    projects.sort((a: any, b: any) => b.totalCost - a.totalCost)

    const summary = {
      totalCost: projects.reduce((s: number, p: any) => s + p.totalCost, 0),
      totalSamples: projects.reduce((s: number, p: any) => s + p.sampleCount, 0),
      materialCost: projects.reduce((s: number, p: any) => s + p.materialCost, 0),
      laborCost: projects.reduce((s: number, p: any) => s + p.laborCost, 0),
      equipmentCost: projects.reduce((s: number, p: any) => s + p.equipmentCost, 0),
      qcCost: projects.reduce((s: number, p: any) => s + p.qcCost, 0),
      indirectCost: projects.reduce((s: number, p: any) => s + p.indirectCost, 0),
    }

    success(res, {
      summary: {
        ...summary,
        avgUnitCost: summary.totalSamples > 0 ? Math.round((summary.totalCost / summary.totalSamples) * 100) / 100 : 0,
      },
      projects,
    })
  } catch (err: any) { error(res, err.message) }
})

// ===== Phase 3.5: 成本结构（按成本类型） =====
router.get('/cost-structure', (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const db = getDatabase()
    let where = "r.status = 'completed' AND r.is_deleted = 0 AND (p.is_deleted = 0 OR p.id IS NULL)"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }

    // 查询实际出库成本（材料成本）
    const rows = db.prepare(`
      SELECT
        SUM(r.total_cost) as material_cost,
        SUM(COALESCE(r.sample_count, 1)) as sample_count,
        GROUP_CONCAT(DISTINCT p.type) as project_types,
        GROUP_CONCAT(DISTINCT r.project_id) as project_ids
      FROM outbound_records r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE ${where}
    `).get(...params) as any

    const materialCost = Number(rows?.material_cost || 0)
    const sampleCount = Number(rows?.sample_count || 0)

    const costRows = sampleCount > 0 ? db.prepare(`
      SELECT
        r.total_cost as material_cost,
        COALESCE(r.sample_count, 1) as sample_count,
        COALESCE(p.type, 'ihc') as project_type,
        COALESCE(b.standard_equipment_cost, 0) as standard_equipment_cost,
        strftime('%Y-%m', r.created_at) as cost_month
      FROM outbound_records r
      LEFT JOIN projects p ON r.project_id = p.id
      LEFT JOIN boms b ON p.bom_id = b.id AND b.is_deleted = 0
      WHERE ${where}
    `).all(...params) as any[] : []

    const uniqueTypes = [...new Set(costRows.map(row => row.project_type || 'ihc'))]
    const laborCostMap: Record<string, number> = {}
    if (uniqueTypes.length > 0) {
      const placeholders = uniqueTypes.map(() => '?').join(',')
      const laborRows = db.prepare(`
        SELECT project_type, standard_minutes, labor_rate_per_minute
        FROM standard_labor_times
        WHERE (project_type IN (${placeholders}) OR project_type = 'all') AND is_equipment_step = 0
      `).all(...uniqueTypes) as any[]
      for (const row of laborRows) {
        const key = row.project_type || 'all'
        laborCostMap[key] = (laborCostMap[key] || 0)
          + (Number(row.standard_minutes) || 0) * (Number(row.labor_rate_per_minute) || 0)
      }
    }

    const uniqueMonths = [...new Set(costRows.map(row => row.cost_month).filter(Boolean))]
    const indirectRateMap: Record<string, number> = {}
    if (uniqueMonths.length > 0) {
      const placeholders = uniqueMonths.map(() => '?').join(',')
      const indirectRows = db.prepare(`
        SELECT year_month, SUM(allocation_rate) as rate
        FROM indirect_cost_allocations
        WHERE year_month IN (${placeholders})
        GROUP BY year_month
      `).all(...uniqueMonths) as any[]
      for (const row of indirectRows) {
        indirectRateMap[row.year_month] = Number(row.rate) || 0
      }
    }

    const laborCost = Math.round(costRows.reduce((sum, row) => {
      const projectType = row.project_type || 'ihc'
      const perSampleCost = (laborCostMap[projectType] || 0) + (laborCostMap['all'] || 0)
      return sum + perSampleCost * (Number(row.sample_count) || 1)
    }, 0) * 100) / 100

    const indirectCost = Math.round(costRows.reduce((sum, row) => {
      const rate = indirectRateMap[row.cost_month] || 0
      return sum + rate * (Number(row.sample_count) || 1)
    }, 0) * 100) / 100

    const equipmentCost = Math.round(costRows.reduce((sum, row) => (
      sum + (Number(row.standard_equipment_cost) || 0) * (Number(row.sample_count) || 1)
    ), 0) * 100) / 100

    const totalCost = materialCost + laborCost + equipmentCost + indirectCost

    const structure = [
      { costType: 'material', label: '直接材料', amount: Math.round(materialCost * 100) / 100, percentage: totalCost > 0 ? Math.round(materialCost / totalCost * 10000) / 100 : 0 },
      { costType: 'labor', label: '人工成本', amount: laborCost, percentage: totalCost > 0 ? Math.round(laborCost / totalCost * 10000) / 100 : 0 },
      { costType: 'equipment', label: '设备折旧', amount: equipmentCost, percentage: totalCost > 0 ? Math.round(equipmentCost / totalCost * 10000) / 100 : 0 },
      { costType: 'indirect', label: '间接费用', amount: indirectCost, percentage: totalCost > 0 ? Math.round(indirectCost / totalCost * 10000) / 100 : 0 },
    ]

    success(res, { totalCost: Math.round(totalCost * 100) / 100, structure })
  } catch (err: any) { error(res, err.message) }
})

// ===== Phase 2.4: 成本差异分析 =====
router.get('/cost-variance', (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const compareType = ['project', 'month', 'material'].includes(String(req.query.compareType))
      ? String(req.query.compareType)
      : 'project'
    const db = getDatabase()
    let where = "r.status = 'completed' AND r.is_deleted = 0 AND (p.is_deleted = 0 OR p.id IS NULL)"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }

    if (compareType === 'material') {
      const rows = db.prepare(`
        SELECT
          oi.material_id,
          m.name as material_name,
          m.unit,
          SUM(oi.quantity) as quantity,
          SUM(oi.total_cost) as actual_cost,
          SUM(oi.quantity * COALESCE(m.price, oi.unit_cost, 0)) as standard_cost
        FROM outbound_items oi
        JOIN outbound_records r ON oi.outbound_id = r.id
        LEFT JOIN projects p ON r.project_id = p.id
        LEFT JOIN materials m ON oi.material_id = m.id AND m.is_deleted = 0
        WHERE ${where}
        GROUP BY oi.material_id
        ORDER BY actual_cost DESC
      `).all(...params) as any[]

      const items = rows.map((row: any) => {
        const materialActual = Math.round((Number(row.actual_cost) || 0) * 100) / 100
        const materialStandard = Math.round((Number(row.standard_cost) || 0) * 100) / 100
        const totalVariance = Math.round((materialActual - materialStandard) * 100) / 100
        return {
          projectId: row.material_id || 'unknown-material',
          projectName: row.material_name || 'Unknown Material',
          groupType: 'material',
          unit: row.unit || '',
          materialActual,
          materialStandard,
          laborActual: 0,
          laborStandard: 0,
          equipmentActual: 0,
          equipmentStandard: 0,
          qcActual: 0,
          indirectActual: 0,
          indirectStandard: 0,
          totalActual: materialActual,
          totalStandard: materialStandard,
          totalVariance,
          varianceRate: materialStandard > 0 ? Math.round(totalVariance / materialStandard * 10000) / 100 : 0,
          sampleCount: Number(row.quantity) || 0,
        }
      })

      const summary = {
        totalActual: Math.round(items.reduce((s: number, i: any) => s + i.totalActual, 0) * 100) / 100,
        totalStandard: Math.round(items.reduce((s: number, i: any) => s + i.totalStandard, 0) * 100) / 100,
        totalVariance: Math.round(items.reduce((s: number, i: any) => s + i.totalVariance, 0) * 100) / 100,
        varianceRate: 0,
      }
      summary.varianceRate = summary.totalStandard > 0
        ? Math.round(summary.totalVariance / summary.totalStandard * 10000) / 100
        : 0

      success(res, { summary, items })
      return
    }

    const rows = db.prepare(`
      SELECT
        r.id as outbound_id,
        r.project_id,
        r.total_cost as actual_material_cost,
        COALESCE(r.sample_count, 1) as sample_count,
        p.name as project_name,
        COALESCE(p.type, 'ihc') as project_type,
        p.bom_id,
        strftime('%Y-%m', r.created_at) as cost_month
      FROM outbound_records r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE ${where}
      ORDER BY r.created_at ASC
    `).all(...params) as any[]

    // 查询 BOM 标准成本
    const bomIds = [...new Set(rows.filter((r: any) => r.bom_id).map((r: any) => r.bom_id))]
    const bomMap: Record<string, any> = {}
    if (bomIds.length > 0) {
      const placeholders = bomIds.map(() => '?').join(',')
      const bomRows = db.prepare(`
        SELECT id, standard_labor_cost, standard_equipment_cost, standard_indirect_cost, standard_total_cost
        FROM boms WHERE id IN (${placeholders}) AND is_deleted = 0
      `).all(...bomIds) as any[]
      for (const b of bomRows) {
        bomMap[b.id] = b
      }
    }

    const groupMap = new Map<string, any>()
    for (const row of rows) {
      const month = row.cost_month || new Date().toISOString().slice(0, 7)
      const groupId = compareType === 'month' ? month : (row.project_id || 'unknown')
      const groupName = compareType === 'month' ? `${month} 月` : (row.project_name || 'Unknown')
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          projectId: groupId,
          projectName: groupName,
          groupType: compareType,
          month: compareType === 'month' ? month : undefined,
          materialActual: 0, materialStandard: 0,
          laborActual: 0, laborStandard: 0,
          equipmentActual: 0, equipmentStandard: 0,
          qcActual: 0,
          indirectActual: 0, indirectStandard: 0,
          totalActual: 0, totalStandard: 0,
          sampleCount: 0,
        })
      }
      const proj = groupMap.get(groupId)
      const bom = bomMap[row.bom_id]
      const sc = Number(row.sample_count) || 1
      proj.sampleCount += sc
      proj.materialActual += Number(row.actual_material_cost) || 0
      proj.laborActual += calculateLaborCost(db, row.project_type || 'ihc', sc)
      proj.equipmentActual += row.bom_id ? calculateEquipmentCost(db, row.bom_id, sc) : 0
      proj.qcActual += row.bom_id ? calculateQCCost(db, row.bom_id, sc) : 0
      proj.indirectActual += calculateIndirectCost(db, month, sc)
      if (bom) {
        const standardLabor = Number(bom.standard_labor_cost) || 0
        const standardEquipment = Number(bom.standard_equipment_cost) || 0
        const standardIndirect = Number(bom.standard_indirect_cost) || 0
        const standardTotal = Number(bom.standard_total_cost) || 0
        proj.laborStandard += standardLabor * sc
        proj.equipmentStandard += standardEquipment * sc
        proj.indirectStandard += standardIndirect * sc
        proj.materialStandard += Math.max(0, standardTotal - standardLabor - standardEquipment - standardIndirect) * sc
      }
    }

    const items = Array.from(groupMap.values()).map((p: any) => {
      p.totalActual = Math.round((p.materialActual + p.laborActual + p.equipmentActual + p.qcActual + p.indirectActual) * 100) / 100
      p.totalStandard = Math.round((p.materialStandard + p.laborStandard + p.equipmentStandard + p.indirectStandard) * 100) / 100
      const totalVariance = p.totalActual - p.totalStandard
      return {
        ...p,
        materialActual: Math.round(p.materialActual * 100) / 100,
        materialStandard: Math.round(p.materialStandard * 100) / 100,
        laborActual: Math.round(p.laborActual * 100) / 100,
        laborStandard: Math.round(p.laborStandard * 100) / 100,
        equipmentActual: Math.round(p.equipmentActual * 100) / 100,
        equipmentStandard: Math.round(p.equipmentStandard * 100) / 100,
        qcActual: Math.round(p.qcActual * 100) / 100,
        indirectActual: Math.round(p.indirectActual * 100) / 100,
        indirectStandard: Math.round(p.indirectStandard * 100) / 100,
        totalVariance: Math.round(totalVariance * 100) / 100,
        varianceRate: p.totalStandard > 0 ? Math.round(totalVariance / p.totalStandard * 10000) / 100 : 0,
      }
    })

    const summary = {
      totalActual: items.reduce((s: number, i: any) => s + i.totalActual, 0),
      totalStandard: items.reduce((s: number, i: any) => s + i.totalStandard, 0),
      totalVariance: items.reduce((s: number, i: any) => s + i.totalVariance, 0),
      varianceRate: 0,
    }
    summary.varianceRate = summary.totalStandard > 0
      ? Math.round(summary.totalVariance / summary.totalStandard * 10000) / 100
      : 0

    success(res, { summary, items })
  } catch (err: any) { error(res, err.message) }
})

// ===== Phase 2.6: 月度环比 =====
router.get('/cost-monthly-comparison', (req, res) => {
  try {
    const db = getDatabase()
    const now = new Date()
    const todayMonth = formatYearMonth(now)
    const requestedMonth = String(req.query.month || '').trim()
    const source = String(req.query.source || 'outbound')
    const currentMonth = /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : todayMonth
    const [targetYear, targetMonthNumber] = currentMonth.split('-').map(Number)
    const targetDate = new Date(targetYear, targetMonthNumber - 1, 1)
    const prevDate = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1)
    const previousMonth = formatYearMonth(prevDate)

    const monthlySql = source === 'abc'
      ? `
        SELECT
          SUM(total_cost) as total_cost,
          SUM(COALESCE(sample_count, 0)) as sample_count,
          COUNT(*) as record_count
        FROM outbound_abc_details
        WHERE cost_month = ?
          AND COALESCE(cost_status, 'costed') NOT IN ('pending_cost', 'cost_exception')
      `
      : `
        SELECT
          SUM(total_cost) as total_cost,
          SUM(COALESCE(sample_count, 1)) as sample_count,
          COUNT(*) as record_count
        FROM outbound_records
        WHERE status = 'completed' AND is_deleted = 0
          AND strftime('%Y-%m', created_at) = ?
      `

    const currentRows = db.prepare(monthlySql).get(currentMonth) as any
    const previousRows = db.prepare(monthlySql).get(previousMonth) as any

    const currentTotal = currentRows?.total_cost || 0
    const previousTotal = previousRows?.total_cost || 0
    const totalChange = currentTotal - previousTotal
    const totalChangeRate = previousTotal > 0 ? Math.round(totalChange / previousTotal * 10000) / 100 : 0

    const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate()
    const currentDay = currentMonth < todayMonth
      ? daysInMonth
      : currentMonth === todayMonth
        ? Math.min(now.getDate(), daysInMonth)
        : 0
    const isComplete = currentMonth < todayMonth || (currentMonth === todayMonth && currentDay >= daysInMonth)
    const previousDaysInMonth = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate()
    const previousDataDays = previousMonth < todayMonth
      ? previousDaysInMonth
      : previousMonth === todayMonth
        ? Math.min(now.getDate(), previousDaysInMonth)
        : 0
    const previousIsComplete = previousMonth < todayMonth || (previousMonth === todayMonth && previousDataDays >= previousDaysInMonth)

    success(res, {
      currentMonth: {
        month: currentMonth,
        totalCost: Math.round(currentTotal * 100) / 100,
        sampleCount: currentRows?.sample_count || 0,
        recordCount: currentRows?.record_count || 0,
        isComplete,
        dataDays: currentDay,
      },
      previousMonth: {
        month: previousMonth,
        totalCost: Math.round(previousTotal * 100) / 100,
        sampleCount: previousRows?.sample_count || 0,
        recordCount: previousRows?.record_count || 0,
        isComplete: previousIsComplete,
        dataDays: previousDataDays,
      },
      changes: {
        totalChange: Math.round(totalChange * 100) / 100,
        totalChangeRate,
        direction: totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'flat',
        note: !isComplete ? `${currentMonth} 数据不完整（仅 ${currentDay}/${daysInMonth} 天）` : undefined,
        source,
      },
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/personnel-efficiency', (req, res) => {
  try {
    const db = getDatabase()
    const { startDate, endDate } = getDateRange(req.query)
    const role = String(req.query.role || 'all').trim()

    let where = "r.status = 'completed' AND r.is_deleted = 0"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }
    if (role && role !== 'all') {
      where += ' AND COALESCE(u.role, r.operator) = ?'
      params.push(role)
    }

    const rows = db.prepare(`
      SELECT
        r.operator,
        COALESCE(u.real_name, r.operator) as operator_name,
        COALESCE(u.role, 'unknown') as role,
        COALESCE(p.type, 'all') as project_type,
        strftime('%Y-%m', r.created_at) as month,
        COUNT(*) as record_count,
        SUM(COALESCE(r.sample_count, 1)) as sample_count,
        SUM(COALESCE(r.total_cost, 0)) as material_cost
      FROM outbound_records r
      LEFT JOIN users u ON u.username = r.operator AND u.is_deleted = 0
      LEFT JOIN projects p ON p.id = r.project_id AND (p.is_deleted = 0 OR p.id IS NULL)
      WHERE ${where}
      GROUP BY r.operator, operator_name, role, project_type, month
      ORDER BY sample_count DESC
    `).all(...params) as any[]

    const projectTypes = [...new Set(rows.map(row => row.project_type || 'all'))]
    const laborRows = projectTypes.length > 0
      ? db.prepare(`
          SELECT project_type, standard_minutes, labor_rate_per_minute
          FROM standard_labor_times
          WHERE (project_type IN (${projectTypes.map(() => '?').join(',')}) OR project_type = 'all')
            AND is_equipment_step = 0
        `).all(...projectTypes) as any[]
      : []

    const minutesByType: Record<string, number> = {}
    const laborCostByType: Record<string, number> = {}
    for (const row of laborRows) {
      const key = row.project_type || 'all'
      minutesByType[key] = (minutesByType[key] || 0) + (Number(row.standard_minutes) || 0)
      laborCostByType[key] = (laborCostByType[key] || 0)
        + (Number(row.standard_minutes) || 0) * (Number(row.labor_rate_per_minute) || 0)
    }

    const people = new Map<string, any>()
    const months = new Map<string, any>()
    let totalOutput = 0
    let totalLaborCost = 0
    let totalStandardMinutes = 0

    for (const row of rows) {
      const operator = row.operator || 'unknown'
      const projectType = row.project_type || 'all'
      const sampleCount = Number(row.sample_count) || 0
      const recordCount = Number(row.record_count) || 0
      const perSampleMinutes = (minutesByType[projectType] || 0) + (minutesByType.all || 0)
      const perSampleLaborCost = (laborCostByType[projectType] || 0) + (laborCostByType.all || 0)
      const standardMinutes = perSampleMinutes * sampleCount
      const laborCost = perSampleLaborCost * sampleCount

      if (!people.has(operator)) {
        people.set(operator, {
          id: operator,
          name: row.operator_name || operator,
          role: row.role || 'unknown',
          outputCount: 0,
          recordCount: 0,
          standardMinutes: 0,
          totalCost: 0,
          materialCost: 0,
        })
      }
      const person = people.get(operator)
      person.outputCount += sampleCount
      person.recordCount += recordCount
      person.standardMinutes += standardMinutes
      person.totalCost += laborCost
      person.materialCost += Number(row.material_cost) || 0

      if (!months.has(row.month)) {
        months.set(row.month, { month: row.month, outputCount: 0, totalCost: 0, standardMinutes: 0 })
      }
      const month = months.get(row.month)
      month.outputCount += sampleCount
      month.totalCost += laborCost
      month.standardMinutes += standardMinutes

      totalOutput += sampleCount
      totalLaborCost += laborCost
      totalStandardMinutes += standardMinutes
    }

    const baselineOutputPerHour = totalStandardMinutes > 0 ? totalOutput / (totalStandardMinutes / 60) : 0
    const ranking = Array.from(people.values()).map(person => {
      const hours = person.standardMinutes > 0 ? person.standardMinutes / 60 : 0
      const outputPerHour = hours > 0 ? person.outputCount / hours : 0
      return {
        id: person.id,
        name: person.name,
        role: person.role,
        efficiency: baselineOutputPerHour > 0 ? round2(outputPerHour / baselineOutputPerHour) : 0,
        outputPerHour: round2(outputPerHour),
        totalCost: round2(person.totalCost),
        materialCost: round2(person.materialCost),
        outputCount: person.outputCount,
        recordCount: person.recordCount,
        standardHours: round2(hours),
        costPerOutput: person.outputCount > 0 ? round2(person.totalCost / person.outputCount) : 0,
      }
    }).sort((a, b) => b.outputCount - a.outputCount)

    const trend = Array.from(months.values()).map(month => {
      const hours = month.standardMinutes > 0 ? month.standardMinutes / 60 : 0
      const outputPerHour = hours > 0 ? month.outputCount / hours : 0
      return {
        month: month.month,
        avgEfficiency: baselineOutputPerHour > 0 ? round2(outputPerHour / baselineOutputPerHour) : 0,
        outputPerHour: round2(outputPerHour),
        totalCost: round2(month.totalCost),
        outputCount: month.outputCount,
        standardHours: round2(hours),
      }
    }).sort((a, b) => a.month.localeCompare(b.month))

    success(res, {
      summary: {
        personCount: ranking.length,
        totalOutput,
        totalLaborCost: round2(totalLaborCost),
        totalStandardHours: round2(totalStandardMinutes / 60),
        avgEfficiency: ranking.length > 0
          ? round2(ranking.reduce((sum, item) => sum + item.efficiency, 0) / ranking.length)
          : 0,
        costPerOutput: totalOutput > 0 ? round2(totalLaborCost / totalOutput) : 0,
      },
      ranking,
      trend,
    })
  } catch (err: any) { error(res, err.message) }
})

export default router
