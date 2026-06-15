export const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '启用' },
  { value: 'inactive', label: '停用' },
]

export const TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'standard', label: '标准' },
  { value: 'custom', label: '自定义' },
  { value: 'template', label: '模板' },
]

export const QUICK_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '启用中' },
  { key: 'inactive', label: '已停用' },
]

export const QUICK_FILTER_COLORS: Record<string, { active: string; inactive: string }> = {
  all: { active: 'bg-gray-700 text-white', inactive: 'bg-gray-50 text-gray-600 hover:bg-gray-100' },
  active: { active: 'bg-green-600 text-white', inactive: 'bg-green-50 text-green-600 hover:bg-green-100' },
  inactive: { active: 'bg-red-600 text-white', inactive: 'bg-red-50 text-red-600 hover:bg-red-100' },
}

export const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  active: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    dot: 'bg-green-500',
    label: '启用',
  },
  inactive: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    dot: 'bg-red-500',
    label: '停用',
  },
  missing: {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-gray-200',
    dot: 'bg-gray-400',
    label: '未知',
  },
}

export function getMaterialStatus(material: { stock?: number; minStock?: number; expiryDate?: string }): string {
  if (material.expiryDate) {
    const daysLeft = Math.ceil((new Date(material.expiryDate).getTime() - Date.now()) / 86400000)
    if (daysLeft <= 0) return 'expired'
    if (daysLeft <= 30) return 'expiring'
  }
  if (material.stock !== undefined && material.minStock !== undefined && material.stock <= material.minStock) {
    return 'low-stock'
  }
  return 'normal'
}

export function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}
