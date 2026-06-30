/**
 * 单月院级 P&L 月份轴对齐 —— 跨月 case 的收入/成本必须落在同一个月（服务月）。
 *
 * 缺陷背景：单月聚合 buildPartnerPnl / loadCasePnlsWithCost 收入按 case_revenue.service_month 过滤，
 *   但成本按 outbound_abc_details.cost_month 过滤；两列语义不同（服务/对账月 vs 耗材成本核算月）。
 *   跨月 case（服务月 ≠ 成本月）在单月视图里 收入有成本无 / 成本有收入无 → 单月毛利错期。
 *
 * 正确口径：单月视图里成本也按【服务月】对齐——经 (partner_id, case_no) 关联 case_revenue.service_month，
 *   即「服务于该月的 case，其全部成本都归到该月」，与该 case 的收入同月。全量未过滤视图不受影响（仍正确）。
 *   趋势视图 buildPartnerTrend 仍【有意】按 cost_month 归集（设计，非本测试范围）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './p0-harness.js'
import { buildPartnerPnl, loadCasePnlsWithCost } from '../src/utils/partner-pnl-service.js'
import { getPartnerCostRollup } from '../src/utils/abc-partner-link.js'

let db: any
const P = 'MX-AXIS'

beforeAll(async () => {
  db = await getDb()
  db.prepare(`INSERT OR IGNORE INTO partners (id,code,name,service_scope,status) VALUES (?, 'MX-AX01','月份轴医院','technical_only',1)`).run(P)

  // 对称跨月构造（用 statement 权威收入，labRevenue 确定不走估算）：
  //  CM-MAY：服务月 2026-05，成本月却落 2026-06（serviced May，cost booked June）→ 收入 1000 / 成本 300
  //  CM-JUN：服务月 2026-06，成本月却落 2026-05（serviced June，cost booked May）→ 收入 800  / 成本 200
  const insRev = (id: string, caseNo: string, month: string, lab: number) =>
    db.prepare(`INSERT INTO case_revenue (id,case_no,partner_id,partner_name,net_amount,lab_revenue,out_revenue,revenue_source,discount_rate,service_month,line_count)
                VALUES (?,?,?, '月份轴医院', ?, ?, 0, 'statement', 1, ?, 1)`).run(id, caseNo, P, lab, lab, month)
  const insCost = (id: string, caseNo: string, costMonth: string, cost: number) =>
    db.prepare(`INSERT INTO outbound_abc_details (id,outbound_id,case_no,partner_id,total_cost,cost_status,cost_month)
                VALUES (?,?,?,?,?, 'costed', ?)`).run(id, `o-${id}`, caseNo, P, cost, costMonth)

  insRev('RMAY', 'CM-MAY', '2026-05', 1000)
  insCost('XMAY', 'CM-MAY', '2026-06', 300) // 成本月 6 月，但 case 服务月是 5 月
  insRev('RJUN', 'CM-JUN', '2026-06', 800)
  insCost('XJUN', 'CM-JUN', '2026-05', 200) // 成本月 5 月，但 case 服务月是 6 月
})

const pnl = (month?: string) =>
  buildPartnerPnl(db, month ? { partnerId: P, serviceMonth: month } : { partnerId: P }).find((p) => p.partnerId === P)!

describe('院级单月聚合：成本按服务月对齐（跨月 case 不错期）', () => {
  it('2026-05 视图：成本=300（CM-MAY 自己的成本，虽成本月在 6 月），毛利=700', () => {
    const may = pnl('2026-05')
    expect(may.labRevenueTotal).toBe(1000)
    expect(may.costTotal).toBe(300) // bug：旧逻辑按 cost_month=05 会取到 CM-JUN 的 200、漏掉 CM-MAY 的 300
    expect(may.grossMargin).toBe(700)
    expect(may.costMonthAxis).toBe('service_month') // 口径标注：单月成本已对齐到服务月
  })

  it('2026-06 视图：成本=200（CM-JUN 自己的成本，虽成本月在 5 月），毛利=600', () => {
    const jun = pnl('2026-06')
    expect(jun.labRevenueTotal).toBe(800)
    expect(jun.costTotal).toBe(200) // bug：旧逻辑按 cost_month=06 会取到 CM-MAY 的 300
    expect(jun.grossMargin).toBe(600)
  })

  it('可加性不变量：单月毛利之和 = 全量毛利（每个 case 都有服务月时无错期、无漏算）', () => {
    const all = pnl()
    expect(all.labRevenueTotal).toBe(1800)
    expect(all.costTotal).toBe(500)
    expect(all.grossMargin).toBe(1300)
    expect(all.costMonthAxis).toBe('all') // 全量视图不做单月对齐
    expect(pnl('2026-05').grossMargin + pnl('2026-06').grossMargin).toBe(all.grossMargin)
  })
})

describe('case 级单月下钻（loadCasePnlsWithCost）成本同样按服务月对齐', () => {
  it('2026-05 下钻：CM-MAY 拿到自己的成本 300，毛利 700', () => {
    const c = loadCasePnlsWithCost(db, { partnerId: P, serviceMonth: '2026-05' }).find((c) => c.caseNo === 'CM-MAY')!
    expect(c.costTotal).toBe(300)
    expect(c.grossMargin).toBe(700)
  })
  it('2026-06 下钻：CM-JUN 拿到自己的成本 200，毛利 600', () => {
    const c = loadCasePnlsWithCost(db, { partnerId: P, serviceMonth: '2026-06' }).find((c) => c.caseNo === 'CM-JUN')!
    expect(c.costTotal).toBe(200)
    expect(c.grossMargin).toBe(600)
  })
})

describe('getPartnerCostRollup 双轴：serviceMonth(对齐) vs costMonth(原始成本月) 各取所需', () => {
  it('serviceMonth=2026-05 经 case_revenue 关联 → 取 CM-MAY 成本 300', () => {
    expect(getPartnerCostRollup(db, { serviceMonth: '2026-05' }).get(P)?.costTotal).toBe(300)
  })
  it('costMonth=2026-05 仍按原始 cost_month 列 → 取 CM-JUN 成本 200（趋势/诊断口径，保留）', () => {
    expect(getPartnerCostRollup(db, { costMonth: '2026-05' }).get(P)?.costTotal).toBe(200)
  })
})
