import React from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { BOM, BOMDeleteCheck } from '@/types'

interface Props {
  open: boolean
  editingId: string | null
  data: BOM[]
  deleteCheck: BOMDeleteCheck | null
  checkingDelete: boolean
  isSubmitting: boolean
  onClose: () => void
  onConfirm: () => void
}

export function BOMDeleteModal({ open, editingId, data, deleteCheck, checkingDelete, isSubmitting, onClose, onConfirm }: Props) {
  if (!open) return null

  const target = data.find((d) => d.id === editingId)
  const disabled = checkingDelete || isSubmitting || !deleteCheck || deleteCheck.deletable === false
  const impacts = deleteCheck?.impacts
  const impactItems = impacts ? [
    { label: '检测项目', value: impacts.projectCount },
    { label: '成本明细', value: impacts.outboundDetailCount },
  ] : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {deleteCheck?.deletable === false ? '无法删除' : '确认删除'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h4 className="text-base font-semibold text-gray-900 mb-1">
              {deleteCheck?.deletable === false ? '该BOM已被业务数据引用' : '确定要删除该BOM吗？'}
            </h4>
            <p className="text-sm text-gray-500 mb-4">删除前会检查检测项目和出库成本明细引用</p>
            <div className="w-full bg-gray-50 p-3 rounded-lg text-left">
              <div className="text-xs text-gray-500 mb-1">待删除BOM</div>
              <div className="font-semibold text-gray-900">
                {deleteCheck?.bom.code || target?.code} {deleteCheck?.bom.name || target?.name}
              </div>
            </div>
            <div className="mt-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-left">
              {checkingDelete ? (
                <div className="text-sm text-gray-500">正在检查删除影响...</div>
              ) : deleteCheck ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {impactItems.map(item => (
                      <div key={item.label} className="rounded-md bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{item.label}</div>
                        <div className={`mt-1 text-base font-semibold ${item.value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  {deleteCheck.reasons.length > 0 ? (
                    <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                      {deleteCheck.reasons.join('；')}，请先解除引用后再删除。
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                      未发现业务引用，可以删除；删除后该BOM不会再用于新检测服务绑定、项目出库、LIS对账、ABC成本计算、项目成本归集和审计筛选。
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-red-600">删除影响检查失败，请关闭后重试。</div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors border border-gray-200"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={disabled}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {checkingDelete ? '检查中...' : isSubmitting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}
