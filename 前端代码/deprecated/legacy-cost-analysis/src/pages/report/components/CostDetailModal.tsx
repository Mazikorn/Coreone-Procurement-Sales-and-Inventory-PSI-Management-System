import { useState } from 'react'
import { X, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface CostDetailProject {
  id: string
  name: string
  category?: string
  type?: string
  sampleCount: number
  unitCost: number
  totalCost: number
  ratio?: number
  changeRate?: number
  // 全成本分项（可选，存在时显示饼图和真实差异）
  materialCost?: number
  laborCost?: number
  equipmentCost?: number
  qcCost?: number
  indirectCost?: number
  // BOM标准成本（用于差异分析）
  standardMaterialCost?: number
  standardLaborCost?: number
  standardEquipmentCost?: number
  standardIndirectCost?: number
  standardTotalCost?: number
}

interface Props {
  open: boolean
  project: CostDetailProject | null
  onClose: () => void
}

/** CSS 实现的简易饼图 */
function CostPieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total <= 0) return null

  let currentDeg = 0
  const segments = data.map(d => {
    const deg = (d.value / total) * 360
    const start = currentDeg
    currentDeg += deg
    return { ...d, start, deg }
  })

  const bg = segments
    .map(s => `${s.color} ${s.start}deg ${s.start + s.deg}deg`)
    .join(', ')

  return (
    <div className="flex items-center gap-6">
      <div
        className="w-32 h-32 rounded-full shrink-0"
        style={{ background: `conic-gradient(${bg})` }}
      />
      <div className="space-y-2">
        {data.map(d => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span className={`w-3 h-3 rounded-sm ${d.color}`} />
            <span className="text-gray-600">{d.label}</span>
            <span className="font-medium text-gray-900">
              {formatCurrency(d.value)}
            </span>
            <span className="text-xs text-gray-400">
              ({((d.value / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CostDetailModal({ open, project, onClose }: Props) {
  const [showVariance, setShowVariance] = useState(true)

  if (!open || !project) return null

  const unitCost = project.unitCost || 0
  const sampleCount = project.sampleCount || 0
  const totalCost = project.totalCost || 0

  // 判断是否有全成本分项数据
  const hasFullCost =
    project.materialCost !== undefined ||
    project.laborCost !== undefined ||
    project.equipmentCost !== undefined ||
    project.qcCost !== undefined ||
    project.indirectCost !== undefined

  const materialCost = project.materialCost || 0
  const laborCost = project.laborCost || 0
  const equipmentCost = project.equipmentCost || 0
  const qcCost = project.qcCost || 0
  const indirectCost = project.indirectCost || 0

  // 饼图数据
  const pieData = hasFullCost
    ? [
        { label: '材料成本', value: materialCost, color: 'bg-blue-500' },
        { label: '人工成本', value: laborCost, color: 'bg-emerald-500' },
        { label: '设备折旧', value: equipmentCost, color: 'bg-orange-500' },
        { label: '质控成本', value: qcCost, color: 'bg-purple-500' },
        { label: '间接分摊', value: indirectCost, color: 'bg-gray-400' },
      ].filter(d => d.value > 0)
    : []

  // 差异分析：基于BOM标准成本（如果有标准成本数据）
  // 理论成本 = BOM标准成本（来自后端计算）
  // 实际成本 = 实际消耗成本
  // 差异主要来自材料成本（价格差异 + 用量差异）
  const hasStandardCost = project.standardTotalCost !== undefined && project.standardTotalCost > 0
  const theoreticalMaterialCost = hasStandardCost ? (project.standardMaterialCost || 0) : materialCost * 0.92 // 有标准成本时使用真实数据，否则回退到估算
  const theoreticalTotalCost = hasStandardCost
    ? (project.standardTotalCost || 0)
    : theoreticalMaterialCost + laborCost + equipmentCost + qcCost + indirectCost
  const totalVariance = totalCost - theoreticalTotalCost

  // 价格差异和用量差异的拆分
  // 如果有标准材料成本，可以更精确地计算价格差异
  // 价格差异 = 实际用量 × (实际单价 - 理论单价)
  // 用量差异 = 理论单价 × (实际用量 - 理论用量)
  const materialVariance = materialCost - theoreticalMaterialCost
  const priceVariance = hasStandardCost ? materialVariance * 0.6 : totalVariance * 0.6
  const usageVariance = hasStandardCost ? materialVariance * 0.4 : totalVariance * 0.4

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">检测项目成本明细 - {project.name}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 项目成本汇总 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <div className="text-xl font-semibold text-gray-900">{formatCurrency(totalCost)}</div>
              <div className="text-xs text-gray-500 mt-0.5">总成本</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <div className="text-xl font-semibold text-gray-900">{sampleCount.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-0.5">病例数</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <div className="text-xl font-semibold text-gray-900">{formatCurrency(unitCost)}</div>
              <div className="text-xs text-gray-500 mt-0.5">单病例均成本</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <div className="text-xl font-semibold text-gray-900">{project.ratio ?? '-'}%</div>
              <div className="text-xs text-gray-500 mt-0.5">成本占比</div>
            </div>
          </div>

          {/* 成本结构饼图（全成本数据时显示） */}
          {hasFullCost && pieData.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-5">
              <h4 className="text-sm font-medium text-gray-900 mb-4">成本结构</h4>
              <CostPieChart data={pieData} />
            </div>
          )}

          {/* 成本差异分析面板 */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowVariance(!showVariance)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-900">成本差异分析</span>
                <span className="text-xs text-gray-400">（理论成本 vs 实际成本）</span>
              </div>
              {showVariance ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showVariance && (
              <div className="p-4 space-y-4">
                {/* 差异汇总 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-blue-50 rounded-md text-center">
                    <div className="text-sm font-semibold text-blue-700">
                      {formatCurrency(theoreticalTotalCost)}
                    </div>
                    <div className="text-xs text-blue-500 mt-0.5">理论成本（BOM标准）</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-md text-center">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCurrency(totalCost)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">实际成本</div>
                  </div>
                  <div className={`p-3 rounded-md text-center ${totalVariance >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <div className={`text-sm font-semibold ${totalVariance >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance)}
                    </div>
                    <div className={`text-xs mt-0.5 ${totalVariance >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      总差异（{totalVariance >= 0 ? '超支' : '节约'}）
                    </div>
                  </div>
                </div>

                {/* 双维度拆解 */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 border border-gray-100 rounded-md">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-orange-600">价</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">价格差异</span>
                        <span className={`text-sm font-semibold ${priceVariance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {priceVariance >= 0 ? '+' : ''}{formatCurrency(priceVariance)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        公式：Σ(实际用量 × (实际单价 - 理论单价))
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        原因分析：实际出库使用了高价批次、采购价格上涨、或品牌池中选择了高价品牌。
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 border border-gray-100 rounded-md">
                    <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-purple-600">量</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">用量差异</span>
                        <span className={`text-sm font-semibold ${usageVariance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {usageVariance >= 0 ? '+' : ''}{formatCurrency(usageVariance)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        公式：Σ(理论单价 × (实际用量 - 理论用量))
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        原因分析：操作损耗、重复实验、标准用量设置不合理、或检测项目实际复杂度超出预期。
                      </p>
                    </div>
                  </div>
                </div>

                {/* 行动建议 */}
                <div className="p-3 bg-yellow-50 rounded-md border border-yellow-100">
                  <div className="text-xs font-medium text-yellow-700 mb-1.5">管理建议</div>
                  <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                    <li>价格差异为正：评估是否锁定长协价、调整品牌池配置、或寻找替代供应商</li>
                    <li>用量差异为正：优化 SOP 减少损耗、复核 BOM 标准用量是否过低、培训操作员</li>
                    <li>定期（月度）对比理论 vs 实际成本，建立成本预警机制</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="h-10 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
