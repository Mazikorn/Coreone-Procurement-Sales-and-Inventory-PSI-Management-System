import { X } from 'lucide-react'
import type { CostExportSection } from '../hooks/useCostAnalysisPage'

interface Props {
  open: boolean
  sections: Record<CostExportSection, boolean>
  onSectionsChange: (sections: Record<CostExportSection, boolean>) => void
  onClose: () => void
  onExport: () => void
}

const sectionOptions: Array<{ key: CostExportSection; label: string }> = [
  { key: 'summary', label: '汇总指标' },
  { key: 'project', label: '检测项目成本分析' },
  { key: 'group', label: '项目组合成本' },
  { key: 'material', label: '物料消耗明细' },
  { key: 'supplier', label: '供应商分析' },
  { key: 'full', label: '全成本分析' },
  { key: 'trend', label: '成本趋势' },
]

export function CostExportModal({ open, sections, onSectionsChange, onClose, onExport }: Props) {
  if (!open) return null

  const toggleSection = (key: CostExportSection) => {
    onSectionsChange({ ...sections, [key]: !sections[key] })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">导出成本分析报告</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">报告格式</label>
            <div className="h-10 px-3 inline-flex items-center rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-700">
              Excel 工作簿 (.xlsx)
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">报告内容</label>
            <div className="space-y-2">
              {sectionOptions.map(item => (
                <label key={item.key} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-md cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={sections[item.key]}
                    onChange={() => toggleSection(item.key)}
                    className="w-4 h-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="h-10 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onExport}
            className="h-10 px-4 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
          >
            导出报告
          </button>
        </div>
      </div>
    </div>
  )
}
