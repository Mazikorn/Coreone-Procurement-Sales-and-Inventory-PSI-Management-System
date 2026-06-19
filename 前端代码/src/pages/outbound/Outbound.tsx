import { useState, useEffect, useMemo, useCallback } from 'react'
import { Printer, Package } from 'lucide-react'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { outboundApi } from '@/api/inventory'
import { materialApi, projectApi } from '@/api/master'
import type { OutboundRecord, Material, Project } from '@/types'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'
import OutboundFormModal, { type FormData } from './components/OutboundFormModal'
import OutboundDetailModal from './components/OutboundDetailModal'
import OutboundCancelModal from './components/OutboundCancelModal'
import OutboundDeleteModal from './components/OutboundDeleteModal'
import OutboundStats from './components/OutboundStats'
import OutboundQuickFilters from './components/OutboundQuickFilters'
import OutboundFilterBar from './components/OutboundFilterBar'
import OutboundTable from './components/OutboundTable'

type QuickFilter = 'all' | 'today' | 'week' | 'month'
type StatusFilter = '' | 'completed' | 'pending' | 'cancelled'

interface OutboundRefs {
  materials: Material[]
  projects: Project[]
}

export function mapOutboundRecordToForm(record: OutboundRecord, fallbackMaterialId = ''): FormData {
  return {
    type: record.type as FormData['type'],
    projectId: record.projectId || '',
    items: record.items?.map(item => ({
      materialId: item.materialId,
      batchId: item.batchId || undefined,
      quantity: item.quantity,
      usage: item.usage,
      receiver: item.receiver,
    })) || [{ materialId: fallbackMaterialId, quantity: 1 }],
    remark: record.remark || '',
    bomId: undefined,
    sampleCount: undefined,
    caseNo: record.caseNo || '',
  }
}

export default function Outbound() {
  const { get, getNumber, setMultiple } = useUrlParams()

  const urlPage = Math.max(1, getNumber('page', 1))
  const urlPageSize = [10, 20, 50, 100].includes(getNumber('pageSize', 10))
    ? getNumber('pageSize', 10)
    : 10

  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [searchText, setSearchText] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | 'project' | 'transfer' | 'scrap'>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAll = useMemo(() => data.length > 0 && data.every(d => selectedIds.has(d.id)), [data, selectedIds])

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
    data.forEach(d => selectAll ? next.delete(d.id) : next.add(d.id))
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

  const openEdit = (record: OutboundRecord) => {
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
      try {
        const res = await outboundApi.createBom({
          bomId: form.bomId || undefined,
          projectId: form.projectId || undefined,
          sampleCount: form.sampleCount,
          caseNo: form.caseNo?.trim() || undefined,
          remark: form.remark || undefined,
        })
        toast.success('BOM出库登记成功')
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
    if (validItems.length === 0) {
      toast.error('请添加至少一个有效物料')
      return
    }
    try {
      if (editRecordId) {
        await outboundApi.update(editRecordId, { ...form, items: validItems })
        toast.success('出库更新成功')
      } else {
        await outboundApi.create({ ...form, items: validItems })
        toast.success('出库登记成功')
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
      toast.success('出库已取消')
      setCancelModalOpen(false)
      refreshWithStats()
    } catch (e) {
      toast.error('取消失败')
    }
  }

  const refreshWithStats = () => { refresh(); fetchStats() }

  const batchExport = async () => {
    const exportData = selectedIds.size > 0 ? data.filter(d => selectedIds.has(d.id)) : data
    if (exportData.length === 0) {
      toast.error('没有可导出的数据')
      return
    }
    try {
      const XLSX = await import('xlsx')
      const rows = exportData.map(row => ({
        出库单号: row.outboundNo,
        类型: row.type === 'project' ? '项目出库' : row.type === 'transfer' ? '调拨出库' : '报废出库',
        项目: row.projectName || '-',
        物料明细: row.items?.map(i => `${i.materialName}×${i.quantity}`).join(', ') || '-',
        总金额: row.totalCost || 0,
        ABC总成本: row.abcTotalCost || 0,
        收费金额: row.feeAmount || 0,
        利润: row.profit || 0,
        操作人: row.operator || '-',
        出库时间: formatDateTime(row.createdAt),
        状态: row.status === 'completed' ? '已完成' : row.status === 'pending' ? '待出库' : '已取消',
        备注: row.remark || '-',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '出库记录')
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      XLSX.writeFile(wb, `出库记录_${dateStr}.xlsx`)
      toast.success('导出成功', { description: `已导出 ${rows.length} 条记录` })
    } catch (e) {
      toast.error('导出失败')
    }
  }

  const escapeHtml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  const buildPrintDocument = (records: OutboundRecord[]) => {
    const pages = records.map(record => {
      const items = record.items?.map(i => `
        <tr>
          <td>${escapeHtml(i.materialName || '')}</td>
          <td>${escapeHtml(i.batchNo || '-')}</td>
          <td>${i.quantity} ${escapeHtml(i.unit || '')}</td>
          <td>${i.unitCost || 0}</td>
          <td>${i.totalCost || 0}</td>
        </tr>
      `).join('') || ''

      return `
        <section class="print-page">
          <h2>出库单</h2>
          <div class="meta">单号：${escapeHtml(record.outboundNo)} | 项目：${escapeHtml(record.projectName || '-')} | 时间：${new Date(record.createdAt).toLocaleString()}</div>
          <table><thead><tr><th>物料</th><th>批号</th><th>数量</th><th>单价</th><th>金额</th></tr></thead>
          <tbody>${items}</tbody>
          </table>
          <div class="footer">操作人：${escapeHtml(record.operator || '-')} | 备注：${escapeHtml(record.remark || '无')}</div>
          <div class="footer">本单据由 COREONE 系统自动生成</div>
        </section>
      `
    }).join('')

    return `
      <html><head><title>出库单打印</title><style>
        body { font-family: sans-serif; padding: 40px; }
        h2 { text-align: center; margin-bottom: 8px; }
        .meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f5f5f5; }
        .footer { margin-top: 24px; font-size: 12px; color: #999; text-align: center; }
        .print-page { page-break-after: always; }
        .print-page:last-child { page-break-after: auto; }
      </style></head><body>${pages}</body></html>
    `
  }

  const printRecords = (records: OutboundRecord[]) => {
    if (records.length === 0) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(buildPrintDocument(records))
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
    const records = data.filter(d => selectedIds.has(d.id))
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
          data={data}
          selectedIds={selectedIds}
          selectAll={selectAll}
          total={total}
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
