import { X } from 'lucide-react'
import type { BOM, BOMMaterial, BOMVersion } from '@/types'
import { formatDateTime } from '../constants'

interface Props {
  open: boolean
  bom: BOM | null
  tab: 'info' | 'history'
  onClose: () => void
  onChangeTab: (tab: 'info' | 'history') => void
  onEdit: () => void
}

function versionDiffSummary(version: BOMVersion) {
  const diff = version.diff || {}
  const parts: string[] = []
  if (diff.changedFields?.length) parts.push(`字段 ${diff.changedFields.length}`)
  if (diff.addedMaterials?.length) parts.push(`新增物料 ${diff.addedMaterials.length}`)
  if (diff.removedMaterials?.length) parts.push(`移除物料 ${diff.removedMaterials.length}`)
  if (diff.changedMaterials?.length) parts.push(`用量调整 ${diff.changedMaterials.length}`)
  return parts
}

function changedMaterialText(version: BOMVersion) {
  const changed = version.diff?.changedMaterials?.[0]
  if (!changed) return ''
  const name = changed.materialName || changed.materialId
  const before = changed.before?.usagePerSample ?? '-'
  const after = changed.after?.usagePerSample ?? '-'
  const unit = changed.after?.unit || changed.before?.unit || ''
  return `${name}: ${before} -> ${after}${unit}`
}

function effectiveScopeLabel(version: BOMVersion) {
  return version.effectiveScope === 'retroactive' ? '追溯重算' : '仅未来生效'
}

