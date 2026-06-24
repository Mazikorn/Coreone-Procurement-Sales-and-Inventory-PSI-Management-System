import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AlertTable } from './AlertTable'
import type { AlertItem, FilterState } from '../hooks/useAlertsPage'

const pendingAlert: AlertItem = {
  id: 'ALERT-RS013',
  type: 'low-stock',
  level: 'warning',
  materialId: 'MAT-RS013',
  materialName: '管理者关注物料',
  currentStock: 1,
  threshold: 5,
  message: '库存不足',
  status: 'pending',
  createdAt: '2026-06-20T10:00:00Z',
}

const filter: FilterState = {
  keyword: '',
  type: 'all',
  level: 'all',
  status: 'all',
  dateRange: ['', ''],
}

function renderTable(canHandle = false, canCreatePurchaseOrders = false) {
  render(
    <MemoryRouter initialEntries={['/alerts']}>
      <LocationProbe />
      <AlertTable
        data={[pendingAlert]}
        loading={false}
        total={1}
        page={1}
        pageSize={10}
        filter={filter}
        quickFilter="all"
        selectedIds={new Set()}
        canHandle={canHandle}
        canCreatePurchaseOrders={canCreatePurchaseOrders}
        onFilterChange={vi.fn()}
        onQuickFilterChange={vi.fn()}
        onResetFilters={vi.fn()}
        onSelect={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onBatchProcess={vi.fn()}
        onOpenModal={vi.fn()}
        onIgnore={vi.fn()}
        getAlertTypeInfo={() => ({ label: '库存不足', bg: 'bg-red-50', text: 'text-red-600' })}
        getStatusInfo={() => ({ label: '待处理', bg: 'bg-yellow-50', text: 'text-yellow-700' })}
        isConsumption={() => false}
        formatDate={(value) => value}
      />
    </MemoryRouter>
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

describe('AlertTable role actions', () => {
  it('keeps manager-style readonly users from selecting, processing, or ignoring pending alerts', () => {
    renderTable(false)

    expect(screen.getByText('管理者关注物料')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /详情/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^处理$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^忽略$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '补采购' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('keeps handling controls visible for users who own alert resolution', () => {
    renderTable(true)

    expect(screen.getByRole('button', { name: /^处理$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^忽略$/ })).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(2)
  })

  it('links alerts back to filtered inventory evidence from the list', async () => {
    renderTable(false)

    fireEvent.click(screen.getByRole('button', { name: '库存证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/inventory?keyword=${encodeURIComponent(pendingAlert.materialName)}`
    )
  })

  it('links alerts to filtered audit evidence so handled decisions can be reviewed without manual log search', async () => {
    renderTable(false)

    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/logs?keyword=${pendingAlert.id}`
    )
  })

  it('opens a prefilled purchase order from low-stock alerts', async () => {
    renderTable(false, true)

    fireEvent.click(screen.getByRole('button', { name: '补采购' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/purchase-orders?action=create&materialId=${pendingAlert.materialId}&orderedQty=4&remark=${encodeURIComponent(`来自库存预警：${pendingAlert.message}`)}`
    )
  })
})
