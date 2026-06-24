import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderConsumptionDetail(alert: AlertItem = stagnantAlert) {
  render(
    <MemoryRouter initialEntries={['/alerts']}>
      <LocationProbe />
      <AlertConsumptionDetailModal
        open
        alert={alert}
        onClose={vi.fn()}
        onHandle={vi.fn()}
        formatDate={(value) => value}
      />
    </MemoryRouter>
  )
}

describe('AlertConsumptionDetailModal', () => {
  it('renders actual alert facts instead of hard-coded demo metrics', () => {
    renderConsumptionDetail()

    expect(screen.getByText('DAB显色液')).toBeInTheDocument()
    expect(screen.getByText('免疫组化项目')).toBeInTheDocument()
    expect(screen.getByText('RULE-003')).toBeInTheDocument()
    expect(screen.getByText('90天内消耗低于阈值，请复核是否呆滞')).toBeInTheDocument()
    expect(screen.queryByText('85瓶')).not.toBeInTheDocument()
    expect(screen.queryByText('+2.08σ')).not.toBeInTheDocument()
    expect(screen.queryByText('2024 Q3')).not.toBeInTheDocument()
  })

  it('does not invent a source rule when backend did not provide one', () => {
    renderConsumptionDetail({ ...stagnantAlert, ruleId: undefined })

    expect(screen.queryByText('RULE-003')).not.toBeInTheDocument()
  })

  it('opens audit evidence for a processed consumption alert handling record', () => {
    renderConsumptionDetail({
      ...stagnantAlert,
      status: 'processed',
      handledBy: 'warehouse',
      handledAt: '2026-06-23T10:00:00Z',
      remark: '处理结论：标记为正常波动',
    })

    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/logs?keyword=alert-stagnant-1')
  })
})
