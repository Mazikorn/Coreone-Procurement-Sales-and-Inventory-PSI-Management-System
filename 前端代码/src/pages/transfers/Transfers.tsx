import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ArrowRightLeft, FileSearch, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { inventoryApi, transferApi } from '@/api/inventory'
import { materialApi, locationApi } from '@/api/master'
import type { TransferRecord, Material, Location, Batch } from '@/types'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'

export interface TransferFormState {
  materialId: string
  batchNo: string
  quantity: number
  fromLocationId: string
  toLocationId: string
  remark: string
}

interface TransferRefs {
  materials: Material[]
  locations: Location[]
}

function buildCreatedTransferRecord(
  payload: Partial<TransferRecord>,
  form: TransferFormState,
  refs: TransferRefs,
): TransferRecord | null {
  if (!payload.id || !payload.inboundNo) return null

  const material = refs.materials.find(item => item.id === (payload.materialId || form.materialId))
  const fromLocation = refs.locations.find(item => item.id === (payload.fromLocationId || form.fromLocationId))
  const toLocation = refs.locations.find(item => item.id === (payload.toLocationId || form.toLocationId))

  return {
    id: payload.id,
    inboundNo: payload.inboundNo,
    materialId: payload.materialId || form.materialId,
    materialName: payload.materialName || material?.name,
    batchNo: payload.batchNo || form.batchNo || undefined,
    quantity: Number(payload.quantity ?? form.quantity),
    fromLocationId: payload.fromLocationId || form.fromLocationId || undefined,
    fromLocationName: payload.fromLocationName || fromLocation?.name,
    toLocationId: payload.toLocationId || form.toLocationId,
    toLocationName: payload.toLocationName || toLocation?.name,
    operator: payload.operator || 'system',
    status: payload.status || 'completed',
    remark: (payload.remark ?? form.remark) || undefined,
    createdAt: payload.createdAt || new Date().toISOString(),
  }
}

export function validateTransferForm(
  form: TransferFormState,
  selectedMaterial: Material | undefined,
  sourceLocationStock: number | null,
  availableBatches: Batch[] = []
): string | null {
  if (!form.materialId || form.quantity <= 0 || !form.fromLocationId || !form.toLocationId) {
    return '请填写物料、数量、来源库位和目标库位'
  }
  if (form.fromLocationId === form.toLocationId) {
    return '来源库位和目标库位不能相同'
  }
  if (!selectedMaterial) {
    return '请选择有效物料'
  }
  if (availableBatches.length > 0 && !form.batchNo) {
    return '请选择调拨批次'
  }
  if (form.batchNo && availableBatches.length > 0) {
    const selectedBatch = availableBatches.find(batch => batch.batchNo === form.batchNo)
    if (!selectedBatch) {
      return '请选择有效调拨批次'
    }
    if (form.quantity > selectedBatch.remaining) {
      return `调拨数量不能超过所选批次剩余量 ${selectedBatch.remaining} ${selectedMaterial.unit}`
    }
  }

  if (sourceLocationStock === null) {
    return '来源库位库存暂未确认，请重新选择来源库位或刷新后再调拨'
  }

  const stockLimit = sourceLocationStock
  if (form.quantity > stockLimit) {
    return `调拨数量不能超过来源库位可用库存 ${stockLimit} ${selectedMaterial.unit}`
  }
  if (form.quantity > selectedMaterial.stock) {
    return `调拨数量不能超过当前库存 ${selectedMaterial.stock} ${selectedMaterial.unit}`
  }

  return null
}

