/**
 * ABC 来源→作业中心映射回填（幂等）
 *
 * 解决"演示数据无 BOM↔作业中心映射、人工/设备无中心归属"导致 ABC 逐中心引擎在真实数据上
 * 未完全吸收、无逐中心明细的问题。仅填补空缺（不覆盖已有映射），故可安全地：
 *   - 在全新 seed 后运行（补齐自动 seed 未覆盖的自定义/历史数据）
 *   - 在既有库上运行（回填存量缺口）
 *
 * 回填四项：
 *   1) standard_labor_times.activity_center_id（按步骤名关键词 → 中心，回退按 project_type）
 *   2) equipment.activity_center_id（按设备名关键词 → 中心）
 *   3) equipment_usage.activity_center_id（继承设备的中心）
 *   4) bom_activity_links（按 BOM 类型 → 中心，每样本量=1，单位随中心动因类型）
 *
 * 用法：npx tsx scripts/seed-abc-mappings.ts    （作用于 DATABASE_PATH 指向的库，默认 data/coreone.db）
 */

import { getDatabase } from '../src/database/DatabaseManager.js'
import { v4 as uuidv4 } from 'uuid'

// 关键词 → 中心 code（按优先级先匹配先得）
const LABOR_KEYWORDS: Array<[RegExp, string]> = [
  [/接收|取材|登记|包埋|specimen|embed/i, 'SPECIMEN'],
  [/切片|摊片|烤片|封片|抗原修复|section/i, 'SECTION'],
  [/HE染色|常规染色/i, 'HE_STAIN'],
  [/免疫组化|ihc/i, 'IHC'],
  [/特殊染色|特染|\bss\b/i, 'SS'],
  [/pcr|fish|ngs|测序|分子|扩增|探针|杂交/i, 'MP'],
  [/阅片|诊断|报告|复核|diagnos|report/i, 'DIAGNOSIS'],
  [/细胞|cyto|tct|液基/i, 'CYTOLOGY'],
]
const EQUIP_KEYWORDS: Array<[RegExp, string]> = [
  [/免疫组化/i, 'IHC'],
  [/染色机|染色/i, 'HE_STAIN'],
  [/切片|包埋|脱水|烤片/i, 'SECTION'],
  [/显微镜/i, 'DIAGNOSIS'],
  [/fish|pcr|ngs|测序|离心|荧光/i, 'MP'],
  [/冰箱|存储|冷藏/i, 'SPECIMEN'],
]
const TYPE_FALLBACK: Record<string, string> = {
  ihc: 'IHC', ss: 'SS', he: 'HE_STAIN', mp: 'MP', cyto: 'CYTOLOGY', all: 'SPECIMEN',
}
// BOM 类型 → 作业中心序列（按工艺顺序）
const BOM_TYPE_CENTERS: Record<string, string[]> = {
  ihc: ['SPECIMEN', 'SECTION', 'IHC', 'DIAGNOSIS'],
  ss: ['SPECIMEN', 'SECTION', 'SS', 'DIAGNOSIS'],
  he: ['SPECIMEN', 'SECTION', 'HE_STAIN', 'DIAGNOSIS'],
  mp: ['SPECIMEN', 'MP', 'DIAGNOSIS'],
  cyto: ['CYTOLOGY', 'DIAGNOSIS'],
}
const DRIVER_UNIT: Record<string, string> = { block_count: '块', slide_count: '张', case_count: '例' }

// 可计量动因（在 outbound_abc_details 有计量列；与 abc-v1.1.DRIVER_COLUMN 白名单一致）。
const MEASURABLE_DRIVERS = new Set(['block_count', 'slide_count', 'case_count', 'sample_count'])
// 标准中心的规范动因（均可计量且符合病理工艺）。修非可计量动因（stain_count/test_count/report_count/
// probe_locus_panel/slide_block_count 无计量列 → 池动因量恒 0、费率 0、成本无法分摊到切片）。
const CANONICAL_DRIVER: Record<string, string> = {
  SPECIMEN: 'block_count', SECTION: 'slide_count', HE_STAIN: 'slide_count', IHC: 'slide_count',
  SS: 'slide_count', MP: 'case_count', DIAGNOSIS: 'case_count', CYTOLOGY: 'slide_count',
}

function matchCenter(text: string, rules: Array<[RegExp, string]>): string | null {
  for (const [re, code] of rules) if (re.test(text)) return code
  return null
}

