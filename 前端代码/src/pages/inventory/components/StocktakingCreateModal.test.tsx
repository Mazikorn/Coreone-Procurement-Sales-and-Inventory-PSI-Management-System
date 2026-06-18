import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { StocktakingCreateModal } from './StocktakingCreateModal'
import type { Material } from '@/types'
import type { FormData } from '../hooks/useStocktakingPage'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

const materials: Material[] = [{
  id: 'mat-001',
  code: 'MAT-001',
  name: '测试物料',
  spec: '1ml',
  unit: '瓶',
  categoryId: 'cat-001',
  categoryPath: '试剂',
  price: 12,
  stock: 10,
  minStock: 0,
  maxStock: 100,
  safetyStock: 5,
  status: 'active',
  createdAt: '2026-06-16',
  updatedAt: '2026-06-16',
}]

function renderModal(form: FormData, overrides: Partial<Parameters<typeof StocktakingCreateModal>[0]> = {}) {
  return render(
    <StocktakingCreateModal
      open
      form={form}
      createStep={1}
      materials={materials}
      isSubmitting={false}
      onClose={vi.fn()}
      onChange={vi.fn()}
      onSetCreateStep={vi.fn()}
      onSubmit={vi.fn()}
      {...overrides}
    />
  )
}

describe('StocktakingCreateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks next step when actual stock is blank', () => {
    const onSetCreateStep = vi.fn()
    renderModal({
      materialId: 'mat-001',
      systemStock: 10,
      actualStock: '',
      remark: '',
    }, { onSetCreateStep })

    fireEvent.click(screen.getByTestId('next-step-btn'))

    expect(onSetCreateStep).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('请选择物料并填写实盘数量')
  })

  it('allows zero actual stock after the user explicitly enters 0', () => {
    const onChange = vi.fn()
    const onSetCreateStep = vi.fn()
    renderModal({
      materialId: 'mat-001',
      systemStock: 10,
      actualStock: '',
      remark: '',
    }, { onChange, onSetCreateStep })

    fireEvent.change(screen.getByTestId('actual-stock-input'), { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ actualStock: 0 }))

    renderModal({
      materialId: 'mat-001',
      systemStock: 10,
      actualStock: 0,
      remark: '',
    }, { onSetCreateStep })
    fireEvent.click(screen.getAllByTestId('next-step-btn').at(-1)!)

    expect(onSetCreateStep).toHaveBeenCalledWith(2)
  })
})
