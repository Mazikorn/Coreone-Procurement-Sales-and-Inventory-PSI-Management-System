import { formatCurrency } from '@/lib/utils'

interface WaterfallItem {
  name: string
  cost: number
  color?: string
}

interface CostWaterfallProps {
  items: WaterfallItem[]
  totalLabel?: string
}

export function CostWaterfall({ items, totalLabel = '总成本' }: CostWaterfallProps) {
  if (!items || items.length === 0) return null

  const maxCost = Math.max(...items.map(i => Math.abs(i.cost)), 1)
  const total = items.reduce((s, i) => s + i.cost, 0)

  const defaultColors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500']

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const width = Math.max(4, (Math.abs(item.cost) / maxCost) * 100)
        const color = item.color || defaultColors[idx % defaultColors.length]
        return (
          <div key={idx} className="flex items-center gap-3">
            <div className="w-20 text-xs text-gray-500 text-right flex-shrink-0">{item.name}</div>
            <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
              <div
                className={`h-full rounded ${color} transition-all duration-500`}
                style={{ width: `${width}%` }}
              />
            </div>
            <div className="w-24 text-xs font-medium text-gray-900 text-right flex-shrink-0">
              {formatCurrency(item.cost)}
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
        <div className="w-20 text-xs font-medium text-gray-700 text-right flex-shrink-0">{totalLabel}</div>
        <div className="flex-1" />
        <div className="w-24 text-xs font-bold text-gray-900 text-right flex-shrink-0">
          {formatCurrency(total)}
        </div>
      </div>
    </div>
  )
}
