/**
 * Phase 1 账实核对引擎 —— TDD 红线（先写会失败的断言，守设计基线 §1.4/§1.6）。
 *
 * 锁口径：
 *  · 差异 = 账单片数 vs LIS 物理片数（纯计数，不依赖成本价）。
 *  · 前提：院名对齐 + 病理号匹配率达标；≥95 正常 / 80–95 匹配偏低(仅参考) / <80 先查(不出差异结论)；未匹配单列「算不了」。
 *  · 系统初判（线索非定论）：账单>实际=疑似计费项目用错；实际>账单=疑似漏收需补收；相等=核对无误。
 *  · 6 认定原因 → 下家路由；补收 gate 只对「漏收，需补收」。
 *  · 差异定义按线不同：本轮只做按数量收费的线（免疫组化/特染）；组织学捆绑码另定义（未决 B1，不在本轮）。
 */
import { describe, it, expect } from 'vitest'
import {
  classifyChargeItem,
  computeMatchStatus,
  computeReconcile,
  verdictFollowUp,
  drivesSupplement,
  DEFAULT_MATCH_THRESHOLDS,
  VERDICT_REASONS,
  type BillCase,
  type LisCase,
} from '../src/utils/reconcile-account.js'

describe('账实核对 · 收费项分类（classifyChargeItem）', () => {
  it('免疫组化 → 免疫组化', () => {
    expect(classifyChargeItem('免疫组化染色')).toBe('免疫组化')
    expect(classifyChargeItem('免疫组织化学法(每抗体)')).toBe('免疫组化')
  })
  it('特殊染色 / 具体特染名 → 特染', () => {
    expect(classifyChargeItem('特殊染色')).toBe('特染')
    expect(classifyChargeItem('Masson三色染色')).toBe('特染')
    expect(classifyChargeItem('网状纤维染色')).toBe('特染')
    expect(classifyChargeItem('抗酸染色')).toBe('特染')
  })
  it('组织学/诊断类 → null（本轮不核）', () => {
    expect(classifyChargeItem('组织病理学检查')).toBeNull()
    expect(classifyChargeItem('术中冰冻')).toBeNull()
    expect(classifyChargeItem('病理会诊')).toBeNull()
  })
})

describe('账实核对 · 匹配率门（computeMatchStatus）', () => {
  const T = DEFAULT_MATCH_THRESHOLDS
  it('≥95% 正常', () => {
    expect(computeMatchStatus(1.0, T, true)).toBe('正常')
    expect(computeMatchStatus(0.95, T, true)).toBe('正常')
  })
  it('80–95% 匹配偏低（仅参考）', () => {
    expect(computeMatchStatus(0.9, T, true)).toBe('匹配偏低')
    expect(computeMatchStatus(0.8, T, true)).toBe('匹配偏低')
  })
  it('<80% 先查', () => {
    expect(computeMatchStatus(0.79, T, true)).toBe('先查')
    expect(computeMatchStatus(0.2, T, true)).toBe('先查')
  })
  it('一边为空 → 待对齐/未匹配', () => {
    expect(computeMatchStatus(0, T, false)).toBe('待对齐')
  })
})

