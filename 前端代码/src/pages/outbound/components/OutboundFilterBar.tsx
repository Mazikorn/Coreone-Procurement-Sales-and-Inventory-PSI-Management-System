import { Search, Calendar } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Material } from '@/types'

type StatusFilter = '' | 'completed' | 'pending' | 'cancelled'
type TypeFilter = '' | 'project' | 'transfer' | 'scrap'

interface OutboundFilterBarProps {
  searchText: string
  materialFilter: string
  typeFilter: TypeFilter
  statusFilter: StatusFilter
  startDate: string
  endDate: string
  materials: Material[]
  onSearchChange: (value: string) => void
  onMaterialChange: (value: string) => void
  onTypeChange: (value: TypeFilter) => void
  onStatusChange: (value: StatusFilter) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onQuery: () => void
  onReset: () => void
}

export default function OutboundFilterBar({
  searchText,
  materialFilter,
  typeFilter,
  statusFilter,
  startDate,
  endDate,
  materials,
  onSearchChange,
  onMaterialChange,
  onTypeChange,
  onStatusChange,
  onStartDateChange,
  onEndDateChange,
  onQuery,
  onReset,
}: OutboundFilterBarProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 border-b border-gray-200">
      <span className="text-base font-medium text-gray-900">出库记录</span>
      <div className="flex-1 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索出库单号/耗材名称/批号..."
            value={searchText}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9 pr-3 h-10 w-64 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
        </div>
        {/* Material Select */}
        <SearchableSelect
          value={materialFilter}
          onChange={val => onMaterialChange(val || '')}
          options={[
            { value: '', label: '全部物料' },
            ...materials.map(m => ({ value: m.id, label: m.name })),
          ]}
          placeholder="全部物料"
          className="w-36"
        />
        {/* Type Select */}
        <SearchableSelect
          value={typeFilter}
          onChange={val => onTypeChange(val as TypeFilter)}
          options={[
            { value: '', label: '全部类型' },
            { value: 'project', label: '项目出库' },
            { value: 'transfer', label: '调拨出库' },
            { value: 'scrap', label: '报废出库' },
          ]}
          placeholder="全部类型"
          className="w-32"
        />
        {/* Status Select */}
        <SearchableSelect
          value={statusFilter}
          onChange={val => onStatusChange(val as StatusFilter)}
          options={[
            { value: '', label: '全部状态' },
            { value: 'completed', label: '已完成' },
            { value: 'pending', label: '待出库' },
            { value: 'cancelled', label: '已取消' },
          ]}
          placeholder="全部状态"
          className="w-32"
        />
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={e => onStartDateChange(e.target.value)}
              className="pl-8 pr-2 h-10 w-[130px] border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <span className="text-gray-400">-</span>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="date"
              value={endDate}
              onChange={e => onEndDateChange(e.target.value)}
              className="pl-8 pr-2 h-10 w-[130px] border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
        </div>
        {/* Query / Reset */}
        <button
          onClick={onQuery}
          className="h-10 px-4 bg-white border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition-colors duration-150"
        >
          查询
        </button>
        <button
          onClick={onReset}
          className="h-10 px-4 text-gray-500 rounded-md text-sm hover:text-gray-700 hover:bg-gray-50 transition-colors duration-150"
        >
          重置
        </button>
      </div>
    </div>
  )
}
