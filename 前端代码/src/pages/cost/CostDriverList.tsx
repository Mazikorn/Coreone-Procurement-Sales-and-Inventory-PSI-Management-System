import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface CostDriver {
  id: string
  code: string
  name: string
  unit: string
  calculationMethod: string
  tierRules: any[] | null
  description: string
  status: string
  createdAt: string
}

const CALCULATION_METHODS = [
  { value: 'linear', label: '线性' },
  { value: 'tiered', label: '阶梯' },
  { value: 'fixed', label: '固定' },
]

export function CostDriverList() {
  const [costDrivers, setCostDrivers] = useState<CostDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingDriver, setEditingDriver] = useState<CostDriver | null>(null)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    unit: '',
    calculationMethod: 'linear',
    description: '',
  })

  useEffect(() => {
    loadCostDrivers()
  }, [])

  const loadCostDrivers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/abc/cost-drivers', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      })
      const data = await response.json()
      if (data.success) {
        setCostDrivers(data.data?.list || data.data?.items || data.data || [])
      }
    } catch (error) {
      console.error('Failed to load cost drivers:', error)
      toast.error('加载成本动因失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingDriver(null)
    setFormData({ code: '', name: '', unit: '', calculationMethod: 'linear', description: '' })
    setShowDialog(true)
  }

  const handleEdit = (driver: CostDriver) => {
    setEditingDriver(driver)
    setFormData({
      code: driver.code,
      name: driver.name,
      unit: driver.unit,
      calculationMethod: driver.calculationMethod,
      description: driver.description || '',
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!formData.code || !formData.name || !formData.unit) {
      toast.error('请填写必填字段')
      return
    }

    try {
      const url = editingDriver
        ? `/api/v1/abc/cost-drivers/${editingDriver.id}`
        : '/api/v1/abc/cost-drivers'

      const response = await fetch(url, {
        method: editingDriver ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      if (data.success) {
        toast.success(editingDriver ? '更新成功' : '创建成功')
        setShowDialog(false)
        loadCostDrivers()
      } else {
        toast.error(data.error?.message || '操作失败')
      }
    } catch (error) {
      console.error('Failed to save cost driver:', error)
      toast.error('保存失败')
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeletingId(id)
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) return

    try {
      const response = await fetch(`/api/v1/abc/cost-drivers/${deletingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      })

      const data = await response.json()
      if (data.success) {
        toast.success('删除成功')
        loadCostDrivers()
      } else {
        toast.error(data.error?.message || '删除失败')
      }
    } catch (error) {
      console.error('Failed to delete cost driver:', error)
      toast.error('删除失败')
    } finally {
      setShowDeleteConfirm(false)
      setDeletingId(null)
    }
  }

  const filteredDrivers = costDrivers.filter(driver =>
    driver.name.includes(searchKeyword) ||
    driver.code.includes(searchKeyword) ||
    driver.description?.includes(searchKeyword)
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">成本动因管理</h1>
          <p className="text-sm text-gray-500 mt-1">配置 ABC 作业成本法的成本动因</p>
        </div>
        <button
          onClick={handleAdd}
          className="h-10 px-4 bg-[#3b82f6] text-white rounded-md hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          新增成本动因
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="搜索成本动因..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full h-10 pl-10 pr-4 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">单位</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">计算方法</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">描述</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">加载中...</td>
              </tr>
            ) : filteredDrivers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">暂无数据</td>
              </tr>
            ) : (
              filteredDrivers.map(driver => (
                <tr key={driver.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{driver.code}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{driver.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{driver.unit}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {CALCULATION_METHODS.find(m => m.value === driver.calculationMethod)?.label || driver.calculationMethod}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{driver.description || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      driver.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {driver.status === 'active' ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleEdit(driver)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="编辑">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDeleteClick(driver.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors ml-1" title="删除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <Modal onClose={() => setShowDialog(false)} title={editingDriver ? '编辑成本动因' : '新增成本动因'}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">代码 *</label>
              <input type="text" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="例如：slide_count" disabled={!!editingDriver} className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 disabled:bg-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="例如：切片数" className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">单位 *</label>
              <input type="text" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} placeholder="例如：张、个、次" className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">计算方法</label>
              <select value={formData.calculationMethod} onChange={(e) => setFormData({ ...formData, calculationMethod: e.target.value })} className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500">
                {CALCULATION_METHODS.map(method => (
                  <option key={method.value} value={method.value}>{method.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="成本动因的详细描述" rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setShowDialog(false)} className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button onClick={handleSave} className="h-10 px-4 text-sm text-white bg-[#3b82f6] rounded-md hover:bg-blue-600 transition-colors">{editingDriver ? '更新' : '创建'}</button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="确认删除"
        description="确定要删除此成本动因吗？删除后无法恢复。"
        confirmText="确认删除"
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setShowDeleteConfirm(false); setDeletingId(null) }}
      />
    </div>
  )
}
