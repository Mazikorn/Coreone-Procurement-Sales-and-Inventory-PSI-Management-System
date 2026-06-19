import { useCallback, useEffect, useMemo, useState } from 'react'
import { bomApi, materialApi, projectApi } from '@/api/master'
import { usePagination } from '@/hooks/usePagination'
import type { BOM, BOMDeleteCheck, BOMGeneralConsumable, BOMGeneralReagent, BOMQualityControl, BOMStatusCheck, Material, Project } from '@/types'
import { toast } from 'sonner'
import { downloadTextFile } from '@/lib/utils'
import { getUserRole } from '@/lib/permissions'

export interface BOMForm {
  code: string
  name: string
  version: string
  type: string
  serviceId: string
  description: string
  status: 'active' | 'inactive'
  supportableSamples: number
  feeStandardId: string
  feeCategory: string
  materials: Array<{
    id?: string
    materialId: string
    name: string
    spec: string
    usagePerSample: number
    unit: string
    groupName?: string | null
  }>
  generalReagents: BOMGeneralReagent[]
  generalConsumables: BOMGeneralConsumable[]
  qualityControls: BOMQualityControl[]
}

export interface CopyForm {
  name: string
  copyInfo: boolean
  copyMaterials: boolean
}

export interface BOMExportForm {
  range: 'all' | 'selected' | 'filtered'
  format: 'xlsx' | 'csv'
  includeBasic: boolean
  includeMaterials: boolean
  includeHistory: boolean
}

type ModalType = 'create' | 'edit' | 'detail' | 'delete' | 'batchImpact' | 'copy' | 'export' | null
type DetailTab = 'info' | 'history'

export type BOMBatchAction = 'delete' | 'active' | 'inactive'

export interface BOMBatchDeleteResult {
  bom: BOM
  check: BOMDeleteCheck | null
  error?: string
}

export interface BOMBatchStatusResult {
  bom: BOM
  check: BOMStatusCheck | null
  error?: string
}

const emptyForm: BOMForm = {
  code: '',
  name: '',
  version: 'v1.0',
  type: 'ihc',
  serviceId: '',
  description: '',
  status: 'active',
  supportableSamples: 0,
  feeStandardId: '',
  feeCategory: '',
  materials: [],
  generalReagents: [],
  generalConsumables: [],
  qualityControls: [],
}

type BOMUsageItem = {
  materialId?: string
  usagePerSample?: number
}

type BOMQualityItem = {
  materialId?: string
  usagePerBatch?: number
  coversSamples?: number
}

function validateMaterialGroup(
  items: BOMUsageItem[],
  label: string,
  options?: { required?: boolean }
) {
  if (options?.required && items.length === 0) {
    return `${label}至少需要配置一项物料`
  }

  const seen = new Set<string>()
  for (const item of items) {
    const materialId = String(item.materialId || '').trim()
    if (!materialId) return `${label}存在未选择物料的明细`
    if (seen.has(materialId)) return `${label}存在重复物料`
    seen.add(materialId)

    const usage = Number(item.usagePerSample)
    if (!Number.isFinite(usage) || usage <= 0) return `${label}用量必须大于0`
  }
  return null
}

function validateQualityControls(items: BOMQualityItem[]) {
  const seen = new Set<string>()
  for (const item of items) {
    const materialId = String(item.materialId || '').trim()
    if (!materialId) return '质控品存在未选择物料的明细'
    if (seen.has(materialId)) return '质控品存在重复物料'
    seen.add(materialId)

    const usage = Number(item.usagePerBatch)
    if (!Number.isFinite(usage) || usage <= 0) return '质控品用量必须大于0'

    const coversSamples = Number(item.coversSamples)
    if (!Number.isFinite(coversSamples) || coversSamples <= 0) return '质控品覆盖样本数必须大于0'
  }
  return null
}

