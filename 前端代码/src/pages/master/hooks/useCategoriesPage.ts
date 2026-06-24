import { useState, useEffect, useCallback, useMemo } from 'react'
import { categoryApi, materialApi } from '@/api/master'
import type { Category, Material } from '@/types'
import { toast } from 'sonner'

export interface FormData {
  code: string
  name: string
  parentId: string | null
  level: number
  sortOrder: number
  remark: string
}

export function countStats(nodes: Category[]) {
  let total = 0, totalMaterials = 0, level3 = 0
  const walk = (items: Category[]) => {
    items.forEach(item => {
      total++
      totalMaterials += item.count || 0
      if (item.level === 3) level3++
      if (item.children) walk(item.children)
    })
  }
  walk(nodes)
  return { total, totalMaterials, level3 }
}

function flattenCategories(nodes: Category[]): Category[] {
  const result: Category[] = []
  const walk = (items: Category[]) => {
    items.forEach(item => {
      result.push(item)
      if (item.children) walk(item.children)
    })
  }
  walk(nodes)
  return result
}

function buildCreatedCategory(payload: Partial<Category>, form: FormData): Category | null {
  const code = String(payload.code || form.code || '').trim()
  if (!payload.id || !code) return null

  return {
    id: String(payload.id),
    code,
    name: String(payload.name || form.name),
    parentId: payload.parentId ?? form.parentId,
    level: Number(payload.level ?? form.level),
    sortOrder: Number(payload.sortOrder ?? form.sortOrder),
    status: payload.status || 'active',
    count: Number(payload.count ?? 0),
    isLeaf: payload.isLeaf ?? true,
    children: payload.children,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: payload.updatedAt || new Date().toISOString(),
  }
}

function containsCategory(nodes: Category[], fallback: Category): boolean {
  return nodes.some(node => (
    node.id === fallback.id ||
    node.code === fallback.code ||
    (node.children ? containsCategory(node.children, fallback) : false)
  ))
}

function insertCategoryFallback(nodes: Category[], fallback: Category): Category[] {
  if (containsCategory(nodes, fallback)) return nodes
  if (!fallback.parentId) return [fallback, ...nodes]

  const insertIntoParent = (items: Category[]): { nodes: Category[]; inserted: boolean } => {
    let inserted = false
    const nextItems = items.map(node => {
      if (node.id === fallback.parentId) {
        inserted = true
        return {
          ...node,
          isLeaf: false,
          children: [fallback, ...(node.children || [])],
        }
      }
      if (node.children?.length) {
        const nextChildren = insertIntoParent(node.children)
        if (nextChildren.inserted) {
          inserted = true
          return { ...node, children: nextChildren.nodes }
        }
      }
      return node
    })
    return { nodes: inserted ? nextItems : items, inserted }
  }

  const result = insertIntoParent(nodes)
  return result.inserted ? result.nodes : [fallback, ...nodes]
}

