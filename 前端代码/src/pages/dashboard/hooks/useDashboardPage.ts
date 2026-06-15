import { useState, useEffect, useMemo } from 'react'
import { inventoryApi, inboundApi, outboundApi } from '@/api/inventory'
import { abcApi } from '@/api/abc'
import { alertsApi } from '@/api/alerts'
import { getUserRole } from '@/lib/permissions'
import { getDashboardConfig } from '../config/dashboard-roles'
import type { InventoryStats } from '@/types'
import type { DashboardRoleConfig } from '../config/dashboard-roles'

export type DashboardStats = InventoryStats

export interface CostSummary {
  totalCost: number
  totalFee: number
  totalProfit: number
  profitRate: number
  caseCount: number
}

export interface AlertItem {
  id: string
  type: string
  level: string
  materialName: string
  message: string
  currentStock: number
  threshold: number
}

export interface ActivityItem {
  id: string
  type: 'inbound' | 'outbound'
  title: string
  desc: string
  time: string
}

export interface InboundStats {
  total: number
  completed: number
  cancelled: number
  amount: number
  supplierCount: number
  pendingOrders: number
}

export interface OutboundStats {
  total: number
  completed: number
  pending: number
  cancelled: number
  totalCost: number
}

export function useDashboardPage() {
  const [role, setRole] = useState<string | null>(null)
  const [config, setConfig] = useState<DashboardRoleConfig>(() => getDashboardConfig(null))
  const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null)
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)
  const [inboundStats, setInboundStats] = useState<InboundStats | null>(null)
  const [outboundStats, setOutboundStats] = useState<OutboundStats | null>(null)
  const [pendingAlerts, setPendingAlerts] = useState<AlertItem[]>([])
  const [recentInbound, setRecentInbound] = useState<any[]>([])
  const [recentOutbound, setRecentOutbound] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const today = useMemo(() => {
    const d = new Date()
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    const hour = d.getHours()
    const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
    return { date: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`, greeting }
  }, [])

  // 角色变化时更新配置
  useEffect(() => {
    const currentRole = getUserRole()
    setRole(currentRole)
    setConfig(getDashboardConfig(currentRole))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const fetchData = async () => {
      setLoading(true)
      try {
        const cfg = getDashboardConfig(role)
        const promises: Promise<any>[] = []
        const keys: string[] = []

        // 根据角色配置决定调用哪些 API
        if (cfg.apiCalls.includes('inventory')) {
          promises.push(inventoryApi.getStats())
          keys.push('inventory')
        }
        if (cfg.apiCalls.includes('alerts')) {
          promises.push(alertsApi.getList({ status: 'pending', pageSize: 5 }).catch(() => null))
          keys.push('alerts')
        }
        if (cfg.apiCalls.includes('inbound-stats')) {
          promises.push(inboundApi.getStats().catch(() => null))
          keys.push('inbound-stats')
        }
        if (cfg.apiCalls.includes('outbound-stats')) {
          promises.push(outboundApi.getStats().catch(() => null))
          keys.push('outbound-stats')
        }
        if (cfg.apiCalls.includes('abc-dashboard')) {
          promises.push(abcApi.getDashboard().catch(() => null))
          keys.push('abc-dashboard')
        }

        // 始终获取最近活动数据
        promises.push(inboundApi.getList({ page: 1, pageSize: 3 }).catch(() => null))
        keys.push('recent-inbound')
        promises.push(outboundApi.getList({ page: 1, pageSize: 3 }).catch(() => null))
        keys.push('recent-outbound')

        if (signal.aborted) return

        const results = await Promise.allSettled(promises)

        if (signal.aborted) return

        // 解析结果（H-2: 失败时静默降级）
        results.forEach((result, index) => {
          const key = keys[index]
          if (result.status === 'fulfilled' && result.value) {
            const data = result.value
            switch (key) {
              case 'inventory':
                setInventoryStats(data as unknown as InventoryStats)
                break
              case 'alerts': {
                const alertRes = data as any
                const alertList = alertRes?.list || alertRes?.data?.list || []
                setPendingAlerts(alertList.map((a: any) => ({
                  id: a.id,
                  type: a.type,
                  level: a.level,
                  materialName: a.materialName || a.material_name || '未知物料',
                  message: a.message || '',
                  currentStock: a.currentStock || a.current_stock || 0,
                  threshold: a.threshold || 0,
                })))
                break
              }
              case 'inbound-stats':
                setInboundStats(data as InboundStats)
                break
              case 'outbound-stats':
                setOutboundStats(data as OutboundStats)
                break
              case 'abc-dashboard': {
                const d = data as any
                if (d?.summary) {
                  setCostSummary({
                    totalCost: d.summary.totalCost || 0,
                    totalFee: d.summary.totalFee || 0,
                    totalProfit: d.summary.totalProfit || 0,
                    profitRate: d.summary.profitRate || 0,
                    caseCount: d.summary.caseCount || 0,
                  })
                }
                break
              }
              case 'recent-inbound':
                setRecentInbound((data as any)?.list || [])
                break
              case 'recent-outbound':
                setRecentOutbound((data as any)?.list || [])
                break
            }
          }
        })
      } catch {
        // silent fail — 边界契约 #4
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchData()
    return () => controller.abort()
  }, [role]) // H-7: role 变化时重新获取

  // 合并最近活动
  const activities: ActivityItem[] = useMemo(() => {
    const list: ActivityItem[] = []
    recentInbound.slice(0, 3).forEach((item: any) => {
      list.push({
        id: `in-${item.id}`,
        type: 'inbound',
        title: `入库：${item.materialName || item.material_name || '未知物料'}`,
        desc: `数量 ${item.quantity}${item.unit || ''} · ${item.operator || '系统'}`,
        time: formatTime(item.createdAt || item.created_at),
      })
    })
    recentOutbound.slice(0, 3).forEach((item: any) => {
      list.push({
        id: `out-${item.id}`,
        type: 'outbound',
        title: `出库：${item.outboundNo || item.outbound_no || '出库单'}`,
        desc: `${item.projectName || item.project_name || '项目消耗'} · ${item.operator || '系统'}`,
        time: formatTime(item.createdAt || item.created_at),
      })
    })
    return list.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6)
  }, [recentInbound, recentOutbound])

  // 计算 alertCount
  const alertCount = useMemo(() => {
    if (inventoryStats) {
      return (inventoryStats.lowStockCount || 0) + (inventoryStats.expiringCount || 0) + (inventoryStats.expiredCount || 0)
    }
    return pendingAlerts.length
  }, [inventoryStats, pendingAlerts])

  return {
    loading,
    today,
    role,
    config,
    inventoryStats,
    costSummary,
    inboundStats,
    outboundStats,
    pendingAlerts,
    alertCount,
    activities,
  }
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

/** 安全格式化数字（H-2: 防止 NaN/Infinity） */
export function formatNumber(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN')
}

/** 安全格式化货币 */
export function formatCurrency(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 安全格式化百分比 */
export function formatPercent(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(1)}%`
}
