import type { ElementType } from 'react'

interface Props {
  label: string
  desc?: string
  icon: ElementType
  colorClass: string
  bgClass: string
  onClick: () => void
}

export function QuickAction({ label, desc, icon: Icon, colorClass, bgClass, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm text-left transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${bgClass}`}>
          <Icon className={`w-5 h-5 ${colorClass}`} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900 truncate">{label}</span>
          {desc && <span className="block text-xs text-gray-500 mt-1 leading-5">{desc}</span>}
        </span>
      </div>
    </button>
  )
}
