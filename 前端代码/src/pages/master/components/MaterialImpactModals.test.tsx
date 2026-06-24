import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaterialDeleteModal } from './MaterialDeleteModal'
import { MaterialStatusModal } from './MaterialStatusModal'
import { MaterialBatchImpactModal } from './MaterialBatchImpactModal'
import type { Material, MaterialDeleteCheck, MaterialStatusCheck } from '@/types'

const material: Material = {
  id: 'mat-1',
  code: 'MAT-001',
  name: '测试物料',
  spec: '1ml',
  unit: '瓶',
  price: 10,
  stock: 3,
  minStock: 1,
  maxStock: 100,
  safetyStock: 2,
  categoryId: 'cat-1',
  status: 'active',
  createdAt: '2026-06-18',
  updatedAt: '2026-06-18',
}

describe('Material impact modals', () => {
  it('shows delete impacts and disables confirm when material is referenced', () => {
    const deleteCheck: MaterialDeleteCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      deletable: false,
      impacts: {
        currentInventoryCount: 1,
        inventoryLocationCount: 1,
        batchCount: 0,
        inboundCount: 0,
        outboundCount: 0,
        bomCount: 1,
        returnCount: 0,
        scrapCount: 0,
        supplierReturnCount: 0,
        stockLogCount: 1,
        usageTrackingCount: 0,
      },
      reasons: ['存在 1 条当前库存引用', '存在 1 条BOM明细引用'],
    }

    render(
      <MaterialDeleteModal
        open
        target={material}
        deleteCheck={deleteCheck}
        checkingDelete={false}
        deleting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法删除物料')).toBeInTheDocument()
    expect(screen.getByText('BOM明细')).toBeInTheDocument()
    expect(screen.getByText('库存流水')).toBeInTheDocument()
    expect(screen.getByText('存在 1 条当前库存引用；存在 1 条BOM明细引用，请先解除引用后再删除。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeDisabled()
  })

  it('explains downstream business impact before deleting an unreferenced material', () => {
    const deleteCheck: MaterialDeleteCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      deletable: true,
      impacts: {
        currentInventoryCount: 0,
        inventoryLocationCount: 0,
        batchCount: 0,
        inboundCount: 0,
        outboundCount: 0,
        bomCount: 0,
        returnCount: 0,
        scrapCount: 0,
        supplierReturnCount: 0,
        stockLogCount: 0,
        usageTrackingCount: 0,
      },
      reasons: [],
    }

    render(
      <MaterialDeleteModal
        open
        target={material}
        deleteCheck={deleteCheck}
        checkingDelete={false}
        deleting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('确定要删除该物料吗？')).toBeInTheDocument()
    expect(screen.getByText('未发现业务引用，可以删除；删除后该物料不会再用于新采购、入库、库存批次、BOM选料、成本计算、预警和审计筛选。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeEnabled()
  })

  it('shows status impacts and disables confirm when material has stock or active BOM', () => {
    const statusCheck: MaterialStatusCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      targetStatus: 'inactive',
      canChange: false,
      impacts: {
        currentInventoryCount: 1,
        inventoryLocationCount: 1,
        activeBomCount: 1,
      },
      reasons: ['存在 1 条库位库存引用', '存在 1 条启用BOM明细引用'],
    }

    render(
      <MaterialStatusModal
        open
        target={material}
        targetStatus="inactive"
        statusCheck={statusCheck}
        checkingStatus={false}
        updatingStatus={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法停用物料')).toBeInTheDocument()
    expect(screen.getByText('库位库存')).toBeInTheDocument()
    expect(screen.getByText('启用BOM明细')).toBeInTheDocument()
    expect(screen.getByText('存在 1 条库位库存引用；存在 1 条启用BOM明细引用，请先解除引用后再停用。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认停用' })).toBeDisabled()
  })

  it('shows activation blockers with enable-specific copy', () => {
    const statusCheck: MaterialStatusCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      targetStatus: 'active',
      canChange: false,
      impacts: {
        currentInventoryCount: 0,
        inventoryLocationCount: 0,
        activeBomCount: 0,
      },
      reasons: ['停用物料分类不能用于物料'],
    }

    render(
      <MaterialStatusModal
        open
        target={{ ...material, status: 'inactive' }}
        targetStatus="active"
        statusCheck={statusCheck}
        checkingStatus={false}
        updatingStatus={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法启用物料')).toBeInTheDocument()
    expect(screen.getByText('停用物料分类不能用于物料，请先修正绑定后再启用。')).toBeInTheDocument()
    expect(screen.queryByText('无法停用物料')).not.toBeInTheDocument()
    expect(screen.queryByText(/再停用/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认启用' })).toBeDisabled()
  })

  it('explains downstream impact before disabling an unreferenced material', () => {
    const statusCheck: MaterialStatusCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      targetStatus: 'inactive',
      canChange: true,
      impacts: {
        currentInventoryCount: 0,
        inventoryLocationCount: 0,
        activeBomCount: 0,
      },
      reasons: [],
    }

    render(
      <MaterialStatusModal
        open
        target={material}
        targetStatus="inactive"
        statusCheck={statusCheck}
        checkingStatus={false}
        updatingStatus={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('未发现阻断影响，可以停用；停用后该物料不会再用于新采购、入库、BOM选料、库存预警和成本计算，历史库存和审计记录保留。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认停用' })).toBeEnabled()
  })

  it('explains downstream impact before enabling a valid material', () => {
    const statusCheck: MaterialStatusCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      targetStatus: 'active',
      canChange: true,
      impacts: {
        currentInventoryCount: 0,
        inventoryLocationCount: 0,
        activeBomCount: 0,
      },
      reasons: [],
    }

    render(
      <MaterialStatusModal
        open
        target={{ ...material, status: 'inactive' }}
        targetStatus="active"
        statusCheck={statusCheck}
        checkingStatus={false}
        updatingStatus={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('未发现阻断影响，可以启用；启用后该物料可重新用于新采购、入库、BOM选料、库存预警和成本计算，历史库存和审计记录不变。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认启用' })).toBeEnabled()
  })

  it('shows batch delete blockers and disables confirm when any selected material is referenced', () => {
    const deleteCheck: MaterialDeleteCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      deletable: false,
      impacts: {
        currentInventoryCount: 1,
        inventoryLocationCount: 0,
        batchCount: 0,
        inboundCount: 0,
        outboundCount: 0,
        bomCount: 1,
        returnCount: 0,
        scrapCount: 0,
        supplierReturnCount: 0,
        stockLogCount: 0,
        usageTrackingCount: 0,
      },
      reasons: ['存在 1 条当前库存引用', '存在 1 条BOM明细引用'],
    }

    render(
      <MaterialBatchImpactModal
        open
        action="delete"
        targetsCount={1}
        deleteResults={[{ material, check: deleteCheck }]}
        statusResults={[]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法批量删除物料')).toBeInTheDocument()
    expect(screen.getByText('已选择 1 个物料，1 个存在阻断影响')).toBeInTheDocument()
    expect(screen.getByText('当前库存 1，BOM明细 1')).toBeInTheDocument()
    expect(screen.getByText('存在阻断项，批量操作不会执行。请先处理对应库存、BOM 或业务记录引用。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认删除/ })).toBeDisabled()
  })

  it('explains downstream business impact before batch deleting unreferenced materials', () => {
    const deleteCheck: MaterialDeleteCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      deletable: true,
      impacts: {
        currentInventoryCount: 0,
        inventoryLocationCount: 0,
        batchCount: 0,
        inboundCount: 0,
        outboundCount: 0,
        bomCount: 0,
        returnCount: 0,
        scrapCount: 0,
        supplierReturnCount: 0,
        stockLogCount: 0,
        usageTrackingCount: 0,
      },
      reasons: [],
    }

    render(
      <MaterialBatchImpactModal
        open
        action="delete"
        targetsCount={1}
        deleteResults={[{ material, check: deleteCheck }]}
        statusResults={[]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('批量删除物料')).toBeInTheDocument()
    expect(screen.getByText('检查通过；删除后这些物料不会再用于新采购、入库、库存批次、BOM选料、成本计算、预警和审计筛选。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认删除/ })).toBeEnabled()
  })

  it('shows batch status blockers and disables confirm when any selected material cannot be disabled', () => {
    const statusCheck: MaterialStatusCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      targetStatus: 'inactive',
      canChange: false,
      impacts: {
        currentInventoryCount: 1,
        inventoryLocationCount: 1,
        activeBomCount: 1,
      },
      reasons: ['存在 1 条当前库存引用'],
    }

    render(
      <MaterialBatchImpactModal
        open
        action="inactive"
        targetsCount={1}
        deleteResults={[]}
        statusResults={[{ material, check: statusCheck }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法批量停用物料')).toBeInTheDocument()
    expect(screen.getByText('当前库存 1，库位库存 1，启用BOM明细 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认停用/ })).toBeDisabled()
  })

  it('explains downstream impact before batch disabling unreferenced materials', () => {
    const statusCheck: MaterialStatusCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      targetStatus: 'inactive',
      canChange: true,
      impacts: {
        currentInventoryCount: 0,
        inventoryLocationCount: 0,
        activeBomCount: 0,
      },
      reasons: [],
    }

    render(
      <MaterialBatchImpactModal
        open
        action="inactive"
        targetsCount={1}
        deleteResults={[]}
        statusResults={[{ material, check: statusCheck }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('批量停用物料')).toBeInTheDocument()
    expect(screen.getByText('检查通过；停用后这些物料不会再用于新采购、入库、BOM选料、库存预警和成本计算，历史库存和审计记录保留。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认停用/ })).toBeEnabled()
  })

  it('explains downstream impact before batch enabling valid materials', () => {
    const statusCheck: MaterialStatusCheck = {
      material: { id: 'mat-1', code: 'MAT-001', name: '测试物料' },
      targetStatus: 'active',
      canChange: true,
      impacts: {
        currentInventoryCount: 0,
        inventoryLocationCount: 0,
        activeBomCount: 0,
      },
      reasons: [],
    }

    render(
      <MaterialBatchImpactModal
        open
        action="active"
        targetsCount={1}
        deleteResults={[]}
        statusResults={[{ material: { ...material, status: 'inactive' }, check: statusCheck }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('批量启用物料')).toBeInTheDocument()
    expect(screen.getByText('检查通过；启用后这些物料可重新用于新采购、入库、BOM选料、库存预警和成本计算，历史库存和审计记录不变。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认启用/ })).toBeEnabled()
  })
})
