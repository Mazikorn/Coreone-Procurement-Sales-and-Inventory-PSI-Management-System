import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, X, Package } from 'lucide-react'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { Modal } from '@/components/ui/Modal'
import { purchaseOrderApi } from '@/api/inventory'
import { materialApi, supplierApi } from '@/api/master'
import type { PurchaseOrder, Material, Supplier } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: '待收货', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  partial: { label: '部分收货', bg: 'bg-blue-50', text: 'text-blue-600' },
  completed: { label: '已完成', bg: 'bg-green-50', text: 'text-green-600' },
  cancelled: { label: '已取消', bg: 'bg-red-50', text: 'text-red-600' },
}

export default function PurchaseOrders() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [receiveQty, setReceiveQty] = useState(0)

  const [form, setForm] = useState({
    materialId: '',
    supplierId: '',
    orderedQty: 1,
    unitPrice: 0,
    unit: '个',
    expectedDate: '',
    remark: '',
  })

  const fetchRefs = async () => {
    try {
      const [mRes, sRes]: any = await Promise.all([
        materialApi.getList({ page: 1, pageSize: 999, status: 'active' }),
        supplierApi.getList({ page: 1, pageSize: 999, status: 'active' }),
      ])
      setMaterials(mRes?.list || [])
      setSuppliers(sRes?.list || [])
    } catch (e) { console.error(e) }
  }

  useEffect(() => { fetchRefs() }, [])

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res: any = await purchaseOrderApi.getList({
        page, pageSize,
        status: statusFilter || undefined,
        keyword: searchText || undefined,
      })
      return { list: res.list || [], pagination: res.pagination }
    },
    [statusFilter, searchText]
  )

  const {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<PurchaseOrder>({
    fetchFn,
    deps: [statusFilter, searchText],
  })

  const handleCreate = async () => {
    if (!form.materialId || form.orderedQty <= 0) {
      toast.error('请选择物料并填写采购数量')
      return
    }
    const mat = materials.find(m => m.id === form.materialId)
    try {
      await purchaseOrderApi.create({
        ...form,
        materialName: mat?.name || '',
        unitPrice: form.unitPrice,
      })
      toast.success('采购订单创建成功')
      setModalOpen(false)
      setForm({ materialId: '', supplierId: '', orderedQty: 1, unitPrice: 0, unit: '个', expectedDate: '', remark: '' })
      refresh()
    } catch (e) {
      toast.error('创建失败')
    }
  }

  const handleReceive = async () => {
    if (!selectedOrder || receiveQty <= 0) return
    if (receiveQty > selectedOrder.remainingQty) {
      toast.error('收货数量不能超过剩余数量')
      return
    }
    try {
      await purchaseOrderApi.receive(selectedOrder.id, { quantity: receiveQty })
      toast.success('收货成功')
      setReceiveModalOpen(false)
      setSelectedOrder(null)
      refresh()
    } catch (e) {
      toast.error('收货失败')
    }
  }

  const handleCancel = async (order: PurchaseOrder) => {
    try {
      await purchaseOrderApi.cancel(order.id)
      toast.success('订单已取消')
      refresh()
    } catch (e) {
      toast.error('取消失败')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900">采购订单</h1>
          <p className="text-sm text-gray-500 mt-1">管理物料采购订单及收货进度</p>
        </div>
        <button
          onClick={() => { fetchRefs(); setModalOpen(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium transition-all duration-150"
        >
          <Plus className="w-4 h-4" />
          新建采购订单
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 border-b border-gray-200">
          <span className="text-base font-medium text-gray-900">采购订单</span>
          <div className="flex-1 flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索订单号/物料名称..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-9 pr-3 h-10 w-64 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <SearchableSelect
              value={statusFilter}
              onChange={val => setStatusFilter(val)}
              options={[
                { value: '', label: '全部状态' },
                { value: 'pending', label: '待收货' },
                { value: 'partial', label: '部分收货' },
                { value: 'completed', label: '已完成' },
                { value: 'cancelled', label: '已取消' },
              ]}
              placeholder="全部状态"
              className="w-32"
            />
            <button
              onClick={() => { setSearchText(''); setStatusFilter(''); setPage(1) }}
              className="h-10 px-4 text-gray-500 rounded-md text-sm hover:text-gray-700 hover:bg-gray-50 transition-all duration-150"
            >
              重置
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">订单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物料</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">供应商</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">采购数量</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">已收货</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">单价</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">总金额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[140px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                data.map(row => {
                  const cfg = statusConfig[row.status] || statusConfig.pending
                  const supplier = suppliers.find(s => s.id === row.supplierId)
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-4 py-3 font-mono text-gray-600">{row.orderNo}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.materialName}</td>
                      <td className="px-4 py-3 text-gray-600">{supplier?.name || '-'}</td>
                      <td className="px-4 py-3 text-right">{row.orderedQty} {row.unit}</td>
                      <td className="px-4 py-3 text-right">{row.receivedQty} {row.unit}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelectedOrder(row); setDetailModalOpen(true) }}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                          >
                            详情
                          </button>
                          {(row.status === 'pending' || row.status === 'partial') && (
                            <>
                              <button
                                onClick={() => { setSelectedOrder(row); setReceiveQty(row.remainingQty); setReceiveModalOpen(true) }}
                                className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                              >
                                收货
                              </button>
                              <button
                                onClick={() => handleCancel(row)}
                                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
                              >
                                取消
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <span className="text-sm text-gray-500">共 {total} 条记录</span>
          <Pagination page={page} pageSize={pageSize} total={total} onChangePage={setPage} onChangePageSize={setPageSize} />
        </div>
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title="新建采购订单" size="lg">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">物料 <span className="text-red-500">*</span></label>
              <SearchableSelect
                value={form.materialId}
                onChange={val => setForm({ ...form, materialId: val })}
                options={materials.map(m => ({
                  value: m.id,
                  label: `${m.name} (${m.code})`,
                }))}
                placeholder="请选择"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">供应商</label>
                <SearchableSelect
                  value={form.supplierId}
                  onChange={val => setForm({ ...form, supplierId: val })}
                  options={suppliers.map(s => ({
                    value: s.id,
                    label: s.name,
                  }))}
                  placeholder="请选择"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">采购数量 <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min={1}
                  value={form.orderedQty}
                  onChange={e => setForm({ ...form, orderedQty: Number(e.target.value) })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">单价</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.unitPrice}
                  onChange={e => setForm({ ...form, unitPrice: Number(e.target.value) })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">单位</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">预计到货日期</label>
              <input
                type="date"
                value={form.expectedDate}
                onChange={e => setForm({ ...form, expectedDate: e.target.value })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                value={form.remark}
                onChange={e => setForm({ ...form, remark: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setModalOpen(false)} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button onClick={handleCreate} className="px-4 h-10 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors">确认创建</button>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedOrder && (
        <Modal onClose={() => setDetailModalOpen(false)} title="采购订单详情" size="lg">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">订单号</span>
              <span className="font-mono text-sm font-medium">{selectedOrder.orderNo}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">物料</span>
              <span className="text-sm font-medium">{selectedOrder.materialName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">供应商</span>
              <span className="text-sm font-medium">{suppliers.find(s => s.id === selectedOrder.supplierId)?.name || '-'}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500">采购数量</div>
                <div className="text-lg font-semibold">{selectedOrder.orderedQty} {selectedOrder.unit}</div>
              </div>
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500">已收货</div>
                <div className="text-lg font-semibold">{selectedOrder.receivedQty} {selectedOrder.unit}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500">剩余待收</div>
                <div className="text-lg font-semibold">{selectedOrder.remainingQty} {selectedOrder.unit}</div>
              </div>
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500">总金额</div>
                <div className="text-lg font-semibold">{formatCurrency(selectedOrder.totalAmount)}</div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">单价</span>
              <span className="text-sm">{formatCurrency(selectedOrder.unitPrice)}</span>
            </div>
            {selectedOrder.expectedDate && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">预计到货</span>
                <span className="text-sm">{selectedOrder.expectedDate}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">状态</span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusConfig[selectedOrder.status]?.bg} ${statusConfig[selectedOrder.status]?.text}`}>
                {statusConfig[selectedOrder.status]?.label}
              </span>
            </div>
            {selectedOrder.remark && (
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500 mb-1">备注</div>
                <div className="text-sm">{selectedOrder.remark}</div>
              </div>
            )}
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>创建时间: {selectedOrder.createdAt}</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setDetailModalOpen(false)} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">关闭</button>
          </div>
        </Modal>
      )}

      {/* Receive Modal */}
      {receiveModalOpen && selectedOrder && (
        <Modal onClose={() => setReceiveModalOpen(false)} title="采购收货" size="md">
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-md">
              <div className="text-xs text-gray-500">订单号</div>
              <div className="font-mono text-sm">{selectedOrder.orderNo}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500">采购数量</div>
                <div className="text-sm font-medium">{selectedOrder.orderedQty} {selectedOrder.unit}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">已收货</div>
                <div className="text-sm font-medium">{selectedOrder.receivedQty} {selectedOrder.unit}</div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">本次收货数量 <span className="text-red-500">*</span></label>
              <input
                type="number"
                min={1}
                max={selectedOrder.remainingQty}
                value={receiveQty}
                onChange={e => setReceiveQty(Number(e.target.value))}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">剩余可收货：{selectedOrder.remainingQty} {selectedOrder.unit}</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setReceiveModalOpen(false)} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button onClick={handleReceive} className="px-4 h-10 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors">确认收货</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
