import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AlertItem } from '../hooks/useAlertsPage'
import { AlertHandleModal } from './AlertHandleModal'

const lowStockAlert: AlertItem = {
  id: 'alert-low-1',
  type: 'low-stock',
  level: 'warning',
  materialId: 'mat-1',
  materialName: 'HER2抗体',
  batchNo: 'BATCH-HER2-001',
  currentStock: 2,
  threshold: 8,
  message: 'HER2抗体库存不足，请及时补货',
  status: 'pending',
  createdAt: '2026-06-23T09:00:00Z',
  ruleId: 'LOW-001',
}

describe('AlertHandleModal', () => {
  it('shows the downstream handling chain before users confirm a stock alert', () => {
    render(
      <AlertHandleModal
        open
        alert={lowStockAlert}
        form={{ opinion: '已通知采购补货', result: 'purchase_followed' }}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('处理前确认')).toBeInTheDocument()
    expect(screen.getAllByText('HER2抗体').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('BATCH-HER2-001')).toBeInTheDocument()
    expect(screen.getByText('2 / 8')).toBeInTheDocument()
    expect(screen.getByText('预计补足 6')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('库存、批次、补货、预警记录、审计记录'))).toBeInTheDocument()
  })

  it('explains why users cannot confirm without a handling opinion', () => {
    render(
      <AlertHandleModal
        open
        alert={lowStockAlert}
        form={{ opinion: '', result: 'purchase_followed' }}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('请填写处理意见，系统才能说明预警处理依据并形成审计记录。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认处理' })).toBeDisabled()
  })
})