describe('账实核对 · 差异计算（computeReconcile）', () => {
  it('全对齐(正常) → 逐 case 出差异；相等不出、账单>实际=计费用错、实际>账单=漏收', () => {
    const bills: BillCase[] = [
      { caseNo: 'S26-001', ihc: 5, ss: 0, ihcUnitPrice: 100 }, // 等
      { caseNo: 'S26-002', ihc: 6, ss: 0, ihcUnitPrice: 100 }, // 账单>实际(4) → 计费用错
      { caseNo: 'S26-003', ihc: 3, ss: 0, ihcUnitPrice: 100 }, // 实际(5)>账单 → 漏收
    ]
    const lis: LisCase[] = [
      { caseNo: 'S26-001', ihc: 5, ss: 0 },
      { caseNo: 'S26-002', ihc: 4, ss: 0 },
      { caseNo: 'S26-003', ihc: 5, ss: 0 },
    ]
    const r = computeReconcile(bills, lis)
    expect(r.matchStatus).toBe('正常')
    expect(r.emitDiffs).toBe(true)
    // 相等的 S26-001 不出差异
    expect(r.diffs.find((d) => d.caseNo === 'S26-001')).toBeUndefined()
    const d2 = r.diffs.find((d) => d.caseNo === 'S26-002')!
    expect(d2.delta).toBe(2) // 6-4
    expect(d2.systemHint).toBe('疑似计费项目用错')
    expect(d2.amountImpact).toBe(200) // |2|*100
    const d3 = r.diffs.find((d) => d.caseNo === 'S26-003')!
    expect(d3.delta).toBe(-2) // 3-5
    expect(d3.systemHint).toBe('疑似漏收，需补收')
    expect(d3.amountImpact).toBe(200)
  })

  it('匹配偏低(80–95%) → 出差异但标 lowConfidence', () => {
    const bills: BillCase[] = []
    const lis: LisCase[] = []
    for (let i = 1; i <= 9; i++) {
      bills.push({ caseNo: `C${i}`, ihc: 2, ss: 0, ihcUnitPrice: 50 })
      lis.push({ caseNo: `C${i}`, ihc: 3, ss: 0 })
    }
    bills.push({ caseNo: 'C10', ihc: 1, ss: 0, ihcUnitPrice: 50 }) // bill-only
    lis.push({ caseNo: 'X', ihc: 1, ss: 0 }) // lis-only
    // matched 9 / union 11 = 0.818 → 匹配偏低
    const r = computeReconcile(bills, lis)
    expect(r.matchStatus).toBe('匹配偏低')
    expect(r.emitDiffs).toBe(true)
    expect(r.diffs.length).toBeGreaterThan(0)
    expect(r.diffs.every((d) => d.lowConfidence)).toBe(true)
  })

  it('<80% 先查 → 不出差异结论（diffs 空），未匹配单列', () => {
    const bills: BillCase[] = [
      { caseNo: 'A', ihc: 1, ss: 0 }, { caseNo: 'B', ihc: 1, ss: 0 },
      { caseNo: 'C', ihc: 1, ss: 0 }, { caseNo: 'D', ihc: 1, ss: 0 },
    ]
    const lis: LisCase[] = [
      { caseNo: 'A', ihc: 2, ss: 0 }, { caseNo: 'X', ihc: 1, ss: 0 },
      { caseNo: 'Y', ihc: 1, ss: 0 }, { caseNo: 'Z', ihc: 1, ss: 0 },
    ]
    // matched 1 / union 7 ≈ 0.14 → 先查
    const r = computeReconcile(bills, lis)
    expect(r.matchStatus).toBe('先查')
    expect(r.emitDiffs).toBe(false)
    expect(r.diffs.length).toBe(0)
    expect(r.unmatched.length).toBeGreaterThan(0)
  })

  it('未匹配病例永远单列「算不了」，不混进差异', () => {
    const bills: BillCase[] = [
      { caseNo: 'M1', ihc: 5, ss: 0, ihcUnitPrice: 100 },
      { caseNo: 'M2', ihc: 5, ss: 0, ihcUnitPrice: 100 },
      { caseNo: 'M3', ihc: 5, ss: 0, ihcUnitPrice: 100 },
      { caseNo: 'BILLONLY', ihc: 9, ss: 0, ihcUnitPrice: 100 },
    ]
    const lis: LisCase[] = [
      { caseNo: 'M1', ihc: 5, ss: 0 }, { caseNo: 'M2', ihc: 5, ss: 0 },
      { caseNo: 'M3', ihc: 5, ss: 0 }, { caseNo: 'LISONLY', ihc: 7, ss: 0 },
    ]
    // matched 3 / union 5 = 0.6 → 先查（此处只验证 unmatched 分流）
    const r = computeReconcile(bills, lis)
    expect(r.unmatched.some((u) => u.caseNo === 'BILLONLY' && u.side === 'bill_only')).toBe(true)
    expect(r.unmatched.some((u) => u.caseNo === 'LISONLY' && u.side === 'lis_only')).toBe(true)
    expect(r.diffs.some((d) => d.caseNo === 'BILLONLY' || d.caseNo === 'LISONLY')).toBe(false)
  })

  it('特染线与免疫组化线各自独立出差异', () => {
    const bills: BillCase[] = [{ caseNo: 'S1', ihc: 4, ss: 2, ihcUnitPrice: 100, ssUnitPrice: 30 }]
    const lis: LisCase[] = [{ caseNo: 'S1', ihc: 5, ss: 1 }]
    const r = computeReconcile(bills, lis)
    const ihcDiff = r.diffs.find((d) => d.lineType === '免疫组化')!
    const ssDiff = r.diffs.find((d) => d.lineType === '特染')!
    expect(ihcDiff.delta).toBe(-1)
    expect(ihcDiff.systemHint).toBe('疑似漏收，需补收')
    expect(ssDiff.delta).toBe(1)
    expect(ssDiff.systemHint).toBe('疑似计费项目用错')
    expect(ssDiff.amountImpact).toBe(30)
  })
})

describe('账实核对 · 6 认定原因 → 下家 + 补收 gate', () => {
  it('唯一术语串 = 6 个认定原因', () => {
    expect(VERDICT_REASONS).toEqual([
      '漏收，需补收', '返工重做（不计费）', '超期，免费做的', '计费项目用错', 'LIS 记录不全', '核对无误',
    ])
  })
  it('只有「漏收，需补收」驱动补收', () => {
    expect(drivesSupplement('漏收，需补收')).toBe(true)
    expect(drivesSupplement('返工重做（不计费）')).toBe(false)
    expect(drivesSupplement('超期，免费做的')).toBe(false)
    expect(drivesSupplement('计费项目用错')).toBe(false)
  })
  it('认定原因 → 正确下家', () => {
    expect(verdictFollowUp('漏收，需补收')).toBe('supplement')     // → 补收追踪
    expect(verdictFollowUp('返工重做（不计费）')).toBe('rework')     // 返工指标
    expect(verdictFollowUp('超期，免费做的')).toBe('free')          // 免费诊断指标
    expect(verdictFollowUp('计费项目用错')).toBe('external_fix')    // 待外部更正
    expect(verdictFollowUp('LIS 记录不全')).toBe('data_fill')       // 待补数据
    expect(verdictFollowUp('核对无误')).toBe('settled')            // 了结
  })
})
