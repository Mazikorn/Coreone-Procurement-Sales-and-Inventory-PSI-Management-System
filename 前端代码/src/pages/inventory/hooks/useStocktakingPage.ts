import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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

type StocktakingCreateDraft = Partial<FormData>

export interface CreatedStocktakingRecord {
  id?: string
  stocktakingNo?: string
  status?: string
}

export const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'confirmed', label: '已确认' },
]

function buildCreatedStocktakingRow(
  payload: CreatedStocktakingRecord & Partial<StocktakingRecord>,
  form: FormData,
  materials: Material[],
  inventoryRows: StocktakingScopeRow[],
): StocktakingRecord | null {
  if (!payload.id || !payload.stocktakingNo) return null

  const material = materials.find(item => item.id === form.materialId)
  const selectedBatchRow = inventoryRows.find(row => row.batchId === form.batchId)
  const selectedLocationRow = inventoryRows.find(row => row.locationId === form.locationId)
  const actualStock = Number(form.actualStock)

  return {
    id: payload.id,
    stocktakingNo: payload.stocktakingNo,
    materialId: form.materialId,
    locationId: form.locationId || selectedBatchRow?.locationId || null,
    batchId: form.batchId || null,
    batchNo: payload.batchNo || selectedBatchRow?.batchNo || null,
    materialName: payload.materialName || material?.name || form.materialId,
    materialCode: payload.materialCode || material?.code,
    materialUnit: payload.materialUnit || material?.unit,
    categoryName: payload.categoryName || (material as any)?.categoryName || (material as any)?.categoryPath,
    locationName: payload.locationName || selectedBatchRow?.locationName || selectedLocationRow?.locationName,
    systemStock: Number(form.systemStock || 0),
    actualStock,
    difference: Number((actualStock - Number(form.systemStock || 0)).toFixed(6)),
    operator: payload.operator || 'system',
    status: payload.status || 'completed',
    createdAt: payload.createdAt || new Date().toISOString(),
    remark: (payload.remark ?? form.remark) || undefined,
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  const data = (error as any)?.response?.data
  return data?.error?.message || data?.message || (error as any)?.message || fallback
}

function formatStocktakingQuantity(value: number): string {
  return String(Number(Number(value || 0).toFixed(6)))
}

function getStocktakingCreateSuccessDescription(stocktakingNo?: string): string {
  const prefix = stocktakingNo ? `已生成 ${stocktakingNo}，` : ''
  return `${prefix}当前只记录盘点差异；确认差异后才会调整库存、库位/批次、预警和审计链路`
}

function getStocktakingConfirmSuccessDescription(record: StocktakingRecord): string {
  const difference = Number(record.difference || 0)
  if (difference === 0) {
    return `${record.stocktakingNo} 已确认无差异；盘点状态和审计记录已按单号接住，库存、库位/批次和预警不产生调整`
  }
  return `${record.stocktakingNo} 已确认差异 ${formatStocktakingQuantity(difference)}；库存、库位/批次、预警、库存流水和审计记录已按单号接住`
}

function getStocktakingDeleteSuccessDescription(record: StocktakingRecord): string {
  const hasConfirmedDifference = record.status === 'confirmed' && Number(record.difference || 0) !== 0
  if (hasConfirmedDifference) {
    return `${record.stocktakingNo} 已撤销；库存、库位/批次、预警和库存流水已回退，审计记录可按单号回看`
  }
  return `${record.stocktakingNo} 已撤销；未确认盘点不会改动库存、批次、预警或成本，审计记录可按单号回看`
}

function normalizeScopeType(value: string): StocktakingScopeType {
  if (value === 'location' || value === 'batch') return value
  return 'material'
}

export function useStocktakingPage() {
  const url = useUrlParams()
  const handledCreateFromQuery = useRef(false)

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
  const [createdRecord, setCreatedRecord] = useState<CreatedStocktakingRecord | null>(null)
  const [createdRecordFallback, setCreatedRecordFallback] = useState<StocktakingRecord | null>(null)
  const [confirmedRecordFallback, setConfirmedRecordFallback] = useState<StocktakingRecord | null>(null)
  const [deletedRecordIds, setDeletedRecordIds] = useState<Set<string>>(new Set())
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

  const displayedPage = useMemo(() => {
    const filteredData = deletedRecordIds.size
      ? data.filter(row => !deletedRecordIds.has(row.id))
      : data
    let nextTotal = Math.max(0, total - (data.length - filteredData.length))

    if (
      confirmedRecordFallback &&
      !deletedRecordIds.has(confirmedRecordFallback.id) &&
      keyword === confirmedRecordFallback.stocktakingNo &&
      debouncedKeyword === confirmedRecordFallback.stocktakingNo &&
      statusFilter === 'confirmed' &&
      page === 1
    ) {
      if (filteredData.some(row => row.id === confirmedRecordFallback.id || row.stocktakingNo === confirmedRecordFallback.stocktakingNo)) {
        const rows = filteredData.map(row =>
          row.id === confirmedRecordFallback.id || row.stocktakingNo === confirmedRecordFallback.stocktakingNo
            ? confirmedRecordFallback
            : row
        )
        return { data: rows, total: nextTotal }
      }
      const rows = [confirmedRecordFallback, ...filteredData]
      return { data: rows, total: Math.max(nextTotal + 1, rows.length) }
    }

    if (!createdRecordFallback || deletedRecordIds.has(createdRecordFallback.id)) {
      return { data: filteredData, total: nextTotal }
    }
    if (
      keyword !== createdRecordFallback.stocktakingNo ||
      debouncedKeyword !== createdRecordFallback.stocktakingNo ||
      statusFilter ||
      page !== 1
    ) return { data: filteredData, total: nextTotal }
    if (filteredData.some(row => row.id === createdRecordFallback.id || row.stocktakingNo === createdRecordFallback.stocktakingNo)) {
      return { data: filteredData, total: nextTotal }
    }

    const rows = [createdRecordFallback, ...filteredData]
    return { data: rows, total: Math.max(nextTotal, rows.length) }
  }, [confirmedRecordFallback, createdRecordFallback, data, debouncedKeyword, deletedRecordIds, keyword, page, statusFilter, total])

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

  const getCreateDraftFromUrl = useCallback((): StocktakingCreateDraft => {
    const systemStock = url.getNumber('systemStock', 0)
    return {
      materialId: url.get('materialId', ''),
      scopeType: normalizeScopeType(url.get('scopeType', 'material')),
      locationId: url.get('locationId', ''),
      batchId: url.get('batchId', ''),
      systemStock: Number.isFinite(systemStock) ? systemStock : 0,
      remark: url.get('remark', '来自库存列表现场盘点'),
    }
  }, [url])

  const openCreate = useCallback(async (draft: StocktakingCreateDraft = {}) => {
    const res: any = await materialApi.getList({ page: 1, pageSize: 999, status: 'active' })
    setMaterials(res?.list || [])
    let nextInventoryRows: StocktakingScopeRow[] = []
    if (draft.materialId) {
      try {
        const inventoryRes: any = await inventoryApi.getList({
          materialId: draft.materialId,
          page: 1,
          pageSize: STOCKTAKING_SCOPE_PAGE_SIZE,
        })
        const payload = inventoryRes?.data ?? inventoryRes
        nextInventoryRows = payload?.list || []
      } catch {
        nextInventoryRows = []
      }
    }
    setInventoryRows(nextInventoryRows)
    setForm({
      materialId: draft.materialId || '',
      scopeType: draft.scopeType || 'material',
      locationId: draft.locationId || '',
      batchId: draft.batchId || '',
      systemStock: Number(draft.systemStock || 0),
      actualStock: draft.actualStock ?? '',
      remark: draft.remark || '',
    })
    setCreatedRecord(null)
    setCreateStep(1)
    setModalType('create')
  }, [])

  useEffect(() => {
    if (handledCreateFromQuery.current) return
    if (url.get('action', '') !== 'create') return

    handledCreateFromQuery.current = true
    void openCreate(getCreateDraftFromUrl())
  }, [getCreateDraftFromUrl, openCreate, url])

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
      toast.success('盘点记录已创建', {
        description: getStocktakingCreateSuccessDescription(),
      })
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
    if (form.scopeType === 'location' && !form.locationId) {
      toast.error('请选择盘点库位，库位盘点必须明确库存归属')
      return
    }
    if (form.scopeType === 'batch' && !form.batchId) {
      toast.error('请选择盘点批次，批次盘点必须接住批次追溯链路')
      return
    }
    setIsSubmitting(true)
    try {
      const res: any = await stocktakingApi.create({
        materialId: form.materialId,
        locationId: form.locationId || undefined,
        batchId: form.batchId || undefined,
        systemStock: form.systemStock,
        actualStock: Number(form.actualStock),
        remark: form.remark,
      })
      const payload = res?.data ?? res
      setCreatedRecord({
        id: payload?.id,
        stocktakingNo: payload?.stocktakingNo,
        status: payload?.status,
      })
      if (payload?.stocktakingNo) {
        setCreatedRecordFallback(buildCreatedStocktakingRow(payload, form, materials, inventoryRows))
        setKeyword(payload.stocktakingNo)
        setDebouncedKeyword(payload.stocktakingNo)
        setStatusFilter('')
        setPage(1)
      }
      toast.success('盘点任务已创建', {
        description: getStocktakingCreateSuccessDescription(payload?.stocktakingNo),
      })
      setCreateStep(3)
      refresh()
      loadStats()
    } catch (e) {
      toast.error(getErrorMessage(e, '创建失败，请重试'))
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
      setDeletedRecordIds(prev => {
        const next = new Set(prev)
        next.add(recordToDelete.id)
        return next
      })
      toast.success('盘点记录已撤销', {
        description: getStocktakingDeleteSuccessDescription(recordToDelete),
      })
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
      const confirmedRecord: StocktakingRecord = {
        ...detailRow,
        status: 'confirmed',
        remark: payload.remark || detailRow.remark,
      }
      setConfirmedRecordFallback(confirmedRecord)
      setKeyword(detailRow.stocktakingNo)
      setDebouncedKeyword(detailRow.stocktakingNo)
      setStatusFilter('confirmed')
      setPage(1)
      toast.success('盘点差异已确认', {
        description: getStocktakingConfirmSuccessDescription(detailRow),
      })
      setModalType(null)
      setDetailRow(null)
      refresh()
      loadStats()
    } catch (e) {
      toast.error(getErrorMessage(e, '确认失败'))
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
    data: displayedPage.data, loading, page, pageSize, total: displayedPage.total, setPage, setPageSize, refresh,
    keyword, setKeyword, statusFilter, setStatusFilter,
    modalType, setModalType,
    detailRow, setDetailRow,
    createdRecord,
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