export function seedAbcMappings(database?: any): Record<string, number> {
  const db = database || getDatabase()

  // 解析标准作业中心 code → {id, driver}（仅标准中心，忽略 E2E/测试垃圾中心）
  const centers = db.prepare('SELECT id, code, cost_driver_type FROM abc_activity_centers').all() as any[]
  const byCode = new Map<string, any>()
  for (const c of centers) if (c.code) byCode.set(String(c.code).toUpperCase(), c)
  const resolve = (code: string | null): any => (code ? byCode.get(code.toUpperCase()) : null)

  const stats = { driverFix: 0, labor: 0, equipment: 0, usage: 0, bomLinks: 0, bomsLinked: 0 }

  // 0) 修标准中心的非可计量动因 → 规范可计量动因（否则池成本恒不分摊，未完全吸收）
  const updDriver = db.prepare('UPDATE abc_activity_centers SET cost_driver_type = ? WHERE id = ?')
  for (const [code, canonical] of Object.entries(CANONICAL_DRIVER)) {
    const c = resolve(code)
    if (c && !MEASURABLE_DRIVERS.has(String(c.cost_driver_type))) {
      updDriver.run(canonical, c.id)
      c.cost_driver_type = canonical // 同步内存，供下方 bom_activity_links 取单位
      stats.driverFix++
    }
  }

  // 1) 人工 → 中心
  const laborRows = db.prepare(
    `SELECT id, step_name, project_type FROM standard_labor_times WHERE activity_center_id IS NULL AND COALESCE(is_deleted,0)=0`
  ).all() as any[]
  const updLabor = db.prepare('UPDATE standard_labor_times SET activity_center_id = ? WHERE id = ?')
  for (const r of laborRows) {
    const code = matchCenter(String(r.step_name || ''), LABOR_KEYWORDS)
      || TYPE_FALLBACK[String(r.project_type || 'all').toLowerCase()] || 'SPECIMEN'
    const center = resolve(code) || resolve('SPECIMEN')
    if (center) { updLabor.run(center.id, r.id); stats.labor++ }
  }

  // 2) 设备 → 中心
  const equipRows = db.prepare('SELECT id, name FROM equipment WHERE activity_center_id IS NULL').all() as any[]
  const updEquip = db.prepare('UPDATE equipment SET activity_center_id = ? WHERE id = ?')
  for (const r of equipRows) {
    const code = matchCenter(String(r.name || ''), EQUIP_KEYWORDS) || 'SPECIMEN'
    const center = resolve(code) || resolve('SPECIMEN')
    if (center) { updEquip.run(center.id, r.id); stats.equipment++ }
  }

  // 3) 设备用量 → 继承设备中心（用量发生时定格）
  const usageRes = db.prepare(`
    UPDATE equipment_usage
    SET activity_center_id = (SELECT e.activity_center_id FROM equipment e WHERE e.id = equipment_usage.equipment_id)
    WHERE activity_center_id IS NULL
      AND (SELECT e.activity_center_id FROM equipment e WHERE e.id = equipment_usage.equipment_id) IS NOT NULL
  `).run()
  stats.usage = Number(usageRes.changes) || 0

  // 4) BOM → 作业中心关联（每样本量=1；仅为无关联的 BOM 补）
  const boms = db.prepare('SELECT id, type FROM boms WHERE is_deleted = 0').all() as any[]
  const hasLink = db.prepare('SELECT 1 FROM bom_activity_links WHERE bom_id = ? LIMIT 1')
  const insBAL = db.prepare(
    'INSERT INTO bom_activity_links (id, bom_id, activity_center_id, quantity, unit, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const bom of boms) {
    if (hasLink.get(bom.id)) continue
    const codes = BOM_TYPE_CENTERS[String(bom.type || '').toLowerCase()] || ['SPECIMEN', 'SECTION', 'DIAGNOSIS']
    let order = 0
    let added = 0
    for (const code of codes) {
      const center = resolve(code)
      if (!center) continue
      insBAL.run(uuidv4(), bom.id, center.id, 1, DRIVER_UNIT[center.cost_driver_type] || null, order++)
      stats.bomLinks++; added++
    }
    if (added > 0) stats.bomsLinked++
  }

  return stats
}

// CLI 入口
const isMain = process.argv[1] && process.argv[1].includes('seed-abc-mappings')
if (isMain) {
  const stats = seedAbcMappings()
  console.log('ABC 映射回填完成：', JSON.stringify(stats))
}
