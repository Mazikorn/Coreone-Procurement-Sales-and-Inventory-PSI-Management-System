import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { InventoryTable } from './InventoryTable'
import type { InventoryItem } from '@/types'

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
    ...overrides,
  }

  return {
    ...render(
      <MemoryRouter>
        <InventoryTable {...props} />
      </MemoryRouter>
    ),
    props,
  }
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
})
