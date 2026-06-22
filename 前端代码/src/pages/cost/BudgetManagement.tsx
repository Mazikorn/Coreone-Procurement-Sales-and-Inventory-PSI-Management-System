import React, { useState, useEffect } from 'react'
import { Plus, Search, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { abcApi } from '@/api/abc'
import { Modal } from '@/components/ui/Modal'

interface Budget {
  id: string
  yearMonth: string
  category: string
  budgetAmount: number
  actualAmount: number
  executionRate?: number
  status?: string
  description?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  total: '总预算',
  material: '材料成本',
  labor: '人工成本',
  equipment: '设备折旧',
  qc: '质控成本',
  indirect: '间接成本',
}

const CATEGORY_OPTIONS = [
  { value: 'total', label: '总预算' },
  { value: 'material', label: '材料成本' },
  { value: 'labor', label: '人工成本' },
  { value: 'equipment', label: '设备折旧' },
  { value: 'qc', label: '质控成本' },
  { value: 'indirect', label: '间接成本' },
]

const normalizeBudgetResponse = (response: any): Budget[] => {
  const rows = Array.isArray(response)
    ? response
    : Array.isArray(response?.list)
      ? response.list
      : Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.data?.list)
            ? response.data.list
            : Array.isArray(response?.data?.items)
              ? response.data.items
              : []

  return rows.map((budget: Budget) => {
    const budgetAmount = Number(budget.budgetAmount) || 0
    const actualAmount = Number(budget.actualAmount) || 0
    return {
      ...budget,
      budgetAmount,
      actualAmount,
      executionRate: budget.executionRate ?? (budgetAmount > 0 ? actualAmount / budgetAmount : 0),
      status: budget.status || 'active',
    }
  })
}

