import {
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  ClipboardCheck,
  Package,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  ClipboardCheck,
  Package,
  ShoppingCart,
  TrendingUp,
}

interface Props {
  title: string
  value: string | number
  icon: string | React.ElementType
  colorClass: string
  bgClass: string
  subtitle?: string
  onClick?: () => void
}

export function StatCard({ title, value, icon: Icon, colorClass, bgClass, subtitle, onClick }: Props) {
  const IconComponent = typeof Icon === 'string' ? (iconMap[Icon] || Package) : Icon

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg p-5 border border-gray-200 shadow-sm transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <p className="text-[28px] font-bold text-gray-900 leading-tight tracking-tight">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${bgClass}`}>
          <IconComponent className={`w-5 h-5 ${colorClass}`} />
        </div>
      </div>
    </div>
  )
}
