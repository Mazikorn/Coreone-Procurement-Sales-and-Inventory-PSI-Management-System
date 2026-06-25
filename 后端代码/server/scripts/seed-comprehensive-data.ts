/**
 * 综合种子数据脚本
 * 目标：让系统看起来像运行了 3-6 个月的完整业务系统
 *
 * 填充以下空表：
 * - BOM 扩展表（通用试剂/耗材/质控品/设备模板）
 * - 设备管理（equipment, equipment_usage）
 * - 间接成本中心（indirect_cost_centers, indirect_cost_allocations）
 * - ABC 作业关联（bom_activity_links）
* - 出库 ABC 成本明细（outbound_abc_details）
 * - 切片成本快照（slide_cost_snapshots）
 * - 项目成本明细（project_cost_details）
 * - 成本预算（cost_budgets）
 * - 质量成本（quality_costs）
 * - 预警记录（alerts）
 * - LIS 病例数据（lis_cases）
 * - 对账修正日志（reconciliation_logs）
 * - 批次使用跟踪（batch_usage_tracking, batch_depletion）
 */

import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'data', 'coreone.db')

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatMonth(d: Date): string {
  return d.toISOString().slice(0, 7)
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min: number, max: number, decimals = 2): number {
  return Number((Math.random() * (max - min) + min).toFixed(decimals))
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function seedComprehensiveData(): void {
  const db = new DatabaseSync(dbPath)

  console.log('=== 开始填充综合业务数据 ===\n')

  // ============================================================
  // 1. 设备管理数据
  // ============================================================
  console.log('【1/12】填充设备管理数据...')

  const equipmentCount = db.prepare('SELECT COUNT(*) as count FROM equipment').get() as any
  if (equipmentCount.count === 0) {
    const equipmentList = [
      { code: 'EQ-001', name: '免疫组化仪', model: 'BenchMark ULTRA', manufacturer: 'Roche', price: 850000, life: 8, method: 'straight_line', capacity: 50000, unit: '张' },
      { code: 'EQ-002', name: '全自动染色机', model: 'HistoStar', manufacturer: 'Thermo Fisher', price: 320000, life: 6, method: 'straight_line', capacity: 30000, unit: '张' },
      { code: 'EQ-003', name: '切片机', model: 'RM2255', manufacturer: 'Leica', price: 180000, life: 8, method: 'workload', capacity: 100000, unit: '张' },
      { code: 'EQ-004', name: '包埋机', model: 'EG1150H', manufacturer: 'Leica', price: 120000, life: 10, method: 'straight_line', capacity: 80000, unit: '块' },
      { code: 'EQ-005', name: '脱水机', model: 'ASP300S', manufacturer: 'Leica', price: 280000, life: 8, method: 'straight_line', capacity: 60000, unit: '块' },
      { code: 'EQ-006', name: 'FISH 荧光显微镜', model: 'BX53', manufacturer: 'Olympus', price: 150000, life: 10, method: 'workload', capacity: 20000, unit: '次' },
      { code: 'EQ-007', name: 'PCR 仪', model: 'CFX96', manufacturer: 'Bio-Rad', price: 250000, life: 6, method: 'workload', capacity: 15000, unit: '次' },
      { code: 'EQ-008', name: 'NGS 测序仪', model: 'MiSeq', manufacturer: 'Illumina', price: 1200000, life: 5, method: 'workload', capacity: 5000, unit: '次' },
      { code: 'EQ-009', name: '离心机', model: '5430R', manufacturer: 'Eppendorf', price: 45000, life: 8, method: 'straight_line', capacity: 100000, unit: '次' },
      { code: 'EQ-010', name: '冰箱(-80℃)', model: 'UXF60086V', manufacturer: 'Thermo Fisher', price: 65000, life: 10, method: 'straight_line', capacity: null, unit: null },
      { code: 'EQ-011', name: '显微镜(常规)', model: 'CX43', manufacturer: 'Olympus', price: 35000, life: 10, method: 'straight_line', capacity: 50000, unit: '次' },
      { code: 'EQ-012', name: '切片烤片机', model: 'HI1220', manufacturer: 'Leica', price: 25000, life: 8, method: 'straight_line', capacity: 100000, unit: '张' },
    ]

    // R3：设备→作业中心映射（开箱即用，使设备折旧按动因归集到中心，否则进 unmapped 残差，ADOPT-02）。
    const eqCenterMap: Record<string, string> = {
      'EQ-001': 'ABC-AC-004', // 免疫组化仪 → 免疫组化(IHC)
      'EQ-002': 'ABC-AC-003', // 全自动染色机 → HE染色
      'EQ-003': 'ABC-AC-002', // 切片机 → 切片(SECTION)
      'EQ-004': 'ABC-AC-002', // 包埋机 → 切片(SECTION)
      'EQ-005': 'ABC-AC-001', // 脱水机 → 标本接收/处理(SPECIMEN)
      'EQ-006': 'ABC-AC-006', // FISH 荧光显微镜 → 分子病理(MP)
      'EQ-007': 'ABC-AC-006', // PCR 仪 → 分子病理(MP)
      'EQ-008': 'ABC-AC-006', // NGS 测序仪 → 分子病理(MP)
      'EQ-009': 'ABC-AC-006', // 离心机 → 分子病理(MP)
      'EQ-010': 'ABC-AC-001', // 冰箱(-80℃) → 标本接收/处理(无用量，映射仅备查)
      'EQ-011': 'ABC-AC-007', // 显微镜(常规) → 诊断(DIAGNOSIS)
      'EQ-012': 'ABC-AC-002', // 切片烤片机 → 切片(SECTION)
    }

    const insertEq = db.prepare(`
      INSERT INTO equipment (id, code, name, model, manufacturer, purchase_price, purchase_date,
        depreciable_life_years, depreciation_method, total_capacity, capacity_unit, activity_center_id, status, location_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `)

    const locations = db.prepare('SELECT id FROM locations LIMIT 5').all() as any[]

    for (const eq of equipmentList) {
      const purchaseDate = randomDate(new Date('2023-01-01'), new Date('2025-06-01'))
      insertEq.run(
        uuidv4(), eq.code, eq.name, eq.model, eq.manufacturer,
        eq.price, formatDate(purchaseDate), eq.life, eq.method,
        eq.capacity, eq.unit,
        eqCenterMap[eq.code] || null,
        locations.length > 0 ? pickRandom(locations).id : null
      )
    }
    console.log(`  创建 ${equipmentList.length} 台设备`)
  } else {
    console.log(`  已有 ${equipmentCount.count} 台设备，跳过`)
  }

  // 设备使用记录（最近 3 个月）
  const eqUsageCount = db.prepare('SELECT COUNT(*) as count FROM equipment_usage').get() as any
  if (eqUsageCount.count === 0) {
    const equipments = db.prepare('SELECT id, code, name, activity_center_id FROM equipment WHERE capacity_unit IS NOT NULL').all() as any[]
    const projects = db.prepare('SELECT id, code, name FROM projects WHERE is_deleted = 0 LIMIT 20').all() as any[]
    const outbounds = db.prepare('SELECT id, outbound_no FROM outbound_records WHERE is_deleted = 0').all() as any[]

    if (equipments.length > 0 && projects.length > 0) {
      const insertUsage = db.prepare(`
        INSERT INTO equipment_usage (id, equipment_id, project_id, outbound_id, usage_minutes, usage_count, depreciation_cost, operator, usage_date, activity_center_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const operators = ['张伟', '王坤强', '刘玉芬', '赵明']
      let usageCount = 0

      for (let month = 0; month < 3; month++) {
        const monthDate = new Date()
        monthDate.setMonth(monthDate.getMonth() - month)

        for (const eq of equipments) {
          const usageTimes = randomInt(5, 20)
          for (let i = 0; i < usageTimes; i++) {
            const usageDate = randomDate(
              new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
              new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
            )
            const minutes = randomInt(10, 180)
            const depCost = randomFloat(5, 150)
            const project = pickRandom(projects)
            const outbound = outbounds.length > 0 ? pickRandom(outbounds) : null

            insertUsage.run(
              uuidv4(), eq.id, project.id, outbound?.id || null,
              minutes, 1, depCost,
              pickRandom(operators), formatDate(usageDate),
              eq.activity_center_id || null  // R3：用量定格设备所属作业中心
            )
            usageCount++
          }
        }
      }
      console.log(`  创建 ${usageCount} 条设备使用记录`)
    }
  } else {
    console.log(`  已有 ${eqUsageCount.count} 条使用记录，跳过`)
  }

  // ============================================================
  // 2. BOM 扩展表数据（通用试剂/耗材/质控品/设备模板）
  // ============================================================
  console.log('\n【2/12】填充 BOM 扩展表数据...')

  const boms = db.prepare('SELECT id, code, name, type FROM boms WHERE is_deleted = 0').all() as any[]

  // 通用试剂
  const grCount = db.prepare('SELECT COUNT(*) as count FROM bom_general_reagents').get() as any
  if (grCount.count === 0) {
    // 获取通用试剂类物料（PBS、DAB、缓冲液等）
    const reagentMaterials = db.prepare(`
      SELECT id, code, name FROM materials
      WHERE (name LIKE '%PBS%' OR name LIKE '%DAB%' OR name LIKE '%缓冲液%' OR name LIKE '%双氧水%' OR name LIKE '%苏木素%' OR name LIKE '%伊红%')
      AND is_deleted = 0 LIMIT 10
    `).all() as any[]

    if (reagentMaterials.length > 0) {
      const insertGR = db.prepare(`
        INSERT INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order)
        VALUES (?, ?, ?, ?, ?, 'per_slide', ?)
      `)

      let grTotal = 0
      for (const bom of boms.slice(0, 50)) { // 为前 50 个 BOM 添加通用试剂
        const numReagents = randomInt(2, 4)
        const selectedReagents = reagentMaterials.slice(0, numReagents)

        for (let i = 0; i < selectedReagents.length; i++) {
          const mat = selectedReagents[i]
          insertGR.run(
            uuidv4(), bom.id, mat.id,
            randomFloat(0.1, 2.0, 4), 'ml', i
          )
          grTotal++
        }
      }
      console.log(`  创建 ${grTotal} 条通用试剂配额`)
    }
  } else {
    console.log(`  已有 ${grCount.count} 条通用试剂，跳过`)
  }

  // 通用耗材
  const gcCount = db.prepare('SELECT COUNT(*) as count FROM bom_general_consumables').get() as any
  if (gcCount.count === 0) {
    const consumableMaterials = db.prepare(`
      SELECT id, code, name FROM materials
      WHERE (name LIKE '%载玻片%' OR name LIKE '%盖玻片%' OR name LIKE '%吸头%' OR name LIKE '%手套%' OR name LIKE '%离心管%' OR name LIKE '%封片%')
      AND is_deleted = 0 LIMIT 8
    `).all() as any[]

    if (consumableMaterials.length > 0) {
      const insertGC = db.prepare(`
        INSERT INTO bom_general_consumables (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order)
        VALUES (?, ?, ?, ?, ?, 'per_slide', ?)
      `)

      let gcTotal = 0
      for (const bom of boms.slice(0, 50)) {
        const numConsumables = randomInt(2, 3)
        const selected = consumableMaterials.slice(0, numConsumables)

        for (let i = 0; i < selected.length; i++) {
          const mat = selected[i]
          insertGC.run(
            uuidv4(), bom.id, mat.id,
            randomInt(1, 3), '个', i
          )
          gcTotal++
        }
      }
      console.log(`  创建 ${gcTotal} 条通用耗材配额`)
    }
  } else {
    console.log(`  已有 ${gcCount.count} 条通用耗材，跳过`)
  }

  // 质控品
  const qcCount = db.prepare('SELECT COUNT(*) as count FROM bom_quality_controls').get() as any
  if (qcCount.count === 0) {
    const qcMaterials = db.prepare(`
      SELECT id, code, name FROM materials
      WHERE (name LIKE '%质控%' OR name LIKE '%阳性%' OR name LIKE '%阴性%' OR name LIKE '%对照%')
      AND is_deleted = 0 LIMIT 6
    `).all() as any[]

    if (qcMaterials.length > 0) {
      const insertQC = db.prepare(`
        INSERT INTO bom_quality_controls (id, bom_id, material_id, usage_per_batch, unit, covers_samples, allocation_type, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, 'per_batch', ?)
      `)

      let qcTotal = 0
      for (const bom of boms.slice(0, 40)) {
        const numQC = randomInt(1, 2)
        const selected = qcMaterials.slice(0, numQC)

        for (let i = 0; i < selected.length; i++) {
          const mat = selected[i]
          insertQC.run(
            uuidv4(), bom.id, mat.id,
            randomInt(1, 3), '片', randomInt(20, 50), i
          )
          qcTotal++
        }
      }
      console.log(`  创建 ${qcTotal} 条质控品配额`)
    }
  } else {
    console.log(`  已有 ${qcCount.count} 条质控品，跳过`)
  }

  // 设备模板
  const etCount = db.prepare('SELECT COUNT(*) as count FROM bom_equipment_templates').get() as any
  if (etCount.count === 0) {
    const equipments = db.prepare('SELECT id, code, name FROM equipment WHERE status = 1').all() as any[]

    if (equipments.length > 0) {
      const insertET = db.prepare(`
        INSERT INTO bom_equipment_templates (id, bom_id, equipment_id, usage_minutes, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `)

      let etTotal = 0
      for (const bom of boms.slice(0, 60)) {
        const numEquip = randomInt(1, 3)
        const selected = equipments.slice(0, numEquip)

        for (let i = 0; i < selected.length; i++) {
          const eq = selected[i]
          insertET.run(
            uuidv4(), bom.id, eq.id,
            randomInt(5, 120), i
          )
          etTotal++
        }
      }
      console.log(`  创建 ${etTotal} 条设备模板`)
    }
  } else {
    console.log(`  已有 ${etCount.count} 条设备模板，跳过`)
  }

  // ============================================================
  // 3. 间接成本中心数据
  // ============================================================
  console.log('\n【3/12】填充间接成本中心数据...')

  const iccCount = db.prepare('SELECT COUNT(*) as count FROM indirect_cost_centers').get() as any
  if (iccCount.count === 0) {
    const costCenters = [
      { code: 'RENT', name: '房租', type: 'rent', amount: 35000 },
      { code: 'UTIL', name: '水电费', type: 'utilities', amount: 8000 },
      { code: 'MAINT', name: '设备维护', type: 'maintenance', amount: 5000 },
      { code: 'ADMIN', name: '行政管理', type: 'admin', amount: 12000 },
      { code: 'IT', name: '信息化', type: 'it', amount: 3000 },
      { code: 'INS', name: '保险', type: 'other', amount: 2000 },
    ]

    const insertICC = db.prepare(`
      INSERT INTO indirect_cost_centers (id, code, name, cost_type, monthly_amount, allocation_base, description, status)
      VALUES (?, ?, ?, ?, ?, 'sample_count', ?, 1)
    `)

    for (const cc of costCenters) {
      insertICC.run(
        uuidv4(), cc.code, cc.name, cc.type, cc.amount,
        `${cc.name}月度分摊`
      )
    }
    console.log(`  创建 ${costCenters.length} 个成本中心`)

    // 创建最近 3 个月的分摊记录
    const centers = db.prepare('SELECT id, code, monthly_amount FROM indirect_cost_centers').all() as any[]
    const insertAlloc = db.prepare(`
      INSERT INTO indirect_cost_allocations (id, cost_center_id, year_month, total_amount, allocation_base_value, allocation_rate)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    let allocTotal = 0
    for (let month = 0; month < 3; month++) {
      const monthDate = new Date()
      monthDate.setMonth(monthDate.getMonth() - month)
      const yearMonth = formatMonth(monthDate)

      // 估算当月样本数
      const sampleCount = 1200

      for (const center of centers) {
        const rate = Number((center.monthly_amount / sampleCount).toFixed(4))
        insertAlloc.run(
          uuidv4(), center.id, yearMonth,
          center.monthly_amount, sampleCount, rate
        )
        allocTotal++
      }
    }
    console.log(`  创建 ${allocTotal} 条分摊记录`)
  } else {
    console.log(`  已有 ${iccCount.count} 个成本中心，跳过`)
  }

  // ============================================================
  // 4. ABC BOM 作业关联
  // ============================================================
  console.log('\n【4/12】填充 ABC BOM 作业关联...')

  const balCount = db.prepare('SELECT COUNT(*) as count FROM bom_activity_links').get() as any
  if (balCount.count === 0) {
    const activityCenters = db.prepare('SELECT id, code, name, cost_driver_type FROM abc_activity_centers').all() as any[]

    if (activityCenters.length > 0 && boms.length > 0) {
      // L2-6 统一到规范表 bom_activity_links(id, bom_id, activity_center_id, quantity, unit, sort_order)。
      // 旧 abc_bom_activity_links 从无建表；其 cost_driver_id/description 字段去除——动因由中心 cost_driver_type 决定。
      const insertBAL = db.prepare(`
        INSERT INTO bom_activity_links (id, bom_id, activity_center_id, quantity, unit, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const DRIVER_UNIT: Record<string, string> = { block_count: '块', slide_count: '张', case_count: '例' }

      // BOM 类型与作业中心的映射
      const bomActivityMap: Record<string, string[]> = {
        'he': ['SPECIMEN', 'SECTION', 'HE_STAIN', 'DIAGNOSIS'],
        'ihc': ['SPECIMEN', 'SECTION', 'AR', 'IHC', 'DIAGNOSIS'],
        'ss': ['SPECIMEN', 'SECTION', 'SS', 'DIAGNOSIS'],
        'mp': ['SPECIMEN', 'MP', 'DIAGNOSIS'],
        'cyto': ['SPECIMEN', 'CYTOLOGY', 'DIAGNOSIS'],
      }

      let balTotal = 0
      for (const bom of boms) {
        const activities = bomActivityMap[bom.type] || bomActivityMap['ihc']

        for (let i = 0; i < activities.length; i++) {
          const activityCode = activities[i]
          const activity = activityCenters.find(a => a.code === activityCode)
          if (!activity) continue

          insertBAL.run(
            uuidv4(), bom.id, activity.id,
            randomInt(1, 5),
            DRIVER_UNIT[activity.cost_driver_type] || null,
            i
          )
          balTotal++
        }
      }
      console.log(`  创建 ${balTotal} 条 BOM 作业关联`)
    }
  } else {
    console.log(`  已有 ${balCount.count} 条关联，跳过`)
  }

  // ============================================================
  // 5. 预警记录
  // ============================================================
  console.log('\n【5/12】填充预警记录...')

  const alertCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get() as any
  if (alertCount.count === 0) {
    const materials = db.prepare(`
      SELECT m.id, m.name, m.code, m.safety_stock, COALESCE(i.stock, 0) as stock
      FROM materials m
      LEFT JOIN inventory i ON m.id = i.material_id
      WHERE m.is_deleted = 0
      LIMIT 30
    `).all() as any[]

    const insertAlert = db.prepare(`
      INSERT INTO alerts (id, type, level, material_id, material_name, current_stock, threshold, message, status, handled_by, handled_at, remark, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const alertTypes = ['low-stock', 'expiry', 'stagnant']
    const alertLevels = ['warning', 'danger', 'info']
    const statuses = ['pending', 'handled', 'dismissed']

    let alertTotal = 0

    // 最近 3 个月的预警
    for (let month = 0; month < 3; month++) {
      const monthDate = new Date()
      monthDate.setMonth(monthDate.getMonth() - month)

      const numAlerts = randomInt(8, 15)
      for (let i = 0; i < numAlerts; i++) {
        const mat = pickRandom(materials)
        const alertType = pickRandom(alertTypes)
        const level = pickRandom(alertLevels)
        const status = pickRandom(statuses)
        const alertDate = randomDate(
          new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
          new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
        )

        let message = ''
        let threshold = 0
        if (alertType === 'low-stock') {
          threshold = mat.safety_stock || 10
          message = `物料 ${mat.name} 库存不足，当前库存 ${mat.stock}，安全库存 ${threshold}`
        } else if (alertType === 'expiry') {
          threshold = 30
          message = `物料 ${mat.name} 即将过期，请及时处理`
        } else {
          threshold = 90
          message = `物料 ${mat.name} 超过 ${threshold} 天无出入库记录`
        }

        insertAlert.run(
          uuidv4(), alertType, level, mat.id, mat.name,
          mat.stock, threshold, message, status,
          status === 'handled' ? '王坤强' : null,
          status === 'handled' ? formatDate(new Date(alertDate.getTime() + 86400000)) : null,
          status === 'handled' ? '已处理' : null,
          alertDate.toISOString()
        )
        alertTotal++
      }
    }
    console.log(`  创建 ${alertTotal} 条预警记录`)
  } else {
    console.log(`  已有 ${alertCount.count} 条预警，跳过`)
  }

  // ============================================================
  // 6. LIS 病例数据
  // ============================================================
  console.log('\n【6/12】填充 LIS 病例数据...')

  const lisCount = db.prepare('SELECT COUNT(*) as count FROM lis_cases').get() as any
  if (lisCount.count === 0) {
    const projects = db.prepare('SELECT id, code, name FROM projects WHERE is_deleted = 0 LIMIT 30').all() as any[]

    if (projects.length > 0) {
      const insertLIS = db.prepare(`
        INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status, import_batch, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const operators = ['张伟', '刘玉芬', '王坤强', '陈博']
      const statuses = ['normal', 'abnormal', 'pending']
      let lisTotal = 0

      // 最近 3 个月的病例
      for (let month = 0; month < 3; month++) {
        const monthDate = new Date()
        monthDate.setMonth(monthDate.getMonth() - month)

        const numCases = randomInt(100, 200)
        const importBatch = `IMP-${formatMonth(monthDate)}-${randomInt(1, 5).toString().padStart(3, '0')}`

        for (let i = 0; i < numCases; i++) {
          const caseDate = randomDate(
            new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
            new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
          )
          const project = pickRandom(projects)
          const caseNo = `LC-${formatDate(caseDate).replace(/-/g, '')}-${(lisTotal + i + 1).toString().padStart(5, '0')}`

          insertLIS.run(
            uuidv4(), caseNo, project.id, project.name,
            pickRandom(operators), caseDate.toISOString(),
            pickRandom(statuses), importBatch, caseDate.toISOString()
          )
          lisTotal++
        }
      }
      console.log(`  创建 ${lisTotal} 条 LIS 病例`)
    }
  } else {
    console.log(`  已有 ${lisCount.count} 条病例，跳过`)
  }

  // ============================================================
  // 7. 对账修正日志
  // ============================================================
  console.log('\n【7/12】填充对账修正日志...')

  const rlCount = db.prepare('SELECT COUNT(*) as count FROM reconciliation_logs').get() as any
  if (rlCount.count === 0) {
    const insertRL = db.prepare(`
      INSERT INTO reconciliation_logs (id, type, target_id, target_name, field, old_value, new_value, reason, operator, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const correctionTypes = ['material_price', 'quantity_adjust', 'cost_allocation', 'batch_correction']
    const reasons = ['对账发现价格录入错误', '盘点数量与系统不符', '成本分摊比例调整', '批次信息修正']
    const operators = ['孙丽', '王坤强', '张建国']

    let rlTotal = 0
    for (let month = 0; month < 3; month++) {
      const monthDate = new Date()
      monthDate.setMonth(monthDate.getMonth() - month)

      const numLogs = randomInt(3, 8)
      for (let i = 0; i < numLogs; i++) {
        const logDate = randomDate(
          new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
          new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
        )

        insertRL.run(
          uuidv4(), pickRandom(correctionTypes),
          uuidv4(), pickRandom(['苏木素染液', '伊红染液', 'DAB显色试剂盒', 'EnVision二抗试剂盒', '防脱载玻片', 'FFPE DNA提取试剂盒', 'Ki-67抗体', 'HER2抗体']),
          pickRandom(['price', 'quantity', 'allocation_rate']),
          randomFloat(10, 100).toString(),
          randomFloat(10, 100).toString(),
          pickRandom(reasons), pickRandom(operators),
          logDate.toISOString()
        )
        rlTotal++
      }
    }
    console.log(`  创建 ${rlTotal} 条对账修正日志`)
  } else {
    console.log(`  已有 ${rlCount.count} 条日志，跳过`)
  }

  // ============================================================
  // 8. 出库 ABC 成本明细
  // ============================================================
  console.log('\n【8/12】填充出库 ABC 成本明细...')

  const abcDetailCount = db.prepare('SELECT COUNT(*) as count FROM outbound_abc_details').get() as any
  if (abcDetailCount.count === 0) {
    const outbounds = db.prepare(`
      SELECT o.id, o.outbound_no, o.project_id, o.total_cost, o.created_at,
             p.code as project_code, p.name as project_name, p.bom_id
      FROM outbound_records o
      LEFT JOIN projects p ON o.project_id = p.id
      WHERE o.is_deleted = 0
    `).all() as any[]

    const feeStandards = db.prepare('SELECT id, code, name, base_price FROM fee_standards LIMIT 10').all() as any[]

    if (outbounds.length > 0) {
      const insertABC = db.prepare(`
        INSERT INTO outbound_abc_details (id, outbound_id, bom_id, project_id, sample_count, slide_count, block_count,
          material_cost, activity_cost, total_cost, cost_per_slide, fee_category, fee_standard_id, fee_amount,
          profit, profit_rate, activity_details, cost_month, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let abcTotal = 0
      for (const ob of outbounds) {
        const sampleCount = randomInt(1, 5)
        const slideCount = sampleCount * randomInt(2, 6)
        const blockCount = sampleCount * randomInt(1, 3)
        const materialCost = randomFloat(50, 500)
        const activityCost = randomFloat(20, 200)
        const totalCost = materialCost + activityCost
        const costPerSlide = Number((totalCost / slideCount).toFixed(2))

        const fee = feeStandards.length > 0 ? pickRandom(feeStandards) : null
        const feeAmount = fee ? fee.base_price * slideCount : randomFloat(100, 800)
        const profit = feeAmount - totalCost
        const profitRate = totalCost > 0 ? Number((profit / totalCost).toFixed(4)) : 0

        const activityDetails = JSON.stringify({
          specimen: randomFloat(5, 30),
          section: randomFloat(10, 50),
          staining: randomFloat(20, 100),
          diagnosis: randomFloat(15, 60),
        })

        const costMonth = ob.created_at ? ob.created_at.slice(0, 7) : formatMonth(new Date())

        insertABC.run(
          uuidv4(), ob.id, ob.bom_id, ob.project_id,
          sampleCount, slideCount, blockCount,
          materialCost, activityCost, totalCost, costPerSlide,
          fee ? fee.code : null, fee?.id || null, feeAmount,
          profit, profitRate, activityDetails, costMonth,
          ob.created_at || new Date().toISOString()
        )
        abcTotal++
      }
      console.log(`  创建 ${abcTotal} 条 ABC 成本明细`)
    }
  } else {
    console.log(`  已有 ${abcDetailCount.count} 条明细，跳过`)
  }

  // ============================================================
  // 9. 切片成本快照（最近 3 个月）
  // ============================================================
  console.log('\n【9/12】填充切片成本快照...')

  const snapCount = db.prepare('SELECT COUNT(*) as count FROM slide_cost_snapshots').get() as any
  if (snapCount.count === 0) {
    const insertSnap = db.prepare(`
      INSERT INTO slide_cost_snapshots (id, snapshot_date, bom_id, project_type, std_material_cost, std_activity_cost,
        std_total_cost, std_cost_per_slide, activity_breakdown, fee_category, standard_fee, margin, margin_rate, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const projectTypes = ['he', 'ihc', 'ss', 'mp', 'cyto']
    let snapTotal = 0

    for (let month = 0; month < 3; month++) {
      const monthDate = new Date()
      monthDate.setMonth(monthDate.getMonth() - month)
      const snapshotDate = formatDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1))

      for (const bom of boms.slice(0, 30)) {
        const matCost = randomFloat(30, 300)
        const actCost = randomFloat(15, 100)
        const totalCost = matCost + actCost
        const costPerSlide = Number((totalCost / randomInt(1, 3)).toFixed(2))

        const activityBreakdown = JSON.stringify({
          specimen: randomFloat(3, 20),
          section: randomFloat(5, 30),
          staining: randomFloat(10, 60),
          diagnosis: randomFloat(8, 40),
        })

        const fee = randomFloat(50, 300)
        const margin = fee - totalCost
        const marginRate = totalCost > 0 ? Number((margin / totalCost).toFixed(4)) : 0

        insertSnap.run(
          uuidv4(), snapshotDate, bom.id, bom.type || 'ihc',
          matCost, actCost, totalCost, costPerSlide,
          activityBreakdown, bom.type || 'ihc', fee, margin, marginRate,
          new Date().toISOString()
        )
        snapTotal++
      }
    }
    console.log(`  创建 ${snapTotal} 条切片成本快照`)
  } else {
    console.log(`  已有 ${snapCount.count} 条快照，跳过`)
  }

  // ============================================================
  // 10. 成本预算与质量成本
  // ============================================================
  console.log('\n【10/12】填充成本预算与质量成本...')

  // 成本预算
  const budgetCount = db.prepare('SELECT COUNT(*) as count FROM cost_budgets').get() as any
  if (budgetCount.count === 0) {
    const insertBudget = db.prepare(`
      INSERT INTO cost_budgets (id, year_month, category, budget_amount, actual_amount, execution_rate, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const categories = ['材料成本', '人工成本', '设备折旧', '间接费用', '质控成本']
    let budgetTotal = 0

    for (let month = 0; month < 3; month++) {
      const monthDate = new Date()
      monthDate.setMonth(monthDate.getMonth() - month)
      const yearMonth = formatMonth(monthDate)

      for (const category of categories) {
        const budget = 35000
        const actual = Number((budget * 0.85).toFixed(2))
        const rate = Number((actual / budget).toFixed(4))
        const status = rate > 1.1 ? 'over_budget' : rate < 0.8 ? 'under_budget' : 'normal'

        insertBudget.run(
          uuidv4(), yearMonth, category, budget, actual, rate, status,
          new Date().toISOString()
        )
        budgetTotal++
      }
    }
    console.log(`  创建 ${budgetTotal} 条成本预算`)
  } else {
    console.log(`  已有 ${budgetCount.count} 条预算，跳过`)
  }

  // 质量成本
  const qcCostCount = db.prepare('SELECT COUNT(*) as count FROM quality_costs').get() as any
  if (qcCostCount.count === 0) {
    const insertQC = db.prepare(`
      INSERT INTO quality_costs (id, year_month, cost_type, sub_type, amount, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const costTypes = [
      { type: 'prevention', sub: '培训', desc: '质量培训费用' },
      { type: 'prevention', sub: 'SOP', desc: '标准操作规程维护' },
      { type: 'appraisal', sub: '质控', desc: '室内质控品消耗' },
      { type: 'appraisal', sub: '室间质评', desc: '室间质评费用' },
      { type: 'internal_failure', sub: '返工', desc: '不合格标本返工' },
      { type: 'external_failure', sub: '投诉', desc: '客户投诉处理' },
    ]

    let qcTotal = 0
    for (let month = 0; month < 3; month++) {
      const monthDate = new Date()
      monthDate.setMonth(monthDate.getMonth() - month)
      const yearMonth = formatMonth(monthDate)

      for (const ct of costTypes) {
        insertQC.run(
          uuidv4(), yearMonth, ct.type, ct.sub,
          2000, ct.desc,
          new Date().toISOString()
        )
        qcTotal++
      }
    }
    console.log(`  创建 ${qcTotal} 条质量成本记录`)
  } else {
    console.log(`  已有 ${qcCostCount.count} 条质量成本，跳过`)
  }

  // ============================================================
  // 11. 批次使用跟踪与耗尽记录
  // ============================================================
  console.log('\n【11/12】填充批次使用跟踪...')

  const butCount = db.prepare('SELECT COUNT(*) as count FROM batch_usage_tracking').get() as any
  if (butCount.count === 0) {
    const batches = db.prepare(`
      SELECT b.id, b.material_id, b.batch_no, b.remaining, b.quantity, b.expiry_date, b.created_at,
             m.name as material_name, m.spec, m.unit
      FROM batches b
      JOIN materials m ON b.material_id = m.id
      WHERE b.remaining > 0
      LIMIT 20
    `).all() as any[]

    if (batches.length > 0) {
      const insertBUT = db.prepare(`
        INSERT INTO batch_usage_tracking (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, days_used, expected_days, progress, usage, receiver, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertDepletion = db.prepare(`
        INSERT INTO batch_depletion (id, tracking_id, material_id, material_name, batch, spec, total_qty, remain_qty, unit, start_date, end_date, days_used, actual_days, deplete_type, deplete_reason, operator, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let butTotal = 0
      let depTotal = 0
      const receivers = ['张伟', '刘玉芬', '王坤强']

      for (const batch of batches) {
        const startDate = batch.created_at ? new Date(batch.created_at) : randomDate(new Date('2025-01-01'), new Date())
        const daysUsed = randomInt(5, 90)
        const expectedDays = randomInt(30, 180)
        const progress = Math.min(100, Math.round((daysUsed / expectedDays) * 100))
        const status = progress >= 100 ? 'depleted' : progress >= 80 ? 'warning' : 'in-use'

        insertBUT.run(
          uuidv4(), batch.material_id, batch.material_name, batch.batch_no,
          batch.spec || '', batch.quantity, batch.remaining,
          batch.unit || 'ml', formatDate(startDate), daysUsed, expectedDays,
          progress, 'self', pickRandom(receivers), status,
          startDate.toISOString(), new Date().toISOString()
        )
        butTotal++

        // 部分批次生成耗尽记录
        if (status === 'depleted' || Math.random() > 0.7) {
          const endDate = new Date(startDate.getTime() + daysUsed * 86400000)
          insertDepletion.run(
            uuidv4(), batch.material_id, batch.material_id, batch.material_name,
            batch.batch_no, batch.spec || '', batch.quantity, 0,
            batch.unit || 'ml', formatDate(startDate), formatDate(endDate),
            daysUsed, daysUsed, 'normal', '正常使用耗尽', pickRandom(receivers),
            endDate.toISOString()
          )
          depTotal++
        }
      }
      console.log(`  创建 ${butTotal} 条使用跟踪, ${depTotal} 条耗尽记录`)
    }
  } else {
    console.log(`  已有 ${butCount.count} 条跟踪，跳过`)
  }

  // ============================================================
  // 12. 项目成本明细
  // ============================================================
  console.log('\n【12/12】填充项目成本明细...')

  const pcdCount = db.prepare('SELECT COUNT(*) as count FROM project_cost_details').get() as any
  if (pcdCount.count === 0) {
    const projects = db.prepare('SELECT id, code, name FROM projects WHERE is_deleted = 0 LIMIT 20').all() as any[]
    const outbounds = db.prepare('SELECT id FROM outbound_records WHERE is_deleted = 0').all() as any[]

    if (projects.length > 0) {
      const insertPCD = db.prepare(`
        INSERT INTO project_cost_details (id, outbound_id, project_id, sample_count, material_cost, labor_cost, equipment_cost, qc_cost, indirect_cost, total_cost, cost_month, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let pcdTotal = 0
      for (let month = 0; month < 3; month++) {
        const monthDate = new Date()
        monthDate.setMonth(monthDate.getMonth() - month)
        const costMonth = formatMonth(monthDate)

        for (const project of projects) {
          const numRecords = 3
          for (let i = 0; i < numRecords; i++) {
            const sampleCount = 5
            const materialCost = 350 * sampleCount
            const laborCost = 80 * sampleCount
            const equipmentCost = 50 * sampleCount
            const qcCost = 25 * sampleCount
            const indirectCost = 30 * sampleCount
            const totalCost = materialCost + laborCost + equipmentCost + qcCost + indirectCost

            const outbound = outbounds.length > 0 ? pickRandom(outbounds) : null

            insertPCD.run(
              uuidv4(), outbound?.id || null, project.id, sampleCount,
              materialCost, laborCost, equipmentCost, qcCost, indirectCost, totalCost,
              costMonth, new Date().toISOString()
            )
            pcdTotal++
          }
        }
      }
      console.log(`  创建 ${pcdTotal} 条项目成本明细`)
    }
  } else {
    console.log(`  已有 ${pcdCount.count} 条明细，跳过`)
  }

  // ============================================================
  // 完成
  // ============================================================
  db.close()
  console.log('\n=== 综合业务数据填充完成 ===')
}

// 直接运行
seedComprehensiveData()
