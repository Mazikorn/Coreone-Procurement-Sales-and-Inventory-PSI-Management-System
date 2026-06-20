import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import AuditTrail from './AuditTrail'

vi.mock('@/api/abc', () => ({
  abcApi: {
    getAuditLogs: vi.fn(),
  },
}))

describe('AuditTrail page', () => {
  beforeEach(() => {
    vi.mocked(abcApi.getAuditLogs).mockReset()
  })

  it('renders current audit log response shape and shows detail payload', async () => {
    vi.mocked(abcApi.getAuditLogs).mockResolvedValueOnce({
      list: [
        {
          id: 'audit-1',
          module: 'cost_adjustment',
          targetType: 'cost_adjustment',
          action: 'approve',
          targetId: 'adjustment-1',
          detail: JSON.stringify({
            adjustmentNo: 'ADJ-209902-001',
            yearMonth: '2099-02',
            amount: 128.5,
            remark: '财务复核通过',
          }),
          operator: 'sunli',
          createdAt: '2026-06-20T00:00:00Z',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      total: 1,
    })

    render(<AuditTrail />)

    expect(await screen.findByText('审核通过')).toBeInTheDocument()
    const adjustmentLabels = screen.getAllByText('关账后调整单')
    expect(adjustmentLabels.some((el) => el.closest('td'))).toBe(true)
    expect(screen.getByText('sunli')).toBeInTheDocument()
    expect(screen.queryByText('暂无审计日志')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('查看详情'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('adjustment-1')).toBeInTheDocument()
    expect(within(dialog).getByText(/ADJ-209902-001/)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/财务复核通过/).length).toBeGreaterThan(0)

    await waitFor(() => expect(abcApi.getAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 20 }))
  })
})
