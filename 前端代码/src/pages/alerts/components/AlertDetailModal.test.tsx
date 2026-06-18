import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

describe('AlertDetailModal', () => {
  it('renders handling audit information for processed alerts', () => {
    render(
      <AlertDetailModal
        open
        alert={processedAlert}
        onClose={vi.fn()}
        onHandle={vi.fn()}
        formatDate={(value) => value}
      />
    )

    expect(screen.getByText('处理记录')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('2026-06-16T10:30:00Z')).toBeInTheDocument()
    expect(screen.getByText(/处理结论：采购跟进中/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '处理预警' })).not.toBeInTheDocument()
  })
})
