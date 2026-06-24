import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import OutboundCancelModal from './OutboundCancelModal'
import type { OutboundRecord } from '@/types'

const record: OutboundRecord = {
  id: 'out-cancel-1',
  outboundNo: 'OB-CANCEL-001',
  type: 'project',
  projectId: 'project-1',
  projectName: 'HE制片',
  items: [
    {
      id: 'item-cancel-1',
      outboundId: 'out-cancel-1',
      materialId: 'material-1',
      materialName: '苏木素',
      batchId: 'batch-1',
      batchNo: 'BATCH-001',
      quantity: 2,
      unit: '瓶',
      unitCost: 10,
      totalCost: 20,
    },
  ],
  totalCost: 20,
  operator: 'warehouse',
  status: 'pending',
  createdAt: '2026-06-22T10:00:00.000Z',
}

describe('OutboundCancelModal', () => {
  it('explains the actual cancellation side effects before users confirm', () => {
    render(
      <OutboundCancelModal
        open
        record={record}
        cancelReason="request"
        cancelRemark=""
        onReasonChange={vi.fn()}
        onRemarkChange={vi.fn()}
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('取消结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：库存恢复、批次余量、成本回退、项目消耗对账口径、审计记录')).toBeInTheDocument()
    expect(screen.getByText('出库单 OB-CANCEL-001')).toBeInTheDocument()
    expect(screen.getByText('当前列表将移除该出库单，可在审计记录中按单号回看取消原因。')).toBeInTheDocument()
  })
})
