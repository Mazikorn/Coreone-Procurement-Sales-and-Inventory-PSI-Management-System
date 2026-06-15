import { useState, useMemo, useCallback } from 'react'
import { usePagination } from '@/hooks/usePagination'
import { indirectCostApi } from '@/api/master'
import type { IndirectCostCenter, IndirectCostAllocation } from '@/types'
import { toast } from 'sonner'

export interface CostCenterForm {
  code: string
  name: string
  costType: string
  monthlyAmount: number
  allocationBase: string
  description: string
  status: 'active' | 'inactive'
}

export interface AllocationForm {
  yearMonth: string
  totalAmount: number
  allocationBaseValue: number
}

const COST_TYPE_OPTIONS = [
  { value: 'rent', label: '房租' },
  { value: 'utilities', label: '水电' },
  { value: 'maintenance', label: '维护' },
  { value: 'admin', label: '管理费' },
  { value: 'it', label: 'IT费用' },
  { value: 'other', label: '其他' },
]

const ALLOCATION_BASE_OPTIONS = [
  { value: 'sample_count', label: '样本数' },
  { value: 'revenue', label: '收入' },
  { value: 'labor_hours', label: '工时' },
  { value: 'area', label: '面积' },
]

export function useCostCenterPage() {
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [modalType, setModalType] = useState<null | 'create' | 'edit' | 'delete' | 'allocation'>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<IndirectCostCenter | null>(null)

  const [form, setForm] = useState<CostCenterForm>({
    code: '',
    name: '',
    costType: 'other',
    monthlyAmount: 0,
    allocationBase: 'sample_count',
    description: '',
    status: 'active',
  })

  const [allocationForm, setAllocationForm] = useState<AllocationForm>({
    yearMonth: new Date().toISOString().slice(0, 7),
    totalAmount: 0,
    allocationBaseValue: 1,
  })

  const [allocations, setAllocations] = useState<IndirectCostAllocation[]>([])

  const fetchFn = useCallback(
    async (params: { page: number; pageSize: number }) => {
      const res: any = await indirectCostApi.getList({
        ...params,
        keyword: keyword || undefined,
        status: filterStatus || undefined,
      })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [keyword, filterStatus]
  )

  const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } =
    usePagination<IndirectCostCenter>({ fetchFn, initialPage: 1, initialPageSize: 20, deps: [keyword, filterStatus] })

  const stats = useMemo(() => {
    const all = data
    const active = all.filter((c) => c.status === 'active').length
    const totalMonthly = all.reduce((sum, c) => sum + (c.monthlyAmount || 0), 0)
    return { total: all.length, active, totalMonthly }
  }, [data])

  const handleSearch = () => {
    setKeyword(searchInput)
    setPage(1)
  }

  const handleReset = () => {
    setSearchInput('')
    setKeyword('')
    setFilterStatus('')
    setPage(1)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({
      code: '',
      name: '',
      costType: 'other',
      monthlyAmount: 0,
      allocationBase: 'sample_count',
      description: '',
      status: 'active',
    })
    setModalType('create')
  }

  const openEdit = (row: IndirectCostCenter) => {
    setEditingId(row.id)
    setForm({
      code: row.code || '',
      name: row.name || '',
      costType: row.costType || 'other',
      monthlyAmount: row.monthlyAmount || 0,
      allocationBase: row.allocationBase || 'sample_count',
      description: row.description || '',
      status: row.status || 'active',
    })
    setModalType('edit')
  }

  const openDelete = (row: IndirectCostCenter) => {
    setEditingId(row.id)
    setDetailRow(row)
    setModalType('delete')
  }

  const openAllocation = async (row: IndirectCostCenter) => {
    setEditingId(row.id)
    setDetailRow(row)
    setAllocationForm({
      yearMonth: new Date().toISOString().slice(0, 7),
      totalAmount: row.monthlyAmount || 0,
      allocationBaseValue: 1,
    })
    try {
      const res: any = await indirectCostApi.getAllocations(row.id, { page: 1, pageSize: 12 })
      setAllocations(res?.list || [])
    } catch {
      setAllocations([])
    }
    setModalType('allocation')
  }

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('请填写必填项')
      return
    }
    try {
      const payload = { ...form }
      if (editingId) {
        await indirectCostApi.update(editingId, payload)
        toast.success('成本中心更新成功')
      } else {
        await indirectCostApi.create(payload)
        toast.success('成本中心创建成功')
      }
      setModalType(null)
      refresh()
    } catch {
      toast.error('操作失败')
    }
  }

  const handleDelete = async () => {
    if (!editingId) return
    try {
      await indirectCostApi.delete(editingId)
      toast.success('成本中心已删除')
      setModalType(null)
      setEditingId(null)
      refresh()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleAllocationSubmit = async () => {
    if (!editingId || !allocationForm.yearMonth) {
      toast.error('请填写必填项')
      return
    }
    try {
      const res: any = await indirectCostApi.recordAllocation(editingId, {
        yearMonth: allocationForm.yearMonth,
        totalAmount: allocationForm.totalAmount,
        allocationBaseValue: allocationForm.allocationBaseValue,
      })
      toast.success(`分摊录入成功，单位分摊率：¥${(res?.rate || 0).toFixed(4)}`)
      const listRes: any = await indirectCostApi.getAllocations(editingId, { page: 1, pageSize: 12 })
      setAllocations(listRes?.list || [])
    } catch {
      toast.error('分摊录入失败')
    }
  }

  return {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
    stats,
    keyword,
    searchInput,
    setSearchInput,
    filterStatus,
    setFilterStatus,
    modalType,
    setModalType,
    editingId,
    detailRow,
    form,
    setForm,
    allocationForm,
    setAllocationForm,
    allocations,
    handleSearch,
    handleReset,
    openCreate,
    openEdit,
    openDelete,
    openAllocation,
    handleSubmit,
    handleDelete,
    handleAllocationSubmit,
    COST_TYPE_OPTIONS,
    ALLOCATION_BASE_OPTIONS,
  }
}
