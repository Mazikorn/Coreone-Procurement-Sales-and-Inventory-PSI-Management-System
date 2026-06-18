import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InventoryConsistencyModal } from './InventoryConsistencyModal'
import type { InventoryConsistencyCheck } from '@/types'

describe('InventoryConsistencyModal', () => {
  it('shows critical consistency issues with entity and impact details', () => {
    const result: InventoryConsistencyCheck = {
      summary: { issueCount: 2, criticalCount: 2, warningCount: 0 },
      issues: [
        {
          code: 'ACTIVE_BOM_INVALID_MATERIAL',
          severity: 'critical',
          entityType: 'bom',
          entityId: 'bom-1',
          entityCode: 'BOM-001',
          entityName: '免疫组化BOM',
          message: '启用BOM存在 1 个停用或已删除物料依赖',
          impacts: { invalidMaterialCount: 1 },
        },
        {
          code: 'INVENTORY_BATCH_MISMATCH',
          severity: 'critical',
          entityType: 'material',
          entityId: 'mat-1',
          entityCode: 'MAT-001',
          entityName: 'DAB',
          message: '库存总账与启用批次剩余量汇总不一致',
          impacts: { inventoryStock: 10, activeBatchRemaining: 4 },
        },
      ],
    }

    render(
      <InventoryConsistencyModal
        open
        loading={false}
        result={result}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    expect(screen.getByText('发现 2 个数据问题')).toBeInTheDocument()
    expect(screen.getByText('启用BOM依赖不可用物料')).toBeInTheDocument()
    expect(screen.getByText('库存总账与批次不一致')).toBeInTheDocument()
    expect(screen.getByText('BOM-001 · 免疫组化BOM')).toBeInTheDocument()
    expect(screen.getByText('inventoryStock: 10，activeBatchRemaining: 4')).toBeInTheDocument()
    expect(screen.getAllByText('严重')).toHaveLength(2)
  })

  it('shows a clean result when no issues are found', () => {
    render(
      <InventoryConsistencyModal
        open
        loading={false}
        result={{ summary: { issueCount: 0, criticalCount: 0, warningCount: 0 }, issues: [] }}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    expect(screen.getByText('未发现数据问题')).toBeInTheDocument()
    expect(screen.getByText('当前库存与主数据一致性检查通过。')).toBeInTheDocument()
  })
})
