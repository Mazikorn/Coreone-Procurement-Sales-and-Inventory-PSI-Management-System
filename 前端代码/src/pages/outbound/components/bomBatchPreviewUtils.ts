import type { BOM, Batch } from '@/types'

export interface BatchPreviewOption extends Batch {
  materialName?: string
}

export interface BatchPreviewAllocation {
  batchId: string
  batchNo: string
  materialName?: string
  quantity: number
}

export interface BomBatchPreviewRow {
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

export const roundQuantity = (value: number) => Math.round(value * 1_000_000) / 1_000_000

export const formatQuantity = (value: number) => {
  const rounded = roundQuantity(value)
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '')
}

export const collectBomMaterialIds = (bom: BOM) => Array.from(new Set([
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

export const buildBomBatchPreviewRows = (
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
