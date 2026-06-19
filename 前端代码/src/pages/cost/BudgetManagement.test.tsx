import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import BudgetManagement from './BudgetManagement'

vi.mock('@/api/abc', () => ({
  abcApi: {
    getBudgets: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
  },
}))

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}))

describe('BudgetManagement side effects', () => {
  beforeEach(() => {
    vi.mocked(abcApi.getBudgets).mockReset()
    vi.mocked(abcApi.createBudget).mockReset()
    vi.mocked((abcApi as any).updateBudget).mockReset()
    vi.mocked(abcApi.getBudgets).mockResolvedValue({
      list: [
        {
          id: 'budget-1',
          yearMonth: '2026-06',
          category: 'material',
          budgetAmount: 1000,
          actualAmount: 250,
          status: 'active',
        },
      ],
    })
    vi.mocked(abcApi.createBudget).mockResolvedValue({ id: 'created-budget' })
    vi.mocked((abcApi as any).updateBudget).mockResolvedValue({ id: 'budget-1' })
  })

  it('derives execution rate from real API data and updates the selected budget instead of creating a duplicate', async () => {
    render(<BudgetManagement />)

    const rowLabel = await screen.findByText('材料成本')
    const budgetRow = rowLabel.closest('tr')
    expect(budgetRow).not.toBeNull()
    expect(within(budgetRow as HTMLTableRowElement).getByText('25.0%')).toBeInTheDocument()

    fireEvent.click(within(budgetRow as HTMLTableRowElement).getByRole('button', { name: '编辑' }))
    expect(await screen.findByRole('dialog', { name: '编辑预算' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('button', { name: '更新' }))

    await waitFor(() => {
      expect((abcApi as any).updateBudget).toHaveBeenCalledWith('budget-1', {
        yearMonth: '2026-06',
        category: 'material',
        budgetAmount: 1200,
      })
    })
    expect(abcApi.createBudget).not.toHaveBeenCalled()
  })
})