function validateCrossGroupUnique(form: BOMForm) {
  const groups = [
    { label: '特异性试剂', items: form.materials },
    { label: '通用试剂', items: form.generalReagents },
    { label: '通用耗材', items: form.generalConsumables },
    { label: '质控品', items: form.qualityControls },
  ]
  const firstGroupByMaterial = new Map<string, string>()

  for (const group of groups) {
    for (const item of group.items) {
      const materialId = String(item.materialId || '').trim()
      if (!materialId) continue
      const previousLabel = firstGroupByMaterial.get(materialId)
      if (previousLabel && previousLabel !== group.label) {
        return `${previousLabel}与${group.label}存在重复物料`
      }
      firstGroupByMaterial.set(materialId, group.label)
    }
  }

  return null
}

function validateBomForm(form: BOMForm) {
  return (
    validateMaterialGroup(form.materials, '特异性试剂', { required: true }) ||
    validateMaterialGroup(form.generalReagents, '通用试剂') ||
    validateMaterialGroup(form.generalConsumables, '通用耗材') ||
    validateQualityControls(form.qualityControls) ||
    validateCrossGroupUnique(form)
  )
}

function toForm(bom: BOM): BOMForm {
  return {
    code: bom.code,
    name: bom.name,
    version: bom.version,
    type: bom.type || 'ihc',
    serviceId: bom.serviceId || '',
    description: bom.description || '',
    status: bom.status || 'active',
    supportableSamples: bom.supportableSamples || 0,
    feeStandardId: bom.feeStandardId || '',
    feeCategory: bom.feeCategory || '',
    materials: bom.materials || [],
    generalReagents: bom.generalReagents || [],
    generalConsumables: bom.generalConsumables || [],
    qualityControls: bom.qualityControls || [],
  }
}

function buildPayload(form: BOMForm): any {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    type: form.type,
    serviceId: form.serviceId.trim() || null,
    description: form.description.trim() || undefined,
    supportableSamples: form.supportableSamples || undefined,
    feeStandardId: form.feeStandardId || undefined,
    feeCategory: form.feeCategory || undefined,
    materials: form.materials
      .map(item => ({
        materialId: item.materialId,
        usagePerSample: Number(item.usagePerSample),
        unit: item.unit || '',
        groupName: item.groupName || undefined,
      })),
    generalReagents: form.generalReagents
      .map(item => ({
        materialId: item.materialId,
        usagePerSample: Number(item.usagePerSample),
        unit: item.unit || 'ml',
      })),
    generalConsumables: form.generalConsumables
      .map(item => ({
        materialId: item.materialId,
        usagePerSample: Number(item.usagePerSample),
        unit: item.unit || '个',
      })),
    qualityControls: form.qualityControls
      .map(item => ({
        materialId: item.materialId,
        usagePerBatch: Number(item.usagePerBatch),
        unit: item.unit || '片',
        coversSamples: Number(item.coversSamples),
      })),
  }
}