export default function Transfers() {
  const navigate = useNavigate()
  const initialKeyword = new URLSearchParams(window.location.search).get('keyword') || ''
  const [materials, setMaterials] = useState<Material[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [keywordInput, setKeywordInput] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<TransferRecord | null>(null)
  const [createdTransferFallback, setCreatedTransferFallback] = useState<TransferRecord | null>(null)
  const [cancelledTransferIds, setCancelledTransferIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sourceLocationStock, setSourceLocationStock] = useState<number | null>(null)
  const [sourceStockLoading, setSourceStockLoading] = useState(false)
  const [materialBatches, setMaterialBatches] = useState<Batch[]>([])
  const createDraftHandledRef = useRef(false)
  const [form, setForm] = useState<TransferFormState>({
    materialId: '',
    batchNo: '',
    quantity: 1,
    fromLocationId: '',
    toLocationId: '',
    remark: '',
  })

  const fetchRefs = async () => {
    try {
      const [mRes, lRes]: any = await Promise.all([
        materialApi.getList({ page: 1, pageSize: 999, status: 'active' }),
        locationApi.getList({ page: 1, pageSize: 999, status: 'active' }),
      ])
      setMaterials(mRes?.list || [])
      setLocations(lRes?.list || [])
    } catch (e) { console.error(e) }
  }

  useEffect(() => { fetchRefs() }, [])

  useEffect(() => {
    if (createDraftHandledRef.current) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('action') !== 'create') return

    createDraftHandledRef.current = true
    const quantity = Number(params.get('quantity') || 1)
    setForm(prev => ({
      ...prev,
      materialId: params.get('materialId') || prev.materialId,
      batchNo: params.get('batchNo') || prev.batchNo,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : prev.quantity,
      fromLocationId: params.get('fromLocationId') || prev.fromLocationId,
      toLocationId: params.get('toLocationId') || prev.toLocationId,
      remark: params.get('remark') || prev.remark,
    }))
    setModalOpen(true)
  }, [])

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res: any = await transferApi.getList({
        page,
        pageSize,
        keyword: keyword || undefined,
      })
      return { list: res.list || [], pagination: res.pagination }
    },
    [keyword]
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
  } = usePagination<TransferRecord>({
    fetchFn,
    deps: [keyword],
  })

  const selectedMaterial = materials.find(m => m.id === form.materialId)
  const locationNameById = new Map(locations.map(location => [location.id, location.name]))

  const { displayedData, displayedTotal } = useMemo(() => {
    let rows = data
    let nextTotal = total

    if (cancelledTransferIds.length > 0) {
      const filteredRows = rows.filter(row => !cancelledTransferIds.includes(row.id))
      if (filteredRows.length !== rows.length) {
        nextTotal = Math.max(0, nextTotal - (rows.length - filteredRows.length))
        rows = filteredRows
      }
    }

    if (
      createdTransferFallback
      && !cancelledTransferIds.includes(createdTransferFallback.id)
      && keyword === createdTransferFallback.inboundNo
      && page === 1
      && !rows.some(row => row.id === createdTransferFallback.id || row.inboundNo === createdTransferFallback.inboundNo)
    ) {
      rows = [createdTransferFallback, ...rows]
      nextTotal = Math.max(nextTotal + 1, rows.length)
    }

    return { displayedData: rows, displayedTotal: nextTotal }
  }, [cancelledTransferIds, createdTransferFallback, data, keyword, page, total])

  const handleMaterialChange = (materialId: string) => {
    const nextMaterial = materials.find(m => m.id === materialId)
    const nextFromLocationId = nextMaterial?.locationId || ''
    setForm(prev => ({
      ...prev,
      materialId,
      batchNo: '',
      quantity: 1,
      fromLocationId: nextFromLocationId,
      toLocationId: prev.toLocationId === nextFromLocationId ? '' : prev.toLocationId,
    }))
  }

  useEffect(() => {
    let cancelled = false

    const fetchBatches = async () => {
      if (!form.materialId) {
        setMaterialBatches([])
        return
      }
      try {
        const res: any = await materialApi.getDetail(form.materialId)
        if (cancelled) return
        const batches = (res?.batches || []).filter((batch: Batch) => batch.remaining > 0 && batch.status === 'normal')
        setMaterialBatches(batches)
        if (batches.length === 1) {
          setForm(prev => ({ ...prev, batchNo: batches[0].batchNo }))
        }
      } catch (e) {
        if (!cancelled) setMaterialBatches([])
      }
    }

    fetchBatches()
    return () => { cancelled = true }
  }, [form.materialId])

  const handleFromLocationChange = (fromLocationId: string) => {
    setForm(prev => ({
      ...prev,
      fromLocationId,
      toLocationId: prev.toLocationId === fromLocationId ? '' : prev.toLocationId,
    }))
  }

  useEffect(() => {
    let cancelled = false

    const fetchSourceLocationStock = async () => {
      if (!form.materialId || !form.fromLocationId) {
        setSourceLocationStock(null)
        return
      }
      setSourceStockLoading(true)
      try {
        const res: any = await inventoryApi.getList({
          page: 1,
          pageSize: 20,
          materialId: form.materialId,
          locationId: form.fromLocationId,
        })
        if (cancelled) return
        const row = (res?.list || []).find((item: any) => item.materialId === form.materialId && item.locationId === form.fromLocationId)
        setSourceLocationStock(Number(row?.stock || 0))
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          setSourceLocationStock(null)
        }
      } finally {
        if (!cancelled) setSourceStockLoading(false)
      }
    }

    fetchSourceLocationStock()
    return () => {
      cancelled = true
    }
  }, [form.materialId, form.fromLocationId])

  const handleCreate = async () => {
    const validationError = validateTransferForm(form, selectedMaterial, sourceLocationStock, materialBatches)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setIsSubmitting(true)
    try {
      const submittedForm = { ...form }
      const createdTransfer = await transferApi.createInbound(submittedForm)
      if (createdTransfer?.inboundNo) {
        setCreatedTransferFallback(buildCreatedTransferRecord(createdTransfer, submittedForm, { materials, locations }))
        focusCreatedTransfer(createdTransfer.inboundNo)
      }
      toast.success('调拨入库登记成功', {
        description: createdTransfer?.inboundNo
          ? `已生成 ${createdTransfer.inboundNo}，来源库位、目标库位、批次、库存流水和审计链路可按单号回看`
          : '来源库位、目标库位、批次、库存流水和审计链路可回看',
      })
      setModalOpen(false)
      setForm({ materialId: '', batchNo: '', quantity: 1, fromLocationId: '', toLocationId: '', remark: '' })
      setMaterialBatches([])
      refresh()
    } catch {
      // P2：错误提示由全局响应拦截器统一 toast 后端真实消息；此处不再重复弹通用文案（原取值路径错误恒退化）
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSearch = () => {
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  const handleReset = () => {
    setKeywordInput('')
    setKeyword('')
    setPage(1)
  }

  const focusCreatedTransfer = (inboundNo: string) => {
    setKeywordInput(inboundNo)
    setKeyword(inboundNo)
    setPage(1)
  }

  const openDelete = (row: TransferRecord) => {
    setRecordToDelete(row)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!recordToDelete) return
    try {
      await transferApi.delete(recordToDelete.id)
      setCancelledTransferIds(prev => prev.includes(recordToDelete.id) ? prev : [...prev, recordToDelete.id])
      toast.success('调拨记录已撤销')
      setDeleteConfirmOpen(false)
      setRecordToDelete(null)
      refresh()
    } catch {
      // P2：撤销失败原因由全局拦截器统一提示，不再重复弹通用文案
    }
  }

  const openAuditEvidence = (inboundNo: string) => {
    navigate(`/logs?keyword=${encodeURIComponent(inboundNo)}`)
  }

  const sourceStockLimit = sourceLocationStock ?? selectedMaterial?.stock
  const selectedBatch = materialBatches.find(batch => batch.batchNo === form.batchNo)
  const fromLocation = locations.find(location => location.id === form.fromLocationId)
  const toLocation = locations.find(location => location.id === form.toLocationId)
  const transferUnit = selectedMaterial?.unit || ''
  const transferQuantityText = `${form.quantity || 0} ${transferUnit}`.trim()
  const showTransferPreview = Boolean(
    selectedMaterial &&
    form.quantity > 0 &&
    form.fromLocationId &&
    form.toLocationId &&
    form.fromLocationId !== form.toLocationId
  )
  const downstreamFacts = '库存、批次、库位、库存流水、审计记录'
  const transferValidationMessage = (() => {
    const validationError = validateTransferForm(form, selectedMaterial, sourceLocationStock, materialBatches)
    if (!validationError) return ''
    if (validationError.startsWith('调拨数量不能超过所选批次剩余量')) {
      return `${validationError}，请按实际可调拨数量修改。`
    }
    if (validationError.startsWith('调拨数量不能超过来源库位可用库存')) {
      return `${validationError}，请调整数量或来源库位。`
    }
    if (validationError === '请选择调拨批次') {
      return '请选择调拨批次，系统才能扣减正确批次并保留库存流水。'
    }
    if (validationError === '来源库位库存暂未确认，请重新选择来源库位或刷新后再调拨') {
      return '来源库位库存暂未确认，系统需要确认来源库位余额后才能调拨。'
    }
    if (validationError === '请填写物料、数量、来源库位和目标库位') {
      return '请先选择物料、数量、来源库位和目标库位。'
    }
    return validationError
  })()
  const canConfirmTransfer = !isSubmitting && !sourceStockLoading && !transferValidationMessage

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900">调拨管理</h1>
          <p className="text-sm text-gray-500 mt-1">记录和管理库位间物料调拨操作</p>
        </div>
        <button
          onClick={() => { fetchRefs(); setModalOpen(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium transition-all duration-150"
        >
          <ArrowRightLeft className="w-4 h-4" />
          调拨入库
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden">
        <form
          onSubmit={event => {
            event.preventDefault()
            handleSearch()
          }}
          className="flex flex-col sm:flex-row gap-3 px-4 py-4 border-b border-gray-200 bg-gray-50"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={keywordInput}
              onChange={event => setKeywordInput(event.target.value)}
              placeholder="搜索调拨单号/物料/批次/库位..."
              className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 h-10 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors"
            >
              <Search className="w-4 h-4" />
              查询
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 h-10 px-4 bg-white text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              重置
            </button>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">调拨单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物料</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">来源库位</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">目标库位</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">调拨时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && displayedData.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
              ) : displayedData.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                displayedData.map(row => {
                  const mat = materials.find(m => m.id === row.materialId)
                  const sourceLocationName = row.fromLocationName || (row.fromLocationId ? locationNameById.get(row.fromLocationId) : '') || '-'
                  const targetLocationName = row.toLocationName || (row.toLocationId ? locationNameById.get(row.toLocationId) : '') || row.toLocationId
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-4 py-3 font-mono text-gray-600">{row.inboundNo}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{mat?.name || row.materialName || row.materialId}</td>
                      <td className="px-4 py-3 text-right">{row.quantity} {mat?.unit}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">{sourceLocationName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">{targetLocationName}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{row.operator}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-500">{row.remark || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`审计证据 ${row.inboundNo}`}
                            onClick={() => openAuditEvidence(row.inboundNo)}
                            className="text-gray-400 hover:text-indigo-600 transition-colors"
                            title="审计证据"
                          >
                            <FileSearch className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openDelete(row)}
                            className="text-gray-400 hover:text-red-600 transition-colors"
                            title="撤销"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <span className="text-sm text-gray-500">共 {displayedTotal} 条记录</span>
          <Pagination page={page} pageSize={pageSize} total={displayedTotal} onChangePage={setPage} onChangePageSize={setPageSize} />
        </div>
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title="调拨入库登记" size="lg">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">物料 <span className="text-red-500">*</span></label>
              <SearchableSelect
                testId="transfer-material-select"
                value={form.materialId}
                onChange={handleMaterialChange}
                options={materials.map(m => ({
                  value: m.id,
                  label: `${m.name} (${m.code}) - 库存 ${m.stock} ${m.unit}${m.locationName ? ` / ${m.locationName}` : ''}`,
                }))}
                placeholder="请选择"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">数量 <span className="text-red-500">*</span></label>
                <input
                  data-testid="transfer-quantity-input"
                  type="number"
                  min={1}
                  max={sourceStockLimit || undefined}
                  value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {selectedMaterial && (
                  <p className="mt-1 text-xs text-gray-400">
                    {sourceStockLoading
                      ? '正在读取来源库位库存...'
                      : `来源库位可用：${sourceStockLimit ?? 0} ${selectedMaterial.unit} / 总库存：${selectedMaterial.stock} ${selectedMaterial.unit}`}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  调拨批次 {materialBatches.length > 0 && <span className="text-red-500">*</span>}
                </label>
                <SearchableSelect
                  testId="transfer-batch-no-select"
                  value={form.batchNo}
                  onChange={val => setForm({ ...form, batchNo: val })}
                  options={[
                    { value: '', label: '请选择批次' },
                    ...materialBatches.map(batch => ({
                      value: batch.batchNo,
                      label: `${batch.batchNo} (余${batch.remaining}${selectedMaterial?.unit || ''})`,
                    })),
                  ]}
                  placeholder="请选择批次"
                />
                {form.materialId && materialBatches.length === 0 && (
                  <p className="text-xs text-red-400 mt-1">该物料无可用批次，可保存无批次调拨</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">来源库位 <span className="text-red-500">*</span></label>
                <SearchableSelect
                  testId="transfer-from-location-select"
                  value={form.fromLocationId}
                  onChange={handleFromLocationChange}
                  options={locations.map(l => ({
                    value: l.id,
                    label: l.name,
                  }))}
                  placeholder="请选择"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标库位 <span className="text-red-500">*</span></label>
                <SearchableSelect
                  testId="transfer-to-location-select"
                  value={form.toLocationId}
                  onChange={val => setForm({ ...form, toLocationId: val })}
                  options={locations.filter(l => l.id !== form.fromLocationId).map(l => ({
                    value: l.id,
                    label: l.name,
                  }))}
                  placeholder="请选择"
                />
              </div>
            </div>
            {showTransferPreview && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900">调拨结果确认</h4>
                  <div className="text-xs text-gray-500 mt-0.5">确认后将接住：{downstreamFacts}</div>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: '物料', value: selectedMaterial?.name || '-' },
                    { label: '批次', value: selectedBatch?.batchNo || form.batchNo || '-' },
                    { label: '来源库位', value: fromLocation?.name || form.fromLocationId || '-' },
                    { label: '目标库位', value: toLocation?.name || form.toLocationId || '-' },
                    { label: '调拨数量', value: transferQuantityText || '-' },
                    { label: '来源动作', value: `来源调出 ${transferQuantityText}` },
                    { label: '目标动作', value: `目标调入 ${transferQuantityText}` },
                    {
                      label: '来源余量',
                      value: sourceLocationStock === null
                        ? '待确认'
                        : `${Math.max(0, sourceLocationStock - form.quantity)} ${transferUnit}`.trim(),
                    },
                  ].map(item => (
                    <div key={item.label} className="min-w-0">
                      <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                      <div className="text-sm font-medium text-gray-900 truncate">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {transferValidationMessage && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {transferValidationMessage}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                data-testid="transfer-remark-input"
                value={form.remark}
                onChange={e => setForm({ ...form, remark: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setModalOpen(false)} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button data-testid="transfer-confirm-btn" onClick={handleCreate} disabled={!canConfirmTransfer} className="px-4 h-10 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? '提交中...' : '确认调拨'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen && !!recordToDelete}
        title="确认撤销"
        description={`确定要撤销调拨记录 ${recordToDelete?.inboundNo} 吗？撤销后不会改变物料总库存，目标库位将调回来源库位，同步回滚批次库位余量，并写入库存流水和审计记录。`}
        confirmText="确认撤销"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteConfirmOpen(false); setRecordToDelete(null) }}
      />
    </div>
  )
}
