import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import * as dashboardHooks from './dashboard/hooks/useDashboardPage'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderDashboard(overrides: Record<string, unknown> = {}) {
  vi.spyOn(dashboardHooks, 'useDashboardPage').mockReturnValue({
    loading: false,
    today: { greeting: '早上好', date: '2026年6月22日 星期一' },
    role: 'warehouse_manager',
    config: {
      apiCalls: [],
      statCards: [],
      quickActions: [],
      recentActivitySources: [],
      activityLinks: [],
      showBanner: false,
    },
    inventoryStats: {
      lowStockCount: 5,
      totalMaterials: 10,
    },
    costSummary: null,
    inboundStats: {
      pendingOrders: 0,
    },
    outboundStats: null,
    pendingAlerts: [
      {
        id: 'alert-1',
        type: 'low-stock',
        level: 'danger',
        materialName: '低库存试剂',
        message: '低库存试剂库存不足',
        currentStock: 1,
        threshold: 5,
      },
      {
        id: 'alert-2',
        type: 'expiry',
        level: 'warning',
        materialName: '临期试剂',
        message: '临期试剂即将过期',
        currentStock: 3,
        threshold: 0,
      },
    ],
    alertCount: 2,
    activities: [],
    ...overrides,
  } as any)

  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Dashboard />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('Dashboard todos', () => {
  const TestIcon = () => <span />

  it('opens pending alerts from the todo card instead of the unfiltered alert list', () => {
    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: /2 条预警待处理/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/alerts?quick=pending')
    expect(screen.getByText('进入后可处理、忽略并回看留痕')).toBeInTheDocument()
  })

  it('opens the low-stock inventory filter from the inventory shortage todo', () => {
    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: /5 种物料库存不足/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/inventory?quick=low-stock')
    expect(screen.getByText('进入后可按物料补采购或发起盘点')).toBeInTheDocument()
  })

  it('opens pending purchase orders as a receiving queue from the todo card', () => {
    renderDashboard({
      inboundStats: { pendingOrders: 3 },
      inventoryStats: { lowStockCount: 0, totalMaterials: 10 },
      pendingAlerts: [],
      alertCount: 0,
    })

    fireEvent.click(screen.getByRole('button', { name: /3 个采购单待收货/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/purchase-orders?status=pending,partial')
    expect(screen.getByText('进入后可按采购单收货并生成入库单')).toBeInTheDocument()
  })

  it('opens pending alerts from the alert stat card as a real action button', () => {
    renderDashboard({
      config: {
        apiCalls: [],
        statCards: [
          {
            key: 'alertCount',
            title: '库存预警',
            icon: TestIcon,
            colorClass: 'text-orange-500',
            bgClass: 'bg-orange-50',
            navigateTo: '/alerts?quick=pending',
          },
        ],
        quickActions: [],
        recentActivitySources: [],
        activityLinks: [],
        showBanner: false,
      },
      pendingAlerts: [],
      alertCount: 2,
    })

    fireEvent.click(screen.getByRole('button', { name: /库存预警[\s\S]*2/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/alerts?quick=pending')
  })

  it('opens specific inventory filters from the warehouse low-stock summary', () => {
    renderDashboard({
      config: {
        apiCalls: [],
        statCards: [],
        quickActions: [],
        recentActivitySources: [],
        activityLinks: [],
        showBanner: false,
        exclusiveSection: 'low-stock-summary',
      },
      inventoryStats: {
        totalMaterials: 10,
        lowStockCount: 5,
        expiringCount: 2,
        expiredCount: 1,
        outOfStockCount: 3,
      },
      pendingAlerts: [],
      alertCount: 0,
    })

    fireEvent.click(screen.getByRole('button', { name: /3\s*已缺货/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory?quick=out-of-stock')

    fireEvent.click(screen.getByRole('button', { name: /2\s*即将过期/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory?quick=expiring-month')
  })

  it('opens the pending alert worklist from the warehouse summary view-all action', () => {
    renderDashboard({
      config: {
        apiCalls: [],
        statCards: [],
        quickActions: [],
        recentActivitySources: [],
        activityLinks: [],
        showBanner: false,
        exclusiveSection: 'low-stock-summary',
      },
      inventoryStats: {
        totalMaterials: 10,
        lowStockCount: 5,
        expiringCount: 0,
        expiredCount: 0,
        outOfStockCount: 0,
      },
      pendingAlerts: [],
      alertCount: 0,
    })

    fireEvent.click(screen.getByRole('button', { name: /查看全部/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/alerts?quick=pending')
  })

  it('keeps the warehouse summary visible when only out-of-stock items need action', () => {
    renderDashboard({
      config: {
        apiCalls: [],
        statCards: [],
        quickActions: [],
        recentActivitySources: [],
        activityLinks: [],
        showBanner: false,
        exclusiveSection: 'low-stock-summary',
      },
      inventoryStats: {
        totalMaterials: 10,
        lowStockCount: 0,
        expiringCount: 0,
        expiredCount: 0,
        outOfStockCount: 3,
      },
      pendingAlerts: [],
      alertCount: 0,
    })

    fireEvent.click(screen.getByRole('button', { name: /3\s*已缺货/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/inventory?quick=out-of-stock')
  })
})
