import { describe, expect, it } from 'vitest'
import { parseProjectImportRows } from './ProjectImportModal'

describe('parseProjectImportRows', () => {
  it('归一化中文服务类型并跳过非法类型', () => {
    const result = parseProjectImportRows([
      { 服务编码: 'PRJ-HE-001', 服务名称: 'HE 制片', 服务类型: '病理技术-HE制片', 状态: '启用' },
      { 服务编码: 'PRJ-BAD-001', 服务名称: '未知服务', 服务类型: 'unknown-type', 状态: '启用' },
      { 服务编码: 'PRJ-MP-001', 服务名称: '分子诊断', 服务类型: '分子诊断', 状态: '停用' },
    ])

    expect(result.rows).toHaveLength(2)
    expect(result.rows.map(row => row.type)).toEqual(['he', 'mp'])
    expect(result.rows[1].status).toBe('inactive')
    expect(result.errors).toContain('第 3 行服务类型无效：unknown-type')
  })

  it('导入前校验BOM是否存在启用、类型匹配且有核心物料', () => {
    const boms = [
      { id: 'bom-he-ok', type: 'he', status: 'active', materialCount: 1 },
      { id: 'bom-inactive', type: 'he', status: 'inactive', materialCount: 1 },
      { id: 'bom-ihc', type: 'ihc', status: 'active', materialCount: 1 },
      { id: 'bom-empty', type: 'he', status: 'active', materialCount: 0 },
    ] as any

    const result = parseProjectImportRows([
      { 服务编码: 'PRJ-OK', 服务名称: 'HE 有效服务', 服务类型: 'he', 'BOM ID': 'bom-he-ok' },
      { 服务编码: 'PRJ-MISSING', 服务名称: '不存在BOM服务', 服务类型: 'he', 'BOM ID': 'missing-bom' },
      { 服务编码: 'PRJ-INACTIVE', 服务名称: '停用BOM服务', 服务类型: 'he', 'BOM ID': 'bom-inactive' },
      { 服务编码: 'PRJ-MISMATCH', 服务名称: '类型不符服务', 服务类型: 'he', 'BOM ID': 'bom-ihc' },
      { 服务编码: 'PRJ-EMPTY', 服务名称: '空BOM服务', 服务类型: 'he', 'BOM ID': 'bom-empty' },
    ], boms)

    expect(result.rows.map(row => row.code)).toEqual(['PRJ-OK'])
    expect(result.errors).toEqual([
      '第 3 行BOM ID不存在或未启用：missing-bom',
      '第 4 行BOM ID不存在或未启用：bom-inactive',
      '第 5 行BOM类型与服务类型不一致：bom-ihc',
      '第 6 行BOM缺少核心物料：bom-empty',
    ])
  })
})
