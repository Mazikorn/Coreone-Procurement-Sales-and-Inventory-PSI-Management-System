/**
 * 补充数据初始化脚本
 * 目标: 补充各页面数据，覆盖各种业务状态
 */

import { getDatabase } from '../src/database/DatabaseManager.js'
import { v4 as uuidv4 } from 'uuid'

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function generateNo(prefix: string, seq: number): string {
  return `${prefix}-20260605-${String(seq).padStart(3, '0')}`
}

// ============================================
// 1. 补充库存 — 让大部分物料有库存
// ============================================
function restockMaterials(db: any) {
  log('=== 补充物料库存 ===')
  const materials = db.prepare(`
    SELECT m.id, m.name, m.unit, COALESCE(i.stock, 0) as stock, i.location_id
    FROM materials m
    LEFT JOIN inventory i ON m.id = i.material_id
    WHERE m.is_deleted = 0
    ORDER BY m.id
  `).all() as any[]

  const locations = db.prepare("SELECT id FROM locations WHERE status = 1 AND is_deleted = 0 ORDER BY id").all() as any[]
  if (locations.length === 0) { log('无可用库位'); return }

  let restocked = 0
  const updateInv = db.prepare('UPDATE inventory SET stock = ?, location_id = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
  const insertInv = db.prepare('INSERT OR IGNORE INTO inventory (id, material_id, stock, locked_stock, location_id, update_time) VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)')

  for (const m of materials) {
    if (m.stock > 0) continue
    const targetStock = Math.floor(Math.random() * 20) + 5 // 5-24
    const loc = locations[Math.floor(Math.random() * locations.length)].id
    if (m.location_id) {
      updateInv.run(targetStock, m.location_id, m.id)
    } else {
      insertInv.run(uuidv4(), m.id, targetStock, loc)
    }
    restocked++
  }
  log(`补充库存: ${restocked} 个物料`)
}

// ============================================
// 2. 创建调拨记录
// ============================================
function seedTransfers(db: any) {
  log('=== 创建调拨记录 ===')
  const existing = db.prepare("SELECT COUNT(*) as c FROM inbound_records WHERE type = 'transfer' AND is_deleted = 0").get() as any
  if (existing.c > 0) { log(`调拨记录已存在 (${existing.c} 条), 跳过`); return }

  const materials = db.prepare(`
    SELECT m.id, m.name, m.unit, i.stock, i.location_id
    FROM materials m JOIN inventory i ON m.id = i.material_id
    WHERE m.is_deleted = 0 AND i.stock > 5
    ORDER BY RANDOM() LIMIT 10
  `).all() as any[]

  const locations = db.prepare("SELECT id, name FROM locations WHERE status = 1 AND is_deleted = 0 ORDER BY id").all() as any[]
  const insertTransfer = db.prepare(`
    INSERT INTO inbound_records (id, inbound_no, type, material_id, quantity, unit, location_id, operator, status, remark, created_at)
    VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?, 'completed', ?, ?)
  `)
  const insertLog = db.prepare(`
    INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark, created_at)
    VALUES (?, 'transfer', ?, 0, ?, ?, ?, 'transfer', ?, ?, ?)
  `)

  let count = 0
  for (const m of materials) {
    const fromLoc = locations.find(l => l.id === m.location_id) || locations[0]
    const toLoc = locations.find(l => l.id !== m.location_id) || locations[1]
    if (!toLoc) continue

    const qty = Math.min(Math.floor(Math.random() * 5) + 1, m.stock)
    const id = uuidv4()
    const inboundNo = generateNo('TF', count + 1)
    const date = `2026-06-0${Math.floor(Math.random() * 5) + 1}T${String(8 + count).padStart(2, '0')}:00:00.000Z`

    insertTransfer.run(id, inboundNo, m.id, qty, m.unit || '个', toLoc.id, '王坤强',
      `从 ${fromLoc.name} 调拨至 ${toLoc.name}`, date)

    const logId = uuidv4()
    insertLog.run(logId, m.id, m.stock, m.stock, id, '王坤强',
      `从 ${fromLoc.name} 调拨至 ${toLoc.name}`, date)

    // 更新库存库位
    db.prepare('UPDATE inventory SET location_id = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
      .run(toLoc.id, m.id)

    count++
  }
  log(`创建调拨记录: ${count} 条`)
}

// ============================================
// 3. 补充退库记录
// ============================================
function seedReturns(db: any) {
  log('=== 补充退库记录 ===')
  const existing = db.prepare('SELECT COUNT(*) as c FROM return_records WHERE is_deleted = 0').get() as any
  if (existing.c >= 8) { log(`退库记录已足够 (${existing.c} 条), 跳过`); return }

  const materials = db.prepare(`
    SELECT m.id, m.name, m.unit, i.stock
    FROM materials m JOIN inventory i ON m.id = i.material_id
    WHERE m.is_deleted = 0 AND i.stock > 3
    ORDER BY RANDOM() LIMIT 8
  `).all() as any[]

  const reasons = ['质量问题', '发错物料', '已过期', '多余库存', '其他', '质量问题', '发错物料', '已过期']
  const insertReturn = db.prepare(`
    INSERT INTO return_records (id, return_no, material_id, quantity, unit_cost, total_cost, reason, operator, remark, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
  `)
  const updateInv = db.prepare('UPDATE inventory SET stock = stock + ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')

  let count = 0
  for (const m of materials) {
    const qty = Math.floor(Math.random() * 3) + 1
    const id = uuidv4()
    const returnNo = generateNo('RT', existing.c + count + 1)
    const date = `2026-06-0${Math.floor(Math.random() * 5) + 1}T${String(10 + count).padStart(2, '0')}:00:00.000Z`

    const unitCost = Math.floor(Math.random() * 100) + 20
    const totalCost = qty * unitCost
    insertReturn.run(id, returnNo, m.id, qty, unitCost, totalCost, reasons[count],
      '王坤强', `退库原因: ${reasons[count]}`, date)
    updateInv.run(qty, m.id)
    count++
  }
  log(`补充退库记录: ${count} 条`)
}

// ============================================
// 4. 补充报废记录
// ============================================
function seedScraps(db: any) {
  log('=== 补充报废记录 ===')
  const existing = db.prepare('SELECT COUNT(*) as c FROM scrap_records WHERE is_deleted = 0').get() as any
  if (existing.c >= 8) { log(`报废记录已足够 (${existing.c} 条), 跳过`); return }

  const materials = db.prepare(`
    SELECT m.id, m.name, m.unit, i.stock
    FROM materials m JOIN inventory i ON m.id = i.material_id
    WHERE m.is_deleted = 0 AND i.stock > 5
    ORDER BY RANDOM() LIMIT 8
  `).all() as any[]

  const reasons = ['已过期', '已损坏', '质量问题', '已淘汰', '其他', '已过期', '已损坏', '质量问题']
  const insertScrap = db.prepare(`
    INSERT INTO scrap_records (id, scrap_no, material_id, quantity, reason, operator, remark, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)
  `)
  const updateInv = db.prepare('UPDATE inventory SET stock = stock - ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')

  let count = 0
  for (const m of materials) {
    const qty = Math.min(Math.floor(Math.random() * 2) + 1, m.stock - 1)
    if (qty <= 0) continue
    const id = uuidv4()
    const scrapNo = generateNo('SC', existing.c + count + 1)
    const date = `2026-06-0${Math.floor(Math.random() * 5) + 1}T${String(14 + count).padStart(2, '0')}:00:00.000Z`

    insertScrap.run(id, scrapNo, m.id, qty, reasons[count],
      '王坤强', `报废原因: ${reasons[count]}`, date)
    updateInv.run(qty, m.id)
    count++
  }
  log(`补充报废记录: ${count} 条`)
}

// ============================================
// 5. 补充出库记录（覆盖不同出库类型）
// ============================================
function seedMoreOutbound(db: any) {
  log('=== 补充出库记录 ===')
  const existing = db.prepare('SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0').get() as any
  if (existing.c >= 25) { log(`出库记录已足够 (${existing.c} 条), 跳过`); return }

  const materials = db.prepare(`
    SELECT m.id, m.name, m.unit, i.stock, m.price
    FROM materials m JOIN inventory i ON m.id = i.material_id
    WHERE m.is_deleted = 0 AND i.stock > 3
    ORDER BY RANDOM() LIMIT 10
  `).all() as any[]

  const projects = db.prepare("SELECT id, name FROM projects WHERE is_deleted = 0 LIMIT 5").all() as any[]
  const insertOutbound = db.prepare(`
    INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, operator, status, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)
  `)
  const insertItem = db.prepare(`
    INSERT INTO outbound_items (id, outbound_id, material_id, batch_no, quantity, unit, unit_cost, total_cost, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateInv = db.prepare('UPDATE inventory SET stock = stock - ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')

  const types = ['project', 'transfer', 'scrap', 'project', 'project']
  let count = 0
  for (let i = 0; i < 8; i++) {
    const m = materials[i % materials.length]
    const type = types[i % types.length]
    const project = type === 'project' ? projects[i % projects.length] : null
    const qty = Math.min(Math.floor(Math.random() * 3) + 1, m.stock - 1)
    if (qty <= 0) continue

    const id = uuidv4()
    const outboundNo = generateNo('OB', existing.c + count + 1)
    const totalCost = qty * (m.price || 50)
    const date = `2026-06-0${Math.floor(Math.random() * 5) + 1}T${String(9 + count).padStart(2, '0')}:00:00.000Z`

    insertOutbound.run(id, outboundNo, type, project?.id || null, totalCost, '王坤强',
      `${type}出库 - ${m.name}`, date)

    const itemId = uuidv4()
    const unitPrice = m.price || 50
    insertItem.run(itemId, id, m.id, null, qty, m.unit || '个', unitPrice, qty * unitPrice, date)

    updateInv.run(qty, m.id)
    count++
  }
  log(`补充出库记录: ${count} 条`)
}

// ============================================
// 6. ABC 扩展数据 — 成本预警规则
// ============================================
function seedCostAlertRules(db: any) {
  log('=== 创建成本预警规则 ===')
  const existing = db.prepare('SELECT COUNT(*) as c FROM cost_alert_rules').get() as any
  if (existing.c > 0) { log(`成本预警规则已存在 (${existing.c} 条), 跳过`); return }

  const rules = [
    { rule_type: 'cost_threshold', threshold_value: 1.2, comparison: 'greater_than', notification_type: 'email' },
    { rule_type: 'monthly_increase', threshold_value: 0.15, comparison: 'greater_than', notification_type: 'system' },
    { rule_type: 'profit_to_loss', threshold_value: 0, comparison: 'less_than', notification_type: 'both' },
    { rule_type: 'budget_exceed', threshold_value: 1.0, comparison: 'greater_than', notification_type: 'email' },
    { rule_type: 'quality_cost_ratio', threshold_value: 0.1, comparison: 'greater_than', notification_type: 'system' },
  ]

  const insert = db.prepare(`
    INSERT INTO cost_alert_rules (id, rule_type, threshold_value, comparison, notification_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
  `)

  for (const r of rules) {
    insert.run(uuidv4(), r.rule_type, r.threshold_value, r.comparison, r.notification_type)
  }
  log(`创建成本预警规则: ${rules.length} 条`)
}

// ============================================
// 7. ABC 扩展数据 — 季度调整记录
// ============================================
function seedCostAdjustments(db: any) {
  log('=== 创建季度调整记录 ===')
  const existing = db.prepare('SELECT COUNT(*) as c FROM cost_adjustments').get() as any
  if (existing.c > 0) { log(`季度调整已存在 (${existing.c} 条), 跳过`); return }

  // Get cost centers
  const centers = db.prepare('SELECT id, name FROM indirect_cost_centers LIMIT 3').all() as any[]
  if (centers.length === 0) { log('无间接成本中心, 跳过季度调整'); return }

  const adjustments = [
    { centerIdx: 0, yearQuarter: '2026-Q1', preProvision: 45000, actual: 47500, adjustment: 2500, reason: 'Q1实际成本略高于预提', status: 'approved', submittedBy: 'finance', reviewedBy: 'admin', reviewReason: '批准调整' },
    { centerIdx: 1, yearQuarter: '2026-Q1', preProvision: 32000, actual: 30800, adjustment: -1200, reason: 'Q1实际成本低于预提', status: 'approved', submittedBy: 'finance', reviewedBy: 'admin', reviewReason: '批准调减' },
    { centerIdx: Math.min(2, centers.length - 1), yearQuarter: '2026-Q2', preProvision: 55000, actual: 58200, adjustment: 3200, reason: 'Q2实际成本高于预提', status: 'pending', submittedBy: 'finance', reviewedBy: null, reviewReason: null },
  ]

  const insert = db.prepare(`
    INSERT INTO cost_adjustments (id, cost_center_id, year_quarter, pre_provision_amount, actual_amount, adjustment_amount, adjustment_reason, submitted_by, submitted_at, review_status, reviewed_by, reviewed_at, review_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `)

  for (const a of adjustments) {
    const center = centers[a.centerIdx]
    insert.run(uuidv4(), center.id, a.yearQuarter, a.preProvision, a.actual, a.adjustment, a.reason,
      a.submittedBy, a.status, a.reviewedBy, a.reviewedBy ? new Date().toISOString() : null, a.reviewReason)
  }
  log(`创建季度调整记录: ${adjustments.length} 条`)
}

// ============================================
// 8. ABC 扩展数据 — 成本审计日志
// ============================================
function seedCostAuditLogs(db: any) {
  log('=== 创建成本审计日志 ===')
  const existing = db.prepare('SELECT COUNT(*) as c FROM cost_audit_logs').get() as any
  if (existing.c > 0) { log(`成本审计日志已存在 (${existing.c} 条), 跳过`); return }

  const auditLogs = [
    { action: 'cost_pool_update', target_type: 'cost_pools', target_id: 'SPECIMEN-202606', old_value: '50000', new_value: '52000', reason: '更新标本处理中心6月成本池', operator: 'admin' },
    { action: 'driver_rate_recalc', target_type: 'abc_driver_rates', target_id: '2026-06', old_value: '15.5', new_value: '16.2', reason: '重新计算6月动因费率', operator: 'admin' },
    { action: 'budget_create', target_type: 'cost_budgets', target_id: 'BUD-2026-06', old_value: null, new_value: '76624.05', reason: '创建2026年6月预算', operator: 'admin' },
    { action: 'fee_standard_update', target_type: 'fee_standards', target_id: 'FS-001', old_value: '100', new_value: '113', reason: '更新活检取材费标准', operator: 'admin' },
    { action: 'quality_cost_add', target_type: 'quality_costs', target_id: 'QC-2026-06', old_value: null, new_value: '2712.02', reason: '新增6月质量成本记录', operator: 'finance' },
    { action: 'alert_rule_create', target_type: 'cost_alert_rules', target_id: 'AR-001', old_value: null, new_value: '1.2', reason: '创建成本预警规则', operator: 'admin' },
    { action: 'adjustment_submit', target_type: 'cost_adjustments', target_id: 'ADJ-Q1-001', old_value: null, new_value: '2500', reason: '提交Q1季度调整申请', operator: 'finance' },
    { action: 'adjustment_approve', target_type: 'cost_adjustments', target_id: 'ADJ-Q1-001', old_value: 'pending', new_value: 'approved', reason: '批准Q1季度调整', operator: 'admin' },
    { action: 'bom_cost_recalc', target_type: 'boms', target_id: 'BOM-IHC-CK', old_value: '85.5', new_value: '92.3', reason: '重新计算IHC-CK BOM标准成本', operator: 'admin' },
    { action: 'cost_export', target_type: 'reports', target_id: 'EXP-2026-06', old_value: null, new_value: null, reason: '导出6月成本分析报告', operator: 'finance' },
  ]

  const insert = db.prepare(`
    INSERT INTO cost_audit_logs (id, action, target_type, target_id, old_value, new_value, reason, operator, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `)

  for (const l of auditLogs) {
    insert.run(uuidv4(), l.action, l.target_type, l.target_id, l.old_value, l.new_value, l.reason, l.operator)
  }
  log(`创建成本审计日志: ${auditLogs.length} 条`)
}

// ============================================
// Main
// ============================================
function main() {
  log('========================================')
  log('COREONE 补充数据初始化脚本')
  log('========================================')

  const db = getDatabase()
  db.exec('PRAGMA journal_mode=WAL')

  try {
    db.exec('BEGIN IMMEDIATE')

    restockMaterials(db)
    seedTransfers(db)
    seedReturns(db)
    seedScraps(db)
    seedMoreOutbound(db)
    seedCostAlertRules(db)
    seedCostAdjustments(db)
    seedCostAuditLogs(db)

    db.exec('COMMIT')
    log('========================================')
    log('所有补充数据初始化完成')
    log('========================================')
  } catch (err) {
    db.exec('ROLLBACK')
    log(`❌ 错误: ${err}`)
    throw err
  }
}

main()
