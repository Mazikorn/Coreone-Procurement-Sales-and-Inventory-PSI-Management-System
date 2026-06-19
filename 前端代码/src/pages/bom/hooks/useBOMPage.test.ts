import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bomApi, materialApi, projectApi } from '@/api/master'
import { useBOMPage } from './useBOMPage'
import { toast } from 'sonner'

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

  it('does not update BOM content when deactivation is rejected first', async () => {
    vi.mocked(bomApi.updateStatus).mockRejectedValue(new Error('BOM已被启用检测项目引用'))

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

    expect(bomApi.updateStatus).toHaveBeenCalledWith('bom-1', 'inactive')
    expect(bomApi.update).not.toHaveBeenCalled()
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
})
