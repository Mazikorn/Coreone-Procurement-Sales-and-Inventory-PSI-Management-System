import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Material, Project, BOM, Batch } from '@/types'
import { bomApi, materialApi } from '@/api/master'
import { reconciliationApi } from '@/api/reconciliation'
import { getUserRole } from '@/lib/permissions'

export interface OutboundItemForm {
  materialId: string
  batchId?: string
  batchNo?: string
  unitCost?: number
  quantity: number
  usage?: 'self' | 'external'
  receiver?: string | null
}

export interface FormData {
  type: 'project'
  projectId: string
  items: OutboundItemForm[]
  remark: string
  bomId?: string
  sampleCount?: number
  caseNo?: string
}

interface OutboundFormModalProps {
  open: boolean
  editRecordId: string | null
  form: FormData
  materials: Material[]
  projects: Project[]
  onClose: () => void
  onSubmit: () => void
  onFormChange: (form: FormData) => void
}

interface CostPreview {
  materialCost: number
  activityCost: number
  totalCost: number
  feeAmount: number
  profit: number
}

interface LisCaseOption {
  id: string
  caseNo: string
  projectId?: string
  projectName?: string
  bomId?: string | null
  hasBom?: boolean
  status?: string
  operateTime?: string
}

interface BatchPreviewOption extends Batch {
  materialName?: string
}

interface BatchPreviewAllocation {
  batchId: string
  batchNo: string
  materialName?: string
  quantity: number
}

interface BomBatchPreviewRow {
  key: string
  source: string
  label: string
  requiredQuantity: number
  availableQuantity: number
  unit: string
  allocations: BatchPreviewAllocation[]
  insufficient: boolean
  showMaterialName?: boolean
}

const roundQuantity = (value: number) => Math.round(value * 1_000_000) / 1_000_000

const formatQuantity = (value: number) => {
  const rounded = roundQuantity(value)
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '')
}

const collectBomMaterialIds = (bom: BOM) => Array.from(new Set([
  ...(bom.materials || []).map(material => material.id),
  ...(bom.generalReagents || []).map(item => item.materialId),
  ...(bom.generalConsumables || []).map(item => item.materialId),
  ...(bom.qualityControls || []).map(item => item.materialId),
].filter(Boolean)))

const allocatePreviewBatches = (batches: BatchPreviewOption[], requiredQuantity: number) => {
  const sortedBatches = [...batches]
    .filter(batch => Number(batch.remaining || 0) > 0 && batch.status === 'normal')
    .sort((a, b) => {
      const expiryCompare = String(a.expiryDate || '9999-12-31').localeCompare(String(b.expiryDate || '9999-12-31'))
      if (expiryCompare !== 0) return expiryCompare
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    })

  let remainingRequired = requiredQuantity
  const allocations: BatchPreviewAllocation[] = []

  for (const batch of sortedBatches) {
    if (remainingRequired <= 0) break
    const available = Number(batch.remaining || 0)
    const quantity = Math.min(available, remainingRequired)
    allocations.push({
      batchId: batch.id,
      batchNo: batch.batchNo,
      materialName: batch.materialName,
      quantity: roundQuantity(quantity),
    })
    remainingRequired = roundQuantity(remainingRequired - quantity)
  }

  return {
    allocations,
    availableQuantity: roundQuantity(sortedBatches.reduce((sum, batch) => sum + Number(batch.remaining || 0), 0)),
  }
}

const makeBomBatchPreviewRow = ({
  key,
  source,
  label,
  requiredQuantity,
  unit,
  batches,
  showMaterialName,
}: {
  key: string
  source: string
  label: string
  requiredQuantity: number
  unit: string
  batches: BatchPreviewOption[]
  showMaterialName?: boolean
}): BomBatchPreviewRow => {
  const allocation = allocatePreviewBatches(batches, requiredQuantity)
  return {
    key,
    source,
    label,
    requiredQuantity: roundQuantity(requiredQuantity),
    availableQuantity: allocation.availableQuantity,
    unit,
    allocations: allocation.allocations,
    insufficient: allocation.availableQuantity < requiredQuantity,
    showMaterialName,
  }
}

