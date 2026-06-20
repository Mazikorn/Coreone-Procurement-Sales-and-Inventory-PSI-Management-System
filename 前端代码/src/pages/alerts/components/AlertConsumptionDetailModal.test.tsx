import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AlertItem } from '../hooks/useAlertsPage'
import { AlertConsumptionDetailModal } from './AlertConsumptionDetailModal'

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

describe('AlertConsumptionDetailModal', () => {
  it('renders actual alert facts instead of hard-coded demo metrics', () => {
    render(
      <AlertConsumptionDetailModal
        open
        alert={stagnantAlert}
        onClose={vi.fn()}
        onHandle={vi.fn()}
        formatDate={(value) => value}
      />
    )

    expect(screen.getByText('DAB显色液')).toBeInTheDocument()
    expect(screen.getByText('免疫组化项目')).toBeInTheDocument()
    expect(screen.getByText('RULE-003')).toBeInTheDocument()
    expect(screen.getByText('90天内消耗低于阈值，请复核是否呆滞')).toBeInTheDocument()
    expect(screen.queryByText('85瓶')).not.toBeInTheDocument()
    expect(screen.queryByText('+2.08σ')).not.toBeInTheDocument()
    expect(screen.queryByText('2024 Q3')).not.toBeInTheDocument()
  })

  it('does not invent a source rule when backend did not provide one', () => {
    render(
      <AlertConsumptionDetailModal
        open
        alert={{ ...stagnantAlert, ruleId: undefined }}
        onClose={vi.fn()}
        onHandle={vi.fn()}
        formatDate={(value) => value}
      />
    )

    expect(screen.queryByText('RULE-003')).not.toBeInTheDocument()
  })
})
