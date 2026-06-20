import { useState, useEffect, useCallback } from 'react'
import { materialApi, categoryApi, supplierApi, locationApi } from '@/api/master'
import type { Material, MaterialDeleteCheck, MaterialStatusCheck, Category, Supplier, Location } from '@/types'
import { toast } from 'sonner'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { getUserRole } from '@/lib/permissions'

export interface FormData {
  code: string
  barcode: string
  name: string
  spec: string
  unit: string
  categoryId: string
  supplierId: string
  locationId: string
  price: number
  minStock: number
  maxStock: number
  safetyStock: number
  status: 'active' | 'inactive'
  remark: string
}

export type QuickFilter = 'all' | 'active' | 'inactive' | 'low-stock'
type QuickUrlValue = QuickFilter | 'low'

const QUICK_FILTERS: QuickFilter[] = ['all', 'active', 'inactive', 'low-stock']

function normalizeQuickFilter(value: string): QuickFilter {
  if (value === 'low') return 'low-stock'
  if (QUICK_FILTERS.includes(value as QuickFilter)) return value as QuickFilter
  return 'all'
}

function toQuickUrlValue(value: QuickFilter): QuickUrlValue {
  return value === 'low-stock' ? 'low' : value
}

function canAccessSuppliers(role: string | null): boolean {
  return role === 'admin' || role === 'warehouse_manager' || role === 'procurement'
}

function canManageMaterials(role: string | null): boolean {
  return role === 'admin' || role === 'warehouse_manager'
}

function flattenLeafCategories(nodes: Category[]): Category[] {
  const result: Category[] = []
  const walk = (items: Category[]) => {
    items.forEach(item => {
      const children = item.children || []
      if (children.length === 0 && item.status !== 'inactive') {
        result.push(item)
      }
      if (children.length > 0) walk(children)
    })
  }
  walk(nodes)
  return result
}

interface MaterialStats {
  total: number
  active: number
  inactive: number
  lowStock: number
}

export type MaterialBatchAction = 'delete' | 'active' | 'inactive'

export interface MaterialBatchDeleteResult {
  material: Material
  check: MaterialDeleteCheck | null
  error?: string
}

export interface MaterialBatchStatusResult {
  material: Material
  check: MaterialStatusCheck | null
  error?: string
}

