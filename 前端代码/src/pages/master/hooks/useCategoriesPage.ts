import { useState, useEffect, useCallback } from 'react'
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

  const stats = countStats(tree)

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
    walk(tree)
    setExpandedIds(all)
  }

  const collapseAll = () => {
    const first = new Set<string>()
    tree.forEach(n => first.add(n.id))
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

  const selectedNode = selectedId ? findNodeById(tree, selectedId) : null

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
      } else {
        await categoryApi.create(form)
        toast.success('分类创建成功')
      }
      setModalOpen(false)
      fetchData()
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
    walk(tree, id)
    return path
  }

  return {
    tree,
    loading,
    modalOpen,
    setModalOpen,
    editingId,
    setEditingId,
    form,
    setForm,
    flatList,
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
