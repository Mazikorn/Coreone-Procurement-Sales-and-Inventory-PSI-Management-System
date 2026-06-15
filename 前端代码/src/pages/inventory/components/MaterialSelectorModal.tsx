import { Check, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { BOM, BOMMaterial, Material } from '@/types'

type SelectorTab = 'material' | 'bom'

type SelectedMaterial = {
  rowId: number
  materialId: string
  name: string
  spec: string
  stock: number
  quantity: number
  unit: string
}

interface Props {
  open: boolean
  tab: SelectorTab
  materialList: Material[]
  materialLoading: boolean
  materialKeyword: string
  checkedMaterialIds: Set<string>
  selectedMaterials: SelectedMaterial[]
  bomList: BOM[]
  selectedBomId: string
  bomMaterials: BOMMaterial[]
  bomLoading: boolean
  onClose: () => void
  onSwitchTab: (tab: SelectorTab) => void
  onChangeKeyword: (value: string) => void
  onToggleCheck: (id: string) => void
  onToggleCheckAll: () => void
  onRemoveSelected: (rowId: number) => void
  onAddChecked: () => void
  onConfirm: () => void
  onSelectBom: (id: string) => void
  filteredMaterialList: Material[]
}

export function MaterialSelectorModal({
  open,
  tab,
  materialLoading,
  materialKeyword,
  checkedMaterialIds,
  selectedMaterials,
  bomList,
  selectedBomId,
  bomMaterials,
  bomLoading,
  onClose,
  onSwitchTab,
  onChangeKeyword,
  onToggleCheck,
  onToggleCheckAll,
  onRemoveSelected,
  onAddChecked,
  onConfirm,
  onSelectBom,
  filteredMaterialList,
}: Props) {
  if (!open) return null

  const allChecked = filteredMaterialList.length > 0 && checkedMaterialIds.size === filteredMaterialList.length

  return (
    <Modal title="选择出库物料" onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-1">
          {[
            { key: 'material' as const, label: '物料选择' },
            { key: 'bom' as const, label: 'BOM 带出' },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSwitchTab(item.key)}
              className={`h-8 rounded px-3 text-sm font-medium transition-colors ${
                tab === item.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'material' ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="rounded-lg border border-gray-200">
              <div className="flex items-center gap-3 border-b border-gray-200 p-3">
                <input
                  value={materialKeyword}
                  onChange={e => onChangeKeyword(e.target.value)}
                  placeholder="搜索编码/名称/规格"
                  className="h-9 flex-1 rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onAddChecked}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-500 px-3 text-sm font-medium text-white hover:bg-blue-600"
                >
                  <Plus className="h-4 w-4" />
                  加入
                </button>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={onToggleCheckAll}
                          className="h-4 w-4 rounded border-gray-300 text-blue-500"
                        />
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {materialLoading ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-gray-400">加载中...</td>
                      </tr>
                    ) : filteredMaterialList.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-gray-400">暂无物料</td>
                      </tr>
                    ) : filteredMaterialList.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={checkedMaterialIds.has(item.id)}
                            onChange={() => onToggleCheck(item.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500">{item.code} · {item.spec || '-'}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{(item as any).stock ?? '-'} {item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 px-3 py-2 text-sm font-medium text-gray-900">
                已选物料 ({selectedMaterials.length})
              </div>
              <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
                {selectedMaterials.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-gray-400">尚未选择</div>
                ) : selectedMaterials.map(item => (
                  <div key={item.rowId} className="flex items-start justify-between gap-3 px-3 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{item.spec} · {item.quantity} {item.unit}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveSelected(item.rowId)}
                      className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      aria-label="移除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-lg border border-gray-200 p-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">选择 BOM</label>
              <select
                value={selectedBomId}
                onChange={e => onSelectBom(e.target.value)}
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">请选择</option>
                {bomList.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 px-3 py-2 text-sm font-medium text-gray-900">
                BOM 物料 ({bomMaterials.length})
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">用量</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bomLoading ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-gray-400">加载中...</td>
                      </tr>
                    ) : bomMaterials.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-gray-400">暂无 BOM 物料</td>
                      </tr>
                    ) : bomMaterials.map(item => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500">{item.spec || '-'}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{item.usagePerSample} {item.unit}</td>
                        <td className="px-3 py-2 text-gray-700">{item.stock} {item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            <Check className="h-4 w-4" />
            确认添加
          </button>
        </div>
      </div>
    </Modal>
  )
}