export function BOMDetailModal({ open, bom, tab, onClose, onChangeTab, onEdit }: Props) {
  if (!open || !bom) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">BOM详情</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {(
              [
                { key: 'info' as const, label: '基本信息' },
                { key: 'history' as const, label: '版本历史' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => onChangeTab(t.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  tab === t.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {tab === 'info' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">BOM编号</div>
                  <div className="font-mono text-sm text-gray-900">{bom.code}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">BOM名称</div>
                  <div className="text-sm font-medium text-gray-900">{bom.name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">当前版本</div>
                  <div className="text-sm text-gray-900">{bom.version}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">状态</div>
                  <div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        bom.status === 'active'
                          ? 'bg-green-50 text-green-600 border border-green-200'
                          : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}
                    >
                      {bom.status === 'active' ? '已启用' : '已停用'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">关联检测服务</div>
                  <div className="text-sm text-gray-900">
                    {bom.serviceName || '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">物料数量</div>
                  <div className="text-sm text-gray-900">
                    {bom.materialCount ?? 0} 项
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">创建时间</div>
                  <div className="text-sm text-gray-900">
                    {formatDateTime(bom.createdAt)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">更新时间</div>
                  <div className="text-sm text-gray-900">
                    {formatDateTime(bom.updatedAt)}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  物料清单
                </label>
                {(() => {
                  // 按 groupName 分组
                  const groupMap = new Map<string, BOMMaterial[]>()
                  if (bom.materials?.length > 0) {
                    for (const m of bom.materials) {
                      const g = m.groupName || '未分组'
                      if (!groupMap.has(g)) groupMap.set(g, [])
                      groupMap.get(g)!.push(m)
                    }
                  }
                  const groups = Array.from(groupMap.entries())
                  const totalCost = bom.unitCost || 0
                  return (
                    <div className="space-y-3">
                      {groups.length > 0 ? (
                        groups.map(([groupName, materials]) => {
                          const groupCost = materials.reduce((sum, m) => sum + (m.price || 0) * m.usagePerSample, 0)
                          const groupRatio = totalCost > 0 ? ((groupCost / totalCost) * 100).toFixed(1) : '0'
                          const isPool = materials.length > 1
                          return (
                            <div key={groupName} className="border border-gray-200 rounded-md overflow-hidden">
                              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700">{groupName}</span>
                                  {isPool && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                                      品牌池
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500">
                                  {materials.length} 项 | ¥{groupCost.toFixed(2)} ({groupRatio}%)
                                </span>
                              </div>
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">物料名称</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">规格型号</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">用量/样本</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">单位</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">库存状态</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {materials.map((m: BOMMaterial, idx: number) => {
                                    let stockStatus = '充足'
                                    let stockClass = 'bg-green-50 text-green-600 border-green-200'
                                    if (m.stock <= 0) {
                                      stockStatus = '不足'
                                      stockClass = 'bg-red-50 text-red-600 border-red-200'
                                    } else if (m.stock < 10) {
                                      stockStatus = '偏低'
                                      stockClass = 'bg-yellow-50 text-yellow-600 border-yellow-200'
                                    }
                                    return (
                                      <tr key={m.id || idx}>
                                        <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                                        <td className="px-4 py-2 font-medium text-gray-900">{m.name}</td>
                                        <td className="px-4 py-2 text-gray-500">{m.spec || '-'}</td>
                                        <td className="px-4 py-2 text-gray-700">{m.usagePerSample}</td>
                                        <td className="px-4 py-2 text-gray-500">{m.unit}</td>
                                        <td className="px-4 py-2">
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${stockClass}`}>
                                            {stockStatus}
                                          </span>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )
                        })
                      ) : (
                        <div className="border border-gray-200 rounded-md px-4 py-8 text-center text-gray-400">
                          暂无物料数据
                        </div>
                      )}
                      <div className="px-4 py-2 text-right text-sm text-gray-600 bg-gray-50 rounded-md border border-gray-200">
                        共 {bom.materialCount ?? 0} 项物料
                        {bom.unitCost > 0 && ` | 单样本成本 ¥${bom.unitCost.toFixed(2)}`}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* 通用试剂配额 */}
              {bom.generalReagents && bom.generalReagents.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    通用试剂配额
                  </label>
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">物料名称</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">规格型号</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">用量/样本</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">单位</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bom.generalReagents.map((r, idx) => (
                          <tr key={r.id || idx}>
                            <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                            <td className="px-4 py-2 font-medium text-gray-900">{r.name || '-'}</td>
                            <td className="px-4 py-2 text-gray-500">{r.spec || '-'}</td>
                            <td className="px-4 py-2 text-gray-700">{r.usagePerSample}</td>
                            <td className="px-4 py-2 text-gray-500">{r.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 通用耗材配额 */}
              {bom.generalConsumables && bom.generalConsumables.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    通用耗材配额
                  </label>
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">物料名称</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">规格型号</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">用量/样本</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">单位</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bom.generalConsumables.map((c, idx) => (
                          <tr key={c.id || idx}>
                            <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                            <td className="px-4 py-2 font-medium text-gray-900">{c.name || '-'}</td>
                            <td className="px-4 py-2 text-gray-500">{c.spec || '-'}</td>
                            <td className="px-4 py-2 text-gray-700">{c.usagePerSample}</td>
                            <td className="px-4 py-2 text-gray-500">{c.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 质控品配额 */}
              {bom.qualityControls && bom.qualityControls.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    质控品配额
                  </label>
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">物料名称</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">规格型号</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">用量/批次</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">单位</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">覆盖样本数</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bom.qualityControls.map((q, idx) => (
                          <tr key={q.id || idx}>
                            <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                            <td className="px-4 py-2 font-medium text-gray-900">{q.name || '-'}</td>
                            <td className="px-4 py-2 text-gray-500">{q.spec || '-'}</td>
                            <td className="px-4 py-2 text-gray-700">{q.usagePerBatch}</td>
                            <td className="px-4 py-2 text-gray-500">{q.unit}</td>
                            <td className="px-4 py-2 text-gray-700">{q.coversSamples}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 设备模板 */}
              {bom.equipmentTemplates && bom.equipmentTemplates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    设备模板
                  </label>
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">设备名称</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">型号</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">使用时长(分钟)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bom.equipmentTemplates.map((e, idx) => (
                          <tr key={e.id || idx}>
                            <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                            <td className="px-4 py-2 font-medium text-gray-900">{e.equipmentName || '-'}</td>
                            <td className="px-4 py-2 text-gray-500">{e.model || '-'}</td>
                            <td className="px-4 py-2 text-gray-700">{e.usageMinutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === 'history' && (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      版本号
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      修改说明
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      修改时间
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bom.versionHistory && bom.versionHistory.length > 0 ? (
                    bom.versionHistory.map((v: BOMVersion, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                            {v.version}
                          </span>
                          {v.isCurrent && (
                            <span className="ml-2 text-xs text-gray-400">当前</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          <div>{v.changeLog || '-'}</div>
                          {versionDiffSummary(v).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${
                                v.effectiveScope === 'retroactive'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              }`}>
                                {effectiveScopeLabel(v)}
                              </span>
                              {versionDiffSummary(v).map(item => (
                                <span key={item} className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500">
                                  {item}
                                </span>
                              ))}
                            </div>
                          )}
                          {changedMaterialText(v) && (
                            <div className="mt-1 text-xs text-gray-500">
                              {changedMaterialText(v)}
                            </div>
                          )}
                          {v.impactSummary && v.impactSummary.totalOutboundCount > 0 && (
                            <div className="mt-1 text-xs text-amber-600">
                              影响历史出库 {v.impactSummary.totalOutboundCount} 单，涉及 {v.impactSummary.affectedMonthCount} 个月
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          <div>{formatDateTime(v.updatedAt)}</div>
                          {v.changedBy && <div className="mt-1">操作人: {v.changedBy}</div>}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        暂无版本历史
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors border border-gray-200"
          >
            关闭
          </button>
          <button
            onClick={() => {
              onClose()
              onEdit()
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors shadow-sm"
          >
            编辑
          </button>
        </div>
      </div>
    </div>
  )
}
