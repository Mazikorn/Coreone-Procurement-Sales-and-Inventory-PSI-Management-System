import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AlertItem } from '../hooks/useAlertsPage'
import { AlertConsumptionHandleModal } from './AlertConsumptionHandleModal'

const stagnantAlert: AlertItem = {
  id: 'alert-stagnant-1',
  type: 'stagnant',
  level: 'warning',
  materialId: 'mat-1',
  materialName: 'DAB显色液',
  currentStock: 12,
  threshold: 90,
  message: '90天内消耗低于阈值，请复核是否呆滞',
  status: 'pending',
  createdAt: '2026-06-16T10:00:00Z',
  ruleId: 'RULE-003',
  projectName: '免疫组化项目',
}

describe('AlertConsumptionHandleModal', () => {
  it('does not show hard-coded analysis data while handling a stagnant alert', () => {
    render(
      <AlertConsumptionHandleModal
        open
        alert={stagnantAlert}
        form={{ opinion: '', result: 'normal' }}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('DAB显色液')).toBeInTheDocument()
    expect(screen.getByText('90天内消耗低于阈值，请复核是否呆滞')).toBeInTheDocument()
    expect(screen.getByText('处理前确认')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('BOM、项目消耗、成本差异、预警规则、审计记录'))).toBeInTheDocument()
    expect(screen.getByLabelText('建议调整预警阈值')).toBeInTheDocument()
    expect(screen.getAllByText('RULE-003').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('85瓶')).not.toBeInTheDocument()
    expect(screen.queryByText('+2.08σ')).not.toBeInTheDocument()
    expect(screen.queryByText('样本量增长')).not.toBeInTheDocument()
  })

  it('does not invent a source rule while handling a stagnant alert', () => {
    render(
      <AlertConsumptionHandleModal
        open
        alert={{ ...stagnantAlert, ruleId: undefined }}
        form={{ opinion: '', result: 'normal' }}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.queryByText('RULE-003')).not.toBeInTheDocument()
  })

  it('explains why users cannot confirm a consumption alert without a handling opinion', () => {
    render(
      <AlertConsumptionHandleModal
        open
        alert={stagnantAlert}
        form={{ opinion: '', result: 'normal' }}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('请填写处理意见，系统才能说明消耗异常判断依据并形成审计记录。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认处理' })).toBeDisabled()
  })
})
