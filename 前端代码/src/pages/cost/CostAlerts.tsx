import { useState, useEffect } from 'react'
import { Plus, Search, Bell, BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { abcApi } from '@/api/abc'
import { Modal } from '@/components/ui/Modal'

interface AlertRule {
  id: string
  ruleType: string
  thresholdValue: number
  comparison: string
  notificationType: string
  status: string
}

const RULE_TYPE_LABELS: Record<string, string> = {
  cost_overrun: '成本超支',
  variance_exceed: '差异超限',
  budget_exceed: '预算超支',
  profit_below: '利润率过低',
  quality_cost_ratio: '质量成本占比',
}

const RULE_TYPE_OPTIONS = [
  { value: 'cost_overrun', label: '成本超支' },
  { value: 'variance_exceed', label: '差异超限' },
  { value: 'budget_exceed', label: '预算超支' },
  { value: 'profit_below', label: '利润率过低' },
  { value: 'quality_cost_ratio', label: '质量成本占比' },
]

const COMPARISON_LABELS: Record<string, string> = {
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  eq: '等于',
}

const COMPARISON_OPTIONS = [
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'eq', label: '等于' },
]

const NOTIFICATION_LABELS: Record<string, string> = {
  system: '系统通知',
  email: '邮件通知',
  sms: '短信通知',
}

const NOTIFICATION_OPTIONS = [
  { value: 'system', label: '系统通知' },
  { value: 'email', label: '邮件通知' },
  { value: 'sms', label: '短信通知' },
]

export default function CostAlerts() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [formData, setFormData] = useState({
    ruleType: 'cost_overrun',
    thresholdValue: '',
    comparison: 'gt',
    notificationType: 'system',
  })

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    try {
      setLoading(true)
      const data = await abcApi.getAlertRules()
      setRules(data.data?.list || data.data?.items || data.data || [])
    } catch {
      toast.error('加载预警规则失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.ruleType || !formData.thresholdValue || !formData.comparison) {
      toast.error('请填写必填字段')
      return
    }
    const threshold = parseFloat(formData.thresholdValue)
    if (isNaN(threshold)) {
      toast.error('阈值必须为数字')
      return
    }
    try {
      await abcApi.createAlertRule({
        ruleType: formData.ruleType,
        thresholdValue: threshold,
        comparison: formData.comparison,
        notificationType: formData.notificationType,
      })
      toast.success('创建成功')
      setShowDialog(false)
      loadRules()
    } catch {
      toast.error('创建失败')
    }
  }

  const getThresholdDisplay = (rule: AlertRule) => {
    const compLabel = COMPARISON_LABELS[rule.comparison] || rule.comparison
    if (rule.ruleType === 'profit_below' || rule.ruleType === 'quality_cost_ratio') {
      return `${compLabel} ${(rule.thresholdValue * 100).toFixed(1)}%`
    }
    return `${compLabel} ¥${rule.thresholdValue.toLocaleString()}`
  }

  const filteredRules = rules.filter(r => {
    if (!searchKeyword) return true
    const typeLabel = RULE_TYPE_LABELS[r.ruleType] || r.ruleType
    return typeLabel.includes(searchKeyword)
  })

  return (
    <div className="p-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">成本异常预警</h1>
          <p className="text-sm text-gray-500 mt-1">配置成本预警规则，自动监控异常情况</p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="h-10 px-4 bg-[#3b82f6] text-white rounded-md hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          新增预警规则
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="搜索预警规则..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full h-10 pl-10 pr-4 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
        </div>
      </div>

      {/* 预警规则表格 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">规则类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">触发条件</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">通知方式</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-400">加载中...</td>
              </tr>
            ) : filteredRules.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-400">暂无预警规则</td>
              </tr>
            ) : (
              filteredRules.map(rule => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                      {RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-mono">{getThresholdDisplay(rule)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {NOTIFICATION_LABELS[rule.notificationType] || rule.notificationType}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {rule.status === 'active' ? (
                        <>
                          <Bell className="h-3.5 w-3.5 text-green-500" />
                          <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">启用</span>
                        </>
                      ) : (
                        <>
                          <BellOff className="h-3.5 w-3.5 text-gray-400" />
                          <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">禁用</span>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 新增弹窗 */}
      {showDialog && (
        <Modal onClose={() => setShowDialog(false)} title="新增预警规则">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">规则类型 *</label>
              <select
                value={formData.ruleType}
                onChange={(e) => setFormData({ ...formData, ruleType: e.target.value })}
                className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              >
                {RULE_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">比较方式 *</label>
              <select
                value={formData.comparison}
                onChange={(e) => setFormData({ ...formData, comparison: e.target.value })}
                className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              >
                {COMPARISON_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                阈值 * {(formData.ruleType === 'profit_below' || formData.ruleType === 'quality_cost_ratio')
                  ? '(请输入小数，如 0.1 表示 10%)'
                  : '(元)'}
              </label>
              <input
                type="number"
                step="any"
                value={formData.thresholdValue}
                onChange={(e) => setFormData({ ...formData, thresholdValue: e.target.value })}
                placeholder={
                  (formData.ruleType === 'profit_below' || formData.ruleType === 'quality_cost_ratio')
                    ? '0.1'
                    : '10000'
                }
                className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">通知方式</label>
              <select
                value={formData.notificationType}
                onChange={(e) => setFormData({ ...formData, notificationType: e.target.value })}
                className="w-full h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              >
                {NOTIFICATION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
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
              创建
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
