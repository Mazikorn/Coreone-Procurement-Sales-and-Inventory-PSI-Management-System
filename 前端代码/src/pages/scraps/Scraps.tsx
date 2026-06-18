import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { scrapApi } from '@/api/inventory'
import { materialApi } from '@/api/master'
import type { Batch, ScrapRecord, Material } from '@/types'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'

const reasonOptions = [
  { value: 'expired', label: '过期报废' },
  { value: 'damaged', label: '破损报废' },
  { value: 'quality_issue', label: '质量问题' },
  { value: 'obsolete', label: '淘汰/停用' },
  { value: 'other', label: '其他原因' },
]

export default function Scraps() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<ScrapRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [batches, setBatches] = useState<Batch[]>([])
  const [form, setForm] = useState({
    materialId: '',
    batchId: '',
    quantity: 1,
    reason: '',
    remark: '',
  })

  const fetchRefs = async () => {
    try {
      const res: any = await materialApi.getList({ page: 1, pageSize: 999, status: 'active' })
      setMaterials(res?.list || [])
    } catch (e) { console.error(e) }
  }

  const fetchBatches = async (materialId: string) => {
    if (!materialId) {
      setBatches([])
      return
    }
    try {
      const detail = await materialApi.getDetail(materialId)
      setBatches((detail?.batches || []).filter(batch => Number(batch.remaining || 0) > 0 && (batch.status as string) === 'normal'))
    } catch (e) {
      console.error(e)
      setBatches([])
    }
  }

  useEffect(() => { fetchRefs() }, [])

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res: any = await scrapApi.getList({ page, pageSize })
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
  } = usePagination<ScrapRecord>({
    fetchFn,
    deps: [],
  })

  const selectedMaterial = materials.find(m => m.id === form.materialId)
  const selectedBatch = batches.find(batch => batch.id === form.batchId)
  const maxQuantity = selectedBatch ? Number(selectedBatch.remaining || 0) : Number(selectedMaterial?.stock || 0)

  const openCreate = () => {
    fetchRefs()
    setBatches([])
    setForm({ materialId: '', batchId: '', quantity: 1, reason: '', remark: '' })
    setModalOpen(true)
  }

  const handleMaterialChange = (value: string) => {
    setForm({ ...form, materialId: value, batchId: '', quantity: 1 })
    fetchBatches(value)
  }

  const handleCreate = async () => {
    if (!form.materialId || form.quantity <= 0 || !form.reason) {
      toast.error('请填写物料、数量和报废原因')
      return
    }
    if (selectedMaterial && form.quantity > selectedMaterial.stock) {
      toast.error(`报废数量不能超过当前库存 ${selectedMaterial.stock} ${selectedMaterial.unit}`)
      return
    }
    if (batches.length > 0 && !form.batchId) {
      toast.error('请选择报废批次')
      return
    }
    if (maxQuantity > 0 && form.quantity > maxQuantity) {
      toast.error(`报废数量不能超过批次剩余 ${maxQuantity} ${selectedMaterial?.unit || ''}`)
      return
    }
    setIsSubmitting(true)
    try {
      await scrapApi.create(form)
      toast.success('报废登记成功')
      setModalOpen(false)
      setBatches([])
      setForm({ materialId: '', batchId: '', quantity: 1, reason: '', remark: '' })
      refresh()
      fetchRefs()
    } catch (e) {
      toast.error('报废登记失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openDelete = (row: ScrapRecord) => {
    setRecordToDelete(row)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!recordToDelete) return
    try {
      await scrapApi.delete(recordToDelete.id)
      toast.success('报废记录已撤销')
      setDeleteConfirmOpen(false)
      setRecordToDelete(null)
      refresh()
    } catch (e) {
      toast.error('撤销失败')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900">报废管理</h1>
          <p className="text-sm text-gray-500 mt-1">记录和处理物料报废操作</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm font-medium transition-all duration-150"
        >
          <Trash2 className="w-4 h-4" />
          报废登记
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">报废单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物料</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批次</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">报废原因</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">报废时间</th>
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
                  const reasonLabel = reasonOptions.find(r => r.value === row.reason)?.label || row.reason
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-4 py-3 font-mono text-gray-600">{row.scrapNo}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{mat?.name || row.materialName || row.materialId}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.batchNo || '-'}</td>
                      <td className="px-4 py-3 text-right">{row.quantity} {mat?.unit || row.unit}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-red-50 text-red-700">{reasonLabel}</span>
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
        <Modal onClose={() => setModalOpen(false)} title="报废登记" size="lg">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">物料 <span className="text-red-500">*</span></label>
              <SearchableSelect
                testId="scrap-material-select"
                value={form.materialId}
                onChange={handleMaterialChange}
                options={materials.map(m => ({
                  value: m.id,
                  label: `${m.name} (${m.code}) - 库存 ${m.stock} ${m.unit}`,
                }))}
                placeholder="请选择"
              />
            </div>
            {selectedMaterial && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">报废批次 <span className="text-red-500">*</span></label>
                <SearchableSelect
                  testId="scrap-batch-select"
                  value={form.batchId}
                  onChange={val => setForm({ ...form, batchId: val, quantity: 1 })}
                  options={batches.map(batch => ({
                    value: batch.id,
                    label: `${batch.batchNo} (余${batch.remaining}${selectedMaterial.unit} @¥${Number(batch.inboundPrice || 0).toFixed(2)})`,
                    disabled: Number(batch.remaining || 0) <= 0,
                  }))}
                  placeholder={batches.length > 0 ? '请选择批次' : '当前物料暂无可用批次'}
                  disabled={batches.length === 0}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">报废数量 <span className="text-red-500">*</span></label>
              <input
                data-testid="scrap-quantity-input"
                type="number"
                min={1}
                max={maxQuantity || undefined}
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {selectedMaterial && (
                <p className="text-xs text-gray-400 mt-1">
                  {selectedBatch
                    ? `批次剩余：${selectedBatch.remaining} ${selectedMaterial.unit}`
                    : `当前库存：${selectedMaterial.stock} ${selectedMaterial.unit}`}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">报废原因 <span className="text-red-500">*</span></label>
              <SearchableSelect
                testId="scrap-reason-select"
                value={form.reason}
                onChange={val => setForm({ ...form, reason: val })}
                options={[
                  { value: '', label: '请选择' },
                  ...reasonOptions,
                ]}
                placeholder="请选择"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                value={form.remark}
                onChange={e => setForm({ ...form, remark: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setModalOpen(false)} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button data-testid="scrap-confirm-btn" onClick={handleCreate} disabled={isSubmitting} className="px-4 h-10 text-sm text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? '提交中...' : '确认报废'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen && !!recordToDelete}
        title="确认撤销"
        description={`确定要撤销报废记录 ${recordToDelete?.scrapNo} 吗？撤销后库存将自动回滚。`}
        confirmText="确认撤销"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteConfirmOpen(false); setRecordToDelete(null) }}
      />
    </div>
  )
}