export function useBOMPage() {
  const canWrite = getUserRole() === 'admin'
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allMaterials, setAllMaterials] = useState<Material[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [allBoms, setAllBoms] = useState<BOM[]>([])
  const [modalType, setModalType] = useState<ModalType>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedBom, setSelectedBom] = useState<BOM | null>(null)
  const [deleteCheck, setDeleteCheck] = useState<BOMDeleteCheck | null>(null)
  const [checkingDelete, setCheckingDelete] = useState(false)
  const [batchAction, setBatchAction] = useState<BOMBatchAction | null>(null)
  const [batchTargets, setBatchTargets] = useState<BOM[]>([])
  const [batchDeleteResults, setBatchDeleteResults] = useState<BOMBatchDeleteResult[]>([])
  const [batchStatusResults, setBatchStatusResults] = useState<BOMBatchStatusResult[]>([])
  const [checkingBatch, setCheckingBatch] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('info')
  const [form, setForm] = useState<BOMForm>(emptyForm)
  const [copyForm, setCopyForm] = useState<CopyForm>({ name: '', copyInfo: true, copyMaterials: true })
  const [exportForm, setExportForm] = useState<BOMExportForm>({
    range: 'filtered',
    format: 'xlsx',
    includeBasic: true,
    includeMaterials: true,
    includeHistory: false,
  })
  const [submitting, setSubmitting] = useState(false)

  const effectiveStatus = quickFilter === 'active' || quickFilter === 'inactive' ? quickFilter : filterStatus
  const lowSupportOnly = quickFilter === 'low-support'

  const fetchFn = useCallback(async ({ page, pageSize }: { page: number; pageSize: number }) => {
    const res = await bomApi.getList({
      page,
      pageSize,
      keyword: keyword || undefined,
      type: filterType || undefined,
      status: effectiveStatus || undefined,
    })
    let list = res.list || []
    if (lowSupportOnly) {
      list = list.filter(item => item.supportableSamples !== undefined && item.supportableSamples !== null && item.supportableSamples < 30)
    }
    return {
      list,
      pagination: {
        page: res.pagination?.page || page,
        pageSize: res.pagination?.pageSize || pageSize,
        total: lowSupportOnly ? list.length : res.pagination?.total || list.length,
      },
    }
  }, [keyword, filterType, effectiveStatus, lowSupportOnly])

  const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } = usePagination<BOM>({
    fetchFn,
    deps: [keyword, filterType, effectiveStatus, lowSupportOnly],
  })

  const fetchRefs = useCallback(async () => {
    try {
      const [materialsRes, projectsRes, bomsRes] = await Promise.all([
        materialApi.getList({ page: 1, pageSize: 1000, status: 'active' }),
        projectApi.getList({ page: 1, pageSize: 1000, status: 'active' }),
        bomApi.getList({ page: 1, pageSize: 1000 }),
      ])
      setAllMaterials(materialsRes.list || [])
      setAllProjects(projectsRes.list || [])
      setAllBoms(bomsRes.list || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    fetchRefs()
  }, [fetchRefs])

  const stats = useMemo(() => ({
    total: allBoms.length,
    active: allBoms.filter(item => item.status === 'active').length,
    inactive: allBoms.filter(item => item.status === 'inactive').length,
    lowSupport: allBoms.filter(item => item.supportableSamples !== undefined && item.supportableSamples !== null && item.supportableSamples < 30).length,
  }), [allBoms])

  const isAllSelected = data.length > 0 && data.every(item => selectedIds.has(item.id))
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected

  const resetForm = () => setForm(emptyForm)

  const openCreate = () => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    setEditingId(null)
    setSelectedBom(null)
    resetForm()
    setModalType('create')
  }

  const openEdit = async (row: BOM) => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    setEditingId(row.id)
    setSubmitting(true)
    try {
      const detail = await bomApi.getDetail(row.id)
      setSelectedBom(detail)
      setForm(toForm(detail))
      setModalType('edit')
    } catch {
      toast.error('加载BOM详情失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openDetail = async (row: BOM) => {
    setSubmitting(true)
    try {
      const detail = await bomApi.getDetail(row.id)
      setSelectedBom(detail)
      setDetailTab('info')
      setModalType('detail')
    } catch {
      toast.error('加载BOM详情失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openCopy = async (row: BOM) => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    setEditingId(row.id)
    setSubmitting(true)
    try {
      const detail = await bomApi.getDetail(row.id)
      setSelectedBom(detail)
      setCopyForm({ name: `${detail.name} 副本`, copyInfo: true, copyMaterials: true })
      setModalType('copy')
    } catch {
      toast.error('加载BOM详情失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openDelete = async (row: BOM) => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    setEditingId(row.id)
    setSelectedBom(row)
    setDeleteCheck(null)
    setModalType('delete')
    setCheckingDelete(true)
    try {
      const check = await bomApi.checkDeletable(row.id)
      setDeleteCheck(check)
    } catch {
      toast.error('删除影响检查失败')
    } finally {
      setCheckingDelete(false)
    }
  }

  const closeModal = () => {
    setModalType(null)
    setEditingId(null)
    setSelectedBom(null)
    setDeleteCheck(null)
    setCheckingDelete(false)
    setBatchAction(null)
    setBatchTargets([])
    setBatchDeleteResults([])
    setBatchStatusResults([])
    setCheckingBatch(false)
    resetForm()
  }

  const reload = async () => {
    refresh()
    fetchRefs()
  }

  const handleSubmit = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    if (!form.code.trim() || !form.name.trim() || !form.type) {
      toast.error('请填写必填字段')
      return
    }
    const validationError = validateBomForm(form)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setSubmitting(true)
    try {
      const payload = buildPayload(form)
      if (modalType === 'edit' && editingId) {
        const previousPayload = selectedBom ? buildPayload(toForm(selectedBom)) : null
        const contentChanged = JSON.stringify(payload) !== JSON.stringify(previousPayload)
        const statusChanged = form.status !== selectedBom?.status

        if (statusChanged && form.status === 'inactive') {
          await bomApi.updateStatus(editingId, form.status)
        }
        if (contentChanged) {
          await bomApi.update(editingId, payload)
        }
        if (statusChanged && form.status !== 'inactive') {
          await bomApi.updateStatus(editingId, form.status)
        }
        if (!contentChanged && !statusChanged) {
          toast.info('没有需要保存的变更')
          return
        }
        toast.success('BOM已更新')
      } else {
        const created = await bomApi.create(payload)
        if (form.status === 'inactive' && created?.id) {
          await bomApi.updateStatus(created.id, 'inactive')
        }
        toast.success('BOM已创建')
      }
      closeModal()
      reload()
    } catch {
      toast.error('BOM保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    if (!editingId) return
    if (!deleteCheck || !deleteCheck.deletable) {
      toast.error('该BOM存在业务引用，不能删除')
      return
    }
    setSubmitting(true)
    try {
      await bomApi.delete(editingId)
      toast.success('BOM已删除')
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(editingId)
        return next
      })
      closeModal()
      reload()
    } catch {
      toast.error('删除失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openBatchImpact = async (action: BOMBatchAction) => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    const targets = data.filter(item => selectedIds.has(item.id))
    if (targets.length === 0) return
    setBatchAction(action)
    setBatchTargets(targets)
    setBatchDeleteResults([])
    setBatchStatusResults([])
    setModalType('batchImpact')
    setCheckingBatch(true)
    try {
      if (action === 'delete') {
        const results = await Promise.all(targets.map(async bom => {
          try {
            const check = await bomApi.checkDeletable(bom.id)
            return { bom, check }
          } catch {
            return { bom, check: null, error: '删除影响检查失败' }
          }
        }))
        setBatchDeleteResults(results)
      } else {
        const results = await Promise.all(targets.map(async bom => {
          try {
            const check = await bomApi.checkStatus(bom.id, action)
            return { bom, check }
          } catch {
            return { bom, check: null, error: '状态影响检查失败' }
          }
        }))
        setBatchStatusResults(results)
      }
    } finally {
      setCheckingBatch(false)
    }
  }

  const handleBatchActionConfirm = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    if (!batchAction || batchTargets.length === 0) return
    setSubmitting(true)
    try {
      const ids = batchTargets.map(item => item.id)
      if (batchAction === 'delete') {
        await bomApi.batchDelete(ids)
        toast.success(`已删除 ${ids.length} 个BOM`)
      } else {
        await bomApi.batchStatus(ids, batchAction)
        toast.success(batchAction === 'active' ? 'BOM已启用' : 'BOM已停用')
      }
      setSelectedIds(new Set())
      closeModal()
      reload()
    } catch {
      toast.error(batchAction === 'delete' ? '批量删除失败' : '状态更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyConfirm = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    if (!selectedBom || !copyForm.name.trim()) return
    if (!copyForm.copyMaterials) {
      toast.error('复制BOM必须包含物料清单')
      return
    }
    if ((selectedBom.materials || []).length === 0) {
      toast.error('原BOM缺少物料清单，不能复制')
      return
    }
    setSubmitting(true)
    try {
      const payload = buildPayload(toForm(selectedBom))
      await bomApi.create({
        ...payload,
        code: `${selectedBom.code}-COPY-${Date.now().toString().slice(-4)}`,
        name: copyForm.name.trim(),
        description: copyForm.copyInfo ? payload.description : undefined,
        serviceId: undefined,
        materials: copyForm.copyMaterials ? payload.materials : [],
        generalReagents: copyForm.copyMaterials ? payload.generalReagents : [],
        generalConsumables: copyForm.copyMaterials ? payload.generalConsumables : [],
        qualityControls: copyForm.copyMaterials ? payload.qualityControls : [],
      })
      toast.success('BOM已复制')
      closeModal()
      reload()
    } catch {
      toast.error('复制失败')
    } finally {
      setSubmitting(false)
    }
  }

  const setStatus = async (ids: string[], status: 'active' | 'inactive') => {
    if (!canWrite) {
      toast.error('当前角色只能查看BOM')
      return
    }
    if (ids.length === 0) return
    if (ids.length > 1) {
      await openBatchImpact(status)
      return
    }
    setSubmitting(true)
    try {
      await bomApi.batchStatus(ids, status)
      toast.success(status === 'active' ? 'BOM已启用' : 'BOM已停用')
      setSelectedIds(new Set())
      reload()
    } catch {
      toast.error('状态更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const getExportRows = async () => {
    if (exportForm.range === 'selected') {
      const byId = new Map([...allBoms, ...data].map(item => [item.id, item]))
      return Array.from(selectedIds).map(id => byId.get(id)).filter((item): item is BOM => Boolean(item))
    }
    if (exportForm.range === 'all') {
      const res = await bomApi.getList({ page: 1, pageSize: 10000 })
      return res.list || []
    }
    const res = await bomApi.getList({
      page: 1,
      pageSize: 10000,
      keyword: keyword || undefined,
      type: filterType || undefined,
      status: effectiveStatus || undefined,
    })
    const rows = res.list || []
    return lowSupportOnly
      ? rows.filter(item => item.supportableSamples !== undefined && item.supportableSamples !== null && item.supportableSamples < 30)
      : rows
  }

  const loadExportDetails = async (rows: BOM[]) => {
    if (!exportForm.includeMaterials && !exportForm.includeHistory) return rows
    return Promise.all(rows.map(async item => {
      try {
        return await bomApi.getDetail(item.id)
      } catch {
        return item
      }
    }))
  }

  const buildBasicRows = (rows: BOM[]) => rows.map(item => ({
    BOM编号: item.code,
    BOM名称: item.name,
    类型: item.type,
    版本: item.version,
    状态: item.status === 'active' ? '已启用' : '已停用',
    物料数: item.materialCount || 0,
    可支撑样本数: item.supportableSamples ?? '',
    单样本成本: item.unitCost || 0,
    检测服务: item.serviceName || '',
    更新时间: item.updatedAt,
  }))

  const buildMaterialRows = (rows: BOM[]) => rows.flatMap(item => [
    ...(item.materials || []).map(material => ({
      BOM编号: item.code,
      BOM名称: item.name,
      物料类型: '核心物料',
      物料名称: material.name || material.id,
      规格: material.spec || '',
      用量: material.usagePerSample || 0,
      单位: material.unit || '',
      备注: material.groupName || '',
    })),
    ...(item.generalReagents || []).map(material => ({
      BOM编号: item.code,
      BOM名称: item.name,
      物料类型: '通用试剂',
      物料名称: material.name || material.materialId,
      规格: material.spec || '',
      用量: material.usagePerSample || 0,
      单位: material.unit || '',
      备注: '',
    })),
    ...(item.generalConsumables || []).map(material => ({
      BOM编号: item.code,
      BOM名称: item.name,
      物料类型: '通用耗材',
      物料名称: material.name || material.materialId,
      规格: material.spec || '',
      用量: material.usagePerSample || 0,
      单位: material.unit || '',
      备注: '',
    })),
    ...(item.qualityControls || []).map(material => ({
      BOM编号: item.code,
      BOM名称: item.name,
      物料类型: '质控品',
      物料名称: material.name || material.materialId,
      规格: material.spec || '',
      用量: material.usagePerBatch || 0,
      单位: material.unit || '',
      备注: `覆盖${material.coversSamples || 1}样本`,
    })),
  ])

  const buildHistoryRows = (rows: BOM[]) => rows.flatMap(item => (item.versionHistory || []).map(version => ({
    BOM编号: item.code,
    BOM名称: item.name,
    版本: version.version,
    是否当前版本: version.isCurrent ? '是' : '否',
    生效范围: version.effectiveScope === 'retroactive' ? '追溯历史' : '仅未来',
    变更说明: version.changeLog || '',
    变更人: version.changedBy || '',
    更新时间: version.updatedAt || '',
  })))

  const toCsv = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return ''
    const headers = Object.keys(rows[0])
    const escapeCsv = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value)
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    return [headers.join(','), ...rows.map(row => headers.map(header => escapeCsv(row[header])).join(','))].join('\n')
  }

  const handleExport = async () => {
    if (!exportForm.includeBasic && !exportForm.includeMaterials && !exportForm.includeHistory) {
      toast.warning('请至少选择一项导出内容')
      return
    }
    if (exportForm.range === 'selected' && selectedIds.size === 0) {
      toast.warning('请先选择要导出的BOM')
      return
    }
    const rows = await getExportRows()
    if (rows.length === 0) {
      toast.warning('暂无数据可导出')
      return
    }
    try {
      const detailedRows = await loadExportDetails(rows)
      const basicRows = exportForm.includeBasic ? buildBasicRows(detailedRows) : []
      const materialRows = exportForm.includeMaterials ? buildMaterialRows(detailedRows) : []
      const historyRows = exportForm.includeHistory ? buildHistoryRows(detailedRows) : []
      const date = new Date().toISOString().slice(0, 10)
      if (exportForm.format === 'xlsx') {
        const XLSX = await import('xlsx')
        const wb = XLSX.utils.book_new()
        if (exportForm.includeBasic) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(basicRows), '基本信息')
        if (exportForm.includeMaterials) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(materialRows), '物料清单')
        if (exportForm.includeHistory) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyRows), '版本历史')
        XLSX.writeFile(wb, `BOM清单_${date}.xlsx`)
      } else {
        const sections = [
          exportForm.includeBasic ? `基本信息\n${toCsv(basicRows)}` : '',
          exportForm.includeMaterials ? `物料清单\n${toCsv(materialRows)}` : '',
          exportForm.includeHistory ? `版本历史\n${toCsv(historyRows)}` : '',
        ].filter(Boolean).join('\n\n')
        downloadTextFile(`BOM清单_${date}.csv`, sections, 'text/csv;charset=utf-8')
      }
      toast.success('导出成功')
      setModalType(null)
    } catch {
      toast.error('导出失败')
    }
  }

  return {
    data,
    canWrite,
    loading: loading || submitting,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    searchInput,
    setSearchInput,
    filterType,
    setFilterType,
    filterStatus,
    setFilterStatus,
    quickFilter,
    setQuickFilter: (value: string) => {
      setQuickFilter(value)
      setPage(1)
    },
    selectedIds,
    setSelectedIds,
    isAllSelected,
    isIndeterminate,
    modalType,
    setModalType,
    editingId,
    selectedBom,
    deleteCheck,
    checkingDelete,
    batchAction,
    batchTargets,
    batchDeleteResults,
    batchStatusResults,
    checkingBatch,
    detailTab,
    setDetailTab,
    form,
    setForm,
    copyForm,
    setCopyForm,
    exportForm,
    setExportForm,
    allMaterials,
    allProjects,
    stats,
    handleSearch: () => {
      setKeyword(searchInput.trim())
      setPage(1)
    },
    handleReset: () => {
      setSearchInput('')
      setKeyword('')
      setFilterType('')
      setFilterStatus('')
      setQuickFilter('all')
      setSelectedIds(new Set())
      setPage(1)
    },
    toggleSelectAll: () => {
      setSelectedIds(isAllSelected ? new Set() : new Set(data.map(item => item.id)))
    },
    toggleSelectRow: (id: string) => {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    clearSelection: () => setSelectedIds(new Set()),
    openCreate,
    openEdit,
    openDetail,
    openCopy,
    openDelete,
    closeModal,
    handleSubmit,
    handleDeleteConfirm,
    openBatchImpact,
    handleBatchActionConfirm,
    handleCopyConfirm,
    enableSelected: () => openBatchImpact('active'),
    disableSelected: () => openBatchImpact('inactive'),
    toggleStatus: (row: BOM) => setStatus([row.id], row.status === 'active' ? 'inactive' : 'active'),
    handleExport,
  }
}
