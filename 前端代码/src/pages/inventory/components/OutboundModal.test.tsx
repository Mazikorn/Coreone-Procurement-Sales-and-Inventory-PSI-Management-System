import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OutboundModal } from './OutboundModal'

const material = {
  rowId: 101,
  materialId: 'MAT-001',
  batchId: 'BATCH-001',
  name: '苏木素',
  spec: '10ml',
  batch: 'B-001',
  stock: 6,
  quantity: 1,
  unit: '瓶',
  project: '',
  user: '',
  usage: 'self' as const,
  receiver: '',
}

describe('OutboundModal', () => {
  it('summarizes quick outbound deductions and downstream chains before confirming', () => {
    render(
      <OutboundModal
        open
        materials={[{
          ...material,
          project: 'PROJECT-001',
          user: '王坤强',
          quantity: 2,
        }]}
        remark=""
        projectList={[{ id: 'PROJECT-001', code: 'PRJ001', name: 'HE制片' } as any]}
        userList={[{ id: 'USER-001', real_name: '王坤强' }]}
        onClose={vi.fn()}
        onAddMaterial={vi.fn()}
        onRemoveItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        onUpdateProject={vi.fn()}
        onUpdateUser={vi.fn()}
        onUpdateUsage={vi.fn()}
        onUpdateReceiver={vi.fn()}
        onChangeRemark={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('出库结果确认')).toBeInTheDocument()
    expect(screen.getByText('关联项目 HE制片')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：库存、批次、项目成本、项目消耗对账、审计记录')).toBeInTheDocument()
    expect(screen.getByText('苏木素 / B-001 -2瓶 -> 王坤强')).toBeInTheDocument()
  })

  it('shows when selected materials need to be split by project', () => {
    render(
      <OutboundModal
        open
        materials={[
          { ...material, rowId: 101, project: 'PROJECT-001', user: '王坤强' },
          { ...material, rowId: 102, materialId: 'MAT-002', name: '伊红', batch: 'B-002', project: 'PROJECT-002', user: '王坤强' },
        ]}
        remark=""
        projectList={[
          { id: 'PROJECT-001', code: 'PRJ001', name: 'HE制片' } as any,
          { id: 'PROJECT-002', code: 'PRJ002', name: 'IHC' } as any,
        ]}
        userList={[{ id: 'USER-001', real_name: '王坤强' }]}
        onClose={vi.fn()}
        onAddMaterial={vi.fn()}
        onRemoveItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        onUpdateProject={vi.fn()}
        onUpdateUser={vi.fn()}
        onUpdateUsage={vi.fn()}
        onUpdateReceiver={vi.fn()}
        onChangeRemark={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('关联项目 待拆分为单项目出库')).toBeInTheDocument()
  })

  it('stores project id from the project selector so quick outbound can reach cost and reconciliation chains', async () => {
    const onUpdateProject = vi.fn()

    render(
      <OutboundModal
        open
        materials={[material]}
        remark=""
        projectList={[{ id: 'PROJECT-001', code: 'PRJ001', name: 'HE制片' } as any]}
        userList={[{ id: 'USER-001', real_name: '王坤强' }]}
        onClose={vi.fn()}
        onAddMaterial={vi.fn()}
        onRemoveItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        onUpdateProject={onUpdateProject}
        onUpdateUser={vi.fn()}
        onUpdateUsage={vi.fn()}
        onUpdateReceiver={vi.fn()}
        onChangeRemark={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('关联项目 *')).toBeInTheDocument()
    expect(screen.queryByText('公共成本')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('outbound-project-101').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-PROJECT-001'))

    expect(onUpdateProject).toHaveBeenCalledWith(101, 'PROJECT-001')
  })

  it('blocks quick outbound when a selected row has no deductible batch stock and explains the next step', () => {
    const onConfirm = vi.fn()

    render(
      <OutboundModal
        open
        materials={[{
          ...material,
          batchId: undefined,
          batch: undefined,
          stock: 0,
          project: 'PROJECT-001',
          user: '王坤强',
        }]}
        remark=""
        projectList={[{ id: 'PROJECT-001', code: 'PRJ001', name: 'HE制片' } as any]}
        userList={[{ id: 'USER-001', real_name: '王坤强' }]}
        onClose={vi.fn()}
        onAddMaterial={vi.fn()}
        onRemoveItem={vi.fn()}
        onUpdateQuantity={vi.fn()}
        onUpdateProject={vi.fn()}
        onUpdateUser={vi.fn()}
        onUpdateUsage={vi.fn()}
        onUpdateReceiver={vi.fn()}
        onChangeRemark={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByText('苏木素没有可扣减批次，不能直接出库')).toBeInTheDocument()
    expect(screen.getByText('快捷出库缺少可扣减批次')).toBeInTheDocument()
    expect(screen.getByText('下一步：先补入库或调拨可用批次，再回到库存列表出库。')).toBeInTheDocument()
    expect(screen.getByText('系统会保留已选物料、项目和领用信息，避免重新登记。')).toBeInTheDocument()

    const confirmButton = screen.getByTestId('outbound-confirm-btn')
    expect(confirmButton).toBeDisabled()
    fireEvent.click(confirmButton)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
