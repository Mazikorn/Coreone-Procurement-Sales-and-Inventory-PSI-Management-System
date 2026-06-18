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
})
