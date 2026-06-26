import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Printer, Package } from 'lucide-react'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { outboundApi } from '@/api/inventory'
import { materialApi, projectApi } from '@/api/master'
import type { OutboundRecord, Material, Project } from '@/types'
import { toast } from 'sonner'
import OutboundFormModal, { type FormData } from './components/OutboundFormModal'
import OutboundDetailModal from './components/OutboundDetailModal'
import OutboundCancelModal from './components/OutboundCancelModal'
import OutboundDeleteModal from './components/OutboundDeleteModal'
import OutboundStats from './components/OutboundStats'
import OutboundQuickFilters from './components/OutboundQuickFilters'
import OutboundFilterBar from './components/OutboundFilterBar'
import OutboundTable from './components/OutboundTable'
// P2（拆分）：纯映射/打印/导出已抽至独立模块，降低本文件体量
import { buildCreatedOutboundRecord, buildEditedOutboundPatch, mapOutboundRecordToForm } from './outboundRecordMappers'
import { exportOutboundRecordsToXlsx } from './outboundExport'
import { buildOutboundPrintDocument } from './outboundPrint'

// 保持既有导入路径不变：mapOutboundRecordToForm 仍可从本模块导入（Outbound.test 依赖）
export { mapOutboundRecordToForm } from './outboundRecordMappers'

type QuickFilter = 'all' | 'today' | 'week' | 'month'
type StatusFilter = '' | 'completed' | 'pending' | 'cancelled'

