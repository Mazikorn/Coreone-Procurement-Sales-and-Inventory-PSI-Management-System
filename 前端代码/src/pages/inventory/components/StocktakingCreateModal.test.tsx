import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { StocktakingCreateModal } from './StocktakingCreateModal'
import type { Material } from '@/types'
import type { FormData, StocktakingScopeRow } from '../hooks/useStocktakingPage'

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
      inventoryRows={[]}
      isSubmitting={false}
      onClose={vi.fn()}
      onChange={vi.fn()}
      onSetCreateStep={vi.fn()}
      onSubmit={vi.fn()}
      {...overrides}
    />
  )
}

function renderControlledModal(
  initialForm: FormData,
  overrides: Partial<Parameters<typeof StocktakingCreateModal>[0]> = {}
) {
  const onChange = overrides.onChange || vi.fn()

  function Harness() {
    const [form, setForm] = React.useState(initialForm)
    const [createStep, setCreateStep] = React.useState(overrides.createStep || 1)

    return (
      <StocktakingCreateModal
        open
        form={form}
        createStep={createStep}
        materials={materials}
        inventoryRows={[]}
        isSubmitting={false}
        onClose={vi.fn()}
        onChange={nextForm => {
          setForm(nextForm)
          onChange(nextForm)
        }}
        onSetCreateStep={setCreateStep}
        onSubmit={vi.fn()}
        {...overrides}
      />
    )
  }

  return { ...render(<Harness />), onChange }
}

const scopedRows: StocktakingScopeRow[] = [{
  id: 'inv-row-1',
  materialId: 'mat-001',
  batchId: 'batch-001',
  batchNo: 'B-001',
  code: 'MAT-001',
  name: '测试物料',
  spec: '1ml',
  unit: '瓶',
  stock: 6,
  totalStock: 10,
  minStock: 0,
  maxStock: 100,
  availableStock: 6,
  locationId: 'loc-001',
  locationName: 'A1-01',
  status: 'normal',
}]

describe('StocktakingCreateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks next step when actual stock is blank', () => {
    const onSetCreateStep = vi.fn()
    renderModal({
      materialId: 'mat-001',
      scopeType: 'material',
      locationId: '',
      batchId: '',
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
      scopeType: 'material',
      locationId: '',
      batchId: '',
      systemStock: 10,
      actualStock: '',
      remark: '',
    }, { onChange, onSetCreateStep })

    fireEvent.change(screen.getByTestId('actual-stock-input'), { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ actualStock: 0 }))

    renderModal({
      materialId: 'mat-001',
      scopeType: 'material',
      locationId: '',
      batchId: '',
      systemStock: 10,
      actualStock: 0,
      remark: '',
    }, { onSetCreateStep })
    fireEvent.click(screen.getAllByTestId('next-step-btn').at(-1)!)

    expect(onSetCreateStep).toHaveBeenCalledWith(2)
  })

  it('lets warehouse users scope stocktaking to a batch location and previews that fact', async () => {
    const form: FormData = {
      materialId: 'mat-001',
      scopeType: 'material',
      locationId: '',
      batchId: '',
      systemStock: 10,
      actualStock: 5,
      remark: '',
    }

    const { onChange } = renderControlledModal(form, {
      inventoryRows: scopedRows,
    })

    fireEvent.click(screen.getByTestId('batch-scope-btn'))
    fireEvent.click(screen.getByTestId('batch-select').firstElementChild!)
    fireEvent.click(await screen.findByTestId('option-batch-001'))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      scopeType: 'batch',
      locationId: 'loc-001',
      batchId: 'batch-001',
      systemStock: 6,
    }))

    fireEvent.click(screen.getByTestId('next-step-btn'))

    expect(screen.getByText(/批次库位盘点/)).toBeInTheDocument()
    expect(screen.getByText('B-001')).toBeInTheDocument()
    expect(screen.getByText('A1-01')).toBeInTheDocument()
    expect(screen.getAllByText(/-1瓶/).length).toBeGreaterThan(0)
    expect(screen.getByText('盘点结果确认')).toBeInTheDocument()
    expect(screen.getByText('创建后只记录盘点差异，不会立即调整库存。')).toBeInTheDocument()
    expect(screen.getByText(/处理差异后才调整库存、库位\/批次、预警、库存流水和审计记录/)).toBeInTheDocument()
  })

  it('shows the created stocktaking number and opens audit evidence from the success step', () => {
    const onOpenAuditEvidence = vi.fn()
    renderModal({
      materialId: 'mat-001',
      scopeType: 'material',
      locationId: '',
      batchId: '',
      systemStock: 10,
      actualStock: 8,
      remark: '',
    }, {
      createStep: 3,
      createdRecord: { id: 'stk-created', stocktakingNo: 'ST-20260622-001', status: 'completed' },
      onOpenAuditEvidence,
    })

    expect(screen.getByText('ST-20260622-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看审计记录' }))

    expect(onOpenAuditEvidence).toHaveBeenCalledWith('ST-20260622-001')
  })
})
