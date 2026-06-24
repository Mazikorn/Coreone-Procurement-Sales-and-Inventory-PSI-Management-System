import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectImportModal } from './ProjectImportModal'

const xlsxMocks = vi.hoisted(() => ({
  read: vi.fn(() => ({ Sheets: { Sheet1: {} }, SheetNames: ['Sheet1'] })),
  sheetToJson: vi.fn(),
  aoaToSheet: vi.fn(),
  bookNew: vi.fn(),
  bookAppendSheet: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('xlsx', () => ({
  read: xlsxMocks.read,
  utils: {
    sheet_to_json: xlsxMocks.sheetToJson,
    aoa_to_sheet: xlsxMocks.aoaToSheet,
    book_new: xlsxMocks.bookNew,
    book_append_sheet: xlsxMocks.bookAppendSheet,
  },
  writeFile: xlsxMocks.writeFile,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

describe('ProjectImportModal', () => {
  it('summarizes import result and downstream chains before importing parsed services', async () => {
    vi.stubGlobal('React', React)
    xlsxMocks.sheetToJson.mockReturnValue([
      {
        服务编码: 'HE-001',
        服务名称: 'HE制片',
        服务类型: 'he',
        状态: '启用',
        'BOM ID': 'bom-he-1',
      },
      {
        服务编码: 'BAD-001',
        服务名称: '错误服务',
        服务类型: 'unknown',
        状态: '启用',
      },
    ])

    render(
      <ProjectImportModal
        open
        importing={false}
        boms={[{
          id: 'bom-he-1',
          code: 'BOM-HE-001',
          name: 'HE制片BOM',
          type: 'he',
          status: 'active',
          materialCount: 2,
        } as any]}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />,
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['service import'], 'services.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByText('导入结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：检测服务、BOM、出库、LIS对账、项目成本、审计记录')).toBeInTheDocument()
    expect(screen.getByText('可导入 1 条')).toBeInTheDocument()
    expect(screen.getByText('关联BOM 1 条')).toBeInTheDocument()
    expect(screen.getByText('需修正 1 条')).toBeInTheDocument()
    expect(screen.getByText('第 3 行服务类型无效：unknown')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '开始导入 (1)' })).not.toBeDisabled())
  })
})
