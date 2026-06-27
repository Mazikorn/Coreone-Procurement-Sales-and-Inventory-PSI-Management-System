import { useState, useEffect, useMemo } from 'react'
import { inventoryApi, inboundApi, outboundApi, purchaseOrderApi } from '@/api/inventory'
import { projectApi } from '@/api/master'
import { abcApi } from '@/api/abc'
import { canAccess, canSeeCost } from '@/lib/permissions'
import type { InventoryStats, InboundRecord, OutboundRecord } from '@/types'

export interface DashboardStats extends InventoryStats {
  monthlyInbound: number
  monthlyOutbound: number
  alertCount: number
}

export interface CostSummary {
  totalCost: number
  totalRevenue: number
  totalProfit: number
  profitRate: number // 0–100
}

export interface ActivityItem {
  id: string
  type: 'inbound' | 'outbound' | 'alert'
  title: string
  desc: string
  time: string
}

export function useDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentInbound, setRecentInbound] = useState<InboundRecord[]>([])
  const [recentOutbound, setRecentOutbound] = useState<OutboundRecord[]>([])
  const [projectCount, setProjectCount] = useState<number | null>(null)
  const [poCount, setPoCount] = useState<number | null>(null)
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const today = useMemo(() => {
    const d = new Date()
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // 数据驱动 RBAC：仅拉取当前用户有权限的接口（根治 403 toast + 角色仪表盘按能力差异化）
        const [statsData, inboundRes, outboundRes, projectRes, poRes, costRes] = await Promise.all([
          canAccess('inventory', 'R') ? inventoryApi.getStats() : Promise.resolve(null),
          canAccess('inbound', 'R') ? inboundApi.getList({ page: 1, pageSize: 5 }) : Promise.resolve(null),
          canAccess('outbound', 'R') ? outboundApi.getList({ page: 1, pageSize: 5 }) : Promise.resolve(null),
          canAccess('projects', 'R') ? projectApi.getList({ page: 1, pageSize: 1 }) : Promise.resolve(null),
          canAccess('purchase_orders', 'R') ? purchaseOrderApi.getList({ page: 1, pageSize: 1 }) : Promise.resolve(null),
          canSeeCost() ? abcApi.getDashboard() : Promise.resolve(null),
        ])

        if (statsData) {
          const baseStats = statsData as unknown as InventoryStats
          setStats({
            ...baseStats,
            monthlyInbound: 0,
            monthlyOutbound: 0,
            alertCount: (baseStats.lowStockCount || 0) + (baseStats.expiringCount || 0) + (baseStats.expiredCount || 0),
          })
        }

        setRecentInbound((inboundRes as unknown as { list: InboundRecord[] } | null)?.list || [])
        setRecentOutbound((outboundRes as unknown as { list: OutboundRecord[] } | null)?.list || [])
        if (projectRes) setProjectCount(Number((projectRes as any)?.pagination?.total ?? (projectRes as any)?.total ?? 0))
        if (poRes) setPoCount(Number((poRes as any)?.pagination?.total ?? (poRes as any)?.total ?? 0))
        if (costRes) setCostSummary(extractCostSummary(costRes))
      } catch {
        // silent fail
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const activities: ActivityItem[] = useMemo(() => {
    const list: ActivityItem[] = []
    recentInbound.slice(0, 3).forEach(item => {
      list.push({
        id: `in-${item.id}`,
        type: 'inbound',
        title: `入库：${item.materialName || '未知物料'}`,
        desc: `数量 ${item.quantity}${item.unit || ''} · ${item.operator || '系统'}`,
        time: formatTime(item.createdAt),
      })
    })
    recentOutbound.slice(0, 3).forEach(item => {
      list.push({
        id: `out-${item.id}`,
        type: 'outbound',
        title: `出库：${item.outboundNo || '出库单'}`,
        desc: `${item.projectName || '项目消耗'} · ${item.operator || '系统'}`,
        time: formatTime(item.createdAt),
      })
    })
    return list.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6)
  }, [recentInbound, recentOutbound])

  const stockTrend = useMemo(
    () => [
      { label: '1月', value: 420 },
      { label: '2月', value: 380 },
      { label: '3月', value: 510 },
      { label: '4月', value: 460 },
      { label: '5月', value: 580 },
      { label: '6月', value: 520 },
    ],
    []
  )

  const consumeTrend = useMemo(
    () => [
      { label: '1月', value: 120 },
      { label: '2月', value: 98 },
      { label: '3月', value: 156 },
      { label: '4月', value: 134 },
      { label: '5月', value: 178 },
      { label: '6月', value: 145 },
    ],
    []
  )

  return { stats, recentInbound, recentOutbound, projectCount, poCount, costSummary, loading, today, activities, stockTrend, consumeTrend }
}

// /abc/dashboard 响应字段防御性提取（兼容 summary 嵌套 / 扁平 / snake_case）
function extractCostSummary(raw: any): CostSummary {
  const s = raw?.summary ?? raw ?? {}
  const num = (...keys: string[]): number => {
    for (const k of keys) {
      const v = s[k] ?? raw?.[k]
      if (typeof v === 'number') return v
      if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) return Number(v)
    }
    return 0
  }
  const totalCost = num('totalCost', 'total_cost')
  const totalRevenue = num('totalRevenue', 'totalFee', 'total_fee', 'revenue')
  const totalProfit = num('totalProfit', 'total_profit', 'profit')
  const profitRate = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0
  return { totalCost, totalRevenue, totalProfit, profitRate }
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
