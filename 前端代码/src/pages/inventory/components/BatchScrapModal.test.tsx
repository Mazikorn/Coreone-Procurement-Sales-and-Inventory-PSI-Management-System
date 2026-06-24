import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BatchScrapModal } from './BatchScrapModal'

describe('BatchScrapModal', () => {
  const scrapItems = [
    {
      id: 'inv-1',
      materialId: 'mat-1',
      materialName: '苏木素',
      materialCode: 'MAT-001',
      batchNo: 'B-001',
      stock: 3,
      unit: '瓶',
    },
    {
      id: 'inv-2',
      materialId: 'mat-2',
      materialName: '伊红',
      materialCode: 'MAT-002',
      batchNo: 'B-002',
      stock: 2,
      unit: '瓶',
    },
  ]

  it('summarizes batch scrap deductions and downstream chains before confirming', () => {
    render(
      <BatchScrapModal
        open
        items={scrapItems}
        scrapReason="expired"
        scrapRemark=""
        responsiblePerson="王坤强"
        responsibleDepartment="病理科"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onChangeReason={vi.fn()}
        onChangeRemark={vi.fn()}
        onChangeResponsiblePerson={vi.fn()}
        onChangeResponsibleDepartment={vi.fn()}
      />,
    )

    expect(screen.getByText('批量报废结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：库存、批次、成本、库存流水、审计记录')).toBeInTheDocument()
    expect(screen.getByText('责任归属 病理科 / 王坤强')).toBeInTheDocument()
    expect(screen.getByText('苏木素 / B-001 -3瓶')).toBeInTheDocument()
    expect(screen.getByText('伊红 / B-002 -2瓶')).toBeInTheDocument()
  })

  it('blocks confirmation until a scrap reason is selected', () => {
    const onConfirm = vi.fn()

    render(
      <BatchScrapModal
        open
        items={scrapItems}
        scrapReason=""
        scrapRemark=""
        responsiblePerson=""
        responsibleDepartment=""
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onChangeReason={vi.fn()}
        onChangeRemark={vi.fn()}
        onChangeResponsiblePerson={vi.fn()}
        onChangeResponsibleDepartment={vi.fn()}
      />,
    )

    expect(screen.getByText('请选择报废原因，系统才能沉淀损耗原因、成本和审计证据。')).toBeInTheDocument()
    const confirmButton = screen.getByTestId('batch-scrap-confirm-btn')
    expect(confirmButton).toBeDisabled()

    fireEvent.click(confirmButton)

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('blocks confirmation when no scrap item is selected', () => {
    const onConfirm = vi.fn()

    render(
      <BatchScrapModal
        open
        items={[]}
        scrapReason="expired"
        scrapRemark=""
        responsiblePerson=""
        responsibleDepartment=""
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onChangeReason={vi.fn()}
        onChangeRemark={vi.fn()}
        onChangeResponsiblePerson={vi.fn()}
        onChangeResponsibleDepartment={vi.fn()}
      />,
    )

    expect(screen.getByText('请先在库存列表勾选需要报废的批次。')).toBeInTheDocument()
    const confirmButton = screen.getByTestId('batch-scrap-confirm-btn')
    expect(confirmButton).toBeDisabled()

    fireEvent.click(confirmButton)

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
