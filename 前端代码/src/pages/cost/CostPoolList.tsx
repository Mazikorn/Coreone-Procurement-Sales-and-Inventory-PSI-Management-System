import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface CostPool {
  id: string
  code: string
  name: string
  costType: string
  allocationMethod: string
  totalAmount: number
  description: string
  status: string
  createdAt: string
}

const COST_TYPES = [
  { value: 'material', label: '物料成本' },
  { value: 'labor', label: '人工成本' },
  { value: 'equipment', label: '设备成本' },
  { value: 'indirect', label: '间接成本' },
]

export function CostPoolList() {
  const [pools, setPools] = useState<CostPool[]>([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ code: '', name: '', costType: 'material', allocationMethod: 'direct', totalAmount: 0, description: '' })
  const [deleteTarget, setDeleteTarget] = useState<CostPool | null>(null)

  useEffect(() => {
    // 模拟加载
    setTimeout(() => { setPools([]); setLoading(false) }, 300)
  }, [])

  const handleSave = () => {
    if (!form.code || !form.name) { toast.error('请填写编码和名称'); return }
    toast.success(editingId ? '修改成功' : '创建成功')
    setShowDialog(false)
    setEditingId(null)
  }

  const handleDelete = () => {
    toast.success('删除成功')
    setShowDeleteConfirm(false)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">成本池管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理 ABC 成本池配置</p>
        </div>
        <button onClick={() => { setForm({ code: '', name: '', costType: 'material', allocationMethod: 'direct', totalAmount: 0, description: '' }); setEditingId(null); setShowDialog(true) }} className="h-10 px-4 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> 新增成本池
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="搜索成本池..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">编码</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">成本类型</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">总金额</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 w-32">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">加载中...</td></tr>
              ) : pools.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">暂无成本池数据</td></tr>
              ) : pools.map(pool => (
                <tr key={pool.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-900">{pool.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{pool.name}</td>
                  <td className="px-4 py-3 text-gray-600">{COST_TYPES.find(t => t.value === pool.costType)?.label || pool.costType}</td>
                  <td className="px-4 py-3 text-right text-gray-900">¥{pool.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => { setForm({ code: pool.code, name: pool.name, costType: pool.costType, allocationMethod: pool.allocationMethod, totalAmount: pool.totalAmount, description: pool.description }); setEditingId(pool.id); setShowDialog(true) }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="编辑"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { setDeleteTarget(pool); setShowDeleteConfirm(true) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="删除"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showDialog && (
        <Modal onClose={() => setShowDialog(false)} title={editingId ? '编辑成本池' : '新增成本池'}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">编码</label><input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">名称</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500" /></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">成本类型</label><select value={form.costType} onChange={e => setForm({ ...form, costType: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500">{COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setShowDialog(false)} className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button onClick={handleSave} className="h-10 px-4 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors">确认</button>
          </div>
        </Modal>
      )}

      {showDeleteConfirm && deleteTarget && (
        <ConfirmDialog open={showDeleteConfirm} title="确认删除" description={`确定要删除成本池「${deleteTarget.name}」吗？此操作不可撤销。`} confirmText="确认删除" confirmVariant="danger" onConfirm={handleDelete} onCancel={() => { setShowDeleteConfirm(false); setDeleteTarget(null) }} />
      )}
    </div>
  )
}
