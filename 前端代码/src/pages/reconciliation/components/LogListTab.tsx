import React from 'react'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import type { UsePaginationReturn } from '@/hooks/usePagination'
import type { ReconcileLog } from '../hooks/useReconciliationPage'

interface Props {
  logPagination: UsePaginationReturn<ReconcileLog>
}

export function LogListTab({ logPagination }: Props) {
  const [selectedLog, setSelectedLog] = React.useState<ReconcileLog | null>(null)

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">BOM修正记录</h3>
        </div>
        <div className="p-5">
          {logPagination.data.length === 0 && !logPagination.loading ? (
            <div className="text-center py-8 text-gray-400">暂无修正记录</div>
          ) : (
            <div className="space-y-4">
              {logPagination.data.map(log => (
                <div key={log.id} className="flex gap-3 pb-4 border-b border-gray-100 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.type === 'bom_fix' ? 'bg-blue-500' : 'bg-green-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-800">
                      <strong>{log.type === 'bom_fix' ? '修正 BOM' : '新增关联'}</strong>：
                      {log.target_name}
                      {log.field && ` · ${log.field}`}
                      {log.old_value && log.new_value && (
                        <span> 从 <span className="line-through text-gray-400">{log.old_value}</span> 调整为 <strong>{log.new_value}</strong></span>
                      )}
                    </div>
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
              ))}
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
              <dd className="mt-1 text-gray-900">{selectedLog.type === 'bom_fix' ? '修正 BOM' : '新增关联'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">项目/物料</dt>
              <dd className="mt-1 text-gray-900">{selectedLog.target_name || selectedLog.target_id || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">修正字段</dt>
              <dd className="mt-1 text-gray-900">{selectedLog.field || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">目标ID</dt>
              <dd className="mt-1 break-all text-gray-900">{selectedLog.target_id || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">修正前</dt>
              <dd className="mt-1 text-gray-900">{selectedLog.old_value || '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">修正后</dt>
              <dd className="mt-1 text-gray-900">{selectedLog.new_value || '-'}</dd>
            </div>
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
