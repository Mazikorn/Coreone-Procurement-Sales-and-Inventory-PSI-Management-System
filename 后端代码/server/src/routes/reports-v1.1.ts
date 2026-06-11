import { Router } from 'express'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, error } from '../utils/response.js'
import { getOrCalculateProjectFullCost, calculateEquipmentCostFromRows } from '../utils/cost-calculator.js'

const router = Router()

router.get('/cost-by-project', (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const db = getDatabase()
    let where = "r.status = 'completed' AND r.is_deleted = 0 AND (p.is_deleted = 0 OR p.id IS NULL)"
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
    let where = "o.status = 'completed' AND o.is_deleted = 0 AND m.is_deleted = 0"
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
    const { startDate, endDate, dimension = 'monthly' } = req.query
    const db = getDatabase()
    let where = "status = 'completed' AND is_deleted = 0"
    const params: any[] = []
    if (startDate) { where += ' AND created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND created_at <= ?'; params.push(`${endDate}T23:59:59`) }

    if (dimension === 'quarterly') {
      // 季度聚合
      const quarterExpr = `
        strftime('%Y', created_at) || '-Q' ||
        CASE
          WHEN CAST(strftime('%m', created_at) AS INTEGER) BETWEEN 1 AND 3 THEN '1'
          WHEN CAST(strftime('%m', created_at) AS INTEGER) BETWEEN 4 AND 6 THEN '2'
          WHEN CAST(strftime('%m', created_at) AS INTEGER) BETWEEN 7 AND 9 THEN '3'
          WHEN CAST(strftime('%m', created_at) AS INTEGER) BETWEEN 10 AND 12 THEN '4'
        END
      `
      const rows = db.prepare(`
        SELECT ${quarterExpr} as period, SUM(total_cost) as cost, COUNT(*) as record_count
        FROM outbound_records
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
          isComplete: r.period !== currentPeriod,
        })),
      })
    } else {
      // 月度聚合（默认）
      const rows = db.prepare(`
        SELECT strftime('%Y-%m', created_at) as period, SUM(total_cost) as cost, COUNT(*) as record_count
        FROM outbound_records
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
    let where = "r.status = 'completed' AND r.is_deleted = 0 AND (p.is_deleted = 0 OR p.id IS NULL)"
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
        SELECT et.bom_id, et.usage_minutes, e.purchase_price, e.depreciable_life_years,
               e.residual_value, e.depreciation_method, e.total_capacity
        FROM bom_equipment_templates et
        JOIN equipment e ON et.equipment_id = e.id
        WHERE et.bom_id IN (${bomPlaceholders})
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
        bomStandardCostMap[b.id] = {
          standardLaborCost: b.standard_labor_cost || 0,
          standardEquipmentCost: b.standard_equipment_cost || 0,
          standardIndirectCost: b.standard_indirect_cost || 0,
          standardTotalCost: b.standard_total_cost || 0,
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

    const materialCost = rows?.material_cost || 0
    const sampleCount = rows?.sample_count || 0

    // 计算人工成本（按项目类型）
    const laborCost = sampleCount > 0 ? (() => {
      const laborRows = db.prepare(`
        SELECT project_type, standard_minutes, labor_rate_per_minute
        FROM standard_labor_times WHERE is_equipment_step = 0
      `).all() as any[]
      const costPerSample = laborRows.reduce((sum: number, r: any) =>
        sum + (r.standard_minutes || 0) * (r.labor_rate_per_minute || 0), 0)
      return Math.round(costPerSample * sampleCount * 100) / 100
    })() : 0

    // 计算间接成本
    const indirectCost = sampleCount > 0 ? (() => {
      const months = db.prepare(`
        SELECT DISTINCT strftime('%Y-%m', r.created_at) as month
        FROM outbound_records r
        LEFT JOIN projects p ON r.project_id = p.id
        WHERE ${where}
      `).all(...params) as any[]
      let totalRate = 0
      for (const m of months) {
        const allocRows = db.prepare(`
          SELECT SUM(allocation_rate) as rate FROM indirect_cost_allocations WHERE year_month = ?
        `).get(m.month) as any
        totalRate += allocRows?.rate || 0
      }
      const avgRate = months.length > 0 ? totalRate / months.length : 0
      return Math.round(avgRate * sampleCount * 100) / 100
    })() : 0

    // 设备成本估算（简化：使用 BOM 标准设备成本）
    const equipmentCost = (() => {
      const bomRows = db.prepare(`
        SELECT SUM(b.standard_equipment_cost * COALESCE(r.sample_count, 1)) as eq_cost
        FROM outbound_records r
        LEFT JOIN projects p ON r.project_id = p.id
        LEFT JOIN boms b ON p.bom_id = b.id
        WHERE ${where} AND b.standard_equipment_cost > 0
      `).get(...params) as any
      return Math.round((bomRows?.eq_cost || 0) * 100) / 100
    })()

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
    const { startDate, endDate, compareType = 'actual_vs_standard' } = req.query
    const db = getDatabase()
    let where = "r.status = 'completed' AND r.is_deleted = 0 AND (p.is_deleted = 0 OR p.id IS NULL)"
    const params: any[] = []
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }

    // 查询实际成本（按项目汇总）
    const rows = db.prepare(`
      SELECT
        r.project_id,
        p.name as project_name,
        p.type as project_type,
        p.bom_id,
        SUM(r.total_cost) as actual_material_cost,
        SUM(COALESCE(r.sample_count, 1)) as sample_count,
        strftime('%Y-%m', r.created_at) as cost_month
      FROM outbound_records r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE ${where}
      GROUP BY r.project_id, cost_month
      ORDER BY r.project_id, cost_month
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

    // 按项目汇总差异
    const projectMap = new Map<string, any>()
    for (const row of rows) {
      const pid = row.project_id || 'unknown'
      if (!projectMap.has(pid)) {
        projectMap.set(pid, {
          projectId: pid,
          projectName: row.project_name || 'Unknown',
          materialActual: 0, materialStandard: 0,
          laborActual: 0, laborStandard: 0,
          equipmentActual: 0, equipmentStandard: 0,
          indirectActual: 0, indirectStandard: 0,
          totalActual: 0, totalStandard: 0,
          sampleCount: 0,
        })
      }
      const proj = projectMap.get(pid)
      const bom = bomMap[row.bom_id]
      const sc = row.sample_count || 1
      proj.sampleCount += sc
      proj.materialActual += row.actual_material_cost || 0
      if (bom) {
        proj.laborStandard += (bom.standard_labor_cost || 0) * sc
        proj.equipmentStandard += (bom.standard_equipment_cost || 0) * sc
        proj.indirectStandard += (bom.standard_indirect_cost || 0) * sc
        proj.materialStandard += (bom.standard_total_cost - bom.standard_labor_cost - bom.standard_equipment_cost - bom.standard_indirect_cost) * sc || 0
      }
    }

    const items = Array.from(projectMap.values()).map((p: any) => {
      p.totalActual = Math.round((p.materialActual + p.laborActual + p.equipmentActual + p.indirectActual) * 100) / 100
      p.totalStandard = Math.round((p.materialStandard + p.laborStandard + p.equipmentStandard + p.indirectStandard) * 100) / 100
      const totalVariance = p.totalActual - p.totalStandard
      return {
        ...p,
        materialActual: Math.round(p.materialActual * 100) / 100,
        materialStandard: Math.round(p.materialStandard * 100) / 100,
        laborStandard: Math.round(p.laborStandard * 100) / 100,
        equipmentStandard: Math.round(p.equipmentStandard * 100) / 100,
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
    const currentMonth = now.toISOString().slice(0, 7)
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const previousMonth = prevDate.toISOString().slice(0, 7)

    // 查询当月数据
    const currentRows = db.prepare(`
      SELECT
        SUM(total_cost) as total_cost,
        SUM(COALESCE(sample_count, 1)) as sample_count,
        COUNT(*) as record_count
      FROM outbound_records
      WHERE status = 'completed' AND is_deleted = 0
        AND strftime('%Y-%m', created_at) = ?
    `).get(currentMonth) as any

    // 查询上月数据
    const previousRows = db.prepare(`
      SELECT
        SUM(total_cost) as total_cost,
        SUM(COALESCE(sample_count, 1)) as sample_count,
        COUNT(*) as record_count
      FROM outbound_records
      WHERE status = 'completed' AND is_deleted = 0
        AND strftime('%Y-%m', created_at) = ?
    `).get(previousMonth) as any

    const currentTotal = currentRows?.total_cost || 0
    const previousTotal = previousRows?.total_cost || 0
    const totalChange = currentTotal - previousTotal
    const totalChangeRate = previousTotal > 0 ? Math.round(totalChange / previousTotal * 10000) / 100 : 0

    // 检查当月数据完整性
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const currentDay = now.getDate()
    const isComplete = currentDay >= daysInMonth

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
        isComplete: true,
        dataDays: new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate(),
      },
      changes: {
        totalChange: Math.round(totalChange * 100) / 100,
        totalChangeRate,
        direction: totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'flat',
        note: !isComplete ? `当月数据不完整（仅 ${currentDay}/${daysInMonth} 天）` : undefined,
      },
    })
  } catch (err: any) { error(res, err.message) }
})

export default router
