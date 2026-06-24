import React from 'react'
import type { ElementType } from 'react'

interface Props {
  title: string
  value: string | number
  icon: ElementType
  colorClass: string
  bgClass: string
  subtitle?: string
  onClick?: () => void
}

export function StatCard({ title, value, icon: Icon, colorClass, bgClass, subtitle, onClick }: Props) {
  const content = (
    <>
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
          <Icon className={`w-5 h-5 ${colorClass}`} />
        </div>
      </div>
    </>
  )

  const className = `bg-white rounded-lg p-5 border border-gray-200 shadow-sm transition-all ${
    onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200 text-left w-full' : ''
  }`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    )
  }

  return (
    <div className={className}>
      {content}
    </div>
  )
}