const buildBomBatchPreviewRows = (
  bom: BOM,
  sampleCount: number,
  batchesByMaterialId: Record<string, Batch[]>,
  materialNameFallback: (materialId: string) => string,
): BomBatchPreviewRow[] => {
  const rows: BomBatchPreviewRow[] = []
  const materialGroups = new Map<string, typeof bom.materials>()

  for (const material of bom.materials || []) {
    const groupKey = material.groupName || `_single_${material.id}`
    materialGroups.set(groupKey, [...(materialGroups.get(groupKey) || []), material])
  }

  for (const [groupKey, groupMaterials] of materialGroups.entries()) {
    const firstMaterial = groupMaterials[0]
    const requiredQuantity = Number(firstMaterial.usagePerSample || 0) * sampleCount
    if (requiredQuantity <= 0) continue
    const isGroup = groupMaterials.length > 1
    const batches = groupMaterials.flatMap(material =>
      (batchesByMaterialId[material.id] || []).map(batch => ({
        ...batch,
        materialName: material.name,
      })),
    )
    rows.push(makeBomBatchPreviewRow({
      key: `bom-material-${groupKey}`,
      source: 'BOM物料',
      label: isGroup ? (firstMaterial.groupName || '组合物料') : firstMaterial.name,
      requiredQuantity,
      unit: firstMaterial.unit,
      batches,
      showMaterialName: isGroup,
    }))
  }

  for (const item of bom.generalReagents || []) {
    const requiredQuantity = Number(item.usagePerSample || 0) * sampleCount
    if (requiredQuantity <= 0) continue
    rows.push(makeBomBatchPreviewRow({
      key: `general-reagent-${item.materialId}`,
      source: '通用试剂',
      label: item.name || materialNameFallback(item.materialId),
      requiredQuantity,
      unit: item.unit,
      batches: batchesByMaterialId[item.materialId] || [],
    }))
  }

  for (const item of bom.generalConsumables || []) {
    const requiredQuantity = Number(item.usagePerSample || 0) * sampleCount
    if (requiredQuantity <= 0) continue
    rows.push(makeBomBatchPreviewRow({
      key: `general-consumable-${item.materialId}`,
      source: '通用耗材',
      label: item.name || materialNameFallback(item.materialId),
      requiredQuantity,
      unit: item.unit,
      batches: batchesByMaterialId[item.materialId] || [],
    }))
  }

  for (const item of bom.qualityControls || []) {
    const coversSamples = Math.max(1, Number(item.coversSamples || 1))
    const batchesNeeded = Math.ceil(sampleCount / coversSamples)
    const requiredQuantity = batchesNeeded * Number(item.usagePerBatch || 0)
    if (requiredQuantity <= 0) continue
    rows.push(makeBomBatchPreviewRow({
      key: `quality-control-${item.materialId}`,
      source: '质控品',
      label: item.name || materialNameFallback(item.materialId),
      requiredQuantity,
      unit: item.unit,
      batches: batchesByMaterialId[item.materialId] || [],
    }))
  }

  return rows
}

