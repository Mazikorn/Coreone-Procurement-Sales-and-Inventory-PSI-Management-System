import React from 'react'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import type { UsePaginationReturn } from '@/hooks/usePagination'
import type { ReconcileLog } from '../hooks/useReconciliationPage'

interface Props {
  logPagination: UsePaginationReturn<ReconcileLog>
}

const statusLabels: Record<string, string> = {
  normal: '正常',
  modified: '已修改',
  unmatched: '未关联',
  partial: '部分异常',
}

function getLogTypeLabel(type: string) {
  if (type === 'bom_fix') return '修正 BOM'
  if (type === 'case_edit') return '修改病例'
  return '对账记录'
}

function getStatusLabel(status?: unknown) {
  if (typeof status !== 'string' || !status) return '-'
  return statusLabels[status] || status
}

function parseSnapshot(value: string) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function buildLogDisplay(log: ReconcileLog) {
  if (log.type !== 'case_edit') {
    return {
      typeLabel: getLogTypeLabel(log.type),
      fieldLabel: log.field || '-',
      oldText: log.old_value || '-',
      newText: log.new_value || '-',
      changeLines: log.old_value && log.new_value
        ? [`从 ${log.old_value} 调整为 ${log.new_value}`]
        : [],
    }
  }

  const oldSnapshot = parseSnapshot(log.old_value)
  const newSnapshot = parseSnapshot(log.new_value)
  const oldProject = String(oldSnapshot?.projectName || oldSnapshot?.projectId || '-')
  const newProject = String(newSnapshot?.projectName || newSnapshot?.projectId || '-')
  const oldStatus = getStatusLabel(oldSnapshot?.status)
  const newStatus = getStatusLabel(newSnapshot?.status)

  return {
    typeLabel: getLogTypeLabel(log.type),
    fieldLabel: '病例项目、状态',
    oldText: `${oldProject} / ${oldStatus}`,
    newText: `${newProject} / ${newStatus}`,
    changeLines: [
      `项目：${oldProject} -> ${newProject}`,
      `状态：${oldStatus} -> ${newStatus}`,
    ],
  }
}

export function LogListTab({ logPagination }: Props) {
  const [selectedLog, setSelectedLog] = React.useState<ReconcileLog | null>(null)
  const selectedLogDisplay = selectedLog ? buildLogDisplay(selectedLog) : null

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">对账修正记录</h3>
        </div>
        <div className="p-5">
          {logPagination.data.length === 0 && !logPagination.loading ? (
            <div className="text-center py-8 text-gray-400">暂无修正记录</div>
          ) : (
            <div className="space-y-4">
              {logPagination.data.map(log => {
                const display = buildLogDisplay(log)
                return (
                  <div key={log.id} className="flex gap-3 pb-4 border-b border-gray-200 last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.type === 'bom_fix' ? 'bg-blue-500' : 'bg-green-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800">
                        <strong>{display.typeLabel}</strong>：{log.target_name}
                      </div>
                      {display.changeLines.length > 0 && (
                        <div className="mt-1 space-y-0.5 text-sm text-gray-700">
                          {display.changeLines.map(line => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-400">
                        {log.created_at} · {log.operator} · 原因：{log.reason}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="h-8 flex-shrink-0 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      查看详情
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-4">
            <Pagination
              page={logPagination.page}
              pageSize={logPagination.pageSize}
              total={logPagination.total}
              onChange={logPagination.setPage}
              onPageSizeChange={logPagination.setPageSize}
            />
          </div>
        </div>
      </div>

      {selectedLog && (
        <Modal title="修正日志详情" onClose={() => setSelectedLog(null)} size="lg">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">修正时间</dt>
              <dd className="mt-1 text-gray-900">{selectedLog.created_at || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">操作人</dt>
              <dd className="mt-1 text-gray-900">{selectedLog.operator || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">类型</dt>
              <dd className="mt-1 text-gray-900">{selectedLogDisplay?.typeLabel || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">项目/物料</dt>
              <dd className="mt-1 text-gray-900">{selectedLog.target_name || selectedLog.target_id || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">修正字段</dt>
              <dd className="mt-1 text-gray-900">{selectedLogDisplay?.fieldLabel || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">目标ID</dt>
              <dd className="mt-1 break-all text-gray-900">{selectedLog.target_id || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">修正前</dt>
              <dd className="mt-1 text-gray-900">{selectedLogDisplay?.oldText || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">修正后</dt>
              <dd className="mt-1 text-gray-900">{selectedLogDisplay?.newText || '-'}</dd>
            </div>
            {selectedLogDisplay?.changeLines.map(line => (
              <div key={line}>
                <dt className="text-xs font-medium text-gray-500">{line.split('：')[0]}变化</dt>
                <dd className="mt-1 text-gray-900">{line.split('：')[1] || line}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">修正原因</dt>
              <dd className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-gray-900">
                {selectedLog.reason || '-'}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setSelectedLog(null)}
              className="h-9 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              关闭
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
