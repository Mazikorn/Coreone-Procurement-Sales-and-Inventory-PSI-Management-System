import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { AlertItem } from '../hooks/useAlertsPage'
import { AlertDetailModal } from './AlertDetailModal'

const processedAlert: AlertItem = {
  id: 'alert-1',
  type: 'low-stock',
  level: 'warning',
  materialId: 'mat-1',
  materialName: '抗体试剂',
  currentStock: 1,
  threshold: 5,
  message: '库存不足',
  status: 'processed',
  createdAt: '2026-06-16T10:00:00Z',
  handledBy: 'admin',
  handledAt: '2026-06-16T10:30:00Z',
  remark: '处理结论：采购跟进中\n处理意见：已通知采购补货',
}

const pendingLowStockAlert: AlertItem = {
  ...processedAlert,
  id: 'alert-pending-low-1',
  currentStock: 1,
  threshold: 5,
  status: 'pending',
  handledBy: undefined,
  handledAt: undefined,
  remark: undefined,
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderDetail(alert: AlertItem = processedAlert, canCreatePurchaseOrders = false) {
  render(
    <MemoryRouter initialEntries={['/alerts']}>
      <LocationProbe />
      <AlertDetailModal
        open
        alert={alert}
        onClose={vi.fn()}
        onHandle={vi.fn()}
        canCreatePurchaseOrders={canCreatePurchaseOrders}
        formatDate={(value) => value}
      />
    </MemoryRouter>
  )
}

describe('AlertDetailModal', () => {
  it('renders handling audit information for processed alerts', () => {
    renderDetail()

    expect(screen.getByText('处理记录')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('2026-06-16T10:30:00Z')).toBeInTheDocument()
    expect(screen.getByText(/处理结论：采购跟进中/)).toBeInTheDocument()
    expect(screen.queryByText('RULE-001')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '处理预警' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '补采购' })).not.toBeInTheDocument()
  })

  it('opens filtered inventory evidence from the detail modal', async () => {
    const batchAlert = { ...processedAlert, batchNo: 'BATCH-EXP-001' }
    renderDetail(batchAlert)

    fireEvent.click(screen.getByRole('button', { name: '库存证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/inventory?keyword=BATCH-EXP-001')
  })

  it('opens audit evidence for a processed alert handling record', async () => {
    renderDetail()

    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/logs?keyword=alert-1')
  })

  it('opens a prefilled purchase order from low-stock detail', async () => {
    renderDetail(processedAlert, true)

    fireEvent.click(screen.getByRole('button', { name: '补采购' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/purchase-orders?action=create&materialId=${processedAlert.materialId}&orderedQty=4&remark=${encodeURIComponent(`来自库存预警：${processedAlert.message}`)}`
    )
  })

  it('shows clear next actions for pending low-stock alerts before users leave the detail page', () => {
    renderDetail(pendingLowStockAlert, true)

    expect(screen.getByText('下一步建议')).toBeInTheDocument()
    expect(screen.getByText('建议补足 4')).toBeInTheDocument()
    expect(screen.getByText('先看库存证据确认批次与库存，再补采购或处理预警。')).toBeInTheDocument()
    expect(screen.getByText('可直接补采购，系统会带入物料、建议数量和预警来源备注。')).toBeInTheDocument()
  })
})
