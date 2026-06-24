import React from 'react'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { InboundRecord, Material } from '@/types'
import { CornerUpLeft, FileSearch } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface InboundDetailModalProps {
  open: boolean
  record: InboundRecord | null
  materials: Material[]
  onClose: () => void
  onPrint: () => void
}

export default function InboundDetailModal({ open, record, materials, onClose, onPrint }: InboundDetailModalProps) {
  const navigate = useNavigate()

  if (!open || !record) return null

  const material = materials.find(item => item.id === record.materialId)
  const openAuditEvidence = () => navigate(`/logs?keyword=${encodeURIComponent(record.inboundNo)}`)
  const openSupplierReturnDraft = () => {
    const params = new URLSearchParams({
      action: 'create',
      materialId: record.materialId,
      inboundRecordId: record.id,
      quantity: '1',
      reason: 'quality_issue',
      remark: `来自入库详情退供：${record.inboundNo} / ${record.materialName || record.materialId} / ${record.batchNo || '无批次'}`,
    })
    if (record.supplierId) params.set('supplierId', record.supplierId)
    if (record.purchaseOrderId) params.set('purchaseOrderId', record.purchaseOrderId)
    onClose()
    navigate(`/supplier-returns?${params.toString()}`)
  }
  const inboundAmount = record.amount || record.price * record.quantity
  const batchLocationText = `${record.batchNo || '无批次'} / ${record.locationName || '未记录库位'}`
  const chainDescription = record.status === 'completed'
    ? '确认库存、批次、成本和审计记录已形成，后续出库、盘点、成本重算可继续引用。'
    : '该入库已取消，请以取消原因和审计记录为准，不应继续用于库存和成本流转。'

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

        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <div className="text-sm font-semibold text-emerald-900">入库数据链回看</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Info label="库存批次" value={batchLocationText} />
            <Info label="入库成本" value={formatCurrency(inboundAmount)} />
            <Info label="审计检索" value={record.inboundNo} />
          </div>
          <div className="mt-3 text-xs text-emerald-800">{chainDescription}</div>
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
          {record.status === 'completed' && (
            <button
              type="button"
              aria-label={`退供 ${record.materialName || record.materialId} ${record.batchNo || '无批次'}`}
              onClick={openSupplierReturnDraft}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-4 text-sm text-orange-700 hover:bg-orange-100"
            >
              <CornerUpLeft className="h-4 w-4" />
              退供
            </button>
          )}
          <button
            type="button"
            onClick={openAuditEvidence}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-600 hover:bg-gray-50"
          >
            <FileSearch className="h-4 w-4" />
            审计证据
          </button>
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
