import { useState, useEffect, useCallback } from 'react'
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

function getErrorMessage(err: any, fallback: string) {
  return err?.response?.data?.error?.message || err?.message || fallback
}

export function useCostCenterPage() {
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [stats, setStats] = useState({ total: 0, active: 0, totalMonthly: 0, allocationCount: 0 })

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
        status: filterStatus && filterStatus !== 'all' ? filterStatus : undefined,
      })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [keyword, filterStatus]
  )

  const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } =
    usePagination<IndirectCostCenter>({ fetchFn, initialPage: 1, initialPageSize: 20, deps: [keyword, filterStatus] })

  const loadStats = useCallback(async () => {
    try {
      const res: any = await indirectCostApi.getStats({
        keyword: keyword || undefined,
        status: filterStatus && filterStatus !== 'all' ? filterStatus : undefined,
      })
      setStats({
        total: Number(res?.total || 0),
        active: Number(res?.active || 0),
        totalMonthly: Number(res?.totalMonthly || 0),
        allocationCount: Number(res?.allocationCount || 0),
      })
    } catch {
      setStats({ total, active: 0, totalMonthly: 0, allocationCount: 0 })
    }
  }, [keyword, filterStatus, total])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const refreshPage = async () => {
    refresh()
    await loadStats()
  }

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

  const handleStatusChange = useCallback((value: string) => {
    setFilterStatus(value)
    setPage(1)
  }, [setPage])

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
    if (!Number.isFinite(form.monthlyAmount) || form.monthlyAmount < 0) {
      toast.error('月度金额必须大于等于0')
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
      await refreshPage()
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
      await refreshPage()
    } catch (err: any) {
      toast.error(getErrorMessage(err, '删除失败'))
    }
  }

  const handleAllocationSubmit = async () => {
    if (!editingId || !allocationForm.yearMonth) {
      toast.error('请填写必填项')
      return
    }
    if (detailRow?.status !== 'active') {
      toast.error('停用成本中心不可录入分摊')
      return
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(allocationForm.yearMonth)) {
      toast.error('年月格式必须为 YYYY-MM')
      return
    }
    if (!Number.isFinite(allocationForm.totalAmount) || allocationForm.totalAmount < 0) {
      toast.error('费用总额必须大于等于0')
      return
    }
    if (!Number.isFinite(allocationForm.allocationBaseValue) || allocationForm.allocationBaseValue <= 0) {
      toast.error('分摊基础值必须大于0')
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
      await loadStats()
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
    handleStatusChange,
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
