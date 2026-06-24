import { useState, useMemo, Fragment } from 'react'
import { X, ChevronDown, ChevronRight, AlertTriangle, FileSearch, RotateCcw } from 'lucide-react'
import type { OutboundRecord, OutboundItem } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

interface OutboundDetailModalProps {
  open: boolean
  record: OutboundRecord | null
  onClose: () => void
  onPrint: (record: OutboundRecord) => void
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  completed: { label: '已完成', bg: 'bg-green-50', text: 'text-green-600' },
  pending: { label: '待出库', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  cancelled: { label: '已取消', bg: 'bg-red-50', text: 'text-red-600' },
}

const costStatusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending_cost: { label: '待核算', bg: 'bg-gray-100', text: 'text-gray-600' },
  costed: { label: '已核算', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  cost_exception: { label: '成本异常', bg: 'bg-red-50', text: 'text-red-700' },
  recalculated: { label: '已重算', bg: 'bg-blue-50', text: 'text-blue-700' },
}

interface MaterialGroup {
  materialId: string
  materialName: string
  unit: string
  totalQuantity: number
  totalCost: number
  avgUnitCost: number
  items: OutboundItem[]
}

const usageLabels: Record<string, string> = {
  self: '自用',
  external: '外给',
}

function formatUsage(item: Pick<OutboundItem, 'usage'>) {
  return usageLabels[item.usage || 'self'] || '自用'
}

function formatReceiver(item: Pick<OutboundItem, 'receiver'>) {
  return item.receiver?.trim() || '-'
}

function summarizeItems<T>(items: T[], formatter: (item: T) => string) {
  const values = Array.from(new Set(items.map(formatter).filter(Boolean)))
  return values.length > 0 ? values.join('、') : '-'
}

export default function OutboundDetailModal({ open, record, onClose, onPrint }: OutboundDetailModalProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

  const groupedItems = useMemo<MaterialGroup[]>(() => {
    if (!record?.items) return []
    const map = new Map<string, MaterialGroup>()
    for (const item of record.items) {
      const existing = map.get(item.materialId)
      if (existing) {
        existing.items.push(item)
        existing.totalQuantity += item.quantity
        existing.totalCost += item.totalCost
      } else {
        map.set(item.materialId, {
          materialId: item.materialId,
          materialName: item.materialName || '-',
          unit: item.unit,
          totalQuantity: item.quantity,
          totalCost: item.totalCost,
          avgUnitCost: 0,
          items: [item],
        })
      }
    }
    const groups = Array.from(map.values())
    for (const g of groups) {
      g.avgUnitCost = g.totalQuantity > 0 ? g.totalCost / g.totalQuantity : 0
    }
    return groups
  }, [record?.items])

  const toggleExpand = (materialId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(materialId)) {
        next.delete(materialId)
      } else {
        next.add(materialId)
      }
      return next
    })
  }

  const openAuditEvidence = () => {
    onClose()
    navigate(`/logs?keyword=${encodeURIComponent(record.outboundNo)}`)
  }

  if (!open || !record) return null

  const costCfg = costStatusConfig[record.costStatus || 'pending_cost'] || costStatusConfig.pending_cost
  const buildReturnDraftUrl = (item: OutboundItem) => {
    const params = new URLSearchParams({
      action: 'create',
      outboundItemId: item.id,
      quantity: '1',
      reason: 'unused',
      remark: `来自出库详情退库：${record.outboundNo} / ${item.materialName || item.materialId} / ${item.batchNo || '无批次'}`,
    })
    return `/returns?${params.toString()}`
  }
  const openReturnDraft = (item: OutboundItem) => {
    onClose()
    navigate(buildReturnDraftUrl(item))
  }
  const renderReturnAction = (item: OutboundItem) => {
    if (record.status !== 'completed') {
      return <span className="text-xs text-gray-400">-</span>
    }

    return (
      <button
        type="button"
        aria-label={`退库 ${item.materialName || item.materialId} ${item.batchNo || '无批次'}`}
        onClick={() => openReturnDraft(item)}
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        退库
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">出库详情</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors duration-150"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="text-xl font-semibold text-gray-900">{record.outboundNo}</div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                statusConfig[record.status]?.bg
              } ${statusConfig[record.status]?.text}`}
            >
              {statusConfig[record.status]?.label}
            </span>
          </div>
          <div className="text-sm text-gray-500">出库时间: {formatDate(record.createdAt)}</div>

          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-md">
            <div>
              <div className="text-xs text-gray-500 mb-1">关联项目</div>
              <div className="text-sm font-medium text-gray-900">{record.projectName || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">领用人</div>
              <div className="text-sm font-medium text-gray-900">{record.operator}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">操作人</div>
              <div className="text-sm font-medium text-gray-900">{record.operator}</div>
            </div>
          </div>

          {record.caseNo && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-md border border-blue-100">
              <div>
                <div className="text-xs text-blue-700 mb-1">病例号</div>
                <div className="text-sm font-semibold text-gray-900">{record.caseNo}</div>
              </div>
              <div>
                <div className="text-xs text-blue-700 mb-1">样本数</div>
                <div className="text-sm font-semibold text-gray-900">{record.sampleCount || '-'}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-emerald-50 rounded-md border border-emerald-100">
            <div>
              <div className="text-xs text-emerald-700 mb-1">成本状态</div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${costCfg.bg} ${costCfg.text}`}>
                  {record.costStatus === 'cost_exception' && <AlertTriangle className="h-3 w-3" />}
                  {costCfg.label}
                </span>
                {record.costStatus === 'cost_exception' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      navigate(`/abc/alerts?outboundId=${encodeURIComponent(record.id)}`)
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    查看异常
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-emerald-700 mb-1">ABC总成本</div>
              <div className="text-sm font-semibold text-gray-900">{record.abcTotalCost ? formatCurrency(record.abcTotalCost) : '-'}</div>
            </div>
            <div>
              <div className="text-xs text-emerald-700 mb-1">收费金额</div>
              <div className="text-sm font-semibold text-gray-900">{record.feeAmount ? formatCurrency(record.feeAmount) : '-'}</div>
            </div>
            <div>
              <div className="text-xs text-emerald-700 mb-1">利润</div>
              {record.profit !== undefined && record.profit !== 0 ? (
                <div className={`text-sm font-semibold ${record.profit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {record.profit > 0 ? '+' : ''}{formatCurrency(record.profit)}
                </div>
              ) : (
                <div className="text-sm font-semibold text-gray-400">-</div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm border border-gray-200 rounded-md overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">物料名称</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">批号</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">出库数量</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">用途</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">接收/领用方</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">单位</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">单价</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">金额</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groupedItems.map((group) => {
                  const isExpanded = expandedIds.has(group.materialId)
                  const hasMultiple = group.items.length > 1
                  return (
                    <Fragment key={group.materialId}>
                      <tr className={hasMultiple ? 'bg-gray-50/60' : ''}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            {hasMultiple && (
                              <button
                                onClick={() => toggleExpand(group.materialId)}
                                className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                            <span className="font-medium text-gray-900">{group.materialName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-500 text-xs">
                          {hasMultiple ? `${group.items.length}个批次` : (group.items[0]?.batchNo || '-')}
                        </td>
                        <td className="px-4 py-2">{group.totalQuantity}</td>
                        <td className="px-4 py-2 text-gray-700">{summarizeItems(group.items, formatUsage)}</td>
                        <td className="px-4 py-2 text-gray-700">{summarizeItems(group.items, formatReceiver)}</td>
                        <td className="px-4 py-2 text-gray-500">{group.unit}</td>
                        <td className="px-4 py-2">
                          {hasMultiple ? (
                            <span className="text-xs text-gray-400">均价 {formatCurrency(group.avgUnitCost)}</span>
                          ) : (
                            formatCurrency(group.avgUnitCost)
                          )}
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-900">{formatCurrency(group.totalCost)}</td>
                        <td className="px-4 py-2">
                          {hasMultiple ? (
                            <span className="text-xs text-gray-400">展开明细退库</span>
                          ) : (
                            renderReturnAction(group.items[0])
                          )}
                        </td>
                      </tr>
                      {hasMultiple && isExpanded && group.items.map((item, i) => (
                        <tr key={`${group.materialId}-${i}`} className="bg-white">
                          <td className="px-4 py-1.5 pl-10" />
                          <td className="px-4 py-1.5 font-mono text-gray-500 text-xs">{item.batchNo || '-'}</td>
                          <td className="px-4 py-1.5 text-sm text-gray-600">{item.quantity}</td>
                          <td className="px-4 py-1.5 text-sm text-gray-600">{formatUsage(item)}</td>
                          <td className="px-4 py-1.5 text-sm text-gray-600">{formatReceiver(item)}</td>
                          <td className="px-4 py-1.5 text-sm text-gray-400">{item.unit}</td>
                          <td className="px-4 py-1.5 text-sm text-gray-600">{formatCurrency(item.unitCost)}</td>
                          <td className="px-4 py-1.5 text-sm text-gray-600">{formatCurrency(item.totalCost)}</td>
                          <td className="px-4 py-1.5">{renderReturnAction(item)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={7} className="px-4 py-2 text-right text-gray-700">合计:</td>
                  <td className="px-4 py-2 text-gray-900">{formatCurrency(record.totalCost)}</td>
                  <td className="px-4 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>

          {record.projectName && (
            <div className="p-3 bg-blue-50 rounded-md border border-blue-100">
              <div className="text-xs text-blue-600 font-medium mb-1.5">成本计算说明</div>
              <div className="text-xs text-blue-700 space-y-1">
                <p>本项目为 BOM 关联出库，实际成本按批次加权计算：</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  {groupedItems.slice(0, 3).map(g => (
                    <li key={g.materialId}>
                      {g.materialName}：{g.items.length > 1 ? (
                        <span>{g.items.map(item => `${item.quantity}×${formatCurrency(item.unitCost)}`).join(' + ')} = {formatCurrency(g.totalCost)}</span>
                      ) : (
                        <span>{g.totalQuantity} × {formatCurrency(g.avgUnitCost)} = {formatCurrency(g.totalCost)}</span>
                      )}
                    </li>
                  ))}
                  {groupedItems.length > 3 && (
                    <li className="text-blue-500">... 共 {groupedItems.length} 种物料</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {record.remark && (
            <div className="p-3 bg-gray-50 rounded-md">
              <div className="text-xs text-gray-500 mb-1">备注</div>
              <div className="text-sm text-gray-700">{record.remark}</div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={openAuditEvidence}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-blue-600 bg-blue-50 border border-blue-100 rounded-md hover:bg-blue-100 transition-colors duration-150"
          >
            <FileSearch className="h-4 w-4" />
            审计证据
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-150"
          >
            关闭
          </button>
          <button
            onClick={() => onPrint(record)}
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-150"
          >
            打印
          </button>
        </div>
      </div>
    </div>
  )
}
