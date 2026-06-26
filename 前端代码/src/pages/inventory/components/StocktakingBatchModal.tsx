import React, { useState } from 'react'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { stocktakingApi } from '@/api/stocktaking'
import type { Material } from '@/types'

interface BatchRow {
  materialId: string
  actualStock: string
}

interface Props {
  open: boolean
  materials: Material[]
  onClose: () => void
  onSubmitted: () => void
}

// P1-04：批量盘点弹窗——一次为多物料填实盘数并提交（共享盘点单号），解决"一物一单、无法周期全仓盘点"。
export function StocktakingBatchModal({ open, materials, onClose, onSubmitted }: Props) {
  const [rows, setRows] = useState<BatchRow[]>([{ materialId: '', actualStock: '' }])
  const [submitting, setSubmitting] = useState(false)
  if (!open) return null

  const setRow = (i: number, patch: Partial<BatchRow>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows([...rows, { materialId: '', actualStock: '' }])
  const removeRow = (i: number) => setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows)

  const validRows = rows.filter(
    (r) => r.materialId && r.actualStock !== '' && Number.isFinite(Number(r.actualStock)) && Number(r.actualStock) >= 0,
  )

  const handleSubmit = async () => {
    if (validRows.length === 0) {
      toast.error('请至少填写一行有效的物料与实盘数')
      return
    }
    const ids = validRows.map((r) => r.materialId)
    if (new Set(ids).size !== ids.length) {
      toast.error('存在重复物料，请合并为一行')
      return
    }
    try {
      setSubmitting(true)
      const res: any = await stocktakingApi.createBatch({
        items: validRows.map((r) => ({ materialId: r.materialId, actualStock: Number(r.actualStock) })),
      })
      toast.success(`批量盘点已创建（${res?.count ?? validRows.length} 项，盘点单 ${res?.sheetNo || ''}）`)
      setRows([{ materialId: '', actualStock: '' }])
      onSubmitted()
      onClose()
    } catch {
      // 全局拦截器已提示后端错误
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-xl bg-white shadow-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">批量盘点</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 transition-colors" aria-label="关闭弹窗">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <p className="mb-3 text-xs text-gray-500">一次为多个物料填写实盘数并提交，系统按各自当前账面计算差异，共享一个盘点单号便于回看。</p>
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-32">实盘数</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-12">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <SearchableSelect
                        value={r.materialId}
                        onChange={(val) => setRow(idx, { materialId: val })}
                        options={materials.map((m) => ({ value: m.id, label: `${m.code} - ${m.name}` }))}
                        placeholder="选择物料"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={r.actualStock}
                        onChange={(e) => setRow(idx, { actualStock: e.target.value })}
                        className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[2px] focus:ring-blue-500/10 focus:border-blue-500"
                        placeholder="实盘数量"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => removeRow(idx)}
                        className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                        aria-label="删除行"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={addRow}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md border border-blue-200 transition-colors"
          >
            <Plus className="w-4 h-4" />添加物料行
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500">有效行 {validRows.length} / {rows.length}</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="h-10 px-4 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || validRows.length === 0}
              className="h-10 px-4 inline-flex items-center gap-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              提交批量盘点
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
