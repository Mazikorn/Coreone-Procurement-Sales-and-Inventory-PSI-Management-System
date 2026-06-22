import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LogDetailModal } from './LogDetailModal'

describe('LogDetailModal', () => {
  it('renders a business document link when audit row provides a businessUrl', () => {
    render(
      <LogDetailModal
        open
        log={{
          id: 'log-detail-linked-business',
          userId: 'u-1',
          username: '李仓管',
          operation: 'inbound',
          operationType: 'update',
          module: 'inbound',
          description: '批次库位增加',
          requestData: { relatedId: 'IN-LINK-DETAIL-001' },
          sourceType: 'batch_location',
          sourceLabel: '批次库位流水',
          businessId: 'IN-LINK-DETAIL-001',
          businessUrl: '/inbound?keyword=IN-LINK-DETAIL-001',
          auditEvent: {
            eventCode: 'batch_location.inbound.update',
            action: 'update',
            subjectType: 'inbound',
            subjectId: 'IN-LINK-DETAIL-001',
            businessId: 'IN-LINK-DETAIL-001',
            businessUrl: '/inbound?keyword=IN-LINK-DETAIL-001',
            actor: '李仓管',
            evidenceSource: 'batch_location_adjustments',
            summary: '批次库位增加',
          },
          ip: '',
          userAgent: '',
          createdAt: '2026-06-20 10:00:00',
        }}
        getLogType={() => ({ value: 'update', label: '修改', className: 'bg-blue-100 text-blue-700' })}
        getModuleLabel={() => '入库管理'}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: '操作详情' })).toBeInTheDocument()
    const businessLink = screen.getByRole('link', { name: 'IN-LINK-DETAIL-001' })
    expect(businessLink).toHaveAttribute('href', '/inbound?keyword=IN-LINK-DETAIL-001')
    expect(screen.getByText('标准审计事件')).toBeInTheDocument()
    expect(screen.getByText('batch_location.inbound.update')).toBeInTheDocument()
    expect(screen.getByText('batch_location_adjustments')).toBeInTheDocument()
  })
})
