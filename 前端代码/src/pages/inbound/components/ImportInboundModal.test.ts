import { describe, expect, it } from 'vitest'
import { buildInboundImportTemplateRows, getInboundImportActionState } from './ImportInboundModal'

describe('buildInboundImportTemplateRows', () => {
  it('uses current master data instead of stale demo materials and suppliers', () => {
    const rows = buildInboundImportTemplateRows({
      materials: [
        { id: 'mat-1', code: 'MAT-HE-001', name: '苏木素染液' },
        { id: 'mat-2', code: 'MAT-IHC-001', name: 'Ki-67抗体' },
      ] as any,
      suppliers: [{ id: 'sup-1', code: 'SUP-DAKO', name: 'DAKO供应商' }] as any,
      locations: [{ id: 'loc-1', code: 'A1-01', name: 'A区1号货架' }] as any,
      baseDate: new Date('2026-06-17T00:00:00Z'),
    })

    expect(rows[1]).toEqual(['MAT-HE-001', '苏木素染液', 'B20260617-001', 10, 0, 'DAKO供应商', '2026-06-17', '2027-06-17', 'A区1号货架', ''])
    expect(rows[2]).toEqual(['MAT-IHC-001', 'Ki-67抗体', 'B20260617-002', 10, 0, 'DAKO供应商', '2026-06-17', '2027-06-17', 'A区1号货架', ''])
    expect(JSON.stringify(rows)).not.toContain('DNA提取试剂盒')
    expect(JSON.stringify(rows)).not.toContain('供应商A')
    expect(JSON.stringify(rows)).not.toContain('2025-05-01')
  })

  it('does not use suspicious security-test master data in template examples', () => {
    const rows = buildInboundImportTemplateRows({
      materials: [{ id: 'mat-1', code: 'MAT-HE-001', name: '苏木素染液' }] as any,
      suppliers: [
        { id: 'sup-bad', code: 'BAD-SUP', name: "' OR '1'='1" },
        { id: 'sup-good', code: 'SUP-DAKO', name: 'DAKO供应商' },
      ] as any,
      locations: [
        { id: 'loc-bad', code: 'BAD-LOC', name: "' OR '1'='1" },
        { id: 'loc-good', code: 'A1-01', name: 'A区1号货架' },
      ] as any,
      baseDate: new Date('2026-06-17T00:00:00Z'),
    })

    expect(rows[1][5]).toBe('DAKO供应商')
    expect(rows[1][8]).toBe('A区1号货架')
    expect(JSON.stringify(rows)).not.toContain("' OR '1'='1")
  })
})

describe('getInboundImportActionState', () => {
  it('blocks partial import when any parsed row has errors', () => {
    expect(getInboundImportActionState({
      importing: false,
      totalRows: 2,
      validRows: 1,
      invalidRows: 1,
    })).toEqual({ disabled: true, label: '修正错误后导入' })
  })

  it('allows import only when all parsed rows are valid', () => {
    expect(getInboundImportActionState({
      importing: false,
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
    })).toEqual({ disabled: false, label: '开始导入' })
  })
})