export function useMaterialsPage() {
  const { get, getNumber, setMultiple } = useUrlParams()
  const canWrite = canManageMaterials(getUserRole())

  const initialQuickFilter = normalizeQuickFilter(get('quick', get('status', 'all')))

  const [keyword, setKeywordState] = useState(get('keyword') || '')
  const [debouncedKeyword, setDebouncedKeyword] = useState(get('keyword') || '')
  const [categoryId, setCategoryIdState] = useState(get('categoryId') || '')
  const [supplierId, setSupplierIdState] = useState(get('supplierId') || '')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(initialQuickFilter)
  const [stats, setStats] = useState<MaterialStats>({
    total: 0,
    active: 0,
    inactive: 0,
    lowStock: 0,
  })

  const urlPage = Math.max(1, getNumber('page', 1))
  const urlPageSize = [10, 20, 50, 100].includes(getNumber('pageSize', 20))
    ? getNumber('pageSize', 20)
    : 20

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(keyword), 300)
    return () => window.clearTimeout(timer)
  }, [keyword])

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const params: any = { page, pageSize }
      if (debouncedKeyword) params.keyword = debouncedKeyword
      if (categoryId) params.categoryId = categoryId
      if (supplierId) params.supplierId = supplierId
      if (quickFilter === 'active' || quickFilter === 'inactive') {
        params.status = quickFilter
      }
      if (quickFilter === 'low-stock') {
        params.lowStock = true
      }
      const res: any = await materialApi.getList(params)
      return { list: res.list || [], pagination: res.pagination }
    },
    [debouncedKeyword, categoryId, supplierId, quickFilter]
  )

  const {
    data, loading, page, pageSize, total,
    setPage, setPageSize, refresh,
  } = usePagination<Material>({
    fetchFn,
    initialPage: urlPage,
    initialPageSize: urlPageSize,
    deps: [debouncedKeyword, categoryId, supplierId, quickFilter],
  })

  useEffect(() => {
    setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 20 ? pageSize : null,
      keyword: keyword || null,
      categoryId: categoryId || null,
      supplierId: supplierId || null,
      quick: quickFilter !== 'all' ? toQuickUrlValue(quickFilter) : null,
      status: null,
    })
  }, [page, pageSize, keyword, categoryId, supplierId, quickFilter, setMultiple])

  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [formCategories, setFormCategories] = useState<Category[]>([])
  const [formSuppliers, setFormSuppliers] = useState<Supplier[]>([])
  const [formLocations, setFormLocations] = useState<Location[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailMaterial, setDetailMaterial] = useState<Material | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmProps, setConfirmProps] = useState<{
    title: string
    description: string
    confirmText: string
    confirmVariant: 'danger' | 'primary'
    onConfirm: () => void
  } | null>(null)

  const openConfirm = (props: {
    title: string
    description: string
    confirmText: string
    confirmVariant: 'danger' | 'primary'
    onConfirm: () => void
  }) => {
    setConfirmProps(props)
    setConfirmOpen(true)
  }

  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
  const [deleteCheck, setDeleteCheck] = useState<MaterialDeleteCheck | null>(null)
  const [checkingDelete, setCheckingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [statusTarget, setStatusTarget] = useState<Material | null>(null)
  const [statusTargetStatus, setStatusTargetStatus] = useState<'active' | 'inactive'>('inactive')
  const [statusCheck, setStatusCheck] = useState<MaterialStatusCheck | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [batchAction, setBatchAction] = useState<MaterialBatchAction | null>(null)
  const [batchTargets, setBatchTargets] = useState<Material[]>([])
  const [batchDeleteResults, setBatchDeleteResults] = useState<MaterialBatchDeleteResult[]>([])
  const [batchStatusResults, setBatchStatusResults] = useState<MaterialBatchStatusResult[]>([])
  const [checkingBatch, setCheckingBatch] = useState(false)
  const [submittingBatch, setSubmittingBatch] = useState(false)

  const [form, setForm] = useState<FormData>({
    code: '', barcode: '', name: '', spec: '', unit: '个', categoryId: '', supplierId: '', locationId: '',
    price: 0, minStock: 0, maxStock: 999999, safetyStock: 0, status: 'active', remark: ''
  })

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [specPart, setSpecPart] = useState({ amount: '', unit: '' })

  const fetchRefs = async () => {
    const role = getUserRole()
    const [catRes, catTreeRes, supRes, activeSupRes, locRes, activeLocRes]: any = await Promise.all([
      categoryApi.getList({ page: 1, pageSize: 999 }).catch(() => null),
      categoryApi.getTree().catch(() => null),
      canAccessSuppliers(role)
        ? supplierApi.getList({ page: 1, pageSize: 999 }).catch(() => null)
        : Promise.resolve(null),
      canAccessSuppliers(role)
        ? supplierApi.getList({ page: 1, pageSize: 999, status: 'active' }).catch(() => null)
        : Promise.resolve(null),
      locationApi.getList({ page: 1, pageSize: 999 }).catch(() => null),
      locationApi.getList({ page: 1, pageSize: 999, status: 'active' }).catch(() => null),
    ])
    setCategories(catRes?.list || [])
    setFormCategories(flattenLeafCategories(catTreeRes || []))
    setSuppliers(supRes?.list || [])
    setFormSuppliers(activeSupRes?.list || [])
    setLocations(locRes?.list || [])
    setFormLocations(activeLocRes?.list || [])
  }

  useEffect(() => { fetchRefs() }, [])

  const loadStats = useCallback(async () => {
    try {
      const params: { keyword?: string; categoryId?: string; supplierId?: string } = {}
      if (debouncedKeyword) params.keyword = debouncedKeyword
      if (categoryId) params.categoryId = categoryId
      if (supplierId) params.supplierId = supplierId
      const res: any = await materialApi.getStats(params)
      setStats({
        total: Number(res?.total || 0),
        active: Number(res?.active || 0),
        inactive: Number(res?.inactive || 0),
        lowStock: Number(res?.lowStock || 0),
      })
    } catch (e) { console.error(e) }
  }, [debouncedKeyword, categoryId, supplierId])

  useEffect(() => { loadStats() }, [loadStats])

  useEffect(() => {
    if (modalOpen && !editingId && formCategories.length > 0 && !form.code) {
      const cat = form.categoryId || formCategories[0]?.id
      if (cat) autoFillCode(cat)
    }
  }, [formCategories, modalOpen])

  const autoFillCode = useCallback(async (categoryId: string) => {
    if (!categoryId) return
    try {
      const res: any = await materialApi.getNextCode(categoryId)
      const code = res?.code || res?.data?.code
      if (code) {
        setForm(prev => ({ ...prev, code }))
      }
    } catch (e) { /* ignore */ }
  }, [])

  const parseSpec = (spec?: string) => {
    if (!spec || !spec.includes('/')) return { amount: '', unit: spec || '' }
    const [a, b] = spec.split('/')
    return { amount: a, unit: b }
  }

  const openCreate = () => {
    if (!canWrite) {
      toast.error('当前角色只能查看物料')
      return
    }
    setEditingId(null)
    setSpecPart({ amount: '', unit: '' })
    const defaultCat = formCategories[0]?.id || ''
    setForm({ code: '', barcode: '', name: '', spec: '', unit: '个', categoryId: defaultCat, supplierId: '', locationId: '', price: 0, minStock: 0, maxStock: 999999, safetyStock: 0, status: 'active', remark: '' })
    setModalOpen(true)
    if (defaultCat) autoFillCode(defaultCat)
  }

  const openEdit = (row: Material) => {
    if (!canWrite) {
      toast.error('当前角色只能查看物料')
      return
    }
    setEditingId(row.id)
    setSpecPart(parseSpec(row.spec))
    setForm({
      code: row.code, barcode: row.barcode || '', name: row.name, spec: row.spec || '', unit: row.unit,
      categoryId: row.categoryId || '', supplierId: row.supplierId || '', locationId: row.locationId || '',
      price: row.price || 0, minStock: row.minStock || 0, maxStock: row.maxStock || 999999,
      safetyStock: row.safetyStock || 0, status: row.status, remark: row.remark || ''
    })
    setModalOpen(true)
  }

  const openDetail = (row: Material) => {
    setDetailMaterial(row)
    setDetailModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看物料')
      return
    }
    if (!form.name.trim() || !form.unit.trim()) {
      toast.error('请填写必填字段')
      return
    }
    try {
      if (editingId) {
        const { code: _readonlyCode, ...editableForm } = form
        await materialApi.update(editingId, editableForm)
        toast.success('物料更新成功')
      } else {
        await materialApi.create(form)
        toast.success('物料创建成功')
      }
      setModalOpen(false)
      refresh()
      fetchRefs()
      loadStats()
    } catch (e) {
      toast.error('操作失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!canWrite) {
      toast.error('当前角色只能查看物料')
      return
    }
    const target = data.find(item => item.id === id) || null
    if (!target) {
      toast.error('未找到要删除的物料')
      return
    }
    setDeleteTarget(target)
    setDeleteCheck(null)
    setCheckingDelete(true)
    try {
      const res: any = await materialApi.checkDeletable(id)
      setDeleteCheck(res?.data || res)
    } catch (e) {
      setDeleteCheck(null)
      toast.error('删除影响检查失败')
    } finally {
      setCheckingDelete(false)
    }
  }

  const closeDeleteModal = () => {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteCheck(null)
    setCheckingDelete(false)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !deleteCheck?.deletable) return
    setDeleting(true)
    try {
      await materialApi.delete(deleteTarget.id)
      toast.success('删除成功')
      setDeleteTarget(null)
      setDeleteCheck(null)
      refresh()
      fetchRefs()
      loadStats()
    } catch (e) {
      toast.error('删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const handleToggleStatus = async (row: Material) => {
    if (!canWrite) {
      toast.error('当前角色只能查看物料')
      return
    }
    const newStatus = row.status === 'active' ? 'inactive' : 'active'
    setStatusTarget(row)
    setStatusTargetStatus(newStatus)
    setStatusCheck(null)
    setCheckingStatus(true)
    try {
      const res: any = await materialApi.checkStatus(row.id, newStatus)
      setStatusCheck(res?.data || res)
    } catch (e) {
      setStatusCheck(null)
      toast.error('状态变更影响检查失败')
    } finally {
      setCheckingStatus(false)
    }
  }

  const closeStatusModal = () => {
    if (updatingStatus) return
    setStatusTarget(null)
    setStatusCheck(null)
    setCheckingStatus(false)
  }

  const confirmStatusChange = async () => {
    if (!statusTarget || !statusCheck?.canChange) return
    setUpdatingStatus(true)
    try {
      await materialApi.update(statusTarget.id, { status: statusTargetStatus })
      toast.success(statusTargetStatus === 'active' ? '物料已启用' : '物料已停用')
      setStatusTarget(null)
      setStatusCheck(null)
      clearSelection()
      refresh()
      fetchRefs()
      loadStats()
    } catch (e) {
      toast.error('操作失败')
      setStatusTarget(null)
      setStatusCheck(null)
      refresh()
      fetchRefs()
      loadStats()
    } finally {
      setUpdatingStatus(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === data.length && data.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(data.map(d => d.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const openBatchImpact = async (action: MaterialBatchAction) => {
    if (!canWrite) {
      toast.error('当前角色只能查看物料')
      return
    }
    const targets = data.filter(item => selectedIds.has(item.id))
    if (targets.length === 0) return
    setBatchAction(action)
    setBatchTargets(targets)
    setBatchDeleteResults([])
    setBatchStatusResults([])
    setCheckingBatch(true)
    try {
      if (action === 'delete') {
        const results = await Promise.all(targets.map(async material => {
          try {
            const res: any = await materialApi.checkDeletable(material.id)
            return { material, check: res?.data || res }
          } catch {
            return { material, check: null, error: '删除影响检查失败' }
          }
        }))
        setBatchDeleteResults(results)
      } else {
        const results = await Promise.all(targets.map(async material => {
          try {
            const res: any = await materialApi.checkStatus(material.id, action)
            return { material, check: res?.data || res }
          } catch {
            return { material, check: null, error: '状态影响检查失败' }
          }
        }))
        setBatchStatusResults(results)
      }
    } finally {
      setCheckingBatch(false)
    }
  }

  const closeBatchImpactModal = () => {
    if (submittingBatch) return
    setBatchAction(null)
    setBatchTargets([])
    setBatchDeleteResults([])
    setBatchStatusResults([])
    setCheckingBatch(false)
  }

  const confirmBatchAction = async () => {
    if (!batchAction || batchTargets.length === 0) return
    setSubmittingBatch(true)
    try {
      const ids = batchTargets.map(item => item.id)
      if (batchAction === 'delete') {
        await materialApi.batchDelete(ids)
        toast.success('批量删除成功')
      } else {
        await materialApi.batchStatus(ids, batchAction)
        toast.success(batchAction === 'active' ? '批量启用成功' : '批量停用成功')
      }
      clearSelection()
      setBatchAction(null)
      setBatchTargets([])
      setBatchDeleteResults([])
      setBatchStatusResults([])
      refresh()
      fetchRefs()
      loadStats()
    } catch (e) {
      toast.error(batchAction === 'delete' ? '批量删除失败' : '操作失败')
    } finally {
      setSubmittingBatch(false)
    }
  }

  const batchDelete = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看物料')
      return
    }
    await openBatchImpact('delete')
  }

  const batchToggleStatus = async (status: 'active' | 'inactive') => {
    if (!canWrite) {
      toast.error('当前角色只能查看物料')
      return
    }
    await openBatchImpact(status)
  }

  const getCategoryName = (id?: string) => {
    if (!id) return '-'
    return categories.find(c => c.id === id)?.name || id
  }

  const getSupplierName = (id?: string) => {
    if (!id) return '-'
    return suppliers.find(s => s.id === id)?.name || id
  }

  const getLocationName = (id?: string) => {
    if (!id) return '-'
    return locations.find(l => l.id === id)?.name || id
  }

  const statusBadge = (status: string) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
    }`}>
      {status === 'active' ? '已启用' : '已停用'}
    </span>
  )

  const handleSearch = () => {
    setDebouncedKeyword(keyword)
    setPage(1)
  }

  const handleReset = () => {
    setKeywordState('')
    setDebouncedKeyword('')
    setCategoryIdState('')
    setSupplierIdState('')
    setQuickFilter('all')
    setPageSize(20)
    setPage(1)
  }

  const setKeyword = useCallback((value: string) => {
    setKeywordState(value)
    setPage(1)
  }, [setPage])

  const setCategoryId = useCallback((value: string) => {
    setCategoryIdState(value)
    setPage(1)
  }, [setPage])

  const setSupplierId = useCallback((value: string) => {
    setSupplierIdState(value)
    setPage(1)
  }, [setPage])

  return {
    data, loading, page, pageSize, total, setPage, setPageSize, refresh,
    canWrite,
    keyword, setKeyword, categoryId, setCategoryId, supplierId, setSupplierId,
    quickFilter, setQuickFilter,
    categories, suppliers, locations, formCategories, formSuppliers, formLocations,
    modalOpen, setModalOpen,
    detailModalOpen, setDetailModalOpen,
    editingId, setEditingId,
    detailMaterial, setDetailMaterial,
    confirmOpen, setConfirmOpen, confirmProps, setConfirmProps,
    deleteTarget, deleteCheck, checkingDelete, deleting,
    closeDeleteModal, confirmDelete,
    statusTarget, statusTargetStatus, statusCheck, checkingStatus, updatingStatus,
    closeStatusModal, confirmStatusChange,
    batchAction, batchTargets, batchDeleteResults, batchStatusResults, checkingBatch, submittingBatch,
    closeBatchImpactModal, confirmBatchAction,
    form, setForm,
    selectedIds, setSelectedIds,
    specPart, setSpecPart,
    stats,
    handleSearch, handleReset,
    openCreate, openEdit, openDetail,
    handleSubmit, handleDelete, handleToggleStatus,
    toggleSelectAll, toggleSelect, clearSelection,
    batchDelete, batchToggleStatus,
    getCategoryName, getSupplierName, getLocationName, statusBadge,
    autoFillCode,
  }
}
