import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { InventoryTable } from './InventoryTable'
import { InventoryDetailModal } from './InventoryDetailModal'
import type { InventoryItem } from '@/types'
import type { InventoryBatchTrace } from '@/types'

type InventoryRow = InventoryItem & {
  batch?: string
  expiry?: string
}

function renderTable(data: InventoryRow[], overrides: Partial<Parameters<typeof InventoryTable>[0]> = {}) {
  const props: Parameters<typeof InventoryTable>[0] = {
    data,
    loading: false,
    total: data.length,
    page: 1,
    pageSize: 20,
    keyword: '',
    category: '',
    location: '',
    categoryOptions: [],
    locationOptions: [],
    quickFilter: 'all',
    sortField: null,
    sortDirection: 'asc',
    selectedIds: new Set(),
    expandedGroups: new Set(data.map(item => item.materialId)),
    stats: { total: data.length, normal: data.length, low: 0, warning: 0, expired: 0, outOfStock: 0 },
    quickFilterCounts: {
      all: data.length,
      'low-stock': 0,
      'expiring-soon': 0,
      'expiring-month': 0,
      expired: 0,
      'out-of-stock': 0,
    },
    onKeywordChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onLocationChange: vi.fn(),
    onQuickFilter: vi.fn(),
    onSort: vi.fn(),
    onSearch: vi.fn(),
    onReset: vi.fn(),
    onToggleSelectAll: vi.fn(),
    onToggleSelectOne: vi.fn(),
    onClearSelection: vi.fn(),
    onToggleGroup: vi.fn(),
    onDetail: vi.fn(),
    onOutbound: vi.fn(),
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    onBatchOutbound: vi.fn(),
    onBatchScrap: vi.fn(),
    canManageInventoryActions: true,
    canCreatePurchaseOrders: false,
    ...overrides,
  }

  return {
    ...render(
      <MemoryRouter>
        <LocationProbe />
        <InventoryTable {...props} />
      </MemoryRouter>
    ),
    props,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function makeRow(materialId: string, code: string, stock: number): InventoryRow {
  return {
    id: `INV-${materialId}-batch`,
    materialId,
    batchId: `batch-${materialId}`,
    batchNo: `B-${code}`,
    code,
    name: '同名试剂',
    spec: `${stock}ml`,
    unit: '瓶',
    stock,
    totalStock: stock,
    minStock: 1,
    maxStock: 100,
    availableStock: stock,
    locationId: 'loc-1',
    locationName: 'A1',
    supplierName: '供应商',
    status: 'normal',
    batch: `B-${code}`,
    expiry: '2030-12-31',
  }
}

describe('InventoryTable', () => {
  it('P1-17: 既低库存又临期的批次显示「即将过期」而非「库存不足」（优先级 warning > low-stock）', () => {
    const near = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    // stock 1 ≤ minStock 5（低库存）且 10 天内到期（即将过期）
    const row = { ...makeRow('mat-p117', 'INV-P117', 1), minStock: 5, expiry: near }
    renderTable([row])
    // 唯一一行低库存+临期：修复后状态徽标应为「即将过期」（桌面/移动双视图各一→≥2）；
    // 修复前会因优先级倒置渲染为「库存不足」徽标，此处即将过期徽标计数将不足。
    expect(screen.getAllByText('即将过期').length).toBeGreaterThanOrEqual(2)
  })

  it('按物料身份分组，避免同名不同编码物料被合并出库', () => {
    const data = [
      makeRow('mat-a', 'INV-SAME-A', 5),
      makeRow('mat-b', 'INV-SAME-B', 7),
    ]
    const onOutbound = vi.fn()

    renderTable(data, { onOutbound })

    expect(screen.getAllByText('同名试剂')).toHaveLength(4)
    expect(screen.getAllByText('1 批次')).toHaveLength(2)
    expect(screen.getAllByText(/INV-SAME-A/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/INV-SAME-B/).length).toBeGreaterThan(0)

    const rows = screen.getAllByRole('row')
    const secondGroup = rows.find(row => within(row).queryByText(/INV-SAME-B/))
    expect(secondGroup).toBeDefined()

    fireEvent.click(within(secondGroup!).getByText('出库'))

    expect(onOutbound).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'mat-b',
      code: 'INV-SAME-B',
    }))
  })

  it('hides outbound and batch execution actions for readonly manager inventory users', () => {
    const data = [makeRow('mat-manager', 'INV-MGR', 5)]

    renderTable(data, { canManageInventoryActions: false })

    expect(screen.getAllByText('同名试剂').length).toBeGreaterThan(0)
    expect(screen.queryByText('出库')).not.toBeInTheDocument()
    expect(screen.queryByText('批量出库')).not.toBeInTheDocument()
    expect(screen.queryByText('批量报废')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('opens a prefilled purchase order from a low-stock inventory group', () => {
    const lowStockRow = {
      ...makeRow('mat-low', 'INV-LOW', 1),
      name: '低库存试剂',
      minStock: 5,
      stock: 1,
      totalStock: 1,
      availableStock: 1,
    }

    renderTable([lowStockRow], {
      canCreatePurchaseOrders: true,
      stats: { total: 1, normal: 0, low: 1, warning: 0, expired: 0, outOfStock: 0 },
      quickFilterCounts: {
        all: 1,
        'low-stock': 1,
        'expiring-soon': 0,
        'expiring-month': 0,
        expired: 0,
        'out-of-stock': 0,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: '补采购' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/purchase-orders?action=create&materialId=mat-low&orderedQty=4&remark=${encodeURIComponent('来自库存不足：低库存试剂，当前库存 1，最低库存 5')}`
    )
  })

  it('opens a batch-scoped stocktaking draft from an inventory row without reselecting material and batch', () => {
    const row = makeRow('mat-count', 'INV-COUNT', 7)

    renderTable([row])

    fireEvent.click(screen.getByRole('button', { name: '盘点' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/stocktaking?action=create&materialId=mat-count&scopeType=batch&batchId=batch-mat-count&locationId=loc-1&systemStock=7`
    )
  })

  it('opens a supplier return draft from an inventory batch without reselecting material and batch', () => {
    const row = makeRow('mat-return', 'INV-RETURN', 3)

    renderTable([row])

    fireEvent.click(screen.getByRole('button', { name: '退供' }))

    const locationText = screen.getByTestId('location').textContent || ''
    const params = new URLSearchParams(locationText.split('?')[1])
    expect(locationText).toContain('/supplier-returns?')
    expect(params.get('action')).toBe('create')
    expect(params.get('materialId')).toBe('mat-return')
    expect(params.get('batchId')).toBe('batch-mat-return')
    expect(params.get('quantity')).toBe('1')
    expect(params.get('reason')).toBe('quality_issue')
    expect(params.get('remark')).toBe('来自库存列表退供：同名试剂 / B-INV-RETURN')
  })

  it('opens a transfer draft from an inventory batch without reselecting material, batch, and source location', () => {
    const row = makeRow('mat-transfer', 'INV-TRANSFER', 4)

    renderTable([row])

    fireEvent.click(screen.getByRole('button', { name: '调拨' }))

    const locationText = screen.getByTestId('location').textContent || ''
    const params = new URLSearchParams(locationText.split('?')[1])
    expect(locationText).toContain('/transfers?')
    expect(params.get('action')).toBe('create')
    expect(params.get('materialId')).toBe('mat-transfer')
    expect(params.get('batchNo')).toBe('B-INV-TRANSFER')
    expect(params.get('fromLocationId')).toBe('loc-1')
    expect(params.get('quantity')).toBe('1')
    expect(params.get('remark')).toBe('来自库存列表调拨：同名试剂 / B-INV-TRANSFER / A1')
  })

  it('opens a scrap draft from an inventory batch without reselecting material and batch', () => {
    const row = makeRow('mat-scrap', 'INV-SCRAP', 2)

    renderTable([row])

    fireEvent.click(screen.getByRole('button', { name: '报废' }))

    const locationText = screen.getByTestId('location').textContent || ''
    const params = new URLSearchParams(locationText.split('?')[1])
    expect(locationText).toContain('/scraps?')
    expect(params.get('action')).toBe('create')
    expect(params.get('materialId')).toBe('mat-scrap')
    expect(params.get('batchId')).toBe('batch-mat-scrap')
    expect(params.get('quantity')).toBe('1')
    expect(params.get('reason')).toBe('damaged')
    expect(params.get('remark')).toBe('来自库存列表报废：同名试剂 / B-INV-SCRAP')
  })
})

describe('InventoryDetailModal', () => {
  it('shows batch formation facts, location balances, and movement reasons', () => {
    const item = makeRow('mat-trace', 'INV-TRACE', 7)
    const batchTrace: InventoryBatchTrace = {
      batch: {
        id: 'batch-mat-trace',
        materialId: 'mat-trace',
        batchNo: 'B-INV-TRACE',
        quantity: 10,
        remaining: 7,
        inboundId: 'inbound-trace',
        inboundNo: 'IN-TRACE-001',
        inboundPrice: 12,
        supplierName: '追溯供应商',
        locationName: 'A1',
        productionDate: '2026-01-01',
        expiryDate: '2028-01-31',
        operator: '王仓管',
        createdAt: '2026-06-20 09:00:00',
      },
      locationBalances: [
        { locationId: 'loc-a', locationName: 'A1', remaining: 4 },
        { locationId: 'loc-b', locationName: 'B1', remaining: 3 },
      ],
      movements: [
        { id: 'mv-in', type: 'inbound', label: '采购入库', quantityDelta: 10, documentNo: 'IN-TRACE-001', locationName: 'A1', operator: '王仓管', createdAt: '2026-06-20 09:00:00' },
        { id: 'mv-transfer', type: 'transfer', label: '调拨转出', quantityDelta: -3, locationName: 'A1', createdAt: '2026-06-20 09:30:00' },
      ],
    }

    render(
      <InventoryDetailModal
        open
        item={item}
        batchTrace={batchTrace}
        batchTraceLoading={false}
        onClose={vi.fn()}
        onOutbound={vi.fn()}
      />
    )

    expect(screen.getByText('批次形成与流转')).toBeInTheDocument()
    expect(screen.getAllByText('IN-TRACE-001').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('追溯供应商')).toBeInTheDocument()
    expect(screen.getByText((content, node) => node?.textContent === 'A1: 4瓶')).toBeInTheDocument()
    expect(screen.getByText((content, node) => node?.textContent === 'B1: 3瓶')).toBeInTheDocument()
    expect(screen.getByText('采购入库')).toBeInTheDocument()
    expect(screen.getByText('+10瓶')).toBeInTheDocument()
    expect(screen.getByText('调拨转出')).toBeInTheDocument()
    expect(screen.getByText('-3瓶')).toBeInTheDocument()
  })
})
