import React from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { InventoryConsistencyCheck, InventoryConsistencyIssue } from '@/types'

interface Props {
  open: boolean
  loading: boolean
  result: InventoryConsistencyCheck | null
  onClose: () => void
  onRefresh: () => void
}

const issueLabels: Record<string, string> = {
  INACTIVE_MATERIAL_WITH_STOCK: '停用物料仍有库存',
  ACTIVE_BOM_INVALID_MATERIAL: '启用BOM依赖不可用物料',
  ACTIVE_BOM_INVALID_EQUIPMENT: '启用BOM依赖不可用设备',
  ACTIVE_PROJECT_INVALID_BOM: '启用检测服务绑定不可用BOM',
  INACTIVE_LOCATION_WITH_STOCK: '停用库位仍有库存',
  DELETED_LOCATION_WITH_STOCK: '已删除库位仍有库存',
  INVENTORY_BATCH_MISMATCH: '库存总账与批次不一致',
  INVENTORY_LOCATION_MISMATCH: '库存总账与库位不一致',
}

function formatImpactValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return String(value)
}

function impactSummary(issue: InventoryConsistencyIssue) {
  const entries = Object.entries(issue.impacts || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 4)
  if (entries.length === 0) return null
  return entries.map(([key, value]) => `${key}: ${formatImpactValue(value)}`).join('，')
}

export function InventoryConsistencyModal({ open, loading, result, onClose, onRefresh }: Props) {
  if (!open) return null

  const issueCount = result?.summary.issueCount ?? 0
  const hasIssues = issueCount > 0

  return (
    <Modal title="库存数据诊断" onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className={`flex items-start gap-3 rounded-lg border p-4 ${hasIssues ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${hasIssues ? 'bg-amber-100' : 'bg-green-100'}`}>
            {hasIssues ? <ShieldAlert className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-green-600" />}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {loading ? '正在扫描库存与主数据...' : hasIssues ? `发现 ${issueCount} 个数据问题` : '未发现数据问题'}
            </div>
            <div className="mt-1 text-sm text-gray-600">
              扫描物料、BOM、检测服务、库位、批次和库位库存的历史一致性；该操作只读，不会修改业务数据。
            </div>
          </div>
        </div>

        {result && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">问题总数</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{result.summary.issueCount}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">严重问题</div>
              <div className="mt-1 text-xl font-semibold text-red-600">{result.summary.criticalCount}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">提醒问题</div>
              <div className="mt-1 text-xl font-semibold text-amber-600">{result.summary.warningCount}</div>
            </div>
          </div>
        )}

        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">正在加载诊断结果...</div>
          ) : !result ? (
            <div className="p-4 text-sm text-gray-500">点击重新扫描获取最新诊断结果。</div>
          ) : result.issues.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              当前库存与主数据一致性检查通过。
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {result.issues.map((issue, index) => {
                const summary = impactSummary(issue)
                return (
                  <div key={`${issue.code}-${issue.entityId}-${index}`} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <span className="text-sm font-semibold text-gray-900">{issueLabels[issue.code] || issue.code}</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700">{issue.message}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {issue.entityCode || issue.entityId} {issue.entityName ? `· ${issue.entityName}` : ''}
                        </div>
                        {summary && (
                          <div className="mt-1 text-xs text-gray-500">{summary}</div>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${issue.severity === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        {issue.severity === 'critical' ? '严重' : '提醒'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="h-10 rounded-md bg-blue-500 px-4 text-sm text-white transition-colors hover:bg-blue-600 disabled:bg-gray-300"
          >
            {loading ? '扫描中...' : '重新扫描'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
