import { useState, useEffect, useMemo, useCallback } from 'react'
import { locationApi } from '@/api/master'
import type { Location, LocationDeleteCheck, LocationStatusCheck } from '@/types'
import { toast } from 'sonner'

export interface TreeNode {
  id: string
  code: string
  name: string
  type: string
  zone: string
  shelf?: string
  position?: string
  depth: number
  fullPath: string
  children?: TreeNode[]
  isLeaf?: boolean
}

/** 计算节点在树中的深度（由后端返回的 depth 决定，此函数用于前端兜底） */
export function getNodeDepth(loc: Location): number {
  if (loc.position) return 3
  if (loc.shelf) return 2
  return 1
}

export interface FormData {
  code: string
  name: string
  type: 'shelf' | 'fridge' | 'cabinet' | 'counter' | 'other'
  parentId: string
  levelData: string[]
  capacity: number
  status: 'active' | 'inactive'
}

export const typeOptions = [
  { value: 'shelf', label: '货架' },
  { value: 'fridge', label: '冰箱' },
  { value: 'cabinet', label: '柜' },
  { value: 'counter', label: '操作台' },
  { value: 'other', label: '其他' },
] as const

const levelConfigStorageKey = 'coreone.locationLevelConfigs'

const defaultLevelConfigs: Record<string, string[]> = {
  shelf: ['库区', '货架', '库位'],
  fridge: ['冷冻区', '层', '抽屉'],
  cabinet: ['柜号', '层', '格'],
  counter: ['操作台', '区域'],
  other: ['区域', '位置'],
}

function loadLevelConfigs() {
  try {
    const raw = localStorage.getItem(levelConfigStorageKey)
    if (!raw) return defaultLevelConfigs
    const parsed = JSON.parse(raw) as Record<string, string[]>
    return { ...defaultLevelConfigs, ...parsed }
  } catch {
    return defaultLevelConfigs
  }
}

export function getTypeIcon(type?: string) {
  switch (type) {
    case 'fridge': return '🧊'
    case 'cabinet': return '🗄️'
    case 'counter': return '🔬'
    case 'shelf': return '📦'
    default: return '📍'
  }
}

export function getTypeLabel(type?: string) {
  return typeOptions.find(t => t.value === type)?.label || type || '货架'
}

export type ModalType = 'create' | 'edit' | 'levelConfig' | null

