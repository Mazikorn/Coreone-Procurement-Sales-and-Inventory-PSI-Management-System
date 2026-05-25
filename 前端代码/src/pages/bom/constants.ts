import type { BOM } from '@/types'

export const TYPE_MAP: Record<string, string> = {
  he: 'HE制片',
  ihc: '免疫组化',
  ss: '特殊染色',
  mp: '分子检测',
  cyto: '细胞学',
}

export const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'he', label: 'HE制片' },
  { value: 'ihc', label: '免疫组化' },
  { value: 'ss', label: '特殊染色' },
  { value: 'mp', label: '分子检测' },
  { value: 'cyto', label: '细胞学' },
]

export const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '已启用' },
  { value: 'inactive', label: '已停用' },
]

export const QUICK_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '已启用' },
  { key: 'inactive', label: '已停用' },
] as const

export const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  sufficient: {
    label: '充足',
    bg: 'bg-green-50',
    text: 'text-green-600',
    dot: 'bg-green-500',
    border: 'border-green-200',
  },
  low: {
    label: '偏低',
    bg: 'bg-yellow-50',
    text: 'text-yellow-600',
    dot: 'bg-yellow-500',
    border: 'border-yellow-200',
  },
  insufficient: {
    label: '不足',
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    dot: 'bg-orange-500',
    border: 'border-orange-200',
  },
  missing: {
    label: '缺失',
    bg: 'bg-red-50',
    text: 'text-red-600',
    dot: 'bg-red-500',
    border: 'border-red-200',
  },
}

export const QUICK_FILTER_COLORS: Record<string, { active: string; inactive: string }> = {
  all: {
    active: 'bg-blue-600 text-white',
    inactive: 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
  },
  active: {
    active: 'bg-green-600 text-white',
    inactive: 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
  },
  inactive: {
    active: 'bg-gray-600 text-white',
    inactive: 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
  },
}

export function getMaterialStatus(
  bom: BOM
): 'sufficient' | 'low' | 'insufficient' | 'missing' {
  if (bom.status === 'inactive') return 'missing'
  if (bom.supportableSamples === undefined || bom.supportableSamples === null)
    return 'missing'
  if (bom.supportableSamples === 0) return 'insufficient'
  if (bom.supportableSamples < 30) return 'low'
  return 'sufficient'
}

export function formatDateTime(dt?: string): string {
  if (!dt) return '-'
  const d = new Date(dt)
  if (isNaN(d.getTime())) return dt
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