export default function OutboundFormModal({
  open,
  editRecordId,
  form,
  materials,
  projects,
  onClose,
  onSubmit,
  onFormChange,
}: OutboundFormModalProps) {
  const [boms, setBoms] = useState<BOM[]>([])
  const [lisCases, setLisCases] = useState<LisCaseOption[]>([])
  const [selectedBom, setSelectedBom] = useState<BOM | null>(null)
  const [costPreview, setCostPreview] = useState<CostPreview | null>(null)
  const [batchesByMaterialId, setBatchesByMaterialId] = useState<Record<string, Batch[]>>({})
  const selectedProject = projects.find(project => project.id === form.projectId)
  const compatibleBoms = boms.filter(bom => {
    if (bom.status !== 'active') return false
    if (!selectedProject) return false
    return bom.type === selectedProject.type || bom.type === 'project'
  })
  const isBomOutbound = Boolean(form.bomId || form.caseNo?.trim())
  const canReadLisCases = ['admin', 'finance', 'technician'].includes(getUserRole() || '')

  // Load BOM and LIS case list when modal opens
  useEffect(() => {
    if (!open) return
    bomApi.getList({ page: 1, pageSize: 999, status: 'active' }).then((res: any) => {
      setBoms(res?.list || [])
    }).catch(() => {})
    if (!canReadLisCases) {
      setLisCases([])
      return
    }
    reconciliationApi.getCases({ page: 1, pageSize: 100 }).then((res: any) => {
      setLisCases((res?.list || []).map((item: any) => ({
        id: item.id,
        caseNo: item.caseNo || item.case_no,
        projectId: item.projectId || item.project_id,
        projectName: item.projectName || item.project_name,
        bomId: item.bomId || item.joined_bom_id || null,
        hasBom: item.hasBom,
        status: item.status,
        operateTime: item.operateTime || item.operate_time,
      })).filter((item: LisCaseOption) => item.caseNo))
    }).catch(() => {})
  }, [open, canReadLisCases])

  const ordinaryMaterialIdsForBatchLookup = form.items
    .map(item => item.materialId)
    .filter(Boolean)
    .join('|')
  const bomMaterialIdsForBatchLookup = selectedBom ? collectBomMaterialIds(selectedBom).join('|') : ''
  const materialIdsForBatchLookup = isBomOutbound ? bomMaterialIdsForBatchLookup : ordinaryMaterialIdsForBatchLookup

  useEffect(() => {
    if (!open) {
      setBatchesByMaterialId({})
      return
    }

    const materialIds = Array.from(new Set(materialIdsForBatchLookup.split('|').filter(Boolean)))
    if (materialIds.length === 0) {
      setBatchesByMaterialId({})
      return
    }

    let cancelled = false
    Promise.all(materialIds.map(async materialId => {
      try {
        const detail = await materialApi.getDetail(materialId)
        const batches = (detail?.batches || []).filter(batch => Number(batch.remaining || 0) > 0 && batch.status === 'normal')
        return [materialId, batches] as const
      } catch {
        return [materialId, []] as const
      }
    })).then(entries => {
      if (cancelled) return
      setBatchesByMaterialId(Object.fromEntries(entries))
    })

    return () => { cancelled = true }
  }, [open, materialIdsForBatchLookup])

  useEffect(() => {
    if (!open || isBomOutbound) return

    let changed = false
    const nextItems = form.items.map(item => {
      if (!item.materialId || item.batchId) return item
      const availableBatches = batchesByMaterialId[item.materialId] || []
      if (availableBatches.length !== 1) return item
      const batch = availableBatches[0]
      changed = true
      return {
        ...item,
        batchId: batch.id,
        batchNo: batch.batchNo,
        unitCost: Number(batch.inboundPrice || 0),
      }
    })

    if (changed) {
      onFormChange({ ...form, items: nextItems })
    }
  }, [batchesByMaterialId, form, isBomOutbound, onFormChange, open])

  // Load BOM detail when bomId changes
  useEffect(() => {
    if (!form.bomId) {
      setSelectedBom(null)
      setCostPreview(null)
      return
    }
    bomApi.getDetail(form.bomId).then((bom: BOM) => {
      setSelectedBom(bom)
    }).catch(() => {
      setSelectedBom(null)
    })
  }, [form.bomId])

  // Calculate cost preview when BOM and sample count are available
  useEffect(() => {
    if (!selectedBom || !form.sampleCount || form.sampleCount <= 0) {
      setCostPreview(null)
      return
    }
    const sc = form.sampleCount
    const materialCost = (selectedBom.standardSlideCost || selectedBom.unitCost || 0) * sc
    const feeAmount = (selectedBom.standardFeePerSlide || 0) * sc
    const activityCost = 0 // Activity cost requires backend calculation; shown as 0 until BOM outbound
    const totalCost = materialCost + activityCost
    const profit = feeAmount - totalCost
    setCostPreview({ materialCost, activityCost, totalCost, feeAmount, profit })
  }, [selectedBom, form.sampleCount])

  if (!open) return null

  const setFormField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    onFormChange({ ...form, [field]: value })
  }

  const handleProjectChange = (projectId: string) => {
    const nextProject = projects.find(project => project.id === projectId)
    onFormChange({
      ...form,
      projectId,
      bomId: nextProject?.bomId || undefined,
    })
  }

  const applyLisCase = (caseNo: string) => {
    const matched = lisCases.find(item => item.caseNo === caseNo)
    if (!matched) {
      onFormChange({ ...form, caseNo })
      return
    }
    const matchedProject = projects.find(project => project.id === matched.projectId)
    onFormChange({
      ...form,
      type: 'project',
      caseNo: matched.caseNo,
      projectId: matched.projectId || form.projectId,
      bomId: matched.bomId || matchedProject?.bomId || form.bomId,
      sampleCount: form.sampleCount || 1,
    })
  }

  const addItem = () =>
    onFormChange({
      ...form,
      items: [...form.items, { materialId: materials[0]?.id || '', quantity: 1 }],
    })

  const removeItem = (idx: number) =>
    onFormChange({
      ...form,
      items: form.items.filter((_, i) => i !== idx),
    })

  const updateItem = (idx: number, field: keyof OutboundItemForm, value: string | number | undefined) => {
    onFormChange({
      ...form,
      items: form.items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    })
  }

  const updateItemMaterial = (idx: number, materialId: string) => {
    onFormChange({
      ...form,
      items: form.items.map((item, i) => (i === idx ? { ...item, materialId, batchId: undefined, batchNo: undefined, unitCost: undefined } : item)),
    })
  }

  const updateItemBatch = (idx: number, batchId: string) => {
    const current = form.items[idx]
    const selectedBatch = current
      ? (batchesByMaterialId[current.materialId] || []).find(batch => batch.id === batchId)
      : undefined
    onFormChange({
      ...form,
      items: form.items.map((item, i) => (i === idx ? {
        ...item,
        batchId: batchId || undefined,
        batchNo: selectedBatch?.batchNo,
        unitCost: selectedBatch ? Number(selectedBatch.inboundPrice || 0) : undefined,
      } : item)),
    })
  }

  const hasLoadedBatchLookup = (materialId: string) =>
    Object.prototype.hasOwnProperty.call(batchesByMaterialId, materialId)
  const getSelectedBatch = (item: OutboundItemForm) =>
    (batchesByMaterialId[item.materialId] || []).find(batch => batch.id === item.batchId)
  const hasBatchQuantityConflict = form.items.some(item => {
    const selectedBatch = getSelectedBatch(item)
    return selectedBatch && Number(item.quantity || 0) > Number(selectedBatch.remaining || 0)
  })
  const hasMissingRequiredBatch = !isBomOutbound && form.items.some(item => (
    item.materialId
    && Number(item.quantity || 0) > 0
    && (batchesByMaterialId[item.materialId] || []).length > 0
    && !item.batchId
  ))
  const hasUnavailableRequiredBatch = !isBomOutbound && form.items.some(item => (
    item.materialId
    && Number(item.quantity || 0) > 0
    && hasLoadedBatchLookup(item.materialId)
    && (batchesByMaterialId[item.materialId] || []).length === 0
  ))
  const bomPreviewMaterialIds = isBomOutbound && selectedBom ? collectBomMaterialIds(selectedBom) : []
  const hasLoadedBomBatchDetails = bomPreviewMaterialIds.length > 0
    && bomPreviewMaterialIds.every(materialId => Object.prototype.hasOwnProperty.call(batchesByMaterialId, materialId))
  const bomBatchPreviewRows = selectedBom && form.sampleCount && form.sampleCount > 0 && hasLoadedBomBatchDetails
    ? buildBomBatchPreviewRows(
      selectedBom,
      form.sampleCount,
      batchesByMaterialId,
      materialId => materials.find(material => material.id === materialId)?.name || '未命名物料',
    )
    : []
  const hasBomBatchPreviewConflict = isBomOutbound && bomBatchPreviewRows.some(row => row.insufficient)

  const formatCurrency = (v: number) => `¥${v.toFixed(2)}`
  const validSummaryItems = form.items.filter(item => item.materialId && Number(item.quantity || 0) > 0)
  const getMaterialById = (materialId: string) => materials.find(material => material.id === materialId)
  const getSummaryBatchNo = (item: OutboundItemForm) => {
    const selectedBatchNo = item.batchNo || getSelectedBatch(item)?.batchNo
    if (selectedBatchNo) return selectedBatchNo
    if (item.materialId && hasLoadedBatchLookup(item.materialId) && (batchesByMaterialId[item.materialId] || []).length === 0) {
      return '无可用批次'
    }
    return '待选批次'
  }
  const getSummaryUnit = (item: OutboundItemForm) => getMaterialById(item.materialId)?.unit || ''
  const getSummaryReceiver = (item: OutboundItemForm) => {
    const receiver = typeof item.receiver === 'string' ? item.receiver.trim() : ''
    if (receiver) return receiver
    return item.usage === 'external' ? '待填写接收方' : '内部使用'
  }
  const getSummaryRemaining = (item: OutboundItemForm) => {
    const selectedBatch = getSelectedBatch(item)
    if (!selectedBatch) return ''
    const unit = getSummaryUnit(item)
    const remaining = Math.max(0, Number(selectedBatch.remaining || 0) - Number(item.quantity || 0))
    return ` / 扣减后剩余 ${formatQuantity(remaining)}${unit}`
  }
  const bomSummaryName = selectedBom?.name || compatibleBoms.find(bom => bom.id === form.bomId)?.name || (selectedProject as any)?.bomName || '待选择'
  const resultChainText = isBomOutbound
    ? '库存、批次、BOM、项目成本、项目消耗对账、审计记录'
    : '库存、批次、项目成本、项目消耗对账、审计记录'
  const showMissingBomGuidance = isBomOutbound && selectedProject && !form.bomId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{editRecordId ? '编辑出库' : '出库登记'}</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors duration-150"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">出库类型</label>
              <SearchableSelect
                value={form.type}
                onChange={val => setFormField('type', val as FormData['type'])}
                options={[
                  { value: 'project', label: '项目出库' },
                ]}
                placeholder="请选择"
                testId="outbound-type-select"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联项目 <span className="text-red-500">*</span></label>
              <SearchableSelect
                value={form.projectId}
                onChange={handleProjectChange}
                options={projects.map(p => ({
                  value: p.id,
                  label: `${p.name}${p.bomName ? `｜${p.bomName}${p.bomVersion ? ` ${p.bomVersion}` : ''}` : '｜未配置BOM'}`,
                }))}
                placeholder="请选择"
                testId="project-select"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联BOM</label>
              <SearchableSelect
                value={form.bomId || ''}
                onChange={val => setFormField('bomId', val || undefined)}
                options={compatibleBoms.map(b => ({ value: b.id, label: `${b.name} (${b.code})` }))}
                placeholder={selectedProject?.bomId ? '已按检测服务带出BOM' : '请选择已配置BOM的检测服务'}
                testId="bom-select"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">样本数</label>
              <input
                type="number"
                min={1}
                value={form.sampleCount || ''}
                onChange={e => setFormField('sampleCount', Number(e.target.value) || undefined)}
                placeholder="填写样本数"
                data-testid="sample-count-input"
                className="w-full h-10 px-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
          </div>

          {showMissingBomGuidance && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-sm font-semibold text-amber-900">BOM出库缺少可计费配置</div>
              <div className="mt-1 text-sm text-amber-800">
                当前病例/样本数会触发BOM自动出库，但所选检测项目未绑定BOM。
              </div>
              <div className="mt-1 text-sm text-amber-800">
                下一步：先在检测项目维护中绑定BOM，或选择已配置BOM的LIS病例。
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">LIS病例</label>
              <SearchableSelect
                value={lisCases.some(item => item.caseNo === form.caseNo) ? form.caseNo || '' : ''}
                onChange={applyLisCase}
                options={lisCases.map(item => ({
                  value: item.caseNo,
                  label: `${item.caseNo}｜${item.projectName || '未关联项目'}${item.hasBom ? '' : '｜未配置BOM'}`,
                  disabled: !item.hasBom,
                }))}
                placeholder="选择LIS病例（可选）"
                testId="lis-case-select"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">病例号</label>
              <input
                value={form.caseNo || ''}
                onChange={e => setFormField('caseNo', e.target.value)}
                placeholder="手工输入或由LIS病例带入"
                data-testid="case-no-input"
                className="w-full h-10 px-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Cost Preview Panel */}
          {costPreview && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">成本预览</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">材料成本</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(costPreview.materialCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">作业成本</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(costPreview.activityCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">总成本</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(costPreview.totalCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">收费金额</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(costPreview.feeAmount)}</span>
                </div>
                <div className="flex items-center justify-between col-span-2 pt-1 border-t border-gray-200">
                  <span className="text-sm text-gray-500">预估利润</span>
                  <span className={`text-sm font-medium ${costPreview.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {costPreview.profit >= 0 ? '+' : ''}{formatCurrency(costPreview.profit)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {isBomOutbound ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">BOM自动出库明细</label>
              <div className="overflow-hidden rounded-md border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">物料</th>
                      <th className="px-3 py-2 text-left font-medium">用量/样本</th>
                      <th className="px-3 py-2 text-left font-medium">单位</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedBom?.materials?.length ? selectedBom.materials.map(material => (
                      <tr key={material.id}>
                        <td className="px-3 py-2 text-gray-900">{material.name}</td>
                        <td className="px-3 py-2 text-gray-600">{material.usagePerSample}</td>
                        <td className="px-3 py-2 text-gray-600">{material.unit}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-gray-400">暂无BOM物料</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {bomBatchPreviewRows.length > 0 && (
                <div data-testid="bom-batch-preview" className="overflow-hidden rounded-md border border-gray-200">
                  <div className="px-3 py-2 bg-gray-50 text-sm font-medium text-gray-700">预计批次扣减</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">来源</th>
                          <th className="px-3 py-2 text-left font-medium">物料</th>
                          <th className="px-3 py-2 text-left font-medium">应扣数量</th>
                          <th className="px-3 py-2 text-left font-medium">预计批次</th>
                          <th className="px-3 py-2 text-left font-medium">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bomBatchPreviewRows.map(row => (
                          <tr key={row.key}>
                            <td className="px-3 py-2 text-gray-500">{row.source}</td>
                            <td className="px-3 py-2 text-gray-900">{row.label}</td>
                            <td className="px-3 py-2 text-gray-600">{formatQuantity(row.requiredQuantity)}{row.unit}</td>
                            <td className="px-3 py-2 text-gray-600">
                              {row.allocations.length > 0 ? (
                                <div className="space-y-1">
                                  {row.allocations.map(allocation => (
                                    <div key={`${row.key}-${allocation.batchId}`}>
                                      {row.showMaterialName && allocation.materialName ? `${allocation.materialName} / ` : ''}
                                      {allocation.batchNo} × {formatQuantity(allocation.quantity)}{row.unit}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-red-600">无可用批次</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {row.insufficient ? (
                                <span className="text-red-600">
                                  批次库存不足：需要 {formatQuantity(row.requiredQuantity)}{row.unit}，可用 {formatQuantity(row.availableQuantity)}{row.unit}
                                </span>
                              ) : (
                                <span className="text-green-600">可出库</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {hasBomBatchPreviewConflict && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
                  <div className="text-sm font-semibold text-red-900">BOM批次不足，暂不能提交</div>
                  <div className="mt-1 text-sm text-red-800">
                    下一步：先补入库或调拨可用批次，再重新提交本次BOM出库。
                  </div>
                  <div className="mt-1 text-sm text-red-800">
                    系统会继续保留病例号、样本数和BOM预览，避免重复录入。
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">出库明细 *</label>
                <button
                  onClick={addItem}
                  data-testid="add-item-btn"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 transition-colors duration-150"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加物料
                </button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => {
                  const selectedBatch = getSelectedBatch(item)
                  const availableBatches = batchesByMaterialId[item.materialId] || []
                  const batchLookupLoaded = item.materialId ? hasLoadedBatchLookup(item.materialId) : false
                  const quantityExceedsBatch = selectedBatch && Number(item.quantity || 0) > Number(selectedBatch.remaining || 0)
                  const needsBatchSelection = item.materialId && Number(item.quantity || 0) > 0 && availableBatches.length > 0 && !item.batchId
                  const noAvailableBatch = item.materialId && Number(item.quantity || 0) > 0 && batchLookupLoaded && availableBatches.length === 0
                  return (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_88px_110px_minmax(120px,160px)_32px] items-start gap-2 p-3 bg-gray-50 rounded-md">
                    <div>
                      <SearchableSelect
                        value={item.materialId}
                        onChange={val => updateItemMaterial(idx, val)}
                        options={materials.map(m => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                        placeholder="选择物料"
                        testId={`material-select-${idx}`}
                      />
                    </div>
                    <div>
                      <SearchableSelect
                        value={item.batchId || ''}
                        onChange={val => updateItemBatch(idx, val)}
                        options={availableBatches.map(batch => ({
                          value: batch.id,
                          label: `${batch.batchNo} (余${batch.remaining}${materials.find(m => m.id === item.materialId)?.unit || ''} @${formatCurrency(Number(batch.inboundPrice || 0))})`,
                        }))}
                        placeholder={availableBatches.length > 0 ? '选择出库批次' : '无可用批次'}
                        disabled={!item.materialId || availableBatches.length === 0}
                        testId={`outbound-batch-select-${idx}`}
                      />
                      {needsBatchSelection && (
                        <div className="mt-1 text-xs text-amber-600">
                          请选择批次，系统会按批次扣减库存和成本
                        </div>
                      )}
                      {noAvailableBatch && (
                        <div className="mt-1 text-xs text-red-600">
                          当前物料没有可用批次，不能直接出库
                        </div>
                      )}
                      {item.batchId && (
                        <div className={`mt-1 text-xs ${quantityExceedsBatch ? 'text-red-500' : 'text-gray-500'}`}>
                          {quantityExceedsBatch
                            ? `出库数量不能超过批次剩余 ${selectedBatch?.remaining}${materials.find(m => m.id === item.materialId)?.unit || ''}`
                            : '按所选批次扣减库存和成本'}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      placeholder="数量"
                      min={1}
                      max={selectedBatch?.remaining}
                      value={item.quantity || ''}
                      onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                      data-testid={`quantity-input-${idx}`}
                      className="h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <SearchableSelect
                      value={item.usage || 'self'}
                      onChange={val => updateItem(idx, 'usage', val as OutboundItemForm['usage'])}
                      options={[
                        { value: 'self', label: '内部使用' },
                        { value: 'external', label: '外给' },
                      ]}
                      placeholder="用途"
                      testId={`usage-select-${idx}`}
                    />
                    <input
                      value={item.receiver || ''}
                      onChange={e => updateItem(idx, 'receiver', e.target.value)}
                      placeholder={item.usage === 'external' ? '接收方必填' : '使用人/科室'}
                      data-testid={`receiver-input-${idx}`}
                      className="h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="h-10 flex items-center justify-center">
                      {form.items.length > 1 && (
                        <button
                          onClick={() => removeItem(idx)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>
              {hasUnavailableRequiredBatch && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3">
                  <div className="text-sm font-semibold text-red-900">普通出库缺少可扣减批次</div>
                  <div className="mt-1 text-sm text-red-800">
                    下一步：先补入库或调拨可用批次，再登记本次出库。
                  </div>
                  <div className="mt-1 text-sm text-red-800">
                    系统会保留已选项目、物料、数量和用途，避免重新录入。
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <textarea
              value={form.remark}
              onChange={e => setFormField('remark', e.target.value)}
              rows={2}
              placeholder="请输入出库备注信息（可选）"
              data-testid="remark-input"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-sm font-semibold text-emerald-900">出库结果确认</div>
            <div className="mt-1 text-xs text-emerald-800">确认后将接住：{resultChainText}</div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-emerald-900 sm:grid-cols-3">
              <div>关联项目 {selectedProject?.name || '待选择'}</div>
              {isBomOutbound ? (
                <>
                  <div>BOM {bomSummaryName}</div>
                  <div>样本数 {form.sampleCount || '待填写'}</div>
                  <div>病例号 {form.caseNo?.trim() || '未填写'}</div>
                </>
              ) : (
                <div>出库明细 {validSummaryItems.length || '待添加'}</div>
              )}
            </div>
            {!isBomOutbound && (
              <div className="mt-3 space-y-1 text-sm text-emerald-900">
                {validSummaryItems.length > 0 ? validSummaryItems.map((item, index) => {
                  const material = getMaterialById(item.materialId)
                  return (
                    <div key={`${item.materialId}-${index}`}>
                      {material?.name || '未命名物料'} / {getSummaryBatchNo(item)} -{item.quantity}{getSummaryUnit(item)}{getSummaryRemaining(item)} -&gt; {getSummaryReceiver(item)}
                    </div>
                  )
                }) : (
                  <div>待添加出库明细</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            data-testid="cancel-btn"
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-150"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            data-testid="submit-btn"
            disabled={hasBatchQuantityConflict || hasBomBatchPreviewConflict || hasMissingRequiredBatch || hasUnavailableRequiredBatch}
            className={`px-4 py-2 text-sm text-white rounded-md transition-colors duration-150 ${
              hasBatchQuantityConflict || hasBomBatchPreviewConflict || hasMissingRequiredBatch || hasUnavailableRequiredBatch ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {editRecordId ? '确认更新' : '确认出库'}
          </button>
        </div>
      </div>
    </div>
  )
}
