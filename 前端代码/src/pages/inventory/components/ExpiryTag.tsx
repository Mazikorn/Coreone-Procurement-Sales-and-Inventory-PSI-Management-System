import React from 'react'

interface ExpiryTagProps {
  expiry?: string
}

export function ExpiryTag({ expiry }: ExpiryTagProps) {
  if (!expiry || expiry === '-') return null
  const today = new Date()
  const exp = new Date(expiry)
  const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return <span className="ml-2 text-[11px] text-red-500">已过期</span>
  if (daysLeft <= 7) return <span className="ml-2 text-[11px] text-red-500">剩{daysLeft}天</span>
  if (daysLeft <= 30) return <span className="ml-2 text-[11px] text-yellow-600">剩{daysLeft}天</span>
  return null
}