export default function Outbound() {
  const { get, getNumber, setMultiple } = useUrlParams()
  const handledCreateFromQuery = useRef(false)

  const urlPage = Math.max(1, getNumber('page', 1))
  const urlPageSize = [10, 20, 50, 100].includes(getNumber('pageSize', 10))
    ? getNumber('pageSize', 10)
    : 10

  const [quickFilter, setQuickFilter] = useState<QuickFilter>(
    ['all', 'today', 'week', 'month'].includes(get('quickFilter', 'all')) ? get('quickFilter', 'all') as QuickFilter : 'all'
  )
  const [searchText, setSearchText] = useState(get('keyword', ''))
  const [materialFilter, setMaterialFilter] = useState(get('materialId', ''))
  const [typeFilter, setTypeFilter] = useState<'' | 'project' | 'transfer' | 'scrap' | 'bom'>(
    ['', 'project', 'transfer', 'scrap', 'bom'].includes(get('type', '')) ? get('type', '') as '' | 'project' | 'transfer' | 'scrap' | 'bom' : ''
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    ['', 'completed', 'pending', 'cancelled'].includes(get('status', '')) ? get('status', '') as StatusFilter : ''
  )
  const [startDate, setStartDate] = useState(get('startDate', ''))
  const [endDate, setEndDate] = useState(get('endDate', ''))

  // 快速筛选映射为日期范围
  const quickFilterDates = useMemo(() => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const weekStart = new Date(now.getTime() - now.getDay() * 86400000).toISOString().split('T')[0]
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    switch (quickFilter) {
      case 'today': return { startDate: today, endDate: today }
      case 'week': return { startDate: weekStart, endDate: today }
      case 'month': return { startDate: monthStart, endDate: today }
      default: return { startDate, endDate }
    }
  }, [quickFilter, startDate, endDate])

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res: any = await outboundApi.getList({
        page,
        pageSize,
        status: statusFilter || undefined,
        keyword: searchText || undefined,
        materialId: materialFilter || undefined,
        type: typeFilter || undefined,
        startDate: quickFilterDates.startDate || undefined,
        endDate: quickFilterDates.endDate || undefined,
      })
      return { list: res.list || [], pagination: res.pagination }
    },
    [statusFilter, searchText, materialFilter, typeFilter, quickFilterDates]
  )

  const {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<OutboundRecord>({
    fetchFn,
    initialPage: urlPage,
    initialPageSize: urlPageSize,
    deps: [statusFilter, searchText, materialFilter, typeFilter, quickFilterDates],
  })

  useEffect(() => {
    setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 10 ? pageSize : null,
      status: statusFilter || null,
      keyword: searchText || null,
      materialId: materialFilter || null,
      type: typeFilter || null,
      startDate: startDate || null,
      endDate: endDate || null,
      quickFilter: quickFilter !== 'all' ? quickFilter : null,
    })
  }, [page, pageSize, statusFilter, searchText, materialFilter, typeFilter, startDate, endDate, quickFilter, setMultiple])

  const [materials, setMaterials] = useState<Material[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [createdRecordFallback, setCreatedRecordFallback] = useState<OutboundRecord | null>(null)
  const [localOutboundPatches, setLocalOutboundPatches] = useState<Record<string, Partial<OutboundRecord>>>({})
  const [deletedOutboundIds, setDeletedOutboundIds] = useState<string[]>([])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editRecordId, setEditRecordId] = useState<string | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<OutboundRecord | null>(null)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelRecord, setCancelRecord] = useState<OutboundRecord | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelRemark, setCancelRemark] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteRecord, setDeleteRecord] = useState<OutboundRecord | null>(null)

  const [form, setForm] = useState<FormData>({
    type: 'project',
    projectId: '',
    items: [{ materialId: '', quantity: 0 }],
    remark: '',
    bomId: undefined,
    sampleCount: undefined,
    caseNo: '',
  })

  const fetchRefs = async () => {
    try {
      const [mRes, pRes]: any = await Promise.all([
        materialApi.getList({ page: 1, pageSize: 999, status: 'active' }),
        projectApi.getList({ page: 1, pageSize: 999, status: 'active' }),
      ])
      const refs: OutboundRefs = {
        materials: mRes?.list || [],
        projects: pRes?.list || [],
      }
      setMaterials(refs.materials)
      setProjects(refs.projects)
      return refs
    } catch (e) {
      console.error(e)
      const refs: OutboundRefs = { materials: [], projects: [] }
      setMaterials(refs.materials)
      setProjects(refs.projects)
      return refs
    }
  }

  useEffect(() => {
    fetchRefs()
  }, [])

  const toggleSelectAll = () => {
    const next = new Set(selectedIds)
    displayedData.forEach(d => selectAll ? next.delete(d.id) : next.add(d.id))
    setSelectedIds(next)
  }
  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }
  const clearSelection = () => setSelectedIds(new Set())

  // 统计数据（从后端获取）
  const [stats, setStats] = useState({
    monthTotal: 0,
    completed: 0,
    pending: 0,
    cancelled: 0,
    quickCounts: { all: 0, today: 0, week: 0, month: 0 },
  })

  const fetchStats = async () => {
    try {
      const res: any = await outboundApi.getStats()
      const next = res.data || res
      setStats(prev => ({
        ...prev,
        ...next,
        quickCounts: next.quickCounts || prev.quickCounts,
      }))
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const quickFilterCounts = stats.quickCounts

  const { displayedData, displayedTotal } = useMemo(() => {
    let rows = data.map(row => ({
      ...row,
      ...(localOutboundPatches[row.id] || {}),
    }))
    let nextTotal = total

    if (deletedOutboundIds.length > 0) {
      const filteredRows = rows.filter(row => !deletedOutboundIds.includes(row.id))
      if (filteredRows.length !== rows.length) {
        nextTotal = Math.max(0, nextTotal - (rows.length - filteredRows.length))
        rows = filteredRows
      }
    }

    if (
      createdRecordFallback &&
      !deletedOutboundIds.includes(createdRecordFallback.id) &&
      searchText === createdRecordFallback.outboundNo &&
      !materialFilter &&
      !typeFilter &&
      !statusFilter &&
      !startDate &&
      !endDate &&
      quickFilter === 'all' &&
      page === 1 &&
      !rows.some(row => row.id === createdRecordFallback.id || row.outboundNo === createdRecordFallback.outboundNo)
    ) {
      rows = [createdRecordFallback, ...rows]
      nextTotal = Math.max(nextTotal + 1, rows.length)
    }

    return { displayedData: rows, displayedTotal: nextTotal }
  }, [
    createdRecordFallback,
    data,
    deletedOutboundIds,
    endDate,
    localOutboundPatches,
    materialFilter,
    page,
    quickFilter,
    searchText,
    startDate,
    statusFilter,
    total,
    typeFilter,
  ])
  const selectAll = useMemo(() => displayedData.length > 0 && displayedData.every(d => selectedIds.has(d.id)), [displayedData, selectedIds])

  const openCreate = async () => {
    const refs = await fetchRefs()
    setEditRecordId(null)
    setForm({
      type: 'project',
      projectId: '',
      items: [{ materialId: refs.materials[0]?.id || '', quantity: 1 }],
      remark: '',
      bomId: undefined,
      sampleCount: undefined,
      caseNo: '',
    })
    setCreateModalOpen(true)
  }

  useEffect(() => {
    if (handledCreateFromQuery.current) return
    if (get('action', '') !== 'create') return

    handledCreateFromQuery.current = true
    openCreate()
  }, [get])

  const openEdit = (record: OutboundRecord) => {
    if (record.type !== 'project') {
      toast.error('BOM、调拨和报废出库请通过对应入口处理，不能在出库记录中直接编辑')
      return
    }
    setEditRecordId(record.id)
    setForm(mapOutboundRecordToForm(record, materials[0]?.id || ''))
    fetchRefs()
    setCreateModalOpen(true)
  }

  const openDelete = (record: OutboundRecord) => {
    setDeleteRecord(record)
    setDeleteConfirmOpen(true)
  }

  const openDetail = (record: OutboundRecord) => {
    setDetailRecord(record)
    setDetailModalOpen(true)
  }

  const focusCreatedOutboundRecord = (outboundNo: string) => {
    setSearchText(outboundNo)
    setMaterialFilter('')
    setTypeFilter('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
    setQuickFilter('all')
    setPage(1)
  }

  const openCancel = (record: OutboundRecord) => {
    setCancelRecord(record)
    setCancelReason('')
    setCancelRemark('')
    setCancelModalOpen(true)
  }

  const handleSubmit = async () => {
    // BOM 出库模式
    if (form.bomId || form.caseNo?.trim()) {
      if (!form.sampleCount || form.sampleCount <= 0) {
        toast.error('请填写有效样本数')
        return
      }
      if (!form.bomId) {
        toast.error('请选择已配置BOM的检测服务或LIS病例，BOM出库必须有BOM才能扣减库存并进入成本核算')
        return
      }
      try {
        const res: any = await outboundApi.createBom({
          bomId: form.bomId || undefined,
          projectId: form.projectId || undefined,
          sampleCount: form.sampleCount,
          caseNo: form.caseNo?.trim() || undefined,
          remark: form.remark || undefined,
        })
        const payload = res?.data ?? res
        if (payload?.outboundNo) {
          setCreatedRecordFallback(buildCreatedOutboundRecord(payload, form, { materials, projects }))
          focusCreatedOutboundRecord(payload.outboundNo)
        }
        toast.success('BOM出库登记成功', {
          description: payload?.outboundNo
            ? `已生成 ${payload.outboundNo}，批次库存、BOM用量、ABC成本、成本异常和审计可按单号回看；项目对账请按项目进入消耗对账查看实际出库影响`
            : '批次库存、BOM用量、ABC成本、成本异常和审计可回看；项目对账请按项目进入消耗对账查看实际出库影响',
        })
        setCreateModalOpen(false)
        setEditRecordId(null)
        refreshWithStats()
      } catch (e: any) {
        const msg = e?.response?.data?.error?.message || e?.message || 'BOM出库登记失败'
        toast.error(msg)
      }
      return
    }

    const validItems = form.items.filter(i => i.materialId && i.quantity > 0)
    if (!form.projectId) {
      toast.error('请选择检测项目，出库必须归属到项目才能进入成本和对账')
      return
    }
    if (validItems.length === 0) {
      toast.error('请添加至少一个有效物料')
      return
    }
    const displayItems = validItems.map(item => ({
      ...item,
      receiver: typeof item.receiver === 'string' ? item.receiver.trim() : item.receiver,
    }))
    const submittedForm = { ...form, items: displayItems }
    const normalizedItems = displayItems.map(item => ({
      materialId: item.materialId,
      batchId: item.batchId,
      quantity: item.quantity,
      usage: item.usage,
      receiver: item.receiver || undefined,
    }))
    if (normalizedItems.some(item => item.usage === 'external' && !item.receiver)) {
      toast.error('外给出库必须填写接收方，便于后续对账和追踪')
      return
    }
    try {
      if (editRecordId) {
        const res: any = await outboundApi.update(editRecordId, { ...form, items: normalizedItems })
        const payload = res?.data ?? res
        const currentRecord = displayedData.find(record => record.id === editRecordId)
          || data.find(record => record.id === editRecordId)
        if (currentRecord) {
          setLocalOutboundPatches(prev => ({
            ...prev,
            [editRecordId]: buildEditedOutboundPatch(currentRecord, payload || {}, submittedForm, { materials, projects }),
          }))
        }
        toast.success('出库更新成功', {
          description: '已同步批次库存、成本和审计记录；项目对账请按项目进入消耗对账查看实际出库影响',
        })
      } else {
        const res: any = await outboundApi.create({ ...form, items: normalizedItems })
        const payload = res?.data ?? res
        if (payload?.outboundNo) {
          setCreatedRecordFallback(buildCreatedOutboundRecord(payload, submittedForm, { materials, projects }))
          focusCreatedOutboundRecord(payload.outboundNo)
        }
        toast.success('出库登记成功', {
          description: payload?.outboundNo
            ? `已生成 ${payload.outboundNo}，批次库存、成本和审计可按单号回看；项目对账请按项目进入消耗对账查看实际出库影响`
            : '批次库存、成本和审计可回看；项目对账请按项目进入消耗对账查看实际出库影响',
        })
      }
      setCreateModalOpen(false)
      setEditRecordId(null)
      refreshWithStats()
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || (editRecordId ? '出库更新失败' : '出库登记失败')
      toast.error(msg)
    }
  }

  const handleDelete = async () => {
    if (!deleteRecord) return
    try {
      await outboundApi.delete(deleteRecord.id)
      setDeletedOutboundIds(prev => prev.includes(deleteRecord.id) ? prev : [...prev, deleteRecord.id])
      toast.success('删除成功')
      setDeleteConfirmOpen(false)
      setDeleteRecord(null)
      refreshWithStats()
    } catch (e) {
      toast.error('删除失败')
    }
  }

  const handleCancel = async () => {
    if (!cancelRecord) return
    if (!cancelReason) {
      toast.error('请选择取消原因')
      return
    }
    try {
      await outboundApi.delete(cancelRecord.id, { reason: cancelReason, remark: cancelRemark || undefined })
      setDeletedOutboundIds(prev => prev.includes(cancelRecord.id) ? prev : [...prev, cancelRecord.id])
      toast.success('出库已取消')
      setCancelModalOpen(false)
      refreshWithStats()
    } catch (e) {
      toast.error('取消失败')
    }
  }

  const refreshWithStats = () => { refresh(); fetchStats() }

  const batchExport = async () => {
    const exportData = selectedIds.size > 0 ? displayedData.filter(d => selectedIds.has(d.id)) : displayedData
    if (exportData.length === 0) {
      toast.error('没有可导出的数据')
      return
    }
    try {
      const count = await exportOutboundRecordsToXlsx(exportData)
      toast.success('导出成功', { description: `已导出 ${count} 条记录` })
    } catch (e) {
      toast.error('导出失败')
    }
  }

  const printRecords = (records: OutboundRecord[]) => {
    if (records.length === 0) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(buildOutboundPrintDocument(records))
    w.document.close()
    w.print()
  }

  const handlePrintRecord = (record: OutboundRecord) => {
    printRecords([record])
  }

  const batchPrint = () => {
    if (selectedIds.size === 0) {
      toast.error('请先选择要打印的记录')
      return
    }
    const records = displayedData.filter(d => selectedIds.has(d.id))
    printRecords(records)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900">出库记录</h1>
          <p className="text-sm text-gray-500 mt-1">查看和管理所有出库操作记录</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={batchPrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium transition-colors duration-150"
          >
            <Printer className="w-4 h-4" />
            打印记录
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium transition-colors duration-150"
          >
            <Package className="w-4 h-4" />
            出库登记
          </button>
        </div>
      </div>

      <OutboundStats stats={stats} statusFilter={statusFilter} onStatusChange={setStatusFilter} />

      <OutboundQuickFilters quickFilter={quickFilter} counts={quickFilterCounts} onChange={setQuickFilter} />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <OutboundFilterBar
          searchText={searchText}
          materialFilter={materialFilter}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          startDate={startDate}
          endDate={endDate}
          materials={materials}
          onSearchChange={setSearchText}
          onMaterialChange={setMaterialFilter}
          onTypeChange={setTypeFilter}
          onStatusChange={setStatusFilter}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onQuery={() => setPage(1)}
          onReset={() => {
            setSearchText('')
            setMaterialFilter('')
            setTypeFilter('')
            setStatusFilter('')
            setStartDate('')
            setEndDate('')
            setPage(1)
          }}
        />

        <OutboundTable
          loading={loading}
          data={displayedData}
          selectedIds={selectedIds}
          selectAll={selectAll}
          total={displayedTotal}
          page={page}
          pageSize={pageSize}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelectRow={toggleSelectRow}
          onClearSelection={clearSelection}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onOpenDetail={openDetail}
          onOpenEdit={openEdit}
          onOpenDelete={openDelete}
          onOpenCancel={openCancel}
          onPrintRecord={handlePrintRecord}
          onBatchExport={batchExport}
          onBatchPrint={batchPrint}
        />
      </div>

      <OutboundFormModal
        open={createModalOpen}
        editRecordId={editRecordId}
        form={form}
        materials={materials}
        projects={projects}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleSubmit}
        onFormChange={setForm}
      />

      <OutboundDetailModal
        open={detailModalOpen}
        record={detailRecord}
        onClose={() => setDetailModalOpen(false)}
        onPrint={handlePrintRecord}
      />

      <OutboundCancelModal
        open={cancelModalOpen}
        record={cancelRecord}
        cancelReason={cancelReason}
        cancelRemark={cancelRemark}
        onReasonChange={setCancelReason}
        onRemarkChange={setCancelRemark}
        onCancel={handleCancel}
        onClose={() => setCancelModalOpen(false)}
      />

      <OutboundDeleteModal
        open={deleteConfirmOpen}
        record={deleteRecord}
        onDelete={handleDelete}
        onClose={() => setDeleteConfirmOpen(false)}
      />
    </div>
  )
}