export function useLocationsPage() {
  const [data, setData] = useState<Location[]>([])
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    avgUtilization: 0,
  })
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchStatus, setSearchStatus] = useState<string>('all')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const flatLocations = useMemo(() => {
    const map = new Map<string, Location>()
    data.forEach(d => map.set(d.id, d))
    return map
  }, [data])
  const [modalType, setModalType] = useState<ModalType>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null)
  const [deleteCheck, setDeleteCheck] = useState<LocationDeleteCheck | null>(null)
  const [checkingDelete, setCheckingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [statusTarget, setStatusTarget] = useState<Location | null>(null)
  const [statusCheck, setStatusCheck] = useState<LocationStatusCheck | null>(null)
  const [statusTargetStatus, setStatusTargetStatus] = useState<'active' | 'inactive'>('inactive')
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [levelTab, setLevelTab] = useState<string>('shelf')
  const [levelConfigs, setLevelConfigs] = useState<Record<string, string[]>>(loadLevelConfigs)
  const [form, setForm] = useState<FormData>({
    code: '',
    name: '',
    type: 'shelf',
    parentId: '',
    levelData: [''],
    capacity: 999999,
    status: 'active',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, treeRes, statsRes] = await Promise.all([
        locationApi.getList({ page: 1, pageSize: 1000, keyword: keyword || undefined, status: statusFilter !== 'all' ? statusFilter : undefined }),
        locationApi.getTree(),
        locationApi.getStats({ keyword: keyword || undefined, status: statusFilter !== 'all' ? statusFilter : undefined }),
      ])
      setData((listRes as any).list || [])
      setTreeData((treeRes as any) || [])
      setStats({
        total: Number((statsRes as any)?.total || 0),
        active: Number((statsRes as any)?.active || 0),
        inactive: Number((statsRes as any)?.inactive || 0),
        avgUtilization: Number((statsRes as any)?.avgUtilization || 0),
      })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [keyword, statusFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  const expandAll = () => {
    const collect = (nodes: TreeNode[]): string[] =>
      nodes.flatMap(n => [n.id, ...(n.children ? collect(n.children) : [])])
    setExpandedIds(new Set(collect(treeData)))
  }

  const collapseAll = () => setExpandedIds(new Set())

  const getDescendantIds = useCallback((node: TreeNode): string[] => {
    const ids = [node.id]
    if (node.children) {
      node.children.forEach(c => ids.push(...getDescendantIds(c)))
    }
    return ids
  }, [])

  const displayLocations = useMemo(() => {
    if (!selectedNodeId) return data
    const findNode = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.id === selectedNodeId) return n
        if (n.children) { const f = findNode(n.children); if (f) return f }
      }
      return null
    }
    const node = findNode(treeData)
    if (!node) return data
    const ids = new Set(getDescendantIds(node))
    return data.filter(d => ids.has(d.id))
  }, [data, selectedNodeId, treeData, getDescendantIds])

  const handleSearch = () => {
    setKeyword(searchKeyword)
    setStatusFilter(searchStatus)
  }

  const handleReset = () => {
    setSearchKeyword('')
    setSearchStatus('all')
    setKeyword('')
    setStatusFilter('all')
    setSelectedNodeId(null)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({
      code: '',
      name: '',
      type: 'shelf',
      parentId: '',
      levelData: [''],
      capacity: 999999,
      status: 'active',
    })
    setModalType('create')
  }

  const openEdit = (row: Location) => {
    setEditingId(row.id)
    const labels = levelConfigs[row.type || 'shelf'] || []
    const levelData = [
      row.zone || '',
      row.shelf || '',
      row.position || '',
    ].slice(0, Math.max(3, labels.length))
    while (levelData.length < labels.length) levelData.push('')
    setForm({
      code: row.code,
      name: row.name,
      type: row.type || 'shelf',
      parentId: row.parentId || '',
      levelData,
      capacity: row.capacity,
      status: row.status,
    })
    setModalType('edit')
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.levelData[0]?.trim()) {
      toast.error('请填写必填字段')
      return
    }
    const payload = {
      ...form,
      zone: form.levelData[0] || '',
      shelf: form.levelData[1] || '',
      position: form.levelData[2] || '',
    }
    try {
      if (editingId) {
        await locationApi.update(editingId, payload)
      } else {
        await locationApi.create(payload)
      }
      toast.success('保存成功')
      setModalType(null)
      if (form.parentId) {
        setExpandedIds(prev => new Set(prev).add(form.parentId))
      }
      await fetchData()
    } catch (e) {
      toast.error('保存失败')
    }
  }

  const handleDelete = async (id: string) => {
    setDeleteTarget(data.find(item => item.id === id) || ({ id, name: '该库位' } as Location))
    setDeleteCheck(null)
    setCheckingDelete(true)
    try {
      const check = await locationApi.checkDeletable(id)
      setDeleteCheck(check)
    } catch {
      toast.error('删除影响检查失败')
    } finally {
      setCheckingDelete(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    if (!deleteCheck || !deleteCheck.deletable) {
      toast.error('该库位存在业务引用，不能删除')
      return
    }
    setDeleting(true)
    try {
      await locationApi.delete(deleteTarget.id)
      toast.success('删除成功')
      closeDelete()
      fetchData()
    } catch (e) {
      toast.error('删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const closeDelete = () => {
    setDeleteTarget(null)
    setDeleteCheck(null)
    setCheckingDelete(false)
    setDeleting(false)
  }

  const handleToggleStatus = async (row: Location) => {
    const newStatus = row.status === 'active' ? 'inactive' : 'active'
    setStatusTarget(row)
    setStatusTargetStatus(newStatus)
    setStatusCheck(null)
    setCheckingStatus(true)
    try {
      const check = await locationApi.checkStatus(row.id, newStatus)
      setStatusCheck(check)
    } catch (e) {
      toast.error('状态变更影响检查失败')
    } finally {
      setCheckingStatus(false)
    }
  }

  const confirmStatusChange = async () => {
    if (!statusTarget || !statusCheck || !statusCheck.canChange) {
      toast.error('该库位存在业务引用，不能停用')
      return
    }
    setUpdatingStatus(true)
    try {
      await locationApi.update(statusTarget.id, { status: statusTargetStatus })
      toast.success(statusTargetStatus === 'active' ? '已启用' : '已停用')
      closeStatusChange()
      fetchData()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '操作失败')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const closeStatusChange = () => {
    setStatusTarget(null)
    setStatusCheck(null)
    setStatusTargetStatus('inactive')
    setCheckingStatus(false)
    setUpdatingStatus(false)
  }

  const saveLevelConfigs = () => {
    try {
      localStorage.setItem(levelConfigStorageKey, JSON.stringify(levelConfigs))
    } catch {
      toast.error('配置保存失败')
      return
    }
    toast.success('配置已保存')
    setModalType(null)
  }

  return {
    data,
    treeData,
    loading,
    keyword,
    setKeyword,
    statusFilter,
    setStatusFilter,
    searchKeyword,
    setSearchKeyword,
    searchStatus,
    setSearchStatus,
    selectedNodeId,
    setSelectedNodeId,
    expandedIds,
    setExpandedIds,
    flatLocations,
    modalType,
    setModalType,
    editingId,
    setEditingId,
    deleteTarget,
    setDeleteTarget,
    deleteCheck,
    checkingDelete,
    deleting,
    statusTarget,
    statusCheck,
    statusTargetStatus,
    checkingStatus,
    updatingStatus,
    levelTab,
    setLevelTab,
    levelConfigs,
    setLevelConfigs,
    form,
    setForm,
    fetchData,
    toggleExpand,
    expandAll,
    collapseAll,
    getDescendantIds,
    displayLocations,
    stats,
    handleSearch,
    handleReset,
    openCreate,
    openEdit,
    handleSubmit,
    handleDelete,
    confirmDelete,
    closeDelete,
    handleToggleStatus,
    confirmStatusChange,
    closeStatusChange,
    saveLevelConfigs,
  }
}
