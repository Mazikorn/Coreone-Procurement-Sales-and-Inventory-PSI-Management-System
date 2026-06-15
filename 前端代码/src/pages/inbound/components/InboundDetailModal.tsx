import { Modal } from '@/components/ui/Modal'
import { Printer } from 'lucide-react'
import type { InboundRecord, Material } from '@/types'
import { formatDateTime, formatCurrency } from '@/lib/utils'

interface InboundDetailModalProps {
  open: boolean
  record: InboundRecord | null
  materials: Material[]
  onClose: () => void
  onPrint: () => void
}

const TYPE_LABELS: Record<string, string> = {
  direct: '直接入库',
  purchase: '采购入库',
  return: '退库入库',
  transfer: '调拨入库',
  surplus: '盘盈入库',
  other: '其他入库',
}

export default function InboundDetailModal({
  open,
  record,
  materials,
  onClose,
  onPrint,
}: InboundDetailModalProps) {
  if (!open || !record) return null

  const material = materials.find(m => m.id === record.materialId)

  return (
    <Modal onClose={onClose} title="入库详情" size="lg">
      <div className="space-y-4">
        {/* 基本信息 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-gray-500">入库单号</span>
              <p className="text-sm font-mono font-medium text-gray-900">{record.inboundNo}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">入库类型</span>
              <p className="text-sm font-medium text-gray-900">
                {TYPE_LABELS[record.type] || record.type}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">状态</span>
              <p className="text-sm">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  record.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {record.status === 'completed' ? '已完成' : '已取消'}
                </span>
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">操作时间</span>
              <p className="text-sm text-gray-900">{formatDateTime(record.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* 物料信息 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">物料信息</h4>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-500">耗材名称</span>
              <span className="text-sm font-medium text-gray-900">
                {record.materialName || material?.name || '-'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-500">耗材编码</span>
              <span className="text-sm font-mono text-gray-900">{material?.code || '-'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-500">批号</span>
              <span className="text-sm font-mono text-gray-900">{record.batchNo || '-'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-500">数量</span>
              <span className="text-sm font-medium text-gray-900">
                {record.quantity} {record.unit || ''}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-500">单价</span>
              <span className="text-sm text-gray-900">{formatCurrency(record.price)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-500">金额</span>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(record.amount || record.price * record.quantity)}
              </span>
            </div>
          </div>
        </div>

        {/* 供应商/库位 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">供应商 / 库位</h4>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-500">供应商</span>
              <span className="text-sm text-gray-900">{record.supplierName || '-'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-500">库位</span>
              <span className="text-sm text-gray-900">{record.locationName || '-'}</span>
            </div>
          </div>
        </div>

        {/* 日期信息 */}
        {(record.productionDate || record.expiryDate) && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">日期信息</h4>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {record.productionDate && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-500">生产日期</span>
                  <span className="text-sm text-gray-900">{record.productionDate}</span>
                </div>
              )}
              {record.expiryDate && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-500">有效期至</span>
                  <span className="text-sm text-gray-900">{record.expiryDate}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 备注 */}
        {record.remark && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">备注</h4>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{record.remark}</p>
          </div>
        )}

        {/* 取消原因 */}
        {record.status === 'cancelled' && record.cancelReason && (
          <div className="bg-red-50 rounded-lg p-3">
            <span className="text-xs font-medium text-red-700">取消原因：</span>
            <span className="text-sm text-red-600">{record.cancelReason}</span>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onPrint}
          className="h-10 px-4 inline-flex items-center gap-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Printer className="w-4 h-4" /> 打印
        </button>
        <button
          onClick={onClose}
          className="h-10 px-4 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
        >
          关闭
        </button>
      </div>
    </Modal>
  )
}
