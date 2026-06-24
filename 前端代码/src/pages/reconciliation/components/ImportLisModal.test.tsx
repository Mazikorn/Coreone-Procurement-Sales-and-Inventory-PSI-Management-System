import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ImportLisModal } from './ImportLisModal'

vi.mock('@/lib/utils', () => ({
  downloadTextFile: vi.fn(),
}))

function renderImportLisModal(overrides: Partial<React.ComponentProps<typeof ImportLisModal>> = {}) {
  const props: React.ComponentProps<typeof ImportLisModal> = {
    open: true,
    importData: '',
    setImportData: vi.fn(),
    setImportFile: vi.fn(),
    importErrors: [],
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  }

  render(<ImportLisModal {...props} />)
  return props
}

describe('ImportLisModal', () => {
  it('blocks confirmation when the pasted LIS preview still has invalid rows', () => {
    const props = renderImportLisModal({
      importData: ',HE制片,2026-06-16 09:00,张三',
    })

    const confirmButton = screen.getByRole('button', { name: '修正后导入' })

    expect(confirmButton).toBeDisabled()
    fireEvent.click(confirmButton)
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('allows confirmation when LIS rows are complete enough for downstream reconciliation', () => {
    const props = renderImportLisModal({
      importData: 'CASE-OK-001,HE制片,2026-06-16 09:00,张三',
    })

    const confirmButton = screen.getByRole('button', { name: '确认导入' })

    expect(confirmButton).not.toBeDisabled()
    fireEvent.click(confirmButton)
    expect(props.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('summarizes the downstream reconciliation chain before importing valid LIS rows', () => {
    renderImportLisModal({
      importData: [
        'CASE-OK-001,HE制片,2026-06-16 09:00,张三',
        'CASE-OK-002,免疫组化-IHC,2026-06-16 10:00,李四',
      ].join('\n'),
    })

    expect(screen.getByText('导入结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：LIS病例、项目对账、BOM理论消耗、成本差异、审计记录')).toBeInTheDocument()
    expect(screen.getByText('可导入 2 条，需修正 0 条')).toBeInTheDocument()
    expect(screen.getByText('未匹配项目会进入按病理号查看，继续补齐项目和BOM归属')).toBeInTheDocument()
  })
})
