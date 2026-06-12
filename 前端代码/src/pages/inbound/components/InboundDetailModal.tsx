import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { InboundRecord, Material } from '@/types'

interface InboundDetailModalProps {
  open: boolean
  record: InboundRecord | null
  materials: Material[]
  onClose: () => void
  onPrint: () => void
}

export default function InboundDetailModal({ open, record, materials, onClose, onPrint }: InboundDetailModalProps) {
  if (!open || !record) return null

  const material = materials.find(item => item.id === record.materialId)

  return (
    <Modal onClose={onClose} title="入库详情" size="lg">
      <div className="space-y-5">
        <div className="flex items-start justify-between rounded-lg bg-gray-50 p-4">
          <div>
            <div className="text-sm text-gray-500">入库单号</div>
            <div className="mt-1 font-mono text-base font-semibold text-gray-900">{record.inboundNo}</div>
          </div>
          <span className={record.status === 'completed' ? 'rounded-full bg-green-50 px-3 py-1 text-sm text-green-700' : 'rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600'}>
            {record.status === 'completed' ? '已完成' : '已取消'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="耗材名称" value={record.materialName} />
          <Info label="耗材编码" value={material?.code || '-'} />
          <Info label="规格" value={material?.spec || '-'} />
          <Info label="批号" value={record.batchNo || '-'} />
          <Info label="数量" value={`${record.quantity} ${record.unit || ''}`} />
          <Info label="单价" value={formatCurrency(record.price)} />
          <Info label="金额" value={formatCurrency(record.amount || record.price * record.quantity)} />
          <Info label="供应商" value={record.supplierName || '-'} />
          <Info label="库位" value={record.locationName || '-'} />
          <Info label="生产日期" value={record.productionDate || '-'} />
          <Info label="有效期至" value={record.expiryDate || '-'} />
          <Info label="操作人" value={record.operator || '-'} />
          <Info label="入库时间" value={formatDateTime(record.createdAt)} />
          <Info label="采购订单" value={record.purchaseOrderNo || record.purchaseOrderId || '-'} />
        </div>

        {record.remark && (
          <div>
            <div className="text-sm text-gray-500">备注</div>
            <div className="mt-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">{record.remark}</div>
          </div>
        )}

        {record.cancelReason && (
          <div>
            <div className="text-sm text-gray-500">取消原因</div>
            <div className="mt-1 rounded-md bg-red-50 p-3 text-sm text-red-700">{record.cancelReason}</div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-600 hover:bg-gray-50"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="h-10 rounded-md bg-blue-500 px-4 text-sm text-white hover:bg-blue-600"
          >
            打印
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
    </div>
  )
}

