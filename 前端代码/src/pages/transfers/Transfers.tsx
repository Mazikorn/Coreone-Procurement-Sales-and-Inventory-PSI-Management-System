import { useState, useEffect, useCallback } from 'react'
import { ArrowRightLeft, Trash2 } from 'lucide-react'
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

  const stockLimit = sourceLocationStock ?? selectedMaterial.stock
  if (form.quantity > stockLimit) {
    return `调拨数量不能超过来源库位可用库存 ${stockLimit} ${selectedMaterial.unit}`
  }
  if (form.quantity > selectedMaterial.stock) {
    return `调拨数量不能超过当前库存 ${selectedMaterial.stock} ${selectedMaterial.unit}`
  }

  return null
}

export default function Transfers() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<TransferRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sourceLocationStock, setSourceLocationStock] = useState<number | null>(null)
  const [sourceStockLoading, setSourceStockLoading] = useState(false)
  const [materialBatches, setMaterialBatches] = useState<Batch[]>([])
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

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res: any = await transferApi.getList({ page, pageSize })
      return { list: res.list || [], pagination: res.pagination }
    },
    []
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
    deps: [],
  })

  const selectedMaterial = materials.find(m => m.id === form.materialId)
  const locationNameById = new Map(locations.map(location => [location.id, location.name]))

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
      await transferApi.createInbound(form)
      toast.success('调拨入库登记成功')
      setModalOpen(false)
      setForm({ materialId: '', batchNo: '', quantity: 1, fromLocationId: '', toLocationId: '', remark: '' })
      setMaterialBatches([])
      refresh()
    } catch (e) {
      toast.error((e as any)?.response?.data?.message || '调拨登记失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openDelete = (row: TransferRecord) => {
    setRecordToDelete(row)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!recordToDelete) return
    try {
      await transferApi.delete(recordToDelete.id)
      toast.success('调拨记录已撤销')
      setDeleteConfirmOpen(false)
      setRecordToDelete(null)
      refresh()
    } catch (e) {
      toast.error('撤销失败')
    }
  }

  const sourceStockLimit = sourceLocationStock ?? selectedMaterial?.stock

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
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                data.map(row => {
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
                        <button
                          onClick={() => openDelete(row)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="撤销"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <span className="text-sm text-gray-500">共 {total} 条记录</span>
          <Pagination page={page} pageSize={pageSize} total={total} onChangePage={setPage} onChangePageSize={setPageSize} />
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
            <button data-testid="transfer-confirm-btn" onClick={handleCreate} disabled={isSubmitting || sourceStockLoading} className="px-4 h-10 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? '提交中...' : '确认调拨'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen && !!recordToDelete}
        title="确认撤销"
        description={`确定要撤销调拨记录 ${recordToDelete?.inboundNo} 吗？撤销后库存将自动回滚。`}
        confirmText="确认撤销"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteConfirmOpen(false); setRecordToDelete(null) }}
      />
    </div>
  )
}
