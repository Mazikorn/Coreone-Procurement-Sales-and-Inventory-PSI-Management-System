import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LogDetailModal } from './LogDetailModal'

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('LogDetailModal', () => {
  it('renders a business document link when audit row provides a businessUrl', () => {
    renderWithRouter(
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

  it('shows business evidence review paths from the detail dialog', () => {
    renderWithRouter(
      <LogDetailModal
        open
        log={{
          id: 'log-detail-review-path',
          userId: 'u-1',
          username: '王财务',
          operation: 'resolve',
          operationType: 'update',
          module: 'cost',
          description: '解决成本异常',
          requestData: { exceptionNo: 'CE-REVIEW-001' },
          sourceType: 'abc',
          sourceLabel: '成本审计',
          businessId: 'CE-REVIEW-001',
          businessUrl: '/abc/alerts?keyword=CE-REVIEW-001',
          auditEvent: {
            eventCode: 'abc.exception.resolve',
            action: 'update',
            subjectType: 'cost_exception',
            subjectId: 'CE-REVIEW-001',
            businessId: 'CE-REVIEW-001',
            businessUrl: '/abc/alerts?keyword=CE-REVIEW-001',
            actor: '王财务',
            evidenceSource: 'abc_cost_exceptions',
            summary: '解决成本异常',
          },
          ip: '',
          userAgent: '',
          createdAt: '2026-06-20 11:00:00',
        }}
        getLogType={() => ({ value: 'update', label: '修改', className: 'bg-blue-100 text-blue-700' })}
        getModuleLabel={() => '成本管理'}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('业务证据回看')).toBeInTheDocument()
    expect(screen.getByText('先回业务单据核对原始事实，再按同一业务标识查看完整审计时间线。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '回到业务单据' })).toHaveAttribute('href', '/abc/alerts?keyword=CE-REVIEW-001')
    expect(screen.getByRole('link', { name: '查看同一单据审计时间线' })).toHaveAttribute('href', '/logs?keyword=CE-REVIEW-001')
  })
})
