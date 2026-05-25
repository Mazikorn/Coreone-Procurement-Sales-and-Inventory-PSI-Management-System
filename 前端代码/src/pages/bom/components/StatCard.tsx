export function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  colorClass: string
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-semibold text-gray-900">{value}</div>
          <div className="text-sm text-gray-500 mt-1">{label}</div>
        </div>
        <div className={`p-2.5 rounded-lg ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}
