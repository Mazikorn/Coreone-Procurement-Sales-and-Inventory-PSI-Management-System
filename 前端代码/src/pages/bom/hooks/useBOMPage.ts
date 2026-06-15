export interface BOMForm {
  code: string
  name: string
  type: string
  version: string
  status: 'active' | 'inactive'
  description: string
  serviceId: string
  feeCategory: string
  standardSlideCost: number
  standardFeePerSlide: number
  supportableSamples: number
  materials: BOMFormMaterial[]
  generalReagents: BOMExtMaterial[]
  generalConsumables: BOMExtMaterial[]
  qualityControls: BOMQualityControlForm[]
}

export interface BOMFormMaterial {
  materialId: string
  name: string
  spec: string
  usagePerSample: number
  unit: string
  groupName: string
}

export interface BOMExtMaterial {
  materialId: string
  name: string
  spec: string
  usagePerSample: number
  unit: string
}

export interface BOMQualityControlForm {
  materialId: string
  name: string
  spec: string
  usagePerBatch: number
  unit: string
  coversSamples: number
}

export interface CopyForm {
  sourceId: string
  newCode: string
  newName: string
  name: string
  copyInfo: boolean
  copyMaterials: boolean
}
