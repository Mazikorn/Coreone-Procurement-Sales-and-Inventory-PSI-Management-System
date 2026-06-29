/**
 * 演示种子：给「医院盈利看板」灌一批可信的院级 P&L 数据（partners + lis_cases + case_revenue + outbound_abc_details）。
 * 幂等：先清掉本脚本写入的 DEMO 行再重灌。运行：npx tsx scripts/seed-pnl-demo.ts
 */
import { v4 as uuid } from 'uuid'
import { initializeDatabase, getDatabase } from '../src/database/DatabaseManager.js'
import { backfillAbcPartnerIds } from '../src/utils/abc-partner-link.js'

initializeDatabase()
const db = getDatabase()

// 6 家医院：[名称, scope, 当月: 每 case (实收, 成本, HE切片数, 蜡块, IHC)]，部分院负毛利、部分 HE=0(未校正)
const HOSP: Array<{ name: string; scope: 'with_diagnosis' | 'technical_only'; cases: Array<[number, number, number, number, number]> }> = [
  { name: '东安县人民医院', scope: 'with_diagnosis', cases: Array.from({ length: 14 }, (_, i) => [4200 - i * 60, 3050 - i * 40, i % 3 === 0 ? 0 : 3, 2 + (i % 3), i % 4 === 0 ? 8 : 0] as [number, number, number, number, number]) },
  { name: '上海和睦家医院', scope: 'with_diagnosis', cases: Array.from({ length: 9 }, (_, i) => [1460 + i * 30, 930 + i * 10, i % 2 === 0 ? 5 : 0, 3, i % 2 === 0 ? 12 : 0] as [number, number, number, number, number]) },
  { name: '上海和睦家新城医院', scope: 'with_diagnosis', cases: Array.from({ length: 6 }, (_, i) => [1640 - i * 40, 1015 - i * 20, 3, 2, 0] as [number, number, number, number, number]) },
  { name: '成都三博东篱医院', scope: 'technical_only', cases: Array.from({ length: 7 }, (_, i) => [3070 + i * 20, 2815 + i * 30, i % 2 === 0 ? 3 : 0, 4, 8] as [number, number, number, number, number]) }, // 负毛利
  { name: '上海市养志康复医院', scope: 'with_diagnosis', cases: Array.from({ length: 5 }, (_, i) => [1460 - i * 30, 1630 - i * 20, 0, 1, 0] as [number, number, number, number, number]) }, // 负毛利 + 全 HE=0
  { name: '上海中大肿瘤医院', scope: 'with_diagnosis', cases: Array.from({ length: 11 }, (_, i) => [2890 + i * 25, 1650 + i * 15, i % 2 === 0 ? 1 : 0, 4, 12] as [number, number, number, number, number]) },
]
const MONTH = '2026-06'
const TREND_MONTHS = ['2026-04', '2026-05', '2026-06'] // 和睦家做趋势

// 清旧 DEMO
db.exec(`DELETE FROM outbound_abc_details WHERE id LIKE 'DEMO-%'`)
db.exec(`DELETE FROM case_revenue WHERE case_no LIKE 'DEMO-%'`)
db.exec(`DELETE FROM lis_cases WHERE case_no LIKE 'DEMO-%'`)
db.exec(`DELETE FROM partners WHERE code LIKE 'DEMO-%'`)

const insP = db.prepare(`INSERT INTO partners (id, code, name, service_scope, status) VALUES (?, ?, ?, ?, 1)`)
const insL = db.prepare(`INSERT INTO lis_cases (id, case_no, partner_id, he_slide_count, block_count, ihc_count, specimen_type) VALUES (?, ?, ?, ?, ?, ?, 'tissue')`)
const insR = db.prepare(`INSERT INTO case_revenue (id, case_no, partner_id, partner_name, net_amount, gross_amount, discount_rate, service_month, line_count) VALUES (?, ?, ?, ?, ?, ?, 0.8, ?, 3)`)
const insA = db.prepare(`INSERT INTO outbound_abc_details (id, outbound_id, case_no, partner_id, total_cost, cost_month, cost_status) VALUES (?, ?, ?, ?, ?, ?, 'costed')`)

let n = 0
HOSP.forEach((h, hi) => {
  const pid = uuid()
  insP.run(pid, `DEMO-${String(hi + 1).padStart(3, '0')}`, h.name, h.scope)
  const months = h.name.includes('和睦家医院') ? TREND_MONTHS : [MONTH]
  months.forEach((m, mi) => {
    h.cases.forEach(([net, cost, he, blk, ihc], ci) => {
      const scale = mi === 2 || months.length === 1 ? 1 : 0.8 + mi * 0.1 // 趋势月略增
      const cn = `DEMO-${hi}-${m}-${ci}`
      insL.run(`DEMO-L-${uuid()}`, cn, pid, he, blk, ihc)
      insR.run(`DEMO-R-${uuid()}`, cn, pid, h.name, Math.round(net * scale), Math.round(net * scale / 0.8), m)
      insA.run(`DEMO-A-${uuid()}`, `OB-${uuid()}`, cn, pid, Math.round(cost * scale), m)
      n++
    })
  })
})
backfillAbcPartnerIds(db)
console.log(`✅ DEMO 院级 P&L 种子完成：${HOSP.length} 家医院 / ${n} case（服务月 ${MONTH}，和睦家含 3 月趋势）`)
