import { toast } from 'sonner'

interface DepletionItem {
  id: string
  materialName: string
  batch: string
  totalQty: number
  remaining: number
  unit: string
}

interface Props {
  open: boolean
  item: DepletionItem | null
  remainValue: string
  reason: string
  onClose: () => void
  onChangeValue: (v: string) => void
  onChangeReason: (v: string) => void
}

export function EditRemainModal({ open, item, remainValue, reason, onClose, onChangeValue, onChangeReason }: Props) {
  if (!open || !item) return null

  const used = item.totalQty - item.remaining

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">修改预计剩余量</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-5">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-[13px] text-gray-500 mb-1">当前物料</div>
            <div className="font-semibold text-gray-900">{item.materialName}（{item.batch}）</div>
            <div className="text-xs text-gray-500 mt-1">
              {item.totalQty}{item.unit} · 已用 {used}{item.unit} · 当前预计剩余约 {item.remaining}{item.unit}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">调整后预计剩余 <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input
                type="number"
                value={remainValue}
                onChange={e => onChangeValue(e.target.value)}
                className="flex-1 h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 transition-all duration-150 ease"
              />
              <select className="w-24 h-10 px-2 border border-gray-300 rounded-md text-sm bg-white">
                <option>ml</option><option>μl</option><option>g</option><option>mg</option>
              </select>
            </div>
            <div className="text-xs text-gray-500 mt-1">修改后将重新计算消耗进度，但不会标记为耗尽</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">修改原因（可选）</label>
            <textarea
              value={reason}
              onChange={e => onChangeReason(e.target.value)}
              rows={2}
              placeholder="如：复染次数增加、稀释比例调整等"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 transition-all duration-150 ease resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-all duration-150 ease">取消</button>
          <button
            onClick={() => { toast.success('预计剩余量已更新'); onClose() }}
            className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-all duration-150 ease shadow-sm"
          >
            保存修改
          </button>
        </div>
      </div>
    </div>
  )
}
