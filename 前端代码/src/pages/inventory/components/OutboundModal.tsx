import React from 'react'
import { X, Trash2, Plus } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Project } from '@/types'

interface OutboundMaterial {
  rowId: number
  materialId: string
  batchId?: string
  name: string
  spec: string
  batch?: string
  stock: number
  quantity: number
  unit: string
  project: string
  user: string
  usage: 'self' | 'external'
  receiver: string
}

interface Props {
  open: boolean
  materials: OutboundMaterial[]
  remark: string
  projectList: Project[]
  userList: { id: string; real_name: string }[]
  onClose: () => void
  onAddMaterial: () => void
  onRemoveItem: (rowId: number) => void
  onUpdateQuantity: (rowId: number, value: string) => void
  onUpdateProject: (rowId: number, value: string) => void
  onUpdateUser: (rowId: number, value: string) => void
  onUpdateUsage: (rowId: number, value: 'self' | 'external') => void
  onUpdateReceiver: (rowId: number, value: string) => void
  onChangeRemark: (v: string) => void
  onConfirm: () => void
}

export function OutboundModal({
  open,
  materials,
  remark,
  projectList,
  userList,
  onClose,
  onAddMaterial,
  onRemoveItem,
  onUpdateQuantity,
  onUpdateProject,
  onUpdateUser,
  onUpdateUsage,
  onUpdateReceiver,
  onChangeRemark,
  onConfirm,
}: Props) {
  if (!open) return null

  const selectedProjects = Array.from(new Set(materials.map(item => item.project).filter(Boolean)))
  const selectedProject = selectedProjects.length === 1
    ? projectList.find(project => project.id === selectedProjects[0])
    : undefined
  const projectSummary = selectedProjects.length > 1
    ? '待拆分为单项目出库'
    : selectedProject?.name || '待选择'
  const outboundLines = materials.map(item => {
    const target = item.usage === 'external' ? item.receiver.trim() : item.user.trim()
    return `${item.name}${item.batch ? ` / ${item.batch}` : ''} -${item.quantity || 0}${item.unit}${target ? ` -> ${target}` : ''}`
  })
  const downstreamFacts = '库存、批次、项目成本、项目消耗对账、审计记录'
  const unavailableBatchRows = materials.filter(item => Number(item.stock || 0) <= 0)
  const hasUnavailableBatchRows = unavailableBatchRows.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.6]"
      role="dialog"
      aria-modal="true"
      aria-label="出库登记"
      data-testid="outbound-modal"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg w-full max-w-[1100px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 tracking-normal">出库登记</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all duration-150 ease"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-semibold text-gray-900">出库明细</h4>
              <button
                onClick={onAddMaterial}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-all duration-150 ease shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <Plus className="w-3.5 h-3.5" />
                添加物料
              </button>
            </div>

            {materials.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                </svg>
                <div className="text-sm">请选择物料或点击"添加物料"按钮</div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200">物料名称</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200">关联项目 *</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200">批次号</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200">库存</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200 w-[90px]">出库数量</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200 w-[120px]">领用人</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200 w-[90px]">用途</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200 w-[130px]">接收方</th>
                      <th className="bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide border-b border-gray-200 w-[50px]">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f6]">
                    {materials.map(m => (
                      <tr key={m.rowId} className="hover:bg-gray-50 transition-colors duration-150 ease">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{m.name}</div>
                          <div className="text-xs text-gray-500">{m.spec}</div>
                        </td>
                        <td className="px-4 py-3">
                          <SearchableSelect
                            value={m.project}
                            onChange={val => onUpdateProject(m.rowId, val)}
                            options={[
                              { value: '', label: '选择检测项目' },
                              ...projectList.map(p => ({
                                value: p.id,
                                label: p.code ? `${p.name} (${p.code})` : p.name,
                              })),
                            ]}
                            placeholder="选择检测项目"
                            className="w-36"
                            testId={`outbound-project-${m.rowId}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-600">{m.batch || '无可用批次'}</td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900">{m.stock}</div>
                          {Number(m.stock || 0) <= 0 && (
                            <div className="mt-1 text-xs text-red-600">
                              {m.name}没有可扣减批次，不能直接出库
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            data-testid={`outbound-quantity-${m.rowId}`}
                            type="number"
                            value={m.quantity}
                            min={1}
                            max={m.stock}
                            onChange={e => onUpdateQuantity(m.rowId, e.target.value)}
                            className="w-[70px] h-8 px-3 border border-gray-300 rounded-md text-xs focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 transition-all duration-150 ease"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <SearchableSelect
                            testId={`outbound-user-${m.rowId}`}
                            value={m.user}
                            onChange={val => onUpdateUser(m.rowId, val)}
                            options={[
                              { value: '', label: '选择领用人' },
                              ...userList.map(u => ({
                                value: u.real_name,
                                label: u.real_name,
                              })),
                            ]}
                            placeholder="选择领用人"
                            className="min-w-[120px]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <SearchableSelect
                            value={m.usage}
                            onChange={val => onUpdateUsage(m.rowId, val as 'self' | 'external')}
                            options={[
                              { value: 'self', label: '自用' },
                              { value: 'external', label: '外给' },
                            ]}
                            placeholder="请选择"
                            className="min-w-[80px]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={m.receiver}
                            onChange={e => onUpdateReceiver(m.rowId, e.target.value)}
                            placeholder={m.usage === 'external' ? '接收方名称' : '-'}
                            disabled={m.usage === 'self'}
                            className="w-[120px] h-8 px-3 border border-gray-300 rounded-md text-xs focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 disabled:bg-gray-100 disabled:text-gray-400 transition-all duration-150 ease"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => onRemoveItem(m.rowId)}
                            className="text-red-500 hover:text-red-600 transition-colors duration-150 ease"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {hasUnavailableBatchRows && (
            <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3">
              <div className="text-sm font-semibold text-red-900">快捷出库缺少可扣减批次</div>
              <div className="mt-1 text-sm text-red-800">
                下一步：先补入库或调拨可用批次，再回到库存列表出库。
              </div>
              <div className="mt-1 text-sm text-red-800">
                系统会保留已选物料、项目和领用信息，避免重新登记。
              </div>
            </div>
          )}

          {materials.length > 0 && (
            <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="mb-2 text-sm font-medium text-emerald-800">出库结果确认</div>
              <div className="space-y-1.5 text-xs text-emerald-700">
                <div>关联项目 {projectSummary}</div>
                <div>确认后将接住：{downstreamFacts}</div>
                {outboundLines.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">备注</label>
            <textarea
              value={remark}
              onChange={e => onChangeRemark(e.target.value)}
              rows={2}
              placeholder="请输入出库备注信息（可选）"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 transition-all duration-150 ease resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-all duration-150 ease shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-400/30"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={materials.length === 0 || hasUnavailableBatchRows}
            data-testid="outbound-confirm-btn"
            className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 ease shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            确认出库
          </button>
        </div>
      </div>
    </div>
  )
}
