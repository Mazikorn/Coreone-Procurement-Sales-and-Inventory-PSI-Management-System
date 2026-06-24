import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { inboundApi } from '@/api/inventory'
import ImportInboundModal, { buildInboundImportTemplateRows, getInboundImportActionState } from './ImportInboundModal'
import { toast } from 'sonner'

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
  SSF: {
    parse_date_code: vi.fn(),
  },
  utils: {
    sheet_to_json: xlsxMocks.sheetToJson,
    aoa_to_sheet: xlsxMocks.aoaToSheet,
    book_new: xlsxMocks.bookNew,
    book_append_sheet: xlsxMocks.bookAppendSheet,
  },
  writeFile: xlsxMocks.writeFile,
}))

vi.mock('@/api/inventory', () => ({
  inboundApi: {
    batchCreate: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('buildInboundImportTemplateRows', () => {
  it('uses current master data instead of stale demo materials and suppliers', () => {
    const rows = buildInboundImportTemplateRows({
      materials: [
        { id: 'mat-1', code: 'MAT-HE-001', name: '苏木素染液' },
        { id: 'mat-2', code: 'MAT-IHC-001', name: 'Ki-67抗体' },
      ] as any,
      suppliers: [{ id: 'sup-1', code: 'SUP-DAKO', name: 'DAKO供应商' }] as any,
      locations: [{ id: 'loc-1', code: 'A1-01', name: 'A区1号货架' }] as any,
      baseDate: new Date('2026-06-17T00:00:00Z'),
    })

    expect(rows[1]).toEqual(['MAT-HE-001', '苏木素染液', 'B20260617-001', 10, 0, 'DAKO供应商', '2026-06-17', '2027-06-17', 'A区1号货架', ''])
    expect(rows[2]).toEqual(['MAT-IHC-001', 'Ki-67抗体', 'B20260617-002', 10, 0, 'DAKO供应商', '2026-06-17', '2027-06-17', 'A区1号货架', ''])
    expect(JSON.stringify(rows)).not.toContain('DNA提取试剂盒')
    expect(JSON.stringify(rows)).not.toContain('供应商A')
    expect(JSON.stringify(rows)).not.toContain('2025-05-01')
  })

  it('does not use suspicious security-test master data in template examples', () => {
    const rows = buildInboundImportTemplateRows({
      materials: [{ id: 'mat-1', code: 'MAT-HE-001', name: '苏木素染液' }] as any,
      suppliers: [
        { id: 'sup-bad', code: 'BAD-SUP', name: "' OR '1'='1" },
        { id: 'sup-good', code: 'SUP-DAKO', name: 'DAKO供应商' },
      ] as any,
      locations: [
        { id: 'loc-bad', code: 'BAD-LOC', name: "' OR '1'='1" },
        { id: 'loc-good', code: 'A1-01', name: 'A区1号货架' },
      ] as any,
      baseDate: new Date('2026-06-17T00:00:00Z'),
    })

    expect(rows[1][5]).toBe('DAKO供应商')
    expect(rows[1][8]).toBe('A区1号货架')
    expect(JSON.stringify(rows)).not.toContain("' OR '1'='1")
  })
})

describe('getInboundImportActionState', () => {
  it('blocks partial import when any parsed row has errors', () => {
    expect(getInboundImportActionState({
      importing: false,
      totalRows: 2,
      validRows: 1,
      invalidRows: 1,
    })).toEqual({ disabled: true, label: '修正错误后导入' })
  })

  it('allows import only when all parsed rows are valid', () => {
    expect(getInboundImportActionState({
      importing: false,
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
    })).toEqual({ disabled: false, label: '开始导入' })
  })
})

describe('ImportInboundModal', () => {
  it('summarizes import result and downstream chains before importing valid inbound rows', async () => {
    vi.stubGlobal('React', React)
    xlsxMocks.sheetToJson.mockReturnValue([
      ['耗材编码', '耗材名称', '批号', '入库数量', '单价', '供应商', '有效期至', '库位'],
      ['MAT-HE-001', '苏木素染液', 'BATCH-IN-001', 10, 12.5, 'DAKO供应商', '2027-06-17', 'A区1号货架'],
      ['MAT-HE-001', '苏木素染液', '', 5, 12.5, 'DAKO供应商', '2027-06-17', 'A区1号货架'],
    ])
    vi.mocked(inboundApi.batchCreate).mockResolvedValue({ createdCount: 1 } as any)

    render(React.createElement(ImportInboundModal, {
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      materials: [{ id: 'mat-1', code: 'MAT-HE-001', name: '苏木素染液', unit: '瓶' }],
      suppliers: [{ id: 'sup-1', code: 'SUP-DAKO', name: 'DAKO供应商' }],
      locations: [{ id: 'loc-1', code: 'A1-01', name: 'A区1号货架' }],
    } as any))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['inbound import'], 'inbound.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByText('入库导入结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：入库单、库存、批次、库位、成本、库存流水、审计记录')).toBeInTheDocument()
    expect(screen.getByText('可导入 1 条')).toBeInTheDocument()
    expect(screen.getByText('需修正 1 条')).toBeInTheDocument()
    expect(screen.getByText('批次数 1 个')).toBeInTheDocument()
    expect(screen.getByText('入库数量 10')).toBeInTheDocument()
    expect(screen.getByText('入库金额 ¥125.00')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '修正错误后导入' })).toBeDisabled())
  })

  it('shows the backend reason when valid inbound import rows are rejected', async () => {
    vi.stubGlobal('React', React)
    xlsxMocks.sheetToJson.mockReturnValue([
      ['耗材编码', '耗材名称', '批号', '入库数量', '单价', '供应商', '有效期至', '库位'],
      ['MAT-HE-001', '苏木素染液', 'BATCH-DUP-001', 10, 12.5, 'DAKO供应商', '2027-06-17', 'A区1号货架'],
    ])
    vi.mocked(inboundApi.batchCreate).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: '第 2 行批号 BATCH-DUP-001 已存在，请修改后重新导入',
          },
        },
      },
    })

    render(React.createElement(ImportInboundModal, {
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      materials: [{ id: 'mat-1', code: 'MAT-HE-001', name: '苏木素染液', unit: '瓶' }],
      suppliers: [{ id: 'sup-1', code: 'SUP-DAKO', name: 'DAKO供应商' }],
      locations: [{ id: 'loc-1', code: 'A1-01', name: 'A区1号货架' }],
    } as any))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['inbound import'], 'inbound.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByRole('button', { name: '开始导入' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '开始导入' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('第 2 行批号 BATCH-DUP-001 已存在，请修改后重新导入')
    })
    expect(screen.getByRole('button', { name: '开始导入' })).not.toBeDisabled()
  })
})