export default function BudgetManagement() {
  const urlParams = new URLSearchParams(window.location.search)
  const [deepLinkKeyword] = useState(() => urlParams.get('keyword')?.trim() || '')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState(deepLinkKeyword)
  const [filterMonth, setFilterMonth] = useState(() => urlParams.get('month')?.trim() || urlParams.get('yearMonth')?.trim() || '')
  const [showDialog, setShowDialog] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [formData, setFormData] = useState({
    yearMonth: new Date().toISOString().slice(0, 7),
    category: 'total',
    budgetAmount: '',
    actualAmount: '',
    description: '',
  })

  useEffect(() => {
    loadBudgets()
  }, [filterMonth])

  const loadBudgets = async () => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (filterMonth) params.yearMonth = filterMonth
      if (deepLinkKeyword) params.keyword = deepLinkKeyword
      const data = await abcApi.getBudgets(params)
      setBudgets(normalizeBudgetResponse(data))
    } catch {
      toast.error('加载预算数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingBudget(null)
    setFormData({
      yearMonth: new Date().toISOString().slice(0, 7),
      category: 'total',
      budgetAmount: '',
      actualAmount: '',
      description: '',
    })
    setShowDialog(true)
  }

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget)
    setFormData({
      yearMonth: budget.yearMonth,
      category: budget.category,
      budgetAmount: String(budget.budgetAmount),
      actualAmount: String(budget.actualAmount ?? 0),
      description: budget.description || '',
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!formData.yearMonth || !formData.category || !formData.budgetAmount) {
      toast.error('请填写必填字段')
      return
    }
    const amount = parseFloat(formData.budgetAmount)
    if (isNaN(amount) || amount < 0) {
      toast.error('预算金额必须为非负数')
      return
    }
    const actualAmount = formData.actualAmount.trim() ? parseFloat(formData.actualAmount) : 0
    if (isNaN(actualAmount) || actualAmount < 0) {
      toast.error('实际金额必须为非负数')
      return
    }
    try {
      const payload = {
        yearMonth: formData.yearMonth,
        category: formData.category,
        budgetAmount: amount,
        actualAmount,
        description: formData.description.trim(),
      }
      if (editingBudget) {
        await abcApi.updateBudget(editingBudget.id, payload)
      } else {
        await abcApi.createBudget(payload)
      }
      toast.success(editingBudget ? '更新成功' : '创建成功')
      setShowDialog(false)
      loadBudgets()
    } catch {
      toast.error('操作失败')
    }
  }

  const getProgressColor = (rate: number) => {
    if (rate < 0.8) return 'bg-green-500'
    if (rate <= 1) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getProgressTextColor = (rate: number) => {
    if (rate < 0.8) return 'text-green-600'
    if (rate <= 1) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)

  const filteredBudgets = budgets.filter(b => {
    if (!searchKeyword) return true
    const label = CATEGORY_LABELS[b.category] || b.category
    return (
      b.id.includes(searchKeyword) ||
      label.includes(searchKeyword) ||
      b.category.includes(searchKeyword) ||
      b.yearMonth.includes(searchKeyword) ||
      Boolean(b.description?.includes(searchKeyword))
    )
  })

  return (
    <div className="p-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">成本预算管理</h1>
          <p className="text-sm text-gray-500 mt-1">按月份和成本类型配置预算，监控执行进度</p>
        </div>
        <button
          onClick={handleAdd}
          className="h-10 px-4 bg-[#3b82f6] text-white rounded-md hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          新增预算
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="搜索预算类型..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full h-10 pl-10 pr-4 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
          {filterMonth && (
            <button
              onClick={() => setFilterMonth('')}
              className="h-10 px-3 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      {/* 预算表格 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">月份</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">成本类型</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">预算金额</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">实际金额</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">口径说明</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" style={{ minWidth: 200 }}>执行进度</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">加载中...</td>
              </tr>
            ) : filteredBudgets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">暂无预算数据</td>
              </tr>
            ) : (
              filteredBudgets.map(budget => (
                <tr key={budget.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{budget.yearMonth}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                      {CATEGORY_LABELS[budget.category] || budget.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">{formatCurrency(budget.budgetAmount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">{formatCurrency(budget.actualAmount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                    <span className="line-clamp-2">{budget.description || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(budget.executionRate)}`}
                          style={{ width: `${Math.min(budget.executionRate * 100, 100)}%` }}
                        />
                      </div>
                      <span className={`text-sm font-medium w-14 text-right ${getProgressTextColor(budget.executionRate)}`}>
                        {(budget.executionRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEdit(budget)}
                      className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 新增/编辑弹窗 */}
      {showDialog && (
        <Modal onClose={() => setShowDialog(false)} title={editingBudget ? '编辑预算' : '新增预算'}>
          <div className="space-y-4">
            <div>
              <label htmlFor="budget-year-month" className="block text-sm font-medium text-gray-700 mb-1">月份 *</label>
              <input
                id="budget-year-month"
                type="month"
                value={formData.yearMonth}
                onChange={(e) => setFormData({ ...formData, yearMonth: e.target.value })}
                className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="budget-category" className="block text-sm font-medium text-gray-700 mb-1">成本类型 *</label>
              <select
                id="budget-category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="budget-amount" className="block text-sm font-medium text-gray-700 mb-1">预算金额 (元) *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  id="budget-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.budgetAmount}
                  onChange={(e) => setFormData({ ...formData, budgetAmount: e.target.value })}
                  placeholder="0.00"
                  className="w-full h-10 pl-10 pr-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="budget-actual-amount" className="block text-sm font-medium text-gray-700 mb-1">实际金额 (元)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  id="budget-actual-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.actualAmount}
                  onChange={(e) => setFormData({ ...formData, actualAmount: e.target.value })}
                  placeholder="0.00"
                  className="w-full h-10 pl-10 pr-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="budget-description" className="block text-sm font-medium text-gray-700 mb-1">口径说明</label>
              <textarea
                id="budget-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="说明预算口径、实际金额来源或本月特殊调整"
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 resize-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowDialog(false)}
              className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="h-10 px-4 text-sm text-white bg-[#3b82f6] rounded-md hover:bg-blue-600 transition-colors"
            >
              {editingBudget ? '更新' : '创建'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