export function useCategoriesPage() {
  const initialParams = new URLSearchParams(window.location.search)
  const initialKeyword = initialParams.get('keyword') || ''
  const includeDeleted = initialParams.get('includeDeleted') === 'true'
  const [tree, setTree] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>({ code: '', name: '', parentId: null, level: 1, sortOrder: 0, remark: '' })
  const [flatList, setFlatList] = useState<Category[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState(initialKeyword)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [categoryMaterials, setCategoryMaterials] = useState<Material[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [materialPage, setMaterialPage] = useState(1)
  const [materialPageSize] = useState(20)
  const [materialTotal, setMaterialTotal] = useState(0)
  const [materialKeyword, setMaterialKeyword] = useState('')
  const [migrateModalOpen, setMigrateModalOpen] = useState(false)
  const [migrateTarget, setMigrateTarget] = useState<Material | null>(null)
  const [createdCategoryFallback, setCreatedCategoryFallback] = useState<Category | null>(null)

  const fetchCategoryMaterials = useCallback(async (page: number, keyword?: string) => {
    if (!selectedId) return
    setMaterialsLoading(true)
    try {
      const res: any = await materialApi.getList({
        categoryId: selectedId,
        page,
        pageSize: materialPageSize,
        keyword,
      })
      const list = res?.list || []
      const total = res?.total || 0
      if (page === 1) {
        setCategoryMaterials(list)
      } else {
        setCategoryMaterials(prev => [...prev, ...list])
      }
      setMaterialTotal(total)
      setMaterialPage(page)
    } catch (e) {
      if (page === 1) setCategoryMaterials([])
    } finally {
      setMaterialsLoading(false)
    }
  }, [selectedId, materialPageSize])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await categoryApi.getTree(includeDeleted ? { includeDeleted: true } : undefined)
      const t = res || []
      setTree(t)
      setCreatedCategoryFallback(prev => (prev && containsCategory(t, prev) ? null : prev))
      const firstLevelIds = new Set<string>()
      t.forEach((n: Category) => firstLevelIds.add(n.id))
      setExpandedIds(firstLevelIds)
      setFlatList(flattenCategories(t))
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [includeDeleted])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!selectedId) {
      setCategoryMaterials([])
      setMaterialTotal(0)
      setMaterialPage(1)
      setMaterialKeyword('')
      return
    }
    fetchCategoryMaterials(1)
  }, [selectedId, fetchCategoryMaterials])

  const displayedTree = useMemo(() => (
    createdCategoryFallback
      ? insertCategoryFallback(tree, createdCategoryFallback)
      : tree
  ), [createdCategoryFallback, tree])
  const displayedFlatList = useMemo(() => flattenCategories(displayedTree), [displayedTree])
  const stats = countStats(displayedTree)

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    const all = new Set<string>()
    const walk = (items: Category[]) => {
      items.forEach(item => {
        if (item.children && item.children.length) {
          all.add(item.id)
          walk(item.children)
        }
      })
    }
    walk(displayedTree)
    setExpandedIds(all)
  }

  const collapseAll = () => {
    const first = new Set<string>()
    displayedTree.forEach(n => first.add(n.id))
    setExpandedIds(first)
  }

  const findNodeById = useCallback((items: Category[], id: string): Category | null => {
    for (const item of items) {
      if (item.id === id) return item
      if (item.children) {
        const found = findNodeById(item.children, id)
        if (found) return found
      }
    }
    return null
  }, [])

  const selectedNode = selectedId ? findNodeById(displayedTree, selectedId) : null

  const openCreate = (parentId: string | null = null, level: number = 1) => {
    setEditingId(null)
    setForm({ code: '', name: '', parentId, level, sortOrder: 0, remark: '' })
    setModalOpen(true)
  }

  const openEdit = (node: Category) => {
    setEditingId(node.id)
    setForm({
      code: node.code,
      name: node.name,
      parentId: node.parentId || null,
      level: node.level,
      sortOrder: node.sortOrder || 0,
      remark: '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('请填写分类名称')
      return
    }
    try {
      if (editingId) {
        await categoryApi.update(editingId, form)
        toast.success('分类更新成功')
        setModalOpen(false)
        fetchData()
      } else {
        const res: any = await categoryApi.create(form)
        const created = res?.data ?? res
        const createdKeyword = created?.code || form.code || form.name
        setCreatedCategoryFallback(buildCreatedCategory(created, form))
        toast.success('分类创建成功')
        setSearchKeyword(createdKeyword)
        if (created?.id) setSelectedId(created.id)
        if (form.parentId) {
          setExpandedIds(prev => new Set(prev).add(form.parentId as string))
        }
        setModalOpen(false)
        fetchData()
      }
    } catch (e) {
      toast.error('操作失败')
    }
  }

  const openDelete = (node: Category) => {
    setDeleteTarget(node)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await categoryApi.delete(deleteTarget.id)
      toast.success('分类删除成功')
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteModalOpen(false)
      setDeleteTarget(null)
      fetchData()
    } catch (e) {
      toast.error('删除失败')
    }
  }

  const openMigrate = (material: Material) => {
    setMigrateTarget(material)
    setMigrateModalOpen(true)
  }

  const confirmMigrate = async (materialId: string, targetCategoryId: string) => {
    try {
      await materialApi.update(materialId, { categoryId: targetCategoryId })
      toast.success('物料迁移成功')
      setMigrateModalOpen(false)
      setMigrateTarget(null)
      fetchCategoryMaterials(materialPage, materialKeyword)
      fetchData()
    } catch (e) {
      toast.error('迁移失败')
    }
  }

  const handleMaterialSearch = (keyword: string) => {
    setMaterialKeyword(keyword)
    fetchCategoryMaterials(1, keyword)
  }

  const loadMoreMaterials = () => {
    fetchCategoryMaterials(materialPage + 1, materialKeyword)
  }

  const filterMatch = (node: Category): boolean => {
    if (!searchKeyword.trim()) return true
    const kw = searchKeyword.toLowerCase()
    if (
      node.id.toLowerCase().includes(kw) ||
      node.name.toLowerCase().includes(kw) ||
      node.code.toLowerCase().includes(kw)
    ) return true
    if (node.children) {
      return node.children.some(child => filterMatch(child))
    }
    return false
  }

  const getBreadcrumb = (id: string): Category[] => {
    const path: Category[] = []
    const walk = (items: Category[], target: string): boolean => {
      for (const item of items) {
        if (item.id === target) {
          path.push(item)
          return true
        }
        if (item.children) {
          if (walk(item.children, target)) {
            path.unshift(item)
            return true
          }
        }
      }
      return false
    }
    walk(displayedTree, id)
    return path
  }

  return {
    tree: displayedTree,
    loading,
    modalOpen,
    setModalOpen,
    editingId,
    setEditingId,
    form,
    setForm,
    flatList: displayedFlatList,
    expandedIds,
    setExpandedIds,
    selectedId,
    setSelectedId,
    searchKeyword,
    setSearchKeyword,
    deleteModalOpen,
    setDeleteModalOpen,
    deleteTarget,
    setDeleteTarget,
    fetchData,
    stats,
    toggleExpand,
    expandAll,
    collapseAll,
    findNodeById,
    selectedNode,
    categoryMaterials,
    materialsLoading,
    materialTotal,
    materialPage,
    materialPageSize,
    materialKeyword,
    setMaterialKeyword,
    fetchCategoryMaterials,
    loadMoreMaterials,
    handleMaterialSearch,
    migrateModalOpen,
    setMigrateModalOpen,
    migrateTarget,
    setMigrateTarget,
    openMigrate,
    confirmMigrate,
    openCreate,
    openEdit,
    handleSubmit,
    openDelete,
    confirmDelete,
    filterMatch,
    getBreadcrumb,
  }
}
