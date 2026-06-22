import { useState, useEffect, useCallback } from 'react'
import { stocktakingApi } from '@/api/stocktaking'
import { inventoryApi } from '@/api/inventory'
import { materialApi } from '@/api/master'
import type { InventoryItem, Material } from '@/types'
import { toast } from 'sonner'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'

export interface StocktakingRecord {
  id: string
  stocktakingNo: string
  materialId: string
  locationId?: string | null
  batchId?: string | null
  batchNo?: string | null
  materialName: string
  materialCode?: string
  materialUnit?: string
  categoryName?: string
  locationName?: string
  systemStock: number
  actualStock: number
  difference: number
  operator: string
  status: string
  createdAt: string
  remark?: string
}

export type StocktakingScopeType = 'material' | 'location' | 'batch'

export type StocktakingScopeRow = InventoryItem

export const STOCKTAKING_SCOPE_PAGE_SIZE = 200

export interface FormData {
  materialId: string
  scopeType: StocktakingScopeType
  locationId: string
  batchId: string
  systemStock: number
  actualStock: number | ''
  remark: string
}

export const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'confirmed', label: '已确认' },
]

export function useStocktakingPage() {
  const url = useUrlParams()

  const initialPage = Math.max(1, url.getNumber('page', 1))
  const initialPageSize = [10, 20, 50, 100].includes(url.getNumber('pageSize', 20))
    ? url.getNumber('pageSize', 20)
    : 20

  const [keyword, setKeyword] = useState(url.get('keyword', ''))
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword)
  const [statusFilter, setStatusFilter] = useState(url.get('status', ''))
  const [stats, setStats] = useState({
    completed: 0,
    confirmed: 0,
    diffCount: 0,
    accuracy: '100.0',
  })

  const [modalType, setModalType] = useState<'create' | 'detail' | 'adjust' | null>(null)
  const [detailRow, setDetailRow] = useState<StocktakingRecord | null>(null)
  const [createStep, setCreateStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<StocktakingRecord | null>(null)

  const [materials, setMaterials] = useState<Material[]>([])
  const [inventoryRows, setInventoryRows] = useState<StocktakingScopeRow[]>([])
  const [form, setForm] = useState<FormData>({
    materialId: '', scopeType: 'material', locationId: '', batchId: '', systemStock: 0, actualStock: '', remark: '',
  })

  const fetchFn = useCallback(
    async (params: { page: number; pageSize: number }) => {
      const res: any = await stocktakingApi.getList({
        ...params,
        keyword: debouncedKeyword || undefined,
        status: statusFilter || undefined,
      })
      const payload = res?.data ?? res
      return {
        list: payload?.list || [],
        pagination: payload?.pagination,
      }
    },
    [debouncedKeyword, statusFilter]
  )

  const {
    data, loading, page, pageSize, total,
    setPage, setPageSize, refresh,
  } = usePagination<StocktakingRecord>({
    fetchFn,
    initialPage,
    initialPageSize,
    deps: [debouncedKeyword, statusFilter],
  })

  useEffect(() => {
    url.setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 20 ? pageSize : null,
      keyword: keyword || null,
      status: statusFilter || null,
    })
  }, [page, pageSize, keyword, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(keyword), 300)
    return () => window.clearTimeout(timer)
  }, [keyword])

  const loadStats = useCallback(async () => {
    try {
      const res: any = await stocktakingApi.getStats({
        keyword: debouncedKeyword || undefined,
        status: statusFilter || undefined,
      })
      setStats({
        completed: Number(res?.completed || 0),
        confirmed: Number(res?.confirmed || 0),
        diffCount: Number(res?.diffCount || 0),
        accuracy: Number(res?.accuracy ?? 100).toFixed(1),
      })
    } catch {
      setStats({ completed: 0, confirmed: 0, diffCount: 0, accuracy: '100.0' })
    }
  }, [debouncedKeyword, statusFilter])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const openCreate = async () => {
    const res: any = await materialApi.getList({ page: 1, pageSize: 999, status: 'active' })
    setMaterials(res?.list || [])
    setInventoryRows([])
    setForm({
      materialId: '', scopeType: 'material', locationId: '', batchId: '', systemStock: 0, actualStock: '', remark: '',
    })
    setCreateStep(1)
    setModalType('create')
  }

  const handleSubmit = async () => {
    if (!form.materialId) { toast.error('请选择物料'); return }
    if (form.actualStock === '') {
      toast.error('请输入实盘数量')
      return
    }
    setIsSubmitting(true)
    try {
      await stocktakingApi.create({
        materialId: form.materialId,
        locationId: form.locationId || undefined,
        batchId: form.batchId || undefined,
        systemStock: form.systemStock,
        actualStock: Number(form.actualStock),
        remark: form.remark
      })
      toast.success('盘点记录已创建')
      setModalType(null)
      refresh()
      loadStats()
    } catch (e) { toast.error('操作失败') } finally { setIsSubmitting(false) }
  }

  const handleCreateSubmit = async () => {
    if (!form.materialId) { toast.error('请选择物料'); return }
    if (form.actualStock === '') {
      toast.error('请输入实盘数量')
      return
    }
    setIsSubmitting(true)
    try {
      await stocktakingApi.create({
        materialId: form.materialId,
        locationId: form.locationId || undefined,
        batchId: form.batchId || undefined,
        systemStock: form.systemStock,
        actualStock: Number(form.actualStock),
        remark: form.remark,
      })
      toast.success('盘点任务已创建')
      setCreateStep(3)
      refresh()
      loadStats()
    } catch (e) {
      toast.error('创建失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openDetail = (row: StocktakingRecord) => {
    setDetailRow(row)
    setModalType('detail')
  }

  const openAdjust = (row: StocktakingRecord) => {
    setDetailRow(row)
    setModalType('adjust')
  }

  const openDelete = (row: StocktakingRecord) => {
    setRecordToDelete(row)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!recordToDelete) return
    try {
      await stocktakingApi.delete(recordToDelete.id)
      toast.success('盘点记录已撤销')
      setDeleteConfirmOpen(false)
      setRecordToDelete(null)
      refresh()
      loadStats()
    } catch (e) {
      toast.error('撤销失败')
    }
  }

  const handleAdjustConfirm = async (payload: { reason: string; remark?: string }) => {
    if (!detailRow) return
    if (!payload.reason) {
      toast.error('请选择差异原因')
      return
    }
    setIsSubmitting(true)
    try {
      await stocktakingApi.confirm(detailRow.id, payload)
      toast.success('盘点差异已确认')
      setModalType(null)
      setDetailRow(null)
      refresh()
      loadStats()
    } catch (e) {
      toast.error('确认失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuery = () => { setPage(1) }
  const handleReset = () => { setKeyword(''); setStatusFilter(''); setPage(1) }
  const handleFormChange = (nextForm: FormData) => {
    setForm(nextForm)
    if (nextForm.materialId && nextForm.materialId !== form.materialId) {
      inventoryApi.getList({ materialId: nextForm.materialId, page: 1, pageSize: STOCKTAKING_SCOPE_PAGE_SIZE })
        .then((res: any) => {
          const payload = res?.data ?? res
          setInventoryRows(payload?.list || [])
        })
        .catch(() => setInventoryRows([]))
      return
    }
    if (!nextForm.materialId) {
      setInventoryRows([])
    }
  }

  const selectedMaterial = materials.find(m => m.id === form.materialId)

  return {
    data, loading, page, pageSize, total, setPage, setPageSize, refresh,
    keyword, setKeyword, statusFilter, setStatusFilter,
    modalType, setModalType,
    detailRow, setDetailRow,
    createStep, setCreateStep,
    isSubmitting, setIsSubmitting,
    deleteConfirmOpen, setDeleteConfirmOpen,
    recordToDelete, setRecordToDelete,
    materials, setMaterials,
    inventoryRows, setInventoryRows,
    form, setForm: handleFormChange,
    stats,
    handleQuery, handleReset,
    openCreate, openDetail, openAdjust, openDelete,
    handleSubmit, handleCreateSubmit, handleDelete, handleAdjustConfirm,
    selectedMaterial,
  }
}
