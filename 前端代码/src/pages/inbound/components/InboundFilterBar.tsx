import { Search } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Material } from '@/types'

interface InboundFilterBarProps {
  searchKeyword: string
  onSearchChange: (v: string) => void
  filterMaterial: string
  onMaterialChange: (v: string) => void
  filterStatus: string
  onStatusChange: (v: string) => void
  filterType: string
  onTypeChange: (v: string) => void
  filterStartDate: string
  onStartDateChange: (v: string) => void
  filterEndDate: string
  onEndDateChange: (v: string) => void
  onQuery: () => void
  onReset: () => void
  materials: Material[]
}

export default function InboundFilterBar({
  searchKeyword,
  onSearchChange,
  filterMaterial,
  onMaterialChange,
  filterStatus,
  onStatusChange,
  filterType,
  onTypeChange,
  filterStartDate,
  onStartDateChange,
  filterEndDate,
  onEndDateChange,
  onQuery,
  onReset,
  materials,
}: InboundFilterBarProps) {
  return (
    <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-900">入库记录</span>
      <div className="flex-1" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索入库单号/耗材名称/批号..."
            value={searchKeyword}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9 pr-3 py-2 h-10 text-sm border border-gray-300 rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <SearchableSelect
          value={filterMaterial}
          onChange={val => onMaterialChange(val || '')}
          options={[
            { value: '', label: '全部物料' },
            ...materials.map(m => ({ value: m.id, label: m.name })),
          ]}
          placeholder="全部物料"
          className="w-36"
        />
        <SearchableSelect
          value={filterStatus}
          onChange={val => onStatusChange(val)}
          options={[
            { value: '', label: '全部状态' },
            { value: 'completed', label: '已完成' },
            { value: 'cancelled', label: '已取消' },
          ]}
          placeholder="全部状态"
          className="w-28"
        />
        <SearchableSelect
          value={filterType}
          onChange={val => onTypeChange(val)}
          options={[
            { value: '', label: '全部来源' },
            { value: 'purchase', label: '采购入库' },
            { value: 'return', label: '退库入库' },
            { value: 'direct', label: '直接入库' },
            { value: 'transfer', label: '调拨入库' },
          ]}
          placeholder="全部来源"
          className="w-32"
        />
        <input
          type="date"
          value={filterStartDate}
          onChange={e => onStartDateChange(e.target.value)}
          className="h-10 px-3 text-sm bg-white border border-gray-300 rounded-md outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
        />
        <span className="text-gray-400 text-sm">至</span>
        <input
          type="date"
          value={filterEndDate}
          onChange={e => onEndDateChange(e.target.value)}
          className="h-10 px-3 text-sm bg-white border border-gray-300 rounded-md outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
        />
        <button
          onClick={onQuery}
          className="px-4 py-2 h-10 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          查询
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 h-10 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          重置
        </button>
      </div>
    </div>
  )
}
