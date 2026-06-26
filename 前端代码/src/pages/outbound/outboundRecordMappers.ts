// P2（拆分）：从 Outbound.tsx 抽出的纯映射函数（乐观更新本地补丁 + 记录↔表单转换），
// 降低 Outbound.tsx 体量、便于单测与复用。无组件状态依赖。
import type { OutboundRecord, Material, Project } from '@/types'
import type { FormData } from './components/OutboundFormModal'

export interface OutboundRefs {
  materials: Material[]
  projects: Project[]
}

export function buildCreatedOutboundRecord(payload: Partial<OutboundRecord>, form: FormData, refs: OutboundRefs): OutboundRecord | null {
  if (!payload.id || !payload.outboundNo) return null

  const project = refs.projects.find(item => item.id === (payload.projectId || form.projectId))
  const totalCost = Number(payload.totalCost || 0)
  const payloadItems = payload.items || []
  const validItems = payloadItems.length > 0
    ? payloadItems
    : (payload.type === 'bom' ? [] : form.items.filter(item => item.materialId && item.quantity > 0))
  const itemCount = Math.max(1, validItems.length)

  return {
    id: payload.id,
    outboundNo: payload.outboundNo,
    type: payload.type || 'project',
    projectId: payload.projectId || form.projectId || undefined,
    projectName: payload.projectName || project?.name,
    caseNo: (payload.caseNo ?? form.caseNo) || undefined,
    sampleCount: payload.sampleCount ?? form.sampleCount,
    items: validItems.map((item, index) => {
      const material = refs.materials.find(candidate => candidate.id === item.materialId)
      const itemTotalCost = itemCount === 1 ? totalCost : Number(material?.price || 0) * Number(item.quantity || 0)
      const unitCost = Number(item.quantity || 0) > 0 ? itemTotalCost / Number(item.quantity || 0) : 0
      return {
        id: item.id || `${payload.id}-item-${index}`,
        outboundId: payload.id!,
        materialId: item.materialId,
        materialName: item.materialName || material?.name,
        batchId: item.batchId,
        batchNo: item.batchNo,
        quantity: Number(item.quantity || 0),
        unit: item.unit || material?.unit || '',
        unitCost: item.unitCost ?? unitCost,
        totalCost: item.totalCost ?? itemTotalCost,
        usage: item.usage,
        receiver: item.receiver,
      }
    }),
    totalCost,
    abcTotalCost: payload.abcTotalCost,
    abcActivityCost: payload.abcActivityCost,
    feeAmount: payload.feeAmount,
    profit: payload.profit,
    costStatus: payload.costStatus || 'pending_cost',
    operator: payload.operator || 'system',
    status: payload.status || 'completed',
    remark: (payload.remark ?? form.remark) || undefined,
    createdAt: payload.createdAt || new Date().toISOString(),
  }
}

export function buildEditedOutboundPatch(
  record: OutboundRecord,
  payload: Partial<OutboundRecord>,
  form: FormData,
  refs: OutboundRefs,
): Partial<OutboundRecord> {
  const project = refs.projects.find(item => item.id === (payload.projectId || form.projectId))
  const totalCost = Number(payload.totalCost ?? record.totalCost ?? 0)
  const validItems = form.items.filter(item => item.materialId && item.quantity > 0)
  const itemCount = Math.max(1, validItems.length)

  return {
    type: payload.type || record.type,
    projectId: payload.projectId || form.projectId || undefined,
    projectName: payload.projectName || project?.name || record.projectName,
    caseNo: (payload.caseNo ?? form.caseNo) || undefined,
    sampleCount: payload.sampleCount ?? form.sampleCount,
    items: validItems.map((item, index) => {
      const material = refs.materials.find(candidate => candidate.id === item.materialId)
      const itemTotalCost = itemCount === 1 ? totalCost : Number(item.unitCost || material?.price || 0) * Number(item.quantity || 0)
      const unitCost = Number(item.quantity || 0) > 0 ? itemTotalCost / Number(item.quantity || 0) : 0
      return {
        id: item.batchId
          ? `${record.id}-item-${item.batchId}-${index}`
          : record.items?.[index]?.id || `${record.id}-item-${index}`,
        outboundId: record.id,
        materialId: item.materialId,
        materialName: material?.name || record.items?.[index]?.materialName,
        batchId: item.batchId,
        batchNo: item.batchNo,
        quantity: Number(item.quantity || 0),
        unit: material?.unit || record.items?.[index]?.unit || '',
        unitCost: item.unitCost ?? unitCost,
        totalCost: itemTotalCost,
        usage: item.usage,
        receiver: item.receiver,
      }
    }),
    totalCost,
    abcTotalCost: payload.abcTotalCost,
    abcActivityCost: payload.abcActivityCost,
    feeAmount: payload.feeAmount,
    profit: payload.profit,
    costStatus: payload.costStatus || 'pending_cost',
    remark: (payload.remark ?? form.remark) || undefined,
  }
}

export function mapOutboundRecordToForm(record: OutboundRecord, fallbackMaterialId = ''): FormData {
  return {
    type: record.type as FormData['type'],
    projectId: record.projectId || '',
    items: record.items?.map(item => ({
      materialId: item.materialId,
      batchId: item.batchId || undefined,
      batchNo: item.batchNo || undefined,
      unitCost: item.unitCost,
      quantity: item.quantity,
      usage: item.usage,
      receiver: item.receiver,
    })) || [{ materialId: fallbackMaterialId, quantity: 1 }],
    remark: record.remark || '',
    bomId: undefined,
    sampleCount: undefined,
    caseNo: record.caseNo || '',
  }
}
