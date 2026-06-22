import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, RotateCcw, Search, Trash2, XCircle } from 'lucide-react'
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
  { value: 'spoiled', label: '变质报废' },
  { value: 'obsolete', label: '淘汰/停用' },
  { value: 'other', label: '其他原因' },
]

export const HIGH_VALUE_SCRAP_AMOUNT_THRESHOLD = 1000

export function getScrapAmount(material: Pick<Material, 'price'> | undefined, quantity: number) {
  return Number(((Number(material?.price || 0)) * Number(quantity || 0)).toFixed(2))
}

export function requiresScrapReview(material: Pick<Material, 'price'> | undefined, quantity: number) {
  return getScrapAmount(material, quantity) >= HIGH_VALUE_SCRAP_AMOUNT_THRESHOLD
}

const reviewStatusMeta = {
  not_required: { label: '无需复核', className: 'bg-gray-100 text-gray-600' },
  pending: { label: '待复核', className: 'bg-amber-50 text-amber-700' },
  approved: { label: '复核通过', className: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '已驳回', className: 'bg-red-50 text-red-700' },
}

export default function Scraps() {
  const initialKeyword = new URLSearchParams(window.location.search).get('keyword') || ''
  const [materials, setMaterials] = useState<Material[]>([])
  const [keywordInput, setKeywordInput] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<ScrapRecord | null>(null)
  const [reviewRecord, setReviewRecord] = useState<ScrapRecord | null>(null)
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved')
  const [reviewReason, setReviewReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [batches, setBatches] = useState<Batch[]>([])
  const [form, setForm] = useState({
    materialId: '',
    batchId: '',
    quantity: 1,
    reason: '',
    responsiblePerson: '',
    responsibleDepartment: '',
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
      const res: any = await scrapApi.getList({
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
  } = usePagination<ScrapRecord>({
    fetchFn,
    deps: [keyword],
  })

  const selectedMaterial = materials.find(m => m.id === form.materialId)
  const selectedBatch = batches.find(batch => batch.id === form.batchId)
  const maxQuantity = selectedBatch ? Number(selectedBatch.remaining || 0) : Number(selectedMaterial?.stock || 0)
  const scrapAmount = getScrapAmount(selectedMaterial, form.quantity)
  const needsReview = requiresScrapReview(selectedMaterial, form.quantity)

  const openCreate = () => {
    fetchRefs()
    setBatches([])
    setForm({ materialId: '', batchId: '', quantity: 1, reason: '', responsiblePerson: '', responsibleDepartment: '', remark: '' })
    setModalOpen(true)
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
    if (needsReview && (!form.responsiblePerson.trim() || !form.responsibleDepartment.trim())) {
      toast.error('高价值报废必须填写责任人和责任部门')
      return
    }
    setIsSubmitting(true)
    try {
      const result: any = await scrapApi.create({
        ...form,
        responsiblePerson: form.responsiblePerson.trim() || undefined,
        responsibleDepartment: form.responsibleDepartment.trim() || undefined,
        remark: form.remark.trim() || undefined,
      })
      toast.success(result?.reviewStatus === 'pending' ? '报废已登记，待复核' : '报废登记成功')
      setModalOpen(false)
      setBatches([])
      setForm({ materialId: '', batchId: '', quantity: 1, reason: '', responsiblePerson: '', responsibleDepartment: '', remark: '' })
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

  const openReview = (row: ScrapRecord, action: 'approved' | 'rejected') => {
    setReviewRecord(row)
    setReviewAction(action)
    setReviewReason('')
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

  const handleReview = async () => {
    if (!reviewRecord) return
    if (reviewAction === 'rejected' && !reviewReason.trim()) {
      toast.error('驳回复核必须填写原因')
      return
    }
    try {
      await scrapApi.review(reviewRecord.id, {
        status: reviewAction,
        reason: reviewReason.trim() || undefined,
      })
      toast.success(reviewAction === 'approved' ? '报废复核已通过' : '报废已驳回并恢复库存')
      setReviewRecord(null)
      setReviewReason('')
      refresh()
      fetchRefs()
    } catch (e) {
      toast.error('复核失败')
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
              placeholder="搜索报废单号/物料/批次/责任人..."
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">报废单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物料</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批次</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">报废原因</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">责任归属</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">损耗金额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">复核状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">报废时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                data.map(row => {
                  const mat = materials.find(m => m.id === row.materialId)
                  const reasonLabel = reasonOptions.find(r => r.value === row.reason)?.label || row.reason
                  const statusMeta = reviewStatusMeta[row.reviewStatus || 'not_required']
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-4 py-3 font-mono text-gray-600">{row.scrapNo}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{mat?.name || row.materialName || row.materialId}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.batchNo || '-'}</td>
                      <td className="px-4 py-3 text-right">{row.quantity} {mat?.unit || row.unit}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-red-50 text-red-700">{reasonLabel}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {row.responsiblePerson || row.responsibleDepartment ? (
                          <div className="space-y-0.5">
                            <div>{row.responsiblePerson || '-'}</div>
                            <div className="text-xs text-gray-400">{row.responsibleDepartment || '-'}</div>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {row.scrapAmount ? `¥${Number(row.scrapAmount).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${statusMeta.className}`}>{statusMeta.label}</span>
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
                        {row.reviewStatus === 'pending' && (
                          <div className="inline-flex items-center gap-2 ml-3">
                            <button
                              onClick={() => openReview(row, 'approved')}
                              className="text-gray-400 hover:text-emerald-600 transition-colors"
                              title="复核通过"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openReview(row, 'rejected')}
                              className="text-gray-400 hover:text-red-600 transition-colors"
                              title="驳回"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
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
            {selectedMaterial && (
              <div className={needsReview ? 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2' : 'rounded-md border border-gray-200 bg-gray-50 px-3 py-2'}>
                <p className={`text-sm ${needsReview ? 'text-amber-800' : 'text-gray-600'}`}>
                  预计损耗金额：¥{scrapAmount.toFixed(2)}
                  {needsReview ? '，达到高价值报废标准，提交后进入待复核。' : '，提交后直接完成报废登记。'}
                </p>
              </div>
            )}
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
            {needsReview && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">责任人 <span className="text-red-500">*</span></label>
                  <input
                    value={form.responsiblePerson}
                    onChange={e => setForm({ ...form, responsiblePerson: e.target.value })}
                    placeholder="填写本次损耗责任人"
                    className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">责任部门 <span className="text-red-500">*</span></label>
                  <input
                    value={form.responsibleDepartment}
                    onChange={e => setForm({ ...form, responsibleDepartment: e.target.value })}
                    placeholder="填写责任部门"
                    className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
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

      {reviewRecord && (
        <Modal
          onClose={() => setReviewRecord(null)}
          title={reviewAction === 'approved' ? '复核通过报废' : '驳回报废复核'}
          size="md"
        >
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {reviewRecord.scrapNo} · {reviewRecord.materialName || reviewRecord.materialId} ·
              {reviewRecord.quantity} {reviewRecord.unit || ''} ·
              损耗 ¥{Number(reviewRecord.scrapAmount || 0).toFixed(2)}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                复核意见 {reviewAction === 'rejected' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={reviewReason}
                onChange={e => setReviewReason(e.target.value)}
                rows={3}
                placeholder={reviewAction === 'approved' ? '例如：责任归属清楚，批准入账' : '例如：责任说明不足，退回重填'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setReviewRecord(null)} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button
              onClick={handleReview}
              className={`px-4 h-10 text-sm text-white rounded-md transition-colors ${reviewAction === 'approved' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}
            >
              确认{reviewAction === 'approved' ? '通过' : '驳回'}
            </button>
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
