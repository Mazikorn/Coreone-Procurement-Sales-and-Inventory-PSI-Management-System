import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { InboundRecord } from '@/types'
import InboundDetailModal from './InboundDetailModal'
import InboundTable from './InboundTable'

const inboundRecord: InboundRecord = {
  id: 'inb-1',
  inboundNo: 'IN-AUDIT-001',
  type: 'purchase',
  materialId: 'mat-1',
  materialName: '入库审计物料',
  batchNo: 'BATCH-IN-001',
  quantity: 10,
  unit: '瓶',
  price: 12,
  amount: 120,
  supplierId: 'sup-1',
  supplierName: '供应商A',
  locationId: 'loc-1',
  locationName: '常温库',
  productionDate: '2026-06-01',
  expiryDate: '2027-06-01',
  status: 'completed',
  operator: 'warehouse',
  purchaseOrderId: 'po-1',
  purchaseOrderNo: 'PO-AUDIT-001',
  createdAt: '2026-06-20T10:00:00Z',
  updatedAt: '2026-06-20T10:00:00Z',
} as InboundRecord

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

describe('Inbound evidence links', () => {
  it('opens audit evidence from an inbound row', () => {
    render(
      <MemoryRouter initialEntries={['/inbound']}>
        <LocationProbe />
        <InboundTable
          data={[inboundRecord]}
          loading={false}
          selectedIds={new Set()}
          onToggleSelectAll={vi.fn()}
          onToggleSelectOne={vi.fn()}
          isAllSelected={false}
          isIndeterminate={false}
          onClearSelection={vi.fn()}
          onDetail={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onRestore={vi.fn()}
          onPrint={vi.fn()}
          onBatchExport={vi.fn()}
          onBatchPrint={vi.fn()}
          page={1}
          pageSize={20}
          total={1}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
        />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/logs?keyword=IN-AUDIT-001')
  })

  it('opens audit evidence from the inbound detail modal', () => {
    render(
      <MemoryRouter initialEntries={['/inbound']}>
        <LocationProbe />
        <InboundDetailModal
          open
          record={inboundRecord}
          materials={[{ id: 'mat-1', code: 'MAT-001', name: '入库审计物料', spec: '1ml' } as any]}
          onClose={vi.fn()}
          onPrint={vi.fn()}
        />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/logs?keyword=IN-AUDIT-001')
  })

  it('opens a prefilled supplier return draft from the inbound detail modal', () => {
    render(
      <MemoryRouter initialEntries={['/inbound']}>
        <LocationProbe />
        <InboundDetailModal
          open
          record={inboundRecord}
          materials={[{ id: 'mat-1', code: 'MAT-001', name: '入库审计物料', spec: '1ml' } as any]}
          onClose={vi.fn()}
          onPrint={vi.fn()}
        />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /退供 入库审计物料 BATCH-IN-001/ }))

    const locationText = screen.getByTestId('location').textContent || ''
    const target = new URL(locationText, 'http://localhost')
    expect(target.pathname).toBe('/supplier-returns')
    expect(target.searchParams.get('action')).toBe('create')
    expect(target.searchParams.get('materialId')).toBe('mat-1')
    expect(target.searchParams.get('inboundRecordId')).toBe('inb-1')
    expect(target.searchParams.get('supplierId')).toBe('sup-1')
    expect(target.searchParams.get('purchaseOrderId')).toBe('po-1')
    expect(target.searchParams.get('quantity')).toBe('1')
    expect(target.searchParams.get('reason')).toBe('quality_issue')
    expect(target.searchParams.get('remark')).toBe('来自入库详情退供：IN-AUDIT-001 / 入库审计物料 / BATCH-IN-001')
  })

  it('shows the downstream data chain in inbound detail so users can verify without offline checks', () => {
    render(
      <MemoryRouter initialEntries={['/inbound']}>
        <InboundDetailModal
          open
          record={inboundRecord}
          materials={[{ id: 'mat-1', code: 'MAT-001', name: '入库审计物料', spec: '1ml' } as any]}
          onClose={vi.fn()}
          onPrint={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('入库数据链回看')).toBeInTheDocument()
    expect(screen.getByText('库存批次')).toBeInTheDocument()
    expect(screen.getByText('BATCH-IN-001 / 常温库')).toBeInTheDocument()
    expect(screen.getByText('入库成本')).toBeInTheDocument()
    expect(screen.getAllByText('¥120.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('审计检索')).toBeInTheDocument()
    expect(screen.getAllByText('IN-AUDIT-001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('确认库存、批次、成本和审计记录已形成，后续出库、盘点、成本重算可继续引用。')).toBeInTheDocument()
  })
})
