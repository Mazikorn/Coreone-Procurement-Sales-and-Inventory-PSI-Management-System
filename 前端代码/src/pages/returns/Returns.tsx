import { useCallback, useEffect, useState } from 'react'
import { Plus, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { returnApi } from '@/api/inventory'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { usePagination } from '@/hooks/usePagination'
import { formatDate } from '@/lib/utils'
import type { ReturnRecord, ReturnSource } from '@/types'

const reasonOptions = [
  { value: 'wrong_material', label: '错领退库' },
  { value: 'unused', label: '未使用退回' },
  { value: 'project_cancelled', label: '项目取消' },
  { value: 'inventory_correction', label: '库存调整' },
  { value: 'other', label: '其他原因' },
]

export default function Returns() {
  const initialKeyword = new URLSearchParams(window.location.search).get('keyword') || ''
  const [returnSources, setReturnSources] = useState<ReturnSource[]>([])
  const [keywordInput, setKeywordInput] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<ReturnRecord | null>(null)
  const [form, setForm] = useState({
    outboundItemId: '',
    quantity: 1,
    reason: '',
    remark: '',
  })

  const loadReturnSources = useCallback(async () => {
    try {
      const res = await returnApi.getSources({ page: 1, pageSize: 999 })
      setReturnSources(res?.list || [])
    } catch (e) {
      console.error(e)
      setReturnSources([])
    }
  }, [])

  useEffect(() => {
    loadReturnSources()
  }, [loadReturnSources])

  const {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<ReturnRecord>({
    fetchFn: async params => {
      const res = await returnApi.getList({ ...params, keyword: keyword || undefined })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    initialPage: 1,
    initialPageSize: 20,
    deps: [keyword],
  })

  const selectedSource = returnSources.find(source => source.outboundItemId === form.outboundItemId)
  const maxQuantity = Number(selectedSource?.returnableQuantity || 0)

  const openCreate = () => {
    loadReturnSources()
    setForm({ outboundItemId: '', quantity: 1, reason: '', remark: '' })
    setModalOpen(true)
  }

  const handleSourceChange = (value: string) => {
    setForm({ ...form, outboundItemId: value, quantity: 1 })
  }

  const handleSearch = () => {
    setKeyword(keywordInput.trim())
    setPage(1)
  }

  const handleReset = () => {
    setKeywordInput('')
    setKeyword('')
    setPage(1)
  }

  const handleCreate = async () => {
    if (!form.outboundItemId || form.quantity <= 0 || !form.reason) {
      toast.error('请选择来源出库明细、填写数量和退库原因')
      return
    }
    if (!selectedSource) {
      toast.error('来源出库明细不可用，请刷新后重试')
      return
    }
    if (form.quantity > maxQuantity) {
      toast.error(`退库数量不能超过可退数量 ${maxQuantity} ${selectedSource.unit || ''}`)
      return
    }

    setSubmitting(true)
    try {
      await returnApi.create(form)
      toast.success('退库登记成功')
      setModalOpen(false)
      setForm({ outboundItemId: '', quantity: 1, reason: '', remark: '' })
      refresh()
      loadReturnSources()
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.message || '退库登记失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      await returnApi.delete(cancelTarget.id)
      toast.success('退库记录已撤销')
      setCancelTarget(null)
      refresh()
      loadReturnSources()
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.message || '撤销失败')
    }
  }

  const getReasonLabel = (reason: string) => reasonOptions.find(item => item.value === reason)?.label || reason

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900">退库管理</h1>
          <p className="mt-1 text-sm text-gray-500">登记已出库物料退回并自动恢复库存，撤销后反向扣回</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-500 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" />
          退库登记
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={keywordInput}
              onChange={event => setKeywordInput(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && handleSearch()}
              placeholder="搜索退库单号/物料/原因..."
              className="h-10 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10"
            />
          </div>
          <button onClick={handleSearch} className="h-10 rounded-md bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-600">
            查询
          </button>
          <button onClick={handleReset} className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            重置
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">退库单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">来源出库</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">物料</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">批次</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">数量</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">原因</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">操作人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">备注</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">加载中...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">暂无退库记录</td></tr>
              ) : (
                data.map(row => (
                  <tr key={row.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700">{row.returnNo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.outboundNo || '-'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.materialName || row.materialId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.batchNo || '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{row.quantity} {row.unit}</td>
                    <td className="px-4 py-3"><span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{getReasonLabel(row.reason)}</span></td>
                    <td className="px-4 py-3 text-gray-600">{row.operator}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(row.createdAt)}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-gray-500">{row.remark || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setCancelTarget(row)}
                        className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                      >
                        <RotateCcw className="h-4 w-4" />
                        撤销
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <span className="text-sm text-gray-500">共 {total} 条记录</span>
          <Pagination page={page} pageSize={pageSize} total={total} onChangePage={setPage} onChangePageSize={setPageSize} />
        </div>
      </div>

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title="退库登记" size="lg">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">来源出库明细 <span className="text-red-500">*</span></label>
              <SearchableSelect
                testId="return-source-select"
                value={form.outboundItemId}
                onChange={handleSourceChange}
                options={returnSources.map(source => ({
                  value: source.outboundItemId,
                  label: `${source.outboundNo} | ${source.materialName || source.materialId} | ${source.batchNo || '无批次'} | 可退 ${source.returnableQuantity} ${source.unit || ''}`,
                  disabled: Number(source.returnableQuantity || 0) <= 0,
                }))}
                placeholder="请选择已出库且仍可退的明细"
              />
            </div>

            {selectedSource && (
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <div>物料: {selectedSource.materialName || selectedSource.materialId}</div>
                <div>批次: {selectedSource.batchNo || '-'}</div>
                <div>可退数量: {selectedSource.returnableQuantity} {selectedSource.unit || ''}</div>
                <div>原出库单价: ¥{Number(selectedSource.unitCost || 0).toFixed(2)}</div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">退库数量 <span className="text-red-500">*</span></label>
              <input
                data-testid="return-quantity-input"
                type="number"
                min={0.01}
                step={0.01}
                max={maxQuantity || undefined}
                value={form.quantity}
                onChange={event => setForm({ ...form, quantity: Number(event.target.value) })}
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10"
              />
              {selectedSource && (
                <p className="mt-1 text-xs text-gray-400">可退数量：{selectedSource.returnableQuantity} {selectedSource.unit || ''}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">退库原因 <span className="text-red-500">*</span></label>
              <SearchableSelect
                testId="return-reason-select"
                value={form.reason}
                onChange={value => setForm({ ...form, reason: value })}
                options={reasonOptions}
                placeholder="请选择原因"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
              <textarea
                value={form.remark}
                onChange={event => setForm({ ...form, remark: event.target.value })}
                rows={3}
                className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10"
              />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <button onClick={() => setModalOpen(false)} className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-600 hover:bg-gray-50">
              取消
            </button>
            <button data-testid="return-confirm-btn" onClick={handleCreate} disabled={submitting} className="h-10 rounded-md bg-blue-500 px-4 text-sm text-white hover:bg-blue-600 disabled:opacity-50">
              {submitting ? '提交中...' : '确认退库'}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        title="撤销退库记录"
        description={`确定要撤销退库记录 ${cancelTarget?.returnNo} 吗？撤销后将扣回本次退库恢复的库存。`}
        confirmText="确认撤销"
        confirmVariant="danger"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  )
}
