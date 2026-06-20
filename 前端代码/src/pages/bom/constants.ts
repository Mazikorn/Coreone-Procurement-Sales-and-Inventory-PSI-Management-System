import type { BOM } from '@/types'

export const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'he', label: 'HE' },
  { value: 'ihc', label: '免疫组化' },
  { value: 'ss', label: '特殊染色' },
  { value: 'mp', label: '分子病理' },
  { value: 'cyto', label: '细胞学' },
  { value: 'project', label: '项目BOM' },
]

export function getBOMTypeLabel(type?: string | null) {
  if (!type) return ''
  return TYPE_OPTIONS.find(option => option.value === type)?.label || type
}

export function getBOMEffectiveScopeLabel(effectiveScope?: string | null) {
  return effectiveScope === 'retroactive' ? '追溯重算' : '仅未来生效'
}

export const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '已启用' },
  { value: 'inactive', label: '已停用' },
]

export const QUICK_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '已启用' },
  { key: 'inactive', label: '已停用' },
  { key: 'low-support', label: '可支撑偏低' },
]

export const QUICK_FILTER_COLORS: Record<string, { active: string; inactive: string }> = {
  all: { active: 'bg-blue-50 text-blue-600', inactive: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  active: { active: 'bg-green-50 text-green-600', inactive: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  inactive: { active: 'bg-gray-200 text-gray-700', inactive: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  'low-support': { active: 'bg-amber-50 text-amber-700', inactive: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
}

export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  sufficient: {
    label: '充足',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    dot: 'bg-green-500',
  },
  low: {
    label: '偏低',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  missing: {
    label: '不足',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
}

export function getMaterialStatus(row: BOM) {
  if (row.supportableSamples === undefined || row.supportableSamples === null) return 'sufficient'
  if (row.supportableSamples <= 0) return 'missing'
  if (row.supportableSamples < 30) return 'low'
  return 'sufficient'
}

export function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
