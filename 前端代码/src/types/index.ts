// ===== 通用类型 =====
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface PaginationData<T> {
  list: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface PageParams {
  page?: number
  pageSize?: number
  keyword?: string
  sortField?: string
  sortOrder?: 'asc' | 'desc'
}

// ===== 认证类型 =====
export interface User {
  id: string
  username: string
  realName: string
  role: string
  permissions: string[]
  dataScope?: 'all' | 'dept' | 'self'
  department?: string
  phone?: string
  email?: string
  status: 'active' | 'inactive'
  lastLogin?: string | null
  createdAt: string
}

export interface LoginForm {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  refreshToken: string
  expiresIn: number
  user: User
}

// ===== 物料分类 =====
export interface Category {
  id: string
  code: string
  name: string
  parentId?: string | null
  level: number
  sortOrder: number
  status?: 'active' | 'inactive'
  children?: Category[]
  count?: number
  isLeaf?: boolean
  createdAt: string
  updatedAt: string
}

// ===== 物料 =====
export interface Material {
  id: string
  code: string
  barcode?: string
  name: string
  spec: string
  unit: string
  specQty?: number
  specUnit?: string
  price: number
  stock: number
  minStock: number
  maxStock: number
  safetyStock: number
  locationId?: string
  locationName?: string
  categoryId: string
  categoryPath?: string
  supplierId?: string
  supplierName?: string
  status: 'active' | 'inactive'
  remark?: string
  batches?: Batch[]
  stockLogs?: StockLog[]
  createdAt: string
  updatedAt: string
}

export interface MaterialDeleteCheck {
  material: Pick<Material, 'id' | 'code' | 'name'>
  deletable: boolean
  impacts: {
    currentInventoryCount: number
    inventoryLocationCount: number
    batchCount: number
    inboundCount: number
    outboundCount: number
    bomCount: number
    returnCount: number
    scrapCount: number
    supplierReturnCount: number
    stockLogCount: number
    usageTrackingCount: number
  }
  reasons: string[]
}

export interface MaterialStatusCheck {
  material: Pick<Material, 'id' | 'code' | 'name'>
  targetStatus: 'active' | 'inactive'
  canChange: boolean
  impacts: {
    currentInventoryCount: number
    inventoryLocationCount: number
    activeBomCount: number
  }
  reasons: string[]
}

// ===== 批次 =====
export interface Batch {
  id: string
  materialId: string
  batchNo: string
  quantity: number
  remaining: number
  productionDate?: string
  expiryDate: string
  inboundId: string
  inboundPrice: number
  supplierId?: string
  status: 'normal' | 'used' | 'expired'
  createdAt: string
}

// ===== 供应商 =====
export interface Supplier {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  taxNo?: string
  bankName?: string
  bankAccount?: string
  status: 'active' | 'inactive'
  cooperationCount: number
  totalAmount: number
  rating: number
  createdAt: string
  updatedAt: string
}

// ===== 库位 =====
export interface Location {
  id: string
  code: string
  name: string
  type: 'shelf' | 'fridge' | 'cabinet' | 'counter' | 'other'
  parentId?: string | null
  zone: string
  shelf?: string
  position?: string
  capacity: number
  used: number
  status: 'active' | 'inactive'
  createdAt: string
}

export interface LocationDeleteCheck {
  location: Pick<Location, 'id' | 'code' | 'name'>
  deletable: boolean
  impacts: {
    childLocationCount: number
    materialCount: number
    inventoryCount: number
    inventoryLocationCount: number
    inboundCount: number
    transferCount: number
  }
  reasons: string[]
}

export interface LocationStatusCheck {
  location: Pick<Location, 'id' | 'code' | 'name'>
  targetStatus: 'active' | 'inactive'
  canChange: boolean
  impacts: {
    activeChildLocationCount: number
    activeMaterialCount: number
    inventoryCount: number
    inventoryLocationCount: number
  }
  reasons: string[]
}

// ===== 库存 =====
export interface InventoryItem {
  id: string
  materialId: string
  batchId?: string | null
  batchNo?: string | null
  code: string
  name: string
  spec: string
  unit: string
  stock: number
  totalStock?: number
  minStock: number
  maxStock: number
  availableStock: number
  locationId?: string
  locationName?: string
  supplierId?: string
  supplierName?: string
  status: 'normal' | 'low-stock' | 'warning' | 'expired' | 'out-of-stock'
  lastInbound?: string
  lastOutbound?: string
}

export interface InventoryStats {
  totalMaterials: number
  totalStockValue: number
  totalStockCount?: number
  totalQuantity?: number
  normalCount?: number
  lowStockCount: number
  expiringSoonCount?: number
  expiringCount: number
  expiredCount: number
  outOfStockCount?: number
  categoryDistribution: Array<{
    categoryId: string
    categoryName: string
    count: number
  }>
}

export interface InventoryConsistencyIssue {
  code: string
  severity: 'critical' | 'warning'
  entityType: string
  entityId: string
  entityCode?: string | null
  entityName?: string | null
  message: string
  impacts: Record<string, unknown>
}

export interface InventoryConsistencyCheck {
  summary: {
    issueCount: number
    criticalCount: number
    warningCount: number
  }
  issues: InventoryConsistencyIssue[]
}

// ===== 入库 =====
export type InboundType = 'direct' | 'purchase' | 'return' | 'transfer' | 'surplus' | 'other'

export interface InboundRecord {
  id: string
  inboundNo: string
  type: InboundType
  materialId: string
  materialName: string
  batchNo?: string
  quantity: number
  unit: string
  price: number
  amount: number
  supplierId?: string
  supplierName?: string
  locationId: string
  locationName?: string
  productionDate?: string
  expiryDate?: string
  operator: string
  status: 'completed' | 'cancelled'
  remark?: string
  cancelReason?: string
  purchaseOrderId?: string
  purchaseOrderNo?: string
  createdAt: string
}

export interface InboundFormData {
  type: InboundType
  materialId: string
  batchNo?: string
  quantity: number
  price?: number
  supplierId?: string
  locationId: string
  fromLocationId?: string
  fromLocationName?: string
  productionDate?: string
  expiryDate?: string
  remark?: string
  purchaseOrderId?: string
  status?: 'completed' | 'cancelled'
}

// ===== 出库 =====
export type OutboundType = 'project' | 'transfer' | 'scrap' | 'bom'
export type OutboundFormType = Exclude<OutboundType, 'bom'>
export type OutboundCostStatus = 'pending_cost' | 'costed' | 'cost_exception' | 'recalculated'

export interface OutboundItem {
  id: string
  outboundId: string
  materialId: string
  materialName?: string
  batchId?: string
  batchNo?: string
  quantity: number
  unit: string
  unitCost: number
  totalCost: number
  usage?: 'self' | 'external'
  receiver?: string | null
}

export interface OutboundRecord {
  id: string
  outboundNo: string
  type: OutboundType
  projectId?: string
  projectName?: string
  caseNo?: string | null
  sampleCount?: number
  items: OutboundItem[]
  totalCost: number
  abcTotalCost?: number
  abcActivityCost?: number
  feeAmount?: number
  profit?: number
  costStatus?: OutboundCostStatus
  operator: string
  approver?: string
  approvedAt?: string
  status: 'completed' | 'cancelled' | 'pending'
  remark?: string
  createdAt: string
}

export interface OutboundFormData {
  type: OutboundFormType
  projectId?: string
  items: Array<{
    materialId: string
    batchId?: string
    quantity: number
    usage?: 'self' | 'external'
    receiver?: string
  }>
  remark?: string
}

// ===== 检测项目 =====
export interface Project {
  id: string
  code: string
  name: string
  type: string
  typeName?: string
  cycle?: string
  bomId?: string
  bomName?: string
  bomVersion?: string
  supportableSamples?: number
  status: 'active' | 'inactive'
  manager?: string
  description?: string
  costStats?: {
    totalCost: number
    sampleCount: number
    unitCost: number
  }
  createdAt: string
}

export interface ProjectDeleteCheck {
  project: Pick<Project, 'id' | 'code' | 'name'>
  deletable: boolean
  impacts: {
    bomCount: number
    directBomCount: number
    serviceBomCount: number
    outboundCount: number
    lisCaseCount: number
  }
  reasons: string[]
}

export interface ProjectStatusCheck {
  project: Pick<Project, 'id' | 'code' | 'name'>
  targetStatus: 'active' | 'inactive'
  canChange: boolean
  impacts: {
    bomCount: number
    directBomCount: number
    serviceBomCount: number
    outboundCount: number
    lisCaseCount: number
    invalidBomCount: number
  }
  reasons: string[]
  warnings: string[]
}

// ===== BOM =====
export interface BOMDeleteCheck {
  bom: Pick<BOM, 'id' | 'code' | 'name'>
  deletable: boolean
  impacts: {
    projectCount: number
    outboundDetailCount: number
  }
  reasons: string[]
}

export interface BOMStatusCheck {
  bom: Pick<BOM, 'id' | 'code' | 'name'>
  targetStatus: 'active' | 'inactive'
  canChange: boolean
  impacts: {
    activeProjectCount: number
    coreMaterialCount?: number
    inactiveMaterialCount: number
    inactiveEquipmentCount: number
    inactiveEquipmentTypeCount: number
  }
  reasons: string[]
}

export interface BOMMaterial {
  id: string
  name: string
  spec: string
  usagePerSample: number
  unit: string
  price: number
  stock: number
  costRatio: number
  groupName?: string | null
}

export interface BOMVersion {
  version: string
  updatedAt: string
  changeLog: string
  effectiveScope?: 'future_only' | 'retroactive'
  impactSummary?: {
    totalOutboundCount: number
    affectedMonthCount: number
    closedMonthCount: number
    recalculableMonthCount: number
    months?: Array<{
      yearMonth: string
      periodStatus: string
      outboundCount: number
      recalculable: boolean
    }>
  } | null
  changedBy?: string | null
  isCurrent?: boolean
  snapshot?: {
    materials?: Array<{
      materialId: string
      materialName?: string | null
      usagePerSample?: number | null
      unit?: string | null
      groupName?: string | null
    }>
  }
  diff?: {
    changedFields?: Array<{ field: string; label: string; before: unknown; after: unknown }>
    addedMaterials?: Array<{ materialId: string; materialName?: string | null }>
    removedMaterials?: Array<{ materialId: string; materialName?: string | null }>
    changedMaterials?: Array<{
      materialId: string
      materialName?: string | null
      before?: { usagePerSample?: number | null; unit?: string | null; groupName?: string | null }
      after?: { usagePerSample?: number | null; unit?: string | null; groupName?: string | null }
    }>
  }
}

export interface BOMGeneralReagent {
  id?: string
  materialId: string
  name?: string
  spec?: string
  usagePerSample: number
  unit: string
  allocationType?: string
}

export interface BOMGeneralConsumable {
  id?: string
  materialId: string
  name?: string
  spec?: string
  usagePerSample: number
  unit: string
  allocationType?: string
}

export interface BOMQualityControl {
  id?: string
  materialId: string
  name?: string
  spec?: string
  usagePerBatch: number
  unit: string
  coversSamples: number
  allocationType?: string
}

export interface BOMEquipmentTemplate {
  id?: string
  equipmentId?: string
  equipmentTypeId?: string
  equipmentName?: string
  equipmentTypeName?: string
  model?: string
  usageMinutes: number
}

export interface BOM {
  id: string
  code: string
  name: string
  version: string
  type: string
  serviceId?: string
  serviceName?: string
  description?: string
  materialCount: number
  supportableSamples?: number
  unitCost: number
  feeStandardId?: string
  feeCategory?: string
  standardSlideCost?: number
  standardFeePerSlide?: number
  status: 'active' | 'inactive'
  materials: BOMMaterial[]
  generalReagents?: BOMGeneralReagent[]
  generalConsumables?: BOMGeneralConsumable[]
  qualityControls?: BOMQualityControl[]
  equipmentTemplates?: BOMEquipmentTemplate[]
  versionHistory: BOMVersion[]
  createdAt: string
  updatedAt: string
}

// ===== 库存流水 =====
export interface StockLog {
  id: string
  type: 'inbound' | 'outbound' | 'scrap' | 'adjust'
  materialId: string
  quantity: number
  beforeStock: number
  afterStock: number
  relatedId?: string
  relatedType?: string
  operator: string
  remark?: string
  createdAt: string
}

// ===== 预警 =====
export interface AlertRule {
  id: string
  type: 'low-stock' | 'expiry' | 'stagnant'
  name: string
  threshold?: number
  thresholdDays?: number
  enabled: boolean
}

export interface Alert {
  id: string
  type: 'low-stock' | 'expiry' | 'stagnant'
  level: 'warning' | 'danger' | 'info'
  materialId: string
  materialName: string
  batchId?: string | null
  batchNo?: string | null
  ruleId?: string | null
  triggerCondition?: string | null
  currentStock?: number
  threshold?: number
  message: string
  status: 'pending' | 'processed' | 'ignored' | 'auto_resolved' | 'dismissed' | 'handled'
  handledBy?: string
  handledAt?: string
  remark?: string
  createdAt: string
}

// ===== 报表 =====
export interface ProjectCostReport {
  summary: {
    totalCost: number
    projectCost: number
    publicCost: number
    totalSamples: number
  }
  projects: Array<{
    id: string
    name: string
    category: string
    sampleCount: number
    unitCost: number
    totalCost: number
    ratio: number
    changeRate?: number
    changeDirection?: 'up' | 'down'
  }>
}

export interface MaterialCostReport {
  materials: Array<{
    id: string
    name: string
    spec: string
    consumption: number
    consumptionUnit: string
    totalCost: number
    ratio: number
    changeRate?: number
    changeDirection?: 'up' | 'down'
  }>
  trend: Array<{
    date: string
    cost: number
  }>
}

export interface SupplierCostReport {
  suppliers: Array<{
    id: string
    name: string
    amount: number
    ratio: number
    orderCount: number
    status: string
  }>
}

export interface FullCostReport {
  summary: {
    totalCost: number
    totalSamples: number
    avgUnitCost: number
    materialCost: number
    laborCost: number
    equipmentCost: number
    qcCost: number
    indirectCost: number
  }
  projects: Array<{
    id: string
    name: string
    type: string
    sampleCount: number
    materialCost: number
    laborCost: number
    equipmentCost: number
    qcCost: number
    indirectCost: number
    totalCost: number
    unitCost: number
    standardMaterialCost: number
    standardLaborCost: number
    standardEquipmentCost: number
    standardIndirectCost: number
    standardTotalCost: number
  }>
}

// ===== 系统管理 =====
export interface Role {
  id: string
  code: string
  name: string
  description?: string
  permissions: string[]
  status: 'active' | 'inactive'
  dataScope?: 'all' | 'dept' | 'self'
  isSystem?: boolean
  userCount?: number
  associatedUsers?: Array<{
    id: string
    username: string
    realName: string
    department?: string | null
    status: 'active' | 'inactive'
    lastLogin?: string | null
    createdAt?: string
  }>
  createdAt: string
  updatedAt?: string
}

export interface OperationLog {
  id: string
  userId: string
  username: string
  operation: string
  operationType?: string
  module?: string
  description: string
  requestData?: Record<string, unknown>
  responseData?: Record<string, unknown>
  ip: string
  userAgent?: string
  createdAt: string
}

// ===== 退货给供应商 =====
export interface SupplierReturnRecord {
  id: string
  returnNo: string
  materialId: string
  materialName?: string
  batchId?: string
  batchNo?: string
  quantity: number
  supplierId?: string
  supplierName?: string
  purchaseOrderId?: string
  purchaseOrderNo?: string
  inboundRecordId?: string
  inboundNo?: string
  reason: string
  refundAmount?: number
  trackingNo?: string
  status: 'pending' | 'shipped' | 'received' | 'refunded' | 'cancelled'
  operator: string
  remark?: string
  createdAt: string
  updatedAt: string
}

export interface SupplierReturnFormData {
  materialId: string
  quantity: number
  batchId?: string
  supplierId?: string
  purchaseOrderId?: string
  inboundRecordId?: string
  reason: string
  refundAmount?: number
  trackingNo?: string
  remark?: string
  operator?: string
}

// ===== 退库 =====
export interface ReturnRecord {
  id: string
  returnNo: string
  outboundItemId?: string
  outboundNo?: string
  materialId: string
  materialName?: string
  batchId?: string
  batchNo?: string
  quantity: number
  unitCost: number
  totalCost: number
  outboundItemId?: string
  reason: string
  operator: string
  status: string
  remark?: string
  createdAt: string
}

export interface ReturnSource {
  outboundItemId: string
  outboundId: string
  outboundNo: string
  materialId: string
  materialName?: string
  unit?: string
  batchId?: string
  batchNo?: string
  outboundQuantity: number
  returnedQuantity: number
  returnableQuantity: number
  unitCost: number
  totalCost: number
}

// ===== 报废 =====
export interface ScrapRecord {
  id: string
  scrapNo: string
  materialId: string
  materialName?: string
  unit?: string
  batchId?: string
  batchNo?: string
  quantity: number
  reason: string
  operator: string
  status: string
  remark?: string
  createdAt: string
}

// ===== 调拨 =====
export interface TransferRecord {
  id: string
  inboundNo: string
  materialId: string
  materialName?: string
  batchNo?: string
  quantity: number
  fromLocationId?: string
  fromLocationName?: string
  toLocationId: string
  toLocationName?: string
  operator: string
  status: string
  remark?: string
  createdAt: string
}

// ===== 标准工时 =====
export interface StandardLaborTime {
  id: string
  stepCode: string
  stepName: string
  projectType: string
  standardMinutes: number
  laborRatePerMinute: number
  isEquipmentStep: boolean
  description?: string
  sortOrder: number
  referenceSource?: 'supplier' | 'industry' | 'system'
  referenceSourceLabel?: string
  createdAt: string
  updatedAt: string
}

// ===== 间接成本中心 =====
export interface IndirectCostCenter {
  id: string
  code: string
  name: string
  costType: string
  monthlyAmount: number
  allocationBase: string
  description?: string
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

export interface IndirectCostAllocation {
  id: string
  costCenterId: string
  yearMonth: string
  totalAmount: number
  allocationBaseValue: number
  allocationRate: number
  createdAt: string
}

// ===== 设备类型 =====
export interface EquipmentType {
  id: string
  code: string
  name: string
  description?: string
  defaultPurchasePrice?: number
  defaultDepreciableLifeYears?: number
  defaultValue?: number
  defaultDepreciationMethod?: string
  defaultTotalCapacity?: number
  defaultCapacityUnit?: string
  status: 'active' | 'inactive'
  equipmentCount?: number
  createdAt: string
  updatedAt: string
}

// ===== 设备 =====
export interface Equipment {
  id: string
  code: string
  name: string
  model?: string
  manufacturer?: string
  purchasePrice: number
  purchaseDate?: string
  depreciableLifeYears: number
  residualValue: number
  depreciationMethod: 'straight_line' | 'units_of_production'
  totalCapacity?: number
  capacityUnit?: string
  status: 'active' | 'inactive' | 'scrapped'
  locationId?: string
  typeId?: string | null
  typeName?: string | null
  annualDepreciation?: number
  accumulatedDepreciation?: number
  netBookValue?: number
  createdAt: string
  updatedAt: string
}

// ===== 设备折旧统计 =====
export interface DepreciationStat {
  typeId: string
  typeCode: string
  typeName: string
  equipmentCount: number
  totalPurchasePrice: number
  totalAnnualDepreciation: number
  totalMonthlyDepreciation: number
}

// ===== 季度成本调整 =====
export interface CostAdjustment {
  id: string
  costCenterId: string
  costCenterName?: string
  yearQuarter: string
  preProvisionAmount: number
  actualAmount: number
  adjustmentAmount: number
  adjustmentReason?: string
  adjustedBy?: string
  adjustedAt?: string
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: string
  reviewReason?: string
}

// ===== BOM 成本预览 =====
export interface CostPreview {
  bomId: string
  bomName: string
  totalCost: number
  breakdown: {
    materialCost: { amount: number; percentage: number }
    laborCost: { amount: number; percentage: number }
    equipmentCost: { amount: number; percentage: number }
    indirectCost: { amount: number; percentage: number }
  }
}

export interface EquipmentUsage {
  id: string
  equipmentId: string
  projectId?: string
  outboundId?: string
  usageMinutes: number
  usageCount: number
  depreciationCost: number
  operator?: string
  usageDate?: string
  createdAt: string
}

// ===== 采购订单 =====
export interface PurchaseOrder {
  id: string
  orderNo: string
  materialId: string
  materialName: string
  supplierId?: string
  supplierName?: string
  orderedQty: number
  receivedQty: number
  remainingQty: number
  unit: string
  unitPrice: number
  totalAmount: number
  expectedDate?: string
  status: 'pending' | 'partial' | 'completed' | 'cancelled'
  remark?: string
  createdAt: string
  updatedAt: string
}
