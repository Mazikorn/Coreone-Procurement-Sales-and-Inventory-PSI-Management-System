import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bomApi, materialApi, projectApi } from '@/api/master'
import { useBOMPage } from './useBOMPage'
import { toast } from 'sonner'
import { downloadTextFile } from '@/lib/utils'

vi.mock('@/api/master', () => ({
  bomApi: {
    getList: vi.fn(),
    getDetail: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    checkDeletable: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    batchDelete: vi.fn(),
    batchStatus: vi.fn(),
    checkStatus: vi.fn(),
  },
  materialApi: {
    getList: vi.fn(),
  },
  projectApi: {
    getList: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/utils', () => ({
  downloadTextFile: vi.fn(),
}))

const activeBom = {
  id: 'bom-1',
  code: 'BOM-001',
  name: '原BOM',
  version: 'v1.0',
  type: 'ihc',
  serviceId: '',
  description: '',
  materialCount: 1,
  supportableSamples: 10,
  unitCost: 10,
  feeStandardId: '',
  feeCategory: '',
  status: 'active',
  materials: [
    {
      id: 'item-1',
      materialId: 'mat-1',
      name: '试剂',
      spec: '1ml',
      usagePerSample: 1,
      unit: '瓶',
      price: 10,
      stock: 10,
      costRatio: 1,
    },
  ],
  generalReagents: [],
  generalConsumables: [],
  qualityControls: [],
  versionHistory: [],
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
} as const

const serviceBoundBom = {
  ...activeBom,
  id: 'bom-service-1',
  code: 'BOM-SERVICE-001',
  name: '已绑定服务BOM',
  serviceId: 'project-1',
  serviceName: '免疫组化检测服务',
} as const

const inactiveBom = {
  ...activeBom,
  id: 'bom-inactive-1',
  code: 'BOM-INACTIVE-001',
  name: '已停用BOM',
  status: 'inactive',
} as const

const noMaterialBom = {
  ...activeBom,
  id: 'bom-no-material',
  code: 'BOM-NO-MATERIAL',
  name: '无核心物料BOM',
  materialCount: 0,
  materials: [],
} as const

describe('useBOMPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }))
    vi.mocked(bomApi.getList).mockResolvedValue({ list: [activeBom], pagination: { total: 1 } } as any)
    vi.mocked(bomApi.getDetail).mockResolvedValue(activeBom as any)
    vi.mocked(materialApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(projectApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
  })

  it('allows technician users with BOM module access to manage BOMs', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'technician' }))

    const { result } = renderHook(() => useBOMPage())

    expect(result.current.canWrite).toBe(true)
  })

  it('keeps backend-controlled code and supportable samples out of edit updates', async () => {
    vi.mocked(bomApi.update).mockResolvedValue({ id: 'bom-1' } as any)
    const { result } = renderHook(() => useBOMPage())

    await act(async () => {
      await result.current.openEdit(activeBom as any)
    })
    await waitFor(() => expect(result.current.modalType).toBe('edit'))

    act(() => {
      result.current.setForm({
        ...result.current.form,
        code: 'BOM-CHANGED-BY-UI',
        name: '改名后的BOM',
        supportableSamples: 999,
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(bomApi.update).toHaveBeenCalledWith('bom-1', expect.objectContaining({
      code: 'BOM-001',
      name: '改名后的BOM',
    }))
    expect(vi.mocked(bomApi.update).mock.calls[0][1]).not.toHaveProperty('supportableSamples')
  })

  it('checks edit status impacts before saving content changes', async () => {
    vi.mocked(bomApi.checkStatus).mockResolvedValue({
      bom: { id: 'bom-1', code: 'BOM-001', name: '原BOM' },
      targetStatus: 'inactive',
      canChange: false,
      impacts: {
        activeProjectCount: 1,
        inactiveMaterialCount: 0,
        inactiveEquipmentCount: 0,
        inactiveEquipmentTypeCount: 0,
      },
      reasons: ['存在 1 个启用检测项目引用'],
    } as any)

    const { result } = renderHook(() => useBOMPage())

    await act(async () => {
      await result.current.openEdit(activeBom as any)
    })
    await waitFor(() => expect(result.current.modalType).toBe('edit'))

    act(() => {
      result.current.setForm({
        ...result.current.form,
        name: '被阻断时不应保存的名称',
        status: 'inactive',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(bomApi.checkStatus).toHaveBeenCalledWith('bom-1', 'inactive')
    expect(bomApi.updateStatus).not.toHaveBeenCalled()
    expect(bomApi.update).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('存在 1 个启用检测项目引用')
  })

  it('checks delete impacts before opening BOM batch delete confirmation', async () => {
    vi.mocked(bomApi.checkDeletable).mockResolvedValue({
      bom: { id: 'bom-1', code: 'BOM-001', name: '原BOM' },
      deletable: false,
      impacts: { projectCount: 1, outboundDetailCount: 0 },
      reasons: ['存在 1 个检测项目引用'],
    } as any)

    const { result } = renderHook(() => useBOMPage())
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.toggleSelectRow('bom-1')
    })

    await act(async () => {
      await result.current.openBatchImpact('delete')
    })

    expect(bomApi.checkDeletable).toHaveBeenCalledWith('bom-1')
    expect(bomApi.batchDelete).not.toHaveBeenCalled()
    expect(result.current.modalType).toBe('batchImpact')
    expect(result.current.batchDeleteResults[0].check?.deletable).toBe(false)
  })

  it('checks status impacts before opening BOM batch disable confirmation', async () => {
    vi.mocked(bomApi.checkStatus).mockResolvedValue({
      bom: { id: 'bom-1', code: 'BOM-001', name: '原BOM' },
      targetStatus: 'inactive',
      canChange: false,
      impacts: {
        activeProjectCount: 1,
        inactiveMaterialCount: 0,
        inactiveEquipmentCount: 0,
        inactiveEquipmentTypeCount: 0,
      },
      reasons: ['存在 1 个启用检测项目引用'],
    } as any)

    const { result } = renderHook(() => useBOMPage())
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.toggleSelectRow('bom-1')
    })

    await act(async () => {
      await result.current.disableSelected()
    })

    expect(bomApi.checkStatus).toHaveBeenCalledWith('bom-1', 'inactive')
    expect(bomApi.batchStatus).not.toHaveBeenCalled()
    expect(result.current.modalType).toBe('batchImpact')
    expect(result.current.batchStatusResults[0].check?.canChange).toBe(false)
  })

  it('checks single-row status impacts before disabling a referenced BOM', async () => {
    vi.mocked(bomApi.checkStatus).mockResolvedValue({
      bom: { id: 'bom-1', code: 'BOM-001', name: '原BOM' },
      targetStatus: 'inactive',
      canChange: false,
      impacts: {
        activeProjectCount: 1,
        inactiveMaterialCount: 0,
        inactiveEquipmentCount: 0,
        inactiveEquipmentTypeCount: 0,
      },
      reasons: ['存在 1 个启用检测项目引用'],
    } as any)

    const { result } = renderHook(() => useBOMPage())

    await act(async () => {
      await result.current.toggleStatus(activeBom as any)
    })

    expect(bomApi.checkStatus).toHaveBeenCalledWith('bom-1', 'inactive')
    expect(bomApi.batchStatus).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('存在 1 个启用检测项目引用')
  })

  it('blocks submit when core BOM materials are missing', async () => {
    const { result } = renderHook(() => useBOMPage())

    act(() => {
      result.current.openCreate()
      result.current.setForm({
        ...result.current.form,
        code: 'BOM-NO-MAT',
        name: '缺少核心物料BOM',
        materials: [],
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(toast.error).toHaveBeenCalledWith('特异性试剂至少需要配置一项物料')
    expect(bomApi.create).not.toHaveBeenCalled()
  })

  it('blocks submit instead of silently dropping incomplete extension rows', async () => {
    const { result } = renderHook(() => useBOMPage())

    act(() => {
      result.current.openCreate()
      result.current.setForm({
        ...result.current.form,
        code: 'BOM-BAD-EXT',
        name: '无效扩展物料BOM',
        materials: [
          { materialId: 'mat-1', name: '试剂', spec: '1ml', usagePerSample: 1, unit: '瓶' },
        ],
        generalReagents: [
          { materialId: '', name: '', spec: '', usagePerSample: 1, unit: 'ml' },
        ],
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(toast.error).toHaveBeenCalledWith('通用试剂存在未选择物料的明细')
    expect(bomApi.create).not.toHaveBeenCalled()
  })

  it('blocks submit when the same material is duplicated inside one BOM group', async () => {
    const { result } = renderHook(() => useBOMPage())

    act(() => {
      result.current.openCreate()
      result.current.setForm({
        ...result.current.form,
        code: 'BOM-DUP-MAT',
        name: '重复物料BOM',
        materials: [
          { materialId: 'mat-1', name: '试剂', spec: '1ml', usagePerSample: 1, unit: '瓶' },
          { materialId: 'mat-1', name: '试剂', spec: '1ml', usagePerSample: 2, unit: '瓶' },
        ],
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(toast.error).toHaveBeenCalledWith('特异性试剂存在重复物料')
    expect(bomApi.create).not.toHaveBeenCalled()
  })

  it('blocks submit when the same material is duplicated across BOM groups', async () => {
    const { result } = renderHook(() => useBOMPage())

    act(() => {
      result.current.openCreate()
      result.current.setForm({
        ...result.current.form,
        code: 'BOM-CROSS-DUP',
        name: '跨分组重复物料BOM',
        materials: [
          { materialId: 'mat-1', name: '试剂', spec: '1ml', usagePerSample: 1, unit: '瓶' },
        ],
        generalReagents: [
          { materialId: 'mat-1', name: '试剂', spec: '1ml', usagePerSample: 0.5, unit: 'ml' },
        ],
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(toast.error).toHaveBeenCalledWith('特异性试剂与通用试剂存在重复物料')
    expect(bomApi.create).not.toHaveBeenCalled()
  })

  it('does not copy the original service binding when copying a BOM', async () => {
    vi.mocked(bomApi.getDetail).mockResolvedValue(serviceBoundBom as any)
    vi.mocked(bomApi.create).mockResolvedValue({ id: 'bom-copy-1' } as any)

    const { result } = renderHook(() => useBOMPage())

    await act(async () => {
      await result.current.openCopy(serviceBoundBom as any)
    })
    await waitFor(() => expect(result.current.modalType).toBe('copy'))

    await act(async () => {
      await result.current.handleCopyConfirm()
    })

    expect(bomApi.create).toHaveBeenCalledWith(expect.objectContaining({
      name: '已绑定服务BOM 副本',
      serviceId: undefined,
      materials: [
        expect.objectContaining({ materialId: 'mat-1', usagePerSample: 1 }),
      ],
    }))
  })

  it('keeps copied BOM inactive when the original BOM is inactive', async () => {
    vi.mocked(bomApi.getDetail).mockResolvedValue(inactiveBom as any)
    vi.mocked(bomApi.create).mockResolvedValue({ id: 'bom-copy-inactive-1' } as any)

    const { result } = renderHook(() => useBOMPage())

    await act(async () => {
      await result.current.openCopy(inactiveBom as any)
    })
    await waitFor(() => expect(result.current.modalType).toBe('copy'))

    await act(async () => {
      await result.current.handleCopyConfirm()
    })

    expect(bomApi.create).toHaveBeenCalledWith(expect.objectContaining({
      name: '已停用BOM 副本',
      serviceId: undefined,
      materials: [
        expect.objectContaining({ materialId: 'mat-1', usagePerSample: 1 }),
      ],
    }))
    expect(bomApi.updateStatus).toHaveBeenCalledWith('bom-copy-inactive-1', 'inactive')
  })

  it('blocks copying a BOM without material list because BOM drafts are not supported', async () => {
    const { result } = renderHook(() => useBOMPage())

    await act(async () => {
      await result.current.openCopy(activeBom as any)
    })
    await waitFor(() => expect(result.current.modalType).toBe('copy'))

    act(() => {
      result.current.setCopyForm({
        ...result.current.copyForm,
        copyMaterials: false,
      })
    })

    await act(async () => {
      await result.current.handleCopyConfirm()
    })

    expect(toast.error).toHaveBeenCalledWith('复制BOM必须包含物料清单')
    expect(bomApi.create).not.toHaveBeenCalled()
  })

  it('blocks copying a legacy BOM that has no core material rows', async () => {
    vi.mocked(bomApi.getDetail).mockResolvedValue(noMaterialBom as any)

    const { result } = renderHook(() => useBOMPage())

    await act(async () => {
      await result.current.openCopy(noMaterialBom as any)
    })
    await waitFor(() => expect(result.current.modalType).toBe('copy'))

    await act(async () => {
      await result.current.handleCopyConfirm()
    })

    expect(toast.error).toHaveBeenCalledWith('原BOM缺少物料清单，不能复制')
    expect(bomApi.create).not.toHaveBeenCalled()
  })

  it('exports BOM type labels instead of internal type codes', async () => {
    const { result } = renderHook(() => useBOMPage())

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.setExportForm({
        range: 'filtered',
        format: 'csv',
        includeBasic: true,
        includeMaterials: false,
        includeHistory: false,
      })
    })

    await act(async () => {
      await result.current.handleExport()
    })

    expect(downloadTextFile).toHaveBeenCalledWith(
      expect.stringMatching(/^BOM清单_\d{4}-\d{2}-\d{2}\.csv$/),
      expect.stringContaining('免疫组化'),
      'text/csv;charset=utf-8'
    )
    expect(String(vi.mocked(downloadTextFile).mock.calls[0][1])).not.toContain(',ihc,')
  })

  it('exports core material business ids instead of BOM item ids when names are unavailable', async () => {
    vi.mocked(bomApi.getDetail).mockResolvedValue({
      ...activeBom,
      materials: [
        {
          id: 'bom-item-internal-1',
          materialId: 'mat-business-1',
          usagePerSample: 2,
          unit: '瓶',
        },
      ],
    } as any)

    const { result } = renderHook(() => useBOMPage())

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.setExportForm({
        range: 'filtered',
        format: 'csv',
        includeBasic: false,
        includeMaterials: true,
        includeHistory: false,
      })
    })

    await act(async () => {
      await result.current.handleExport()
    })

    const exportedContent = String(vi.mocked(downloadTextFile).mock.calls[0][1])
    expect(exportedContent).toContain('mat-business-1')
    expect(exportedContent).not.toContain('bom-item-internal-1')
  })

  it('exports version history effective scope labels consistent with the detail view', async () => {
    vi.mocked(bomApi.getDetail).mockResolvedValue({
      ...activeBom,
      versionHistory: [
        {
          version: 'v1.2',
          isCurrent: true,
          effectiveScope: 'retroactive',
          changeLog: '追溯调整用量',
          changedBy: 'admin',
          updatedAt: '2026-06-19T09:00:00.000Z',
          diff: {
            changedMaterials: [
              {
                materialId: 'mat-1',
                materialName: '试剂',
                before: { usagePerSample: 1, unit: '瓶' },
                after: { usagePerSample: 2, unit: '瓶' },
              },
            ],
          },
        },
        {
          version: 'v1.1',
          isCurrent: false,
          effectiveScope: 'future_only',
          changeLog: '仅后续生效',
          changedBy: 'admin',
          updatedAt: '2026-06-18T09:00:00.000Z',
        },
      ],
    } as any)

    const { result } = renderHook(() => useBOMPage())

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.setExportForm({
        range: 'filtered',
        format: 'csv',
        includeBasic: false,
        includeMaterials: false,
        includeHistory: true,
      })
    })

    await act(async () => {
      await result.current.handleExport()
    })

    const exportedContent = String(vi.mocked(downloadTextFile).mock.calls[0][1])
    expect(exportedContent).toContain('追溯重算')
    expect(exportedContent).toContain('仅未来生效')
    expect(exportedContent).not.toContain('追溯历史')
    expect(exportedContent).not.toContain('仅未来,')
  })
})
