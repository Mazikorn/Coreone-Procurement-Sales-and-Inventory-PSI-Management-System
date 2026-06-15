import {
  ArrowDownToLine,
  TrendingUp,
  Package,
  ShoppingCart,
  BarChart3,
  ClipboardCheck,
  Bell,
  FileText,
  Settings,
  type LucideIcon,
} from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  ArrowDownToLine,
  TrendingUp,
  Package,
  ShoppingCart,
  BarChart3,
  ClipboardCheck,
  Bell,
  FileText,
  Settings,
}

interface QuickActionProps {
  label: string
  desc?: string
  icon: string
  colorClass?: string
  bgClass?: string
  onClick?: () => void
}

export function QuickAction({ label, desc, icon, colorClass, bgClass, onClick }: QuickActionProps) {
  const IconComponent = iconMap[icon] || Package

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left group"
    >
      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${bgClass || 'bg-blue-50'} group-hover:scale-105 transition-transform`}>
        <IconComponent className={`w-5 h-5 ${colorClass || 'text-blue-500'}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {desc && <p className="text-xs text-gray-500 mt-0.5 truncate">{desc}</p>}
      </div>
    </button>
  )
}
